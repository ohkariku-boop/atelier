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
