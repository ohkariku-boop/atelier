# `orders` table — schema definition

Consolidated definition of what Atelier expects in production (base create + later migrations).

## Logical CREATE (reference)

```sql
CREATE TABLE orders (
  -- Identity
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz DEFAULT now(),

  -- Relations
  auction_id      uuid REFERENCES auctions(id) ON DELETE CASCADE,
  artwork_id      uuid REFERENCES artworks(id) ON DELETE CASCADE,
  user_id         uuid,                          -- buyer auth.users / profiles.id

  -- Commercial
  buyer_name      text,                          -- legacy display; prefer profile
  buyer_email     text,
  amount          numeric NOT NULL,              -- hammer / buy-now amount
  shipping_cost   numeric NOT NULL DEFAULT 0,
  shipping_tier   text NOT NULL DEFAULT 'medium_framed',
  currency        text NOT NULL DEFAULT 'usd',
  platform_fee_cents integer,

  -- Lifecycle
  -- Typical: pending_payment → escrow → shipped → delivered → completed
  -- Also: refunded (admin), plus dispute overlays
  status          text NOT NULL DEFAULT 'escrow',
  tracking_number text,
  receipt_number  text UNIQUE,
  paid_at         timestamptz,

  -- Stripe
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,

  -- Disputes (from dispute_claim_process)
  dispute_status  text,           -- e.g. none | claim_raised | evidence_submitted | resolved_buyer | resolved_seller
  resolution_notes text,

  -- Refund audit (denormalized; full trail in admin_audit_log)
  refunded_at     timestamptz,
  refunded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  refund_reason   text
);

CREATE UNIQUE INDEX idx_orders_stripe_session
  ON orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX idx_orders_auction_id ON orders (auction_id);
CREATE INDEX idx_orders_user_id ON orders (user_id);
CREATE INDEX idx_orders_status ON orders (status);
```

## Status values (app convention)

| Status | Meaning |
|--------|---------|
| `pending_payment` | Won / Buy Now reserved; buyer must pay |
| `escrow` | Paid; funds held pending fulfillment |
| `shipped` | Tracking added |
| `delivered` | Marked delivered |
| `completed` | Closed successfully |
| `refunded` | Admin refund recorded (Stripe refund separate until wired) |

## Audit trail

- **`admin_audit_log`** — append-only rows for `action = 'order_refund'` with actor, reason, and JSON metadata (previous status, amounts, Stripe ids).
- **`orders.refunded_at` / `refunded_by` / `refund_reason`** — fast filters on the order row.
- RPC: `admin_refund_order(p_order_id, p_reason)` writes both.

## RLS (intent)

- Buyers: select/update own rows (`user_id = auth.uid()`).
- Admins: broader access via policies + SECURITY DEFINER RPCs.
- No anonymous writes in production hardening path.
