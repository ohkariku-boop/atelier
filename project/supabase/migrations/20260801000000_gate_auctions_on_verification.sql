/*
# Require studio_verified before an auction can exist

## Issue
`auctions` has always had `anon_insert_auctions ... WITH CHECK (true)` -
any authenticated or anon request could insert an auction row for any
artwork, verified or not. The frontend also auto-created an auction
immediately on listing submission, before any review happened at all.

## Fix
A BEFORE INSERT trigger on `auctions` that blocks the insert unless the
referenced artwork has `studio_verified = true`. This is enforced at the
database level so it can't be bypassed by calling the API directly,
independent of whatever the frontend does or doesn't check.

Also blocks creating a second active auction (live/flash/upcoming) for an
artwork that already has one, so "Start Auction" can't be double-clicked
into two competing auctions for the same piece.
*/

CREATE OR REPLACE FUNCTION prevent_unverified_auction_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_artwork RECORD;
  v_existing_active_count integer;
BEGIN
  SELECT * INTO v_artwork FROM artworks WHERE id = NEW.artwork_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artwork not found';
  END IF;

  IF v_artwork.studio_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'This artwork must pass studio verification before an auction can be created for it';
  END IF;

  SELECT count(*) INTO v_existing_active_count
  FROM auctions
  WHERE artwork_id = NEW.artwork_id
    AND status IN ('live', 'flash', 'upcoming');

  IF v_existing_active_count > 0 THEN
    RAISE EXCEPTION 'This artwork already has an active auction';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_unverified_auction ON auctions;
CREATE TRIGGER prevent_unverified_auction
  BEFORE INSERT ON auctions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_unverified_auction_insert();

-- Server-enforced "start auction" - artist calls this once their listing
-- is verified, instead of the client inserting into auctions directly.
CREATE OR REPLACE FUNCTION start_auction_for_artwork(p_artwork_id uuid, p_duration_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artwork RECORD;
  v_auction_id uuid;
BEGIN
  SELECT * INTO v_artwork FROM artworks WHERE id = p_artwork_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artwork not found';
  END IF;

  IF v_artwork.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the listing owner can start an auction for it';
  END IF;

  IF v_artwork.studio_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'This listing has not passed studio verification yet';
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

REVOKE EXECUTE ON FUNCTION start_auction_for_artwork(uuid, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION start_auction_for_artwork(uuid, integer) TO authenticated;
