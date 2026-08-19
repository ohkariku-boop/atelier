/*
# Featured artworks + admin dispute resolution
*/

ALTER TABLE artworks ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_artworks_featured ON artworks(is_featured) WHERE is_featured = true;

CREATE OR REPLACE FUNCTION resolve_order_dispute(
  p_order_id uuid,
  p_uphold boolean,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_role text;
  v_is_service boolean;
  v_status text;
BEGIN
  v_is_service := coalesce(
    current_setting('request.jwt.claims', true)::json->>'role',
    ''
  ) = 'service_role';

  IF NOT v_is_service THEN
    SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
    IF v_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only admins can resolve disputes';
    END IF;
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.dispute_status NOT IN ('claim_raised', 'evidence_submitted') THEN
    RAISE EXCEPTION 'Order is not in a resolvable dispute state';
  END IF;

  v_status := CASE WHEN p_uphold THEN 'resolved_upheld' ELSE 'resolved_denied' END;

  UPDATE orders SET
    dispute_status = v_status,
    resolution_notes = nullif(trim(coalesce(p_notes, '')), ''),
    resolved_at = now()
  WHERE id = p_order_id;

  -- Notify buyer
  IF v_order.user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, order_id)
    VALUES (
      v_order.user_id,
      'dispute_resolved',
      'Dispute resolved',
      CASE WHEN p_uphold
        THEN 'Your claim was upheld. Our team will follow up on next steps.'
        ELSE 'Your claim was reviewed and denied.' ||
          CASE WHEN p_notes IS NOT NULL AND length(trim(p_notes)) > 0
            THEN ' Note: ' || trim(p_notes) ELSE '' END
      END,
      p_order_id
    );
  END IF;

  RETURN jsonb_build_object('dispute_status', v_status, 'order_id', p_order_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION resolve_order_dispute(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION resolve_order_dispute(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION set_artwork_featured(p_artwork_id uuid, p_featured boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_service boolean;
BEGIN
  v_is_service := coalesce(
    current_setting('request.jwt.claims', true)::json->>'role',
    ''
  ) = 'service_role';

  IF NOT v_is_service THEN
    SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
    IF v_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only admins can feature artworks';
    END IF;
  END IF;

  UPDATE artworks SET is_featured = p_featured WHERE id = p_artwork_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_artwork_featured(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_artwork_featured(uuid, boolean) TO authenticated;
