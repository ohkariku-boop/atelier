import { supabase } from '@/lib/supabase';

/**
 * Calls close_expired_auction for a specific auction. Safe to call on any
 * auction regardless of whether it has actually ended - the RPC itself
 * checks end_time and is a no-op if it's not due yet or already closed.
 *
 * If this results in an order being created, fires off the receipt email
 * (best-effort - failures here should never block the UI, since email
 * delivery requires a Resend API key to be configured server-side; see
 * supabase/functions/send-receipt-email).
 */
export async function tryCloseAuction(auctionId: string): Promise<{ outcome?: string; orderId?: string }> {
  try {
    const { data, error } = await supabase.rpc('close_expired_auction', { p_auction_id: auctionId });
    if (error) {
      console.error('close_expired_auction failed:', error);
      return {};
    }
    const result = data as { outcome?: string; order_id?: string } | null;
    if (result?.order_id) {
      sendReceiptEmail(result.order_id);
    }
    return { outcome: result?.outcome, orderId: result?.order_id };
  } catch (err) {
    console.error('close_expired_auction threw:', err);
    return {};
  }
}

/**
 * Best-effort receipt email. This will silently no-op if the Edge Function
 * isn't deployed yet or has no RESEND_API_KEY configured - it should never
 * throw or block the purchase flow.
 */
export function sendReceiptEmail(orderId: string) {
  supabase.functions
    .invoke('send-receipt-email', { body: { order_id: orderId } })
    .catch((err) => console.error('Receipt email not sent (function may not be deployed yet):', err));
}
