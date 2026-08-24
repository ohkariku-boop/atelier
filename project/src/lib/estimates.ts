import type { Artwork } from '@/types';

export function getEstimateRange(artwork: Pick<Artwork, 'starting_bid' | 'buy_now_price'> & {
  estimate_low?: number | null;
  estimate_high?: number | null;
}): { low: number; high: number } {
  const low =
    artwork.estimate_low != null && Number(artwork.estimate_low) > 0
      ? Number(artwork.estimate_low)
      : Math.round(Number(artwork.starting_bid || 0) * 0.9);
  const high =
    artwork.estimate_high != null && Number(artwork.estimate_high) > 0
      ? Number(artwork.estimate_high)
      : Math.round(
          Number(artwork.buy_now_price || 0) > 0
            ? Number(artwork.buy_now_price)
            : Number(artwork.starting_bid || 0) * 1.8
        );
  return { low, high: Math.max(high, low) };
}
