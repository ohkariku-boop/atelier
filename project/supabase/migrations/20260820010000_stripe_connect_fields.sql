/*
# Stripe Connect + Checkout fields

No secrets live in the DB. Edge Functions use STRIPE_SECRET_KEY /
STRIPE_WEBHOOK_SECRET from Supabase secrets.

Flow:
1. Artist connects Express account → stripe_account_id on profiles
2. Buyer pays pending_payment order → Checkout Session
3. Webhook checkout.session.completed → mark order escrow + paid_at
4. Later: transfer/release to connected account (release-payout function)
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_account_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_onboarding_complete boolean NOT NULL DEFAULT false;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fee_cents integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'usd';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_session
  ON orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- Called by stripe-webhook Edge Function with service_role only
CREATE OR REPLACE FUNCTION complete_stripe_payment(
  p_order_id uuid,
  p_payment_intent_id text DEFAULT NULL,
  p_checkout_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_artwork RECORD;
BEGIN
  -- Only service_role may call this (webhook)
  IF coalesce(current_setting('request.jwt.claims', true)::json->>'role', '')
       IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status = 'escrow' OR v_order.status = 'shipped'
     OR v_order.status = 'delivered' OR v_order.status = 'completed' THEN
    RETURN jsonb_build_object('already_paid', true, 'status', v_order.status);
  END IF;

  IF v_order.status IS DISTINCT FROM 'pending_payment' THEN
    RAISE EXCEPTION 'Order is not awaiting payment (status=%)', v_order.status;
  END IF;

  UPDATE orders SET
    status = 'escrow',
    paid_at = now(),
    stripe_payment_intent_id = coalesce(p_payment_intent_id, stripe_payment_intent_id),
    stripe_checkout_session_id = coalesce(p_checkout_session_id, stripe_checkout_session_id)
  WHERE id = p_order_id;

  SELECT * INTO v_artwork FROM artworks WHERE id = v_order.artwork_id;

  -- Notify seller funds held in escrow
  IF v_artwork.user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, artwork_id, order_id)
    VALUES (
      v_artwork.user_id,
      'payment_received',
      'Buyer paid — funds in escrow',
      'Payment received for "' || coalesce(v_artwork.title, 'your work') ||
        '". Funds are held in escrow until delivery is confirmed.',
      v_artwork.id,
      p_order_id
    );
  END IF;

  -- Notify buyer
  IF v_order.user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, artwork_id, order_id)
    VALUES (
      v_order.user_id,
      'payment_confirmed',
      'Payment confirmed',
      'Your payment is secured in escrow. The artist will ship your work soon.',
      v_order.artwork_id,
      p_order_id
    );
  END IF;

  RETURN jsonb_build_object('status', 'escrow', 'order_id', p_order_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_stripe_payment(uuid, text, text) FROM public, anon, authenticated;
