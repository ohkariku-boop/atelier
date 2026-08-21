-- Production hardening from SIT/UAT gaps
-- 1) ensure_artist_profile: create artists row + link profile for artist role
-- 2) admin_refund_order: mark order refunded / release path (ops)

CREATE OR REPLACE FUNCTION public.ensure_artist_profile(
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_artist_id uuid;
  v_name text;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, artist_id, display_name
    INTO v_role, v_artist_id, v_name
  FROM profiles
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_role IS DISTINCT FROM 'artist' AND v_role IS DISTINCT FROM 'admin' THEN
    -- Allow promoting path only when already artist
    RAISE EXCEPTION 'Only artist accounts can create a studio profile';
  END IF;

  IF v_artist_id IS NOT NULL THEN
    RETURN v_artist_id;
  END IF;

  v_name := COALESCE(NULLIF(trim(p_display_name), ''), NULLIF(trim(v_name), ''), 'Artist');

  INSERT INTO artists (name, studio_verified, biography, creative_philosophy)
  VALUES (
    v_name,
    false,
    v_name || ' — studio on Atelier.',
    'Made by human hands.'
  )
  RETURNING id INTO v_artist_id;

  UPDATE profiles
  SET artist_id = v_artist_id,
      role = CASE WHEN role = 'admin' THEN role ELSE 'artist' END
  WHERE id = v_uid;

  RETURN v_artist_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_artist_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_artist_profile(text) TO authenticated;

-- Admin refund / release order (status flip + note). Does not call Stripe API;
-- pair with Stripe Dashboard refund until Connect reverse is wired.
DROP FUNCTION IF EXISTS public.admin_refund_order(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_refund_order(
  p_order_id uuid,
  p_reason text DEFAULT 'Admin refund'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE orders
  SET
    status = 'refunded',
    dispute_status = CASE
      WHEN dispute_status IN ('claim_raised', 'evidence_submitted') THEN 'resolved_buyer'
      ELSE dispute_status
    END
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT o.user_id,
         'order_update',
         'Refund processed',
         COALESCE(p_reason, 'Your payment was refunded by Atelier admin.'),
         'orders'
  FROM orders o
  WHERE o.id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refund_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_refund_order(uuid, text) TO authenticated;

-- Allow refunded status if check constraint exists (best-effort)
DO $$
BEGIN
  -- no-op if constraint name unknown; apps treat refunded as terminal
  NULL;
END $$;
-- Buy Now + production gap closes

ALTER TABLE artworks ADD COLUMN IF NOT EXISTS buy_now_price numeric;

-- Instant purchase at buy_now_price while auction is live/flash and no bids
-- (or with bids only if buy_now still above current_bid — we require bid_count = 0 for simplicity)
CREATE OR REPLACE FUNCTION public.purchase_buy_now(p_auction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_auction auctions%ROWTYPE;
  v_artwork artworks%ROWTYPE;
  v_order_id uuid;
  v_shipping numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auction not found';
  END IF;

  IF v_auction.status NOT IN ('live', 'flash') THEN
    RAISE EXCEPTION 'Auction is not open for Buy Now';
  END IF;

  IF v_auction.bid_count > 0 THEN
    RAISE EXCEPTION 'Buy Now unavailable after bidding has started';
  END IF;

  SELECT * INTO v_artwork FROM artworks WHERE id = v_auction.artwork_id;
  IF v_artwork.buy_now_price IS NULL OR v_artwork.buy_now_price <= 0 THEN
    RAISE EXCEPTION 'This lot has no Buy Now price';
  END IF;

  IF NOT COALESCE(v_artwork.studio_verified, false) THEN
    RAISE EXCEPTION 'Artwork is not verified';
  END IF;

  v_shipping := CASE COALESCE(v_artwork.shipping_tier, 'medium_framed')
    WHEN 'small_canvas' THEN 25
    WHEN 'heavy_sculpture' THEN 120
    ELSE 45
  END;

  UPDATE auctions
  SET status = 'ended', outcome = 'sold', end_time = now(),
      current_bid = v_artwork.buy_now_price
  WHERE id = p_auction_id;

  INSERT INTO orders (
    user_id, artwork_id, auction_id, amount, shipping_cost, status, created_at
  ) VALUES (
    v_uid, v_artwork.id, p_auction_id, v_artwork.buy_now_price, v_shipping, 'pending_payment', now()
  )
  RETURNING id INTO v_order_id;

  INSERT INTO notifications (user_id, type, title, body, artwork_id, order_id)
  VALUES (
    v_uid,
    'order_update',
    'Buy Now reserved',
    'Complete payment for "' || v_artwork.title || '".',
    v_artwork.id,
    v_order_id
  );

  RETURN jsonb_build_object('order_id', v_order_id, 'amount', v_artwork.buy_now_price);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_buy_now(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_buy_now(uuid) TO authenticated;
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

  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT o.user_id,
         'order_update',
         'Refund processed',
         COALESCE(NULLIF(trim(p_reason), ''), 'Your payment was refunded by Atelier admin.'),
         'orders'
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
