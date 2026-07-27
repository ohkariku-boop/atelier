/*
# Artist controls over their own auction

## New capabilities
- cancel_listing(auction_id): artist can withdraw their own listing, but
  only before any bids exist. Once someone has bid in good faith,
  pulling the listing would break trust with them.
- end_auction_now(auction_id): artist can close their own auction early
  at any time while live, reusing the exact same closing logic
  (close_expired_auction) as natural expiry - reserve met still triggers
  an automatic sale, reserve not met still routes to seller review.
- Reserve price is now locked at the database level once the first bid
  lands - not just hidden in the UI. A seller changing the floor price
  after bidding has started (raising it after seeing what a bidder will
  pay, or lowering it to force a quick sale) is exactly what real auction
  houses prohibit as a matter of basic fairness.

## outcome gains 'cancelled' as a distinct value from 'no_bids' - a
natural no-bid expiry and a seller proactively withdrawing are different
things worth being able to tell apart later.
*/

ALTER TABLE auctions DROP CONSTRAINT IF EXISTS auctions_outcome_check;
ALTER TABLE auctions ADD CONSTRAINT auctions_outcome_check
  CHECK (outcome IN ('sold', 'pending_seller_review', 'declined', 'no_bids', 'cancelled') OR outcome IS NULL);

-- Lock reserve_price once the artwork's auction has any bids
CREATE OR REPLACE FUNCTION prevent_reserve_change_after_bids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_bids boolean;
BEGIN
  IF NEW.reserve_price IS DISTINCT FROM OLD.reserve_price THEN
    SELECT EXISTS (
      SELECT 1 FROM auctions a
      JOIN bids b ON b.auction_id = a.id
      WHERE a.artwork_id = OLD.id
    ) INTO v_has_bids;

    IF v_has_bids THEN
      RAISE EXCEPTION 'Reserve price cannot be changed after bidding has started';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_reserve_after_bids ON artworks;
CREATE TRIGGER lock_reserve_after_bids
  BEFORE UPDATE OF reserve_price ON artworks
  FOR EACH ROW
  EXECUTE FUNCTION prevent_reserve_change_after_bids();

-- Cancel a listing that has no bids yet
CREATE OR REPLACE FUNCTION cancel_listing(p_auction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auction RECORD;
  v_artwork RECORD;
BEGIN
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auction not found';
  END IF;

  SELECT * INTO v_artwork FROM artworks WHERE id = v_auction.artwork_id;

  IF v_artwork.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the artwork owner can cancel this listing';
  END IF;

  IF v_auction.status NOT IN ('live', 'flash', 'upcoming') THEN
    RAISE EXCEPTION 'This listing cannot be cancelled - it has already closed';
  END IF;

  IF v_auction.bid_count > 0 THEN
    RAISE EXCEPTION 'This listing has bids and can no longer be cancelled';
  END IF;

  UPDATE auctions SET status = 'ended', outcome = 'cancelled' WHERE id = p_auction_id;

  RETURN jsonb_build_object('cancelled', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_listing(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION cancel_listing(uuid) TO authenticated;

-- End a live auction early, reusing the exact same closing decision logic
CREATE OR REPLACE FUNCTION end_auction_now(p_auction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auction RECORD;
  v_artwork RECORD;
BEGIN
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auction not found';
  END IF;

  SELECT * INTO v_artwork FROM artworks WHERE id = v_auction.artwork_id;

  IF v_artwork.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the artwork owner can end this auction early';
  END IF;

  IF v_auction.status NOT IN ('live', 'flash') THEN
    RAISE EXCEPTION 'This auction is not currently live';
  END IF;

  UPDATE auctions SET end_time = now() WHERE id = p_auction_id;

  RETURN close_expired_auction(p_auction_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION end_auction_now(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION end_auction_now(uuid) TO authenticated;
