import { supabase } from '@/lib/supabase';

/** Extend auction end_time by 3 minutes if bid lands in final 3 minutes. */
export async function applySoftCloseIfNeeded(auctionId: string, endTime: string): Promise<string | null> {
  const end = new Date(endTime).getTime();
  const now = Date.now();
  const threeMin = 3 * 60 * 1000;
  if (end <= now || end - now > threeMin) return null;

  const newEnd = new Date(now + threeMin).toISOString();
  try {
    // Prefer RPC if present
    const { error: rpcErr } = await supabase.rpc('apply_soft_close', { p_auction_id: auctionId });
    if (!rpcErr) return newEnd;
  } catch { /* fall through */ }

  const { error } = await supabase
    .from('auctions')
    .update({ end_time: newEnd })
    .eq('id', auctionId)
    .eq('status', 'live');
  if (error) {
    console.warn('soft close update failed', error.message);
    return null;
  }
  return newEnd;
}
