import { useState, useEffect } from 'react';
import { X, Gavel, TrendingUp, ShieldCheck } from 'lucide-react';
import type { AuctionWithDetails } from '@/types';
import { formatCurrency } from '@/lib/theme';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

interface BidDrawerProps {
  auction: AuctionWithDetails;
  onClose: () => void;
  onBidPlaced: () => void;
}

export function BidDrawer({ auction, onClose, onBidPlaced }: BidDrawerProps) {
  const { showToast } = useToast();
  const { profile, session } = useAuth();
  const [bidAmount, setBidAmount] = useState<number>(auction.current_bid + 10);
  const [submitting, setSubmitting] = useState(false);

  const minBid = auction.current_bid + 10;
  const reserveMet = auction.current_bid >= auction.artwork.reserve_price;
  const remainingMs = new Date(auction.end_time).getTime() - Date.now();
  const inFinal30s = remainingMs < 30000 && remainingMs > 0;

  useEffect(() => {
    setBidAmount(minBid);
  }, [minBid]);

  const quickBids = [10, 50, 100];

  const placeBid = async () => {
    if (!session?.user) {
      showToast('Please sign in to place a bid.', 'error');
      return;
    }
    if (bidAmount < minBid) {
      showToast(`Minimum bid is ${formatCurrency(minBid)}.`, 'error');
      return;
    }
    if (!profile?.display_name) {
      showToast('Please complete your profile display name before bidding.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (bidAmount >= 10000) {
        const { data: kycOk, error: kycErr } = await supabase.rpc('bidder_kyc_ok', {
          p_amount: bidAmount,
        });
        if (kycErr) throw kycErr;
        if (!kycOk) {
          showToast('Bids of $10,000+ require verified KYC. Complete identity verification first.', 'error');
          setSubmitting(false);
          return;
        }
      }
      const { data, error } = await supabase.rpc('place_bid', {
        p_auction_id: auction.id,
        p_amount: bidAmount,
        p_bidder_name: profile.display_name,
      });

      if (error) throw error;

      const result = data as { new_end_time: string; anti_snipe_triggered?: boolean; anti_snipe?: boolean };
      if (result.anti_snipe_triggered || result.anti_snipe) {
        showToast(`Bid placed! Anti-snipe triggered: extended 2 minutes.`, 'success');
      } else {
        showToast(`Bid of ${formatCurrency(bidAmount)} placed successfully!`, 'success');
      }

      onBidPlaced();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to place bid. Please try again.';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-ink-950 h-full shadow-2xl flex flex-col animate-slide-up border-l border-ink-200 dark:border-ink-800">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-2">
            <Gavel className="w-5 h-5 text-accent-500" />
            <h2 className="font-serif text-lg font-semibold">Place a bid</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-ink-100 dark:hover:bg-ink-900 rounded" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-1">Lot</p>
            <p className="font-serif text-xl font-semibold">{auction.artwork.title}</p>
            <p className="text-sm text-ink-500 mt-1">{auction.artwork.medium}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 border border-ink-200 dark:border-ink-800">
              <p className="text-[10px] uppercase tracking-widest text-ink-400">Current</p>
              <p className="font-mono text-lg font-bold tabular-nums">
                {formatCurrency(auction.current_bid > 0 ? auction.current_bid : auction.artwork.starting_bid)}
              </p>
            </div>
            <div className="p-3 border border-ink-200 dark:border-ink-800">
              <p className="text-[10px] uppercase tracking-widest text-ink-400">Reserve</p>
              <p className={`text-sm font-medium ${reserveMet ? 'text-emerald-600' : 'text-ink-500'}`}>
                {reserveMet ? 'Met' : 'Not yet met'}
              </p>
            </div>
          </div>

          {inFinal30s && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm">
              <TrendingUp className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-amber-800 dark:text-amber-200">
                Final moments — anti-snipe may extend the auction if you bid now.
              </p>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-800 text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-ink-600 dark:text-ink-300 leading-relaxed">
              Winning bids create a payment-due order. Card capture happens at checkout (Stripe), not when you bid.
            </p>
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-ink-400 font-semibold">Your bid</label>
            <input
              type="number"
              value={bidAmount}
              onChange={(e) => setBidAmount(Number(e.target.value))}
              min={minBid}
              step={10}
              className="mt-1.5 w-full text-lg font-mono p-3 border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:border-ink-900 dark:focus:border-ink-400"
            />
            <p className="text-xs text-ink-400 mt-1.5">Minimum: {formatCurrency(minBid)}</p>
            <div className="flex gap-2 mt-3">
              {quickBids.map((inc) => (
                <button
                  key={inc}
                  type="button"
                  onClick={() => setBidAmount(minBid + inc)}
                  className="text-xs px-3 py-1.5 border border-ink-200 dark:border-ink-700 hover:border-ink-900 dark:hover:border-ink-400"
                >
                  +{formatCurrency(inc)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-ink-200 dark:border-ink-800">
          <button
            type="button"
            onClick={placeBid}
            disabled={submitting || bidAmount < minBid || !session}
            className="btn-accent w-full py-3.5 text-sm disabled:opacity-40"
          >
            {submitting ? 'Placing bid…' : `Place bid · ${formatCurrency(bidAmount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
