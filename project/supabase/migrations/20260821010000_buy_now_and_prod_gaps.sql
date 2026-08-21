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
  SET status = 'ended', outcome = 'sold_buy_now', end_time = now(),
      current_bid = v_artwork.buy_now_price
  WHERE id = p_auction_id;

  INSERT INTO orders (
    user_id, artwork_id, auction_id, amount, shipping_cost, status, created_at
  ) VALUES (
    v_uid, v_artwork.id, p_auction_id, v_artwork.buy_now_price, v_shipping, 'pending_payment', now()
  )
  RETURNING id INTO v_order_id;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    v_uid,
    'order_update',
    'Buy Now reserved',
    'Complete payment for "' || v_artwork.title || '".',
    'orders'
  );

  RETURN jsonb_build_object('order_id', v_order_id, 'amount', v_artwork.buy_now_price);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_buy_now(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_buy_now(uuid) TO authenticated;
