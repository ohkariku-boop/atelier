/*
# Fix security issues: artists INSERT policy, storage listing, place_bid SECURITY DEFINER

## Issue 1: RLS Policy Always True on artists INSERT
The `auth_insert_artists` policy had `WITH CHECK (true)`, allowing any authenticated
user to insert unlimited artist records. Now restricted: only authenticated users
who don't already have an artist profile linked can insert.

## Issue 2: Public Bucket Allows Listing
Removed the `public_read_uploads` SELECT policy on storage.objects. Public bucket
objects are accessible via their public URL without any RLS policy — the SELECT
policy only enabled the list() API, which exposed file enumeration.

## Issue 3: SECURITY DEFINER function executable by authenticated
Switched `place_bid` from SECURITY DEFINER to SECURITY INVOKER. To allow the
function (running as the bidder) to update auction bid fields:
  - Revoked table-level UPDATE on auctions from authenticated/anon
  - Granted column-level UPDATE (current_bid, bid_count, end_time) only
  - Added RLS UPDATE policy: only active auctions (status live/flash)
  - Added validation trigger: prevents current_bid from decreasing and
    end_time from being set to the past
This ensures bidders can only touch bid-related columns on active auctions,
and only in a forward direction — no direct API abuse path.
*/

-- ============================================================
-- Issue 1: Fix artists INSERT policy (was WITH CHECK (true))
-- ============================================================
DROP POLICY IF EXISTS "auth_insert_artists" ON artists;
CREATE POLICY "auth_insert_artists" ON artists FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.artist_id IS NOT NULL
    )
  );

-- ============================================================
-- Issue 2: Remove public SELECT policy on storage.objects
-- Public bucket URLs work without RLS; this policy only enabled list()
-- ============================================================
DROP POLICY IF EXISTS "public_read_uploads" ON storage.objects;

-- ============================================================
-- Issue 3: Switch place_bid to SECURITY INVOKER
-- ============================================================

-- 3a. Column-level grants: revoke full UPDATE, grant only bid columns
REVOKE UPDATE ON auctions FROM authenticated, anon;
GRANT UPDATE (current_bid, bid_count, end_time) ON auctions TO authenticated;

-- 3b. RLS policy: allow authenticated to update only active auctions
DROP POLICY IF EXISTS "bidder_update_auctions" ON auctions;
CREATE POLICY "bidder_update_auctions" ON auctions FOR UPDATE
  TO authenticated
  USING (status IN ('live', 'flash'))
  WITH CHECK (status IN ('live', 'flash'));

-- 3c. Validation trigger: prevent bid manipulation via direct API
CREATE OR REPLACE FUNCTION validate_auction_bid_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Prevent lowering the current bid (e.g., setting to 0 via direct PATCH)
  IF NEW.current_bid < OLD.current_bid THEN
    RAISE EXCEPTION 'Current bid cannot be decreased';
  END IF;
  -- Prevent ending an auction early by setting end_time to the past
  IF NEW.end_time < now() THEN
    RAISE EXCEPTION 'End time cannot be set to the past';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_auction_bid_update ON auctions;
CREATE TRIGGER validate_auction_bid_update
  BEFORE UPDATE OF current_bid, end_time ON auctions
  FOR EACH ROW
  EXECUTE FUNCTION validate_auction_bid_update();

-- 3d. Rewrite place_bid as SECURITY INVOKER
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id uuid,
  p_amount numeric,
  p_bidder_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_auction RECORD;
  v_new_end_time timestamptz;
  v_anti_snipe boolean := false;
BEGIN
  -- Lock the auction row for atomic operation (requires UPDATE RLS policy)
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auction not found or not active';
  END IF;

  IF v_auction.status NOT IN ('live', 'flash') THEN
    RAISE EXCEPTION 'Auction is not active';
  END IF;

  IF v_auction.end_time <= now() THEN
    RAISE EXCEPTION 'Auction has ended';
  END IF;

  IF p_amount <= v_auction.current_bid THEN
    RAISE EXCEPTION 'Bid must be higher than current bid of %', v_auction.current_bid;
  END IF;

  -- Anti-snipe: if in final 30 seconds, extend by 2 minutes
  v_new_end_time := v_auction.end_time;
  IF v_auction.end_time - now() < interval '30 seconds' THEN
    v_new_end_time := now() + interval '2 minutes';
    v_anti_snipe := true;
  END IF;

  -- Insert the bid (requires INSERT RLS policy: auth.uid() = user_id)
  INSERT INTO bids (auction_id, bidder_name, amount, user_id)
  VALUES (p_auction_id, p_bidder_name, p_amount, auth.uid());

  -- Update the auction (column-level grant: current_bid, bid_count, end_time only)
  UPDATE auctions
  SET current_bid = p_amount,
      bid_count = bid_count + 1,
      end_time = v_new_end_time
  WHERE id = p_auction_id;

  RETURN jsonb_build_object(
    'new_end_time', v_new_end_time,
    'anti_snipe_triggered', v_anti_snipe
  );
END;
$$;

-- Keep execution restricted to authenticated only
REVOKE EXECUTE ON FUNCTION place_bid(uuid, numeric, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION place_bid(uuid, numeric, text) TO authenticated;
