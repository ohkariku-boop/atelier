import { supabase } from '@/lib/supabase';

/**
 * Calls close_expired_auction for a specific auction. Safe to call on any
 * auction regardless of whether it has actually ended - the RPC itself
 * checks end_time and is a no-op if it's not due yet or already closed.
 *
 * Winning no longer means "paid" - an order created here starts in
 * 'pending_payment'. The buyer gets an in-app notification (inserted by
 * the RPC itself) and completes checkout separately; see
 * completeDummyPayment below for what happens once they do.
 */
export async function tryCloseAuction(auctionId: string): Promise<{ outcome?: string; orderId?: string }> {
  try {
    const { data, error } = await supabase.rpc('close_expired_auction', { p_auction_id: auctionId });
    if (error) {
      console.error('close_expired_auction failed:', error);
      return {};
    }
    const result = data as { outcome?: string; order_id?: string } | null;
    return { outcome: result?.outcome, orderId: result?.order_id };
  } catch (err) {
    console.error('close_expired_auction threw:', err);
    return {};
  }
}

/**
 * Completes the (currently dummy) checkout step for an order awaiting
 * payment. Moves the order to 'escrow' server-side, fires the buyer's
 * receipt email and the seller's sale-notification email (both
 * best-effort - see sendReceiptEmail/notifySellerSale below).
 */
export async function completeDummyPayment(orderId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('complete_dummy_payment', { p_order_id: orderId });
  if (error) {
    return { error: error.message };
  }
  sendReceiptEmail(orderId);
  notifySellerSale(orderId);
  return {};
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

/**
 * Best-effort sale notification email to the seller. Same degrade-gracefully
 * behavior as sendReceiptEmail.
 */
export function notifySellerSale(orderId: string) {
  supabase.functions
    .invoke('notify-seller-sale', { body: { order_id: orderId } })
    .catch((err) => console.error('Seller notification not sent (function may not be deployed yet):', err));
}
