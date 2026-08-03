/*
# Checkout step + notifications (Phase 1 groundwork)

## Context
Orders currently skip payment entirely - the moment an auction closes with
reserve met, the order is created already marked 'escrow' with paid_at set,
as if payment had happened automatically. This adds a real (if currently
simulated) checkout step in between: winning an auction creates an order in
'pending_payment', and nothing moves to escrow until the buyer completes a
checkout action. Real Stripe integration is deferred (Phase 0, later) - for
now, checkout is a dummy card-entry screen that always succeeds. The order
state machine is built the same way it'll need to work once payment is real,
so swapping in real Stripe later replaces one function's internals rather
than reshaping the whole flow.

## Notifications
New `notifications` table, written only via SECURITY DEFINER RPCs (never
directly, so a user can't fabricate a notification appearing to be from
Atelier or another user). Covers:
  - buyer notified when they win an auction and owe payment
  - seller notified when a buyer completes payment
Email delivery reuses the existing send-receipt-email pattern (Resend,
best-effort, degrades gracefully without an API key) - see the new
notify-seller-sale Edge Function alongside this migration.

True push notifications (browser Push API, service worker, subscription
management) are a heavier separate lift and are NOT included here - this
covers in-app + email only. Flagged rather than silently skipped.
*/

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  artwork_id uuid REFERENCES artworks(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_notifications_select" ON notifications;
CREATE POLICY "own_notifications_select" ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_notifications_update" ON notifications;
CREATE POLICY "own_notifications_update" ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- No INSERT policy for regular users at all - rows are only ever created by
-- SECURITY DEFINER RPCs below, which bypass RLS by design.

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE notifications SET read = true
  WHERE id = p_notification_id AND user_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION mark_notification_read(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION mark_notification_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE notifications SET read = true WHERE user_id = auth.uid() AND read = false;
END;
$$;

REVOKE EXECUTE ON FUNCTION mark_all_notifications_read() FROM anon, public;
GRANT EXECUTE ON FUNCTION mark_all_notifications_read() TO authenticated;

-- Redefine the two order-creating paths to land in 'pending_payment'
-- instead of 'escrow', and notify the winning buyer they owe payment.

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

  IF v_top_bid.amount < v_artwork.reserve_price THEN
    UPDATE auctions SET status = 'ended', outcome = 'pending_seller_review' WHERE id = p_auction_id;
    RETURN jsonb_build_object('outcome', 'pending_seller_review');
  END IF;

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

  INSERT INTO notifications (user_id, type, title, body, artwork_id, order_id)
  VALUES (
    v_top_bid.user_id,
    'payment_due',
    'You won an auction!',
    'Your bid on "' || v_artwork.title || '" won. Complete payment to secure your purchase.',
    v_artwork.id,
    v_order_id
  );

  RETURN jsonb_build_object('outcome', 'sold', 'order_id', v_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION resolve_pending_sale(p_auction_id uuid, p_accept boolean)
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
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auction not found';
  END IF;

  SELECT * INTO v_artwork FROM artworks WHERE id = v_auction.artwork_id;

  IF v_artwork.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the listing owner can decide on a below-reserve sale';
  END IF;

  IF v_auction.outcome IS DISTINCT FROM 'pending_seller_review' THEN
    RAISE EXCEPTION 'This auction is not awaiting a seller decision';
  END IF;

  IF NOT p_accept THEN
    UPDATE auctions SET outcome = 'declined' WHERE id = p_auction_id;
    RETURN jsonb_build_object('outcome', 'declined');
  END IF;

  SELECT * INTO v_top_bid FROM bids
    WHERE auction_id = p_auction_id
    ORDER BY amount DESC, created_at ASC
    LIMIT 1;

  UPDATE auctions SET outcome = 'sold' WHERE id = p_auction_id;

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

  INSERT INTO notifications (user_id, type, title, body, artwork_id, order_id)
  VALUES (
    v_top_bid.user_id,
    'payment_due',
    'Your offer was accepted!',
    'The artist accepted your bid on "' || v_artwork.title || '". Complete payment to secure your purchase.',
    v_artwork.id,
    v_order_id
  );

  RETURN jsonb_build_object('outcome', 'sold', 'order_id', v_order_id);
END;
$$;

-- Dummy checkout completion. Real Stripe integration will eventually
-- replace the internals of this function; callers and the rest of the
-- order lifecycle don't need to change when that happens.
CREATE OR REPLACE FUNCTION complete_dummy_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_artwork RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the buyer on this order can complete payment';
  END IF;

  IF v_order.status IS DISTINCT FROM 'pending_payment' THEN
    RAISE EXCEPTION 'This order is not awaiting payment';
  END IF;

  UPDATE orders SET status = 'escrow', paid_at = now() WHERE id = p_order_id;

  SELECT * INTO v_artwork FROM artworks WHERE id = v_order.artwork_id;

  IF v_artwork.user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, artwork_id, order_id)
    VALUES (
      v_artwork.user_id,
      'sale_paid',
      'Your piece sold!',
      '"' || v_artwork.title || '" sold for $' || v_order.amount::text || '. Payment is held in escrow - ship it to get paid.',
      v_artwork.id,
      p_order_id
    );
  END IF;

  RETURN jsonb_build_object('status', 'escrow');
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_dummy_payment(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION complete_dummy_payment(uuid) TO authenticated;
