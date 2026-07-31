/*
# Edit / delete listings, with forced re-verification on edit

## Design
Artists can edit or delete their own listings, but:
- Editing is blocked while an active auction (live/flash/upcoming) exists
  for that artwork - no editing your way out of a live auction.
- Deleting is blocked if the artwork has ever been sold (has an order).
- Any edit resets studio_verified/verification_method back to unreviewed,
  since the whole point of verification is that it's tied to what was
  actually submitted - an edited listing hasn't been reviewed yet.

## Why this needs a trigger change
prevent_studio_verified_self_update (see the two earlier migrations)
blocks any authenticated-role change to studio_verified/verification_method
outright. That's correct for preventing self-verification, but it also
blocks the *legitimate* reset-to-false that a real edit needs to do. A
SECURITY DEFINER function still executes under the calling user's JWT as
far as the trigger's role check is concerned, so it would still get
blocked without an explicit, narrow bypass.

The bypass is a session-local GUC (`app.bypass_verification_lock`) that
only these specific, already-guarded RPCs set immediately before doing
the reset - not a general permission grant. Nothing else in the schema
sets this GUC, so it can't be triggered from a raw client update.
*/

CREATE OR REPLACE FUNCTION prevent_studio_verified_self_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_service_role boolean;
  v_bypass boolean;
BEGIN
  v_is_service_role := current_setting('request.jwt.claims', true)::json->>'role' = 'service_role';
  v_bypass := current_setting('app.bypass_verification_lock', true) = 'true';

  IF NOT v_is_service_role AND NOT v_bypass THEN
    IF NEW.studio_verified IS DISTINCT FROM OLD.studio_verified THEN
      NEW.studio_verified := OLD.studio_verified;
    END IF;
    IF NEW.verification_method IS DISTINCT FROM OLD.verification_method THEN
      NEW.verification_method := OLD.verification_method;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Edit an existing listing. Resets verification status - the edited
-- version hasn't been reviewed yet, regardless of what it looked like
-- before.
CREATE OR REPLACE FUNCTION edit_artwork_listing(
  p_artwork_id uuid,
  p_title text,
  p_medium text,
  p_dimensions text,
  p_description text,
  p_reserve_price numeric,
  p_starting_bid numeric,
  p_shipping_tier text,
  p_image_url text,
  p_requested_verification_method text,
  p_verification_video_url text,
  p_evidence_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artwork RECORD;
  v_active_count integer;
BEGIN
  SELECT * INTO v_artwork FROM artworks WHERE id = p_artwork_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artwork not found';
  END IF;

  IF v_artwork.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the listing owner can edit it';
  END IF;

  SELECT count(*) INTO v_active_count
  FROM auctions
  WHERE artwork_id = p_artwork_id
    AND status IN ('live', 'flash', 'upcoming');

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'This listing has an active auction and cannot be edited right now';
  END IF;

  PERFORM set_config('app.bypass_verification_lock', 'true', true);

  UPDATE artworks SET
    title = p_title,
    medium = p_medium,
    dimensions = p_dimensions,
    description = p_description,
    reserve_price = p_reserve_price,
    starting_bid = p_starting_bid,
    shipping_tier = p_shipping_tier,
    image_url = p_image_url,
    studio_verified = false,
    verification_method = NULL,
    requested_verification_method = p_requested_verification_method,
    verification_video_url = p_verification_video_url,
    evidence_items = p_evidence_items
  WHERE id = p_artwork_id;

  RETURN jsonb_build_object('status', 'updated_pending_review');
END;
$$;

REVOKE EXECUTE ON FUNCTION edit_artwork_listing(uuid, text, text, text, text, numeric, numeric, text, text, text, text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION edit_artwork_listing(uuid, text, text, text, text, numeric, numeric, text, text, text, text, jsonb) TO authenticated;

-- Delete a listing. Blocked if it has ever been sold.
CREATE OR REPLACE FUNCTION delete_artwork_listing(p_artwork_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artwork RECORD;
  v_active_count integer;
  v_order_count integer;
BEGIN
  SELECT * INTO v_artwork FROM artworks WHERE id = p_artwork_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artwork not found';
  END IF;

  IF v_artwork.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the listing owner can delete it';
  END IF;

  SELECT count(*) INTO v_active_count
  FROM auctions
  WHERE artwork_id = p_artwork_id
    AND status IN ('live', 'flash', 'upcoming');

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'This listing has an active auction and cannot be deleted right now';
  END IF;

  SELECT count(*) INTO v_order_count FROM orders WHERE artwork_id = p_artwork_id;

  IF v_order_count > 0 THEN
    RAISE EXCEPTION 'This piece has already been sold and cannot be deleted';
  END IF;

  DELETE FROM artworks WHERE id = p_artwork_id;

  RETURN jsonb_build_object('status', 'deleted');
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_artwork_listing(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION delete_artwork_listing(uuid) TO authenticated;
