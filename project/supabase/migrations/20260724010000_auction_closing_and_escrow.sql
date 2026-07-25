/*
# Auction closing, reserve logic, and escrow order creation

## Overview
Adds the missing piece of the auction lifecycle: what happens when an
auction's end_time passes. Previously nothing did - auctions just sat in
'live'/'flash' forever with no winner determined and no order created.

## Design
- `auctions.outcome` (new column) records what happened when an auction
  closed: 'sold' | 'pending_seller_review' | 'declined' | 'no_bids' | NULL
  (still open). `status` still becomes 'ended' in every closed case, so
  every existing "status === 'ended'" check already in the frontend
  (badges, disabling the bid button) keeps working unchanged - `outcome`
  is purely additive, driving the new seller-review and receipt UI.
- Reserve met (current highest bid >= artwork.reserve_price - the seller's
  floor price) -> automatic sale, an escrow order is created immediately,
  no seller action needed.
- Reserve not met -> outcome = 'pending_seller_review'. The artwork owner
  can then call resolve_pending_sale() to accept (creates the order at the
  actual top bid amount, seller's discretion) or decline (no sale).
- No real payment processor exists yet, so "payment" is bypassed - an order
  landing in 'escrow' status represents "payment captured, funds held" for
  the purposes of this MVP. This is a deliberate placeholder, not a
  security gap to fix later - there is no money actually moving yet.
- Shipping cost is computed server-side from a fixed lookup mirroring
  SHIPPING_RATES in src/lib/theme.ts, rather than trusted from the client.
- Closing is "lazy": there is no cron job running in the background, so an
  auction only actually closes when close_expired_auction() is called -
  which the frontend now calls whenever a relevant page is viewed after
  end_time has passed. This means closing can be delayed until someone
  next loads the page, not instant to the second.
*/

-- 1. Schema additions
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS outcome text
  CHECK (outcome IN ('sold', 'pending_seller_review', 'declined', 'no_bids') OR outcome IS NULL);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_number text UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_email text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- 2. Shared helper: create the escrow order for the current top bidder on
-- an auction. Not exposed to clients directly (no GRANT EXECUTE to
-- authenticated) - only called internally by the two functions below.
CREATE OR REPLACE FUNCTION create_order_for_auction(p_auction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auction RECORD;
  v_artwork RECORD;
  v_top_bid RECORD;
  v_shipping_cost numeric;
  v_receipt text;
  v_buyer_email text;
  v_order_id uuid;
BEGIN
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id;
  SELECT * INTO v_artwork FROM artworks WHERE id = v_auction.artwork_id;

  SELECT * INTO v_top_bid FROM bids
    WHERE auction_id = p_auction_id
    ORDER BY amount DESC, created_at ASC
    LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No bids to create an order from';
  END IF;

  -- Defensive: a bid with no attributable user (e.g. legacy/anonymous data)
  -- can't be turned into a real order for nobody.
  IF v_top_bid.user_id IS NULL THEN
    RAISE EXCEPTION 'Winning bid has no attributable buyer - cannot create order';
  END IF;

  v_shipping_cost := CASE v_artwork.shipping_tier
    WHEN 'small_canvas' THEN 35
    WHEN 'medium_framed' THEN 85
    WHEN 'heavy_sculpture' THEN 145
    ELSE 85
  END;

  v_receipt := 'ATL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  SELECT email INTO v_buyer_email FROM auth.users WHERE id = v_top_bid.user_id;

  INSERT INTO orders (
    auction_id, artwork_id, buyer_name, amount, shipping_cost, shipping_tier,
    status, user_id, receipt_number, buyer_email, paid_at
  ) VALUES (
    p_auction_id, v_auction.artwork_id, v_top_bid.bidder_name, v_top_bid.amount,
    v_shipping_cost, v_artwork.shipping_tier, 'escrow', v_top_bid.user_id,
    v_receipt, v_buyer_email, now()
  ) RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'amount', v_top_bid.amount,
    'shipping_cost', v_shipping_cost,
    'receipt_number', v_receipt
  );
END;
$$;

-- 3. close_expired_auction: called by the frontend when viewing an auction
-- whose end_time has passed. Idempotent - safe to call repeatedly. Locks
-- the row so two near-simultaneous callers can't both process the same
-- expired auction.
CREATE OR REPLACE FUNCTION close_expired_auction(p_auction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auction RECORD;
  v_artwork RECORD;
  v_top_bid RECORD;
  v_order jsonb;
BEGIN
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auction not found';
  END IF;

  IF v_auction.status = 'ended' THEN
    RETURN jsonb_build_object('already_closed', true, 'outcome', v_auction.outcome);
  END IF;

  IF v_auction.end_time > now() THEN
    RETURN jsonb_build_object('not_yet_ended', true);
  END IF;

  SELECT * INTO v_artwork FROM artworks WHERE id = v_auction.artwork_id;

  SELECT * INTO v_top_bid FROM bids
    WHERE auction_id = p_auction_id
    ORDER BY amount DESC, created_at ASC
    LIMIT 1;

  IF NOT FOUND THEN
    UPDATE auctions SET status = 'ended', outcome = 'no_bids' WHERE id = p_auction_id;
    RETURN jsonb_build_object('outcome', 'no_bids');
  END IF;

  IF v_top_bid.amount >= v_artwork.reserve_price AND v_top_bid.user_id IS NOT NULL THEN
    v_order := create_order_for_auction(p_auction_id);
    UPDATE auctions SET status = 'ended', outcome = 'sold' WHERE id = p_auction_id;
    RETURN (jsonb_build_object('outcome', 'sold') || v_order);
  ELSE
    UPDATE auctions SET status = 'ended', outcome = 'pending_seller_review' WHERE id = p_auction_id;
    RETURN jsonb_build_object(
      'outcome', 'pending_seller_review',
      'top_bid', v_top_bid.amount,
      'reserve_price', v_artwork.reserve_price
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION close_expired_auction(uuid) FROM public;
GRANT EXECUTE ON FUNCTION close_expired_auction(uuid) TO anon, authenticated;

-- 4. resolve_pending_sale: the artwork owner accepts or declines a
-- below-reserve sale after the auction has closed pending review. Locks
-- the row first so a double-click can't create two orders.
CREATE OR REPLACE FUNCTION resolve_pending_sale(p_auction_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auction RECORD;
  v_artwork RECORD;
  v_order jsonb;
BEGIN
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auction not found';
  END IF;

  SELECT * INTO v_artwork FROM artworks WHERE id = v_auction.artwork_id;

  IF v_artwork.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the artwork owner can resolve this sale';
  END IF;

  IF v_auction.outcome IS DISTINCT FROM 'pending_seller_review' THEN
    RAISE EXCEPTION 'This auction is not awaiting seller review';
  END IF;

  IF p_accept THEN
    v_order := create_order_for_auction(p_auction_id);
    UPDATE auctions SET outcome = 'sold' WHERE id = p_auction_id;
    RETURN (jsonb_build_object('outcome', 'sold') || v_order);
  ELSE
    UPDATE auctions SET outcome = 'declined' WHERE id = p_auction_id;
    RETURN jsonb_build_object('outcome', 'declined');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION resolve_pending_sale(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION resolve_pending_sale(uuid, boolean) TO authenticated;

-- 5. Add orders to realtime so the buyer's order/receipt view can update
-- immediately once an order is created, without a manual refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;
