/*
# Dispute / claim process for escrow orders

## Context
Ojin (Indie Hackers commenter) pointed out that a fixed post-sale claim
window changes the verification problem: instead of needing perfect
pre-auction verification, Atelier mainly needs a predictable dispute
process before escrow funds release. This migration adds that process.

## Design (deliberately narrow for v1, per the same comment)
- `dispute_status`: 'none' -> 'claim_raised' -> 'evidence_submitted' ->
  'resolved_upheld' | 'resolved_denied'. One claim per order - once
  resolved, it cannot be reopened via these functions.
- Claim window is 72 hours from `paid_at`, computed at claim time rather
  than stored, so there's no separate column to drift out of sync.
- `raise_order_claim`: buyer-only, only within the window, only from
  dispute_status = 'none'. Requires a minimum-length reason so a claim
  has to reference something specific, not just "I have a bad feeling."
- `submit_claim_evidence`: artwork-owner-only, only from
  dispute_status = 'claim_raised'.
- Resolution (resolved_upheld / resolved_denied) is intentionally NOT a
  client-facing RPC yet - Joe reviews evidence against the published
  policy and resolves manually via the SQL editor for now:
    UPDATE orders SET dispute_status = 'resolved_denied',
      resolution_notes = '...', resolved_at = now()
      WHERE id = '<order_id>';
  This matches the "boring beats clever" approach: no admin UI needs to
  exist before the first real case does.
- `release_order_funds` replaces the frontend's direct
  `update({status:'completed'})` call. It enforces server-side that
  funds cannot be released while a claim is open, regardless of what
  the client sends - a check that must live in the database, not just
  be hidden in the UI, given the wide-open UPDATE policy already on
  this table (see note below).

## Known related gap (not fixed by this migration)
`orders` currently has `anon_update_orders ... USING (true) WITH CHECK
(true)` - any authenticated or anon user can update ANY order's status
directly, bypassing application logic entirely. This migration's new
RPCs are safe on their own merits (they check auth.uid() internally),
but the underlying table is still directly writable by anyone. Tightening
that policy is a natural next step, flagged here rather than silently
left alone.
*/

-- 1. Schema additions
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispute_status text NOT NULL DEFAULT 'none'
  CHECK (dispute_status IN ('none', 'claim_raised', 'evidence_submitted', 'resolved_upheld', 'resolved_denied'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS claim_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS claim_raised_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS evidence_notes text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS evidence_submitted_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS resolution_notes text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- 2. Buyer raises a claim within the 72-hour window
CREATE OR REPLACE FUNCTION raise_order_claim(p_order_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the buyer on this order can raise a claim';
  END IF;

  IF v_order.status = 'completed' THEN
    RAISE EXCEPTION 'Funds have already been released - this order can no longer be disputed';
  END IF;

  IF v_order.dispute_status != 'none' THEN
    RAISE EXCEPTION 'A claim has already been raised on this order';
  END IF;

  IF v_order.paid_at IS NULL OR now() > v_order.paid_at + interval '72 hours' THEN
    RAISE EXCEPTION 'The 72-hour claim window for this order has passed';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'Please describe specifically what you are disputing (at least 20 characters)';
  END IF;

  UPDATE orders SET
    dispute_status = 'claim_raised',
    claim_reason = trim(p_reason),
    claim_raised_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('dispute_status', 'claim_raised');
END;
$$;

REVOKE EXECUTE ON FUNCTION raise_order_claim(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION raise_order_claim(uuid, text) TO authenticated;

-- 3. Artist (artwork owner) submits evidence in response to a claim
CREATE OR REPLACE FUNCTION submit_claim_evidence(p_order_id uuid, p_evidence text)
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

  SELECT * INTO v_artwork FROM artworks WHERE id = v_order.artwork_id;

  IF v_artwork.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the artwork owner can respond to this claim';
  END IF;

  IF v_order.dispute_status != 'claim_raised' THEN
    RAISE EXCEPTION 'This order is not awaiting an evidence response';
  END IF;

  IF p_evidence IS NULL OR length(trim(p_evidence)) < 20 THEN
    RAISE EXCEPTION 'Please describe your evidence (dated sketches, source files, WIP photos/video)';
  END IF;

  UPDATE orders SET
    dispute_status = 'evidence_submitted',
    evidence_notes = trim(p_evidence),
    evidence_submitted_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('dispute_status', 'evidence_submitted');
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_claim_evidence(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION submit_claim_evidence(uuid, text) TO authenticated;

-- 4. Buyer releases escrow funds - now server-enforced against open claims
CREATE OR REPLACE FUNCTION release_order_funds(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the buyer on this order can release funds';
  END IF;

  IF v_order.dispute_status NOT IN ('none') THEN
    RAISE EXCEPTION 'Funds cannot be released while a claim is open on this order';
  END IF;

  UPDATE orders SET status = 'completed' WHERE id = p_order_id;

  RETURN jsonb_build_object('status', 'completed');
END;
$$;

REVOKE EXECUTE ON FUNCTION release_order_funds(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION release_order_funds(uuid) TO authenticated;
