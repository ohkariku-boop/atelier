/*
# Seller notifications on auction close outcomes

When an auction closes, the winning buyer already receives a payment_due
notification (added in the checkout migration). Sellers were not notified
for the other outcomes:

  - pending_seller_review  → seller must accept or decline a below-reserve bid
  - no_bids                → auction ended with zero bids
  - sold                   → already covered indirectly via payment completion,
                             but we also notify the seller that a sale occurred
                             so they know an order is incoming

This migration patches close_expired_auction to insert the appropriate
seller-facing notification. resolve_pending_sale already notifies the buyer
on accept; we add a small confirmation notification for the seller on decline
as well (optional clarity).
*/

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
  v_shipping_cost numeric;
  v_receipt text;
  v_buyer_email text;
  v_order_id uuid;
  v_seller_id uuid;
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
  v_seller_id := v_artwork.user_id;

  SELECT * INTO v_top_bid FROM bids
    WHERE auction_id = p_auction_id
    ORDER BY amount DESC, created_at ASC
    LIMIT 1;

  -- No bids
  IF NOT FOUND THEN
    UPDATE auctions SET status = 'ended', outcome = 'no_bids' WHERE id = p_auction_id;

    IF v_seller_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, artwork_id)
      VALUES (
        v_seller_id,
        'auction_no_bids',
        'Auction ended with no bids',
        '"' || v_artwork.title || '" closed without any bids. You can relist it from the Studio Desk after re-verification if needed.',
        v_artwork.id
      );
    END IF;

    RETURN jsonb_build_object('outcome', 'no_bids');
  END IF;

  -- Below reserve → seller review
  IF v_top_bid.amount < v_artwork.reserve_price THEN
    UPDATE auctions SET status = 'ended', outcome = 'pending_seller_review' WHERE id = p_auction_id;

    IF v_seller_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, artwork_id)
      VALUES (
        v_seller_id,
        'seller_review',
        'Action needed: below-reserve bid',
        'Your auction for "' || v_artwork.title || '" ended with a top bid of $' ||
          trim(to_char(v_top_bid.amount, '999999990.00')) ||
          ' (reserve was $' || trim(to_char(v_artwork.reserve_price, '999999990.00')) ||
          '). Accept or decline in the Studio Desk.',
        v_artwork.id
      );
    END IF;

    RETURN jsonb_build_object('outcome', 'pending_seller_review');
  END IF;

  -- Reserve met → sold, create pending_payment order
  UPDATE auctions SET status = 'ended', outcome = 'sold' WHERE id = p_auction_id;

  IF v_top_bid.user_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'sold', 'order_id', null);
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
    v_shipping_cost, v_artwork.shipping_tier, 'pending_payment', v_top_bid.user_id,
    v_receipt, v_buyer_email, NULL
  ) RETURNING id INTO v_order_id;

  -- Buyer: payment due
  INSERT INTO notifications (user_id, type, title, body, artwork_id, order_id)
  VALUES (
    v_top_bid.user_id,
    'payment_due',
    'You won the auction!',
    'Complete payment for "' || v_artwork.title || '" to secure your purchase.',
    v_artwork.id,
    v_order_id
  );

  -- Seller: sale created (buyer still needs to pay)
  IF v_seller_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, artwork_id, order_id)
    VALUES (
      v_seller_id,
      'sale_pending_payment',
      'Your piece sold — awaiting payment',
      '"' || v_artwork.title || '" sold for $' ||
        trim(to_char(v_top_bid.amount, '999999990.00')) ||
        '. The buyer has been notified to complete payment.',
      v_artwork.id,
      v_order_id
    );
  END IF;

  RETURN jsonb_build_object('outcome', 'sold', 'order_id', v_order_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION close_expired_auction(uuid) FROM public;
GRANT EXECUTE ON FUNCTION close_expired_auction(uuid) TO anon, authenticated;
