/*
# Bulk auction closer for reliable scheduled closing

## Problem
close_expired_auction() only runs when a user loads the Gallery or an
Auction Detail page. Auctions can sit past their end_time indefinitely
if no one visits the site.

## Solution
1. close_all_expired_auctions() — SECURITY DEFINER function that finds
   every auction whose end_time has passed and status is not yet 'ended',
   then calls the existing close_expired_auction() logic for each one.
   Returns a summary of what was closed.

2. This function is intentionally *not* granted to anon/authenticated.
   It is only callable with the service role key (Edge Functions / cron).

3. The existing per-auction close_expired_auction() remains available to
   the frontend as a safety net / optimistic close on page load.
*/

CREATE OR REPLACE FUNCTION close_all_expired_auctions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auction RECORD;
  v_result jsonb;
  v_closed integer := 0;
  v_sold integer := 0;
  v_pending_review integer := 0;
  v_no_bids integer := 0;
  v_errors text[] := ARRAY[]::text[];
  v_details jsonb := '[]'::jsonb;
BEGIN
  -- Process oldest first so long-overdue auctions are handled before
  -- recently expired ones.
  FOR v_auction IN
    SELECT id, end_time
    FROM auctions
    WHERE status IN ('live', 'flash', 'upcoming')
      AND end_time <= now()
    ORDER BY end_time ASC
    LIMIT 100  -- safety cap per run; cron can call repeatedly
  LOOP
    BEGIN
      v_result := close_expired_auction(v_auction.id);

      v_closed := v_closed + 1;

      IF (v_result->>'outcome') = 'sold' THEN
        v_sold := v_sold + 1;
      ELSIF (v_result->>'outcome') = 'pending_seller_review' THEN
        v_pending_review := v_pending_review + 1;
      ELSIF (v_result->>'outcome') = 'no_bids' THEN
        v_no_bids := v_no_bids + 1;
      END IF;

      v_details := v_details || jsonb_build_array(
        jsonb_build_object(
          'auction_id', v_auction.id,
          'result', v_result
        )
      );
    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, v_auction.id::text || ': ' || SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'closed', v_closed,
    'sold', v_sold,
    'pending_seller_review', v_pending_review,
    'no_bids', v_no_bids,
    'errors', to_jsonb(v_errors),
    'details', v_details,
    'ran_at', now()
  );
END;
$$;

-- Only the service role (Edge Functions / backend jobs) should call this.
REVOKE EXECUTE ON FUNCTION close_all_expired_auctions() FROM public, anon, authenticated;
-- service_role retains execute by default on SECURITY DEFINER functions
-- in Supabase; no extra GRANT needed.
