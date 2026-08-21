-- Admin refund audit trail
-- Immutable-style log of admin refund actions (append-only for app roles)

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
  ON admin_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor
  ON admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action
  ON admin_audit_log (action, created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read audit log; no direct client inserts (RPC only)
DROP POLICY IF EXISTS admin_audit_select ON admin_audit_log;
CREATE POLICY admin_audit_select ON admin_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Order-level refund markers (denormalized for quick UI)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_reason text;

DROP FUNCTION IF EXISTS public.admin_refund_order(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_refund_order(
  p_order_id uuid,
  p_reason text DEFAULT 'Admin refund'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_order orders%ROWTYPE;
  v_audit_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status = 'refunded' THEN
    RAISE EXCEPTION 'Order is already refunded';
  END IF;

  UPDATE orders
  SET
    status = 'refunded',
    refunded_at = now(),
    refunded_by = v_uid,
    refund_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Admin refund'),
    dispute_status = CASE
      WHEN dispute_status IN ('claim_raised', 'evidence_submitted') THEN 'resolved_buyer'
      ELSE dispute_status
    END
  WHERE id = p_order_id;

  INSERT INTO admin_audit_log (
    actor_id, actor_role, action, entity_type, entity_id, reason, metadata
  ) VALUES (
    v_uid,
    'admin',
    'order_refund',
    'order',
    p_order_id,
    COALESCE(NULLIF(trim(p_reason), ''), 'Admin refund'),
    jsonb_build_object(
      'previous_status', v_order.status,
      'amount', v_order.amount,
      'shipping_cost', v_order.shipping_cost,
      'artwork_id', v_order.artwork_id,
      'user_id', v_order.user_id,
      'stripe_payment_intent_id', v_order.stripe_payment_intent_id,
      'stripe_checkout_session_id', v_order.stripe_checkout_session_id,
      'receipt_number', v_order.receipt_number
    )
  )
  RETURNING id INTO v_audit_id;


  INSERT INTO notifications (user_id, type, title, body, order_id)
  SELECT o.user_id,
         'order_update',
         'Refund processed',
         COALESCE(NULLIF(trim(p_reason), ''), 'Your payment was refunded by Atelier admin.'),
         o.id
  FROM orders o
  WHERE o.id = p_order_id
    AND o.user_id IS NOT NULL;


  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'status', 'refunded',
    'audit_id', v_audit_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refund_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_refund_order(uuid, text) TO authenticated;

COMMENT ON TABLE admin_audit_log IS 'Append-only admin action log (refunds, etc.). Written only via SECURITY DEFINER RPCs.';
COMMENT ON COLUMN orders.refunded_at IS 'When admin marked order refunded (app-level; pair with Stripe refund in Dashboard).';
COMMENT ON COLUMN orders.refunded_by IS 'Admin user id who issued the refund.';
COMMENT ON COLUMN orders.refund_reason IS 'Reason captured at refund time.';
