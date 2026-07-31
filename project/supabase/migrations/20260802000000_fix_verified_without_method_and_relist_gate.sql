/*
# Fix verified-without-method data inconsistency + require fresh review to relist

## Part 1: the badge bug you're still seeing
`studio_verified = true` with `verification_method = NULL` is possible for any
artwork that was verified before the verification_method column existed (set
directly via SQL, before this feature was built). The frontend badge fix
already shipped, but two of these badges are keyed only on `studio_verified`
(the top pill, via the shared Badge component) - a genuinely verified legacy
piece with no method recorded will still show those, while the newer
method-aware section correctly shows "pending review" since it has nothing
to display. Both are reading real (if incomplete) data; the actual bug is
that the data itself is inconsistent.

Fix: backfill the specific inconsistent rows, then add a CHECK constraint so
the database itself refuses to be in this state again - `studio_verified`
cannot be true without a `verification_method`, enforced at the schema level,
not just in application code that could drift out of sync again later.

## Part 2: relisting after an ended auction needs fresh approval
Today, once `studio_verified = true`, an artist can call
`start_auction_for_artwork` again after a prior auction ends (as long as
there's no *active* one) - even though nothing re-reviewed the listing since
that auction ended. This adds `verified_at`, stamped whenever a reviewer
approves a listing, and requires it to be *after* the end of any prior
auction on that artwork before a new one can start. Editing a listing (which
already resets studio_verified/verification_method) also clears verified_at,
so relisting always requires: edit -> fresh review -> verified_at is now
recent -> Start Auction becomes available again.

Selling a piece (an order exists) blocks starting a new auction entirely,
regardless of verification status - a physical piece that's already sold
should never be re-auctioned.
*/

-- Part 1: backfill and constrain
UPDATE artworks
SET verification_method = 'live_video'
WHERE studio_verified = true AND verification_method IS NULL;

ALTER TABLE artworks ADD CONSTRAINT studio_verified_requires_method
  CHECK (studio_verified IS NOT TRUE OR verification_method IS NOT NULL);

-- Part 2: verified_at, guarded the same way as studio_verified/verification_method
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS verified_at timestamptz;
UPDATE artworks SET verified_at = now() WHERE studio_verified = true AND verified_at IS NULL;

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
    IF NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
      NEW.verified_at := OLD.verified_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- edit_artwork_listing already resets studio_verified/verification_method under
-- the bypass GUC; also clear verified_at so a fresh review is required.
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

  IF EXISTS (SELECT 1 FROM orders WHERE artwork_id = p_artwork_id) THEN
    RAISE EXCEPTION 'This piece has already been sold and cannot be edited';
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
    verified_at = NULL,
    requested_verification_method = p_requested_verification_method,
    verification_video_url = p_verification_video_url,
    evidence_items = p_evidence_items
  WHERE id = p_artwork_id;

  RETURN jsonb_build_object('status', 'updated_pending_review');
END;
$$;

-- start_auction_for_artwork: block if sold, and require verification to be
-- fresher than the end of any prior auction on this artwork (i.e. relisting
-- needs a real re-review, not just a stale verified flag from before).
CREATE OR REPLACE FUNCTION start_auction_for_artwork(p_artwork_id uuid, p_duration_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artwork RECORD;
  v_auction_id uuid;
  v_last_ended timestamptz;
BEGIN
  SELECT * INTO v_artwork FROM artworks WHERE id = p_artwork_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artwork not found';
  END IF;

  IF v_artwork.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the listing owner can start an auction for it';
  END IF;

  IF EXISTS (SELECT 1 FROM orders WHERE artwork_id = p_artwork_id) THEN
    RAISE EXCEPTION 'This piece has already been sold and cannot be relisted';
  END IF;

  IF v_artwork.studio_verified IS NOT TRUE OR v_artwork.verification_method IS NULL THEN
    RAISE EXCEPTION 'This listing has not passed studio verification yet';
  END IF;

  SELECT max(end_time) INTO v_last_ended
  FROM auctions
  WHERE artwork_id = p_artwork_id AND status = 'ended';

  IF v_last_ended IS NOT NULL AND (v_artwork.verified_at IS NULL OR v_artwork.verified_at <= v_last_ended) THEN
    RAISE EXCEPTION 'This listing''s previous auction ended since it was last verified - edit and resubmit for review before relisting';
  END IF;

  INSERT INTO auctions (artwork_id, status, end_time, current_bid, bid_count, is_flash)
  VALUES (
    p_artwork_id,
    'live',
    now() + (p_duration_hours || ' hours')::interval,
    v_artwork.starting_bid,
    0,
    false
  )
  RETURNING id INTO v_auction_id;

  RETURN jsonb_build_object('auction_id', v_auction_id);
END;
$$;

/*
Manual review going forward should stamp verified_at, e.g.:

  UPDATE artworks
  SET studio_verified = true, verification_method = 'evidence_based', verified_at = now()
  WHERE id = '<artwork_id>';
*/
