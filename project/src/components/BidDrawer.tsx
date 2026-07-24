import { useState, useEffect } from 'react';
import { X, CreditCard, Gavel, TrendingUp, ShieldCheck, Lock } from 'lucide-react';
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
  const { profile } = useAuth();
  const [bidAmount, setBidAmount] = useState<number>(auction.current_bid + 10);
  const [submitting, setSubmitting] = useState(false);
  const [preAuthed, setPreAuthed] = useState(false);

  const minBid = auction.current_bid + 10;
  const reserveMet = auction.current_bid >= auction.artwork.reserve_price;
  const remainingMs = new Date(auction.end_time).getTime() - Date.now();
  const inFinal30s = remainingMs < 30000 && remainingMs > 0;

  useEffect(() => {
    setBidAmount(minBid);
  }, [minBid]);

  const quickBids = [10, 50, 100];

  const handlePreAuth = () => {
    setPreAuthed(true);
    showToast('Credit card pre-authorized. You can now place bids.', 'success');
  };

  const placeBid = async () => {
    if (!preAuthed) {
      showToast('Please complete credit card pre-authorization first.', 'error');
      return;
    }
    if (bidAmount < minBid) {
      showToast(`Minimum bid is ${formatCurrency(minBid)}.`, 'error');
      return;
    }
    if (!profile?.display_name) {
      showToast('Please sign in to place a bid.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('place_bid', {
        p_auction_id: auction.id,
        p_amount: bidAmount,
        p_bidder_name: profile.display_name,
      });

      if (error) throw error;

      const result = data as { new_end_time: string; anti_snipe_triggered: boolean };
      if (result.anti_snipe_triggered) {
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
      <div className="relative w-full max-w-md bg-ink-50 dark:bg-ink-900 h-full overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-ink-50 dark:bg-ink-900 border-b border-ink-200 dark:border-ink-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-semibold">Place Your Bid</h2>
            <p className="text-xs text-ink-500 mt-0.5">{auction.artwork.title}</p>
          </div>
          <button onClick={onClose} className="p-2 text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Current bid display */}
          <div className="bg-ink-100 dark:bg-ink-800 p-5">
            <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-1">Current Highest Bid</p>
            <p className="font-mono text-3xl font-bold tabular-nums">{formatCurrency(auction.current_bid)}</p>
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-ink-500">{auction.bid_count} bids placed</span>
              <span className={`text-xs font-semibold flex items-center gap-1 ${reserveMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-gold-600'}`}>
                <ShieldCheck className="w-3 h-3" />
                {reserveMet ? 'Reserve Met' : 'Reserve Pending'}
              </span>
            </div>
          </div>

          {/* Bidding as */}
          <div className="flex items-center gap-2 text-sm text-ink-500">
            <div className="w-7 h-7 bg-ink-900 dark:bg-ink-50 rounded-full flex items-center justify-center text-xs font-bold text-ink-50 dark:text-ink-900">
              {profile?.display_name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span>Bidding as <span className="font-semibold text-ink-900 dark:text-ink-100">{profile?.display_name}</span></span>
          </div>

          {/* Pre-auth */}
          {!preAuthed ? (
            <div className="border border-ink-200 dark:border-ink-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="w-5 h-5 text-ink-600 dark:text-ink-400" />
                <h3 className="font-semibold text-sm">Credit Card Pre-Authorization</h3>
              </div>
              <p className="text-xs text-ink-500 mb-4 leading-relaxed">
                One-click pre-auth required before bidding. Your card will only be charged if you win the auction.
              </p>
              <button onClick={handlePreAuth} className="btn-primary w-full text-sm">
                <span className="flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" />
                  Authorize Card
                </span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Card pre-authorized</span>
            </div>
          )}

          {/* Quick bids */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-2">Quick Bid</p>
            <div className="grid grid-cols-3 gap-2">
              {quickBids.map((increment) => {
                const amount = auction.current_bid + increment;
                return (
                  <button
                    key={increment}
                    onClick={() => setBidAmount(amount)}
                    className={`py-3 text-center font-mono text-sm font-semibold transition-all duration-200 ${
                      bidAmount === amount
                        ? 'bg-ink-900 text-ink-50 dark:bg-ink-50 dark:text-ink-900'
                        : 'border border-ink-200 dark:border-ink-700 hover:border-ink-900 dark:hover:border-ink-400'
                    }`}
                  >
                    +${increment}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom bid */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-2">Custom Bid</p>
            <div className="flex items-center border border-ink-200 dark:border-ink-700 focus-within:border-ink-900 dark:focus-within:border-ink-400 transition-colors">
              <span className="pl-4 font-mono text-ink-400">$</span>
              <input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(Number(e.target.value))}
                min={minBid}
                step={10}
                className="flex-1 px-2 py-3 bg-transparent font-mono text-lg font-semibold focus:outline-none"
              />
            </div>
            <p className="text-xs text-ink-400 mt-1.5">Minimum: {formatCurrency(minBid)}</p>
          </div>

          {/* Anti-snipe notice */}
          {inFinal30s && (
            <div className="flex items-start gap-2 px-4 py-3 bg-gold-50 dark:bg-gold-500/10 border border-gold-200 dark:border-gold-500/30">
              <TrendingUp className="w-4 h-4 text-gold-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gold-700 dark:text-gold-400 leading-relaxed">
                <span className="font-semibold">Anti-Snipe Active:</span> Bids in the final 30 seconds extend the timer by 2 minutes.
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={placeBid}
            disabled={submitting || !preAuthed || bidAmount < minBid}
            className="btn-accent w-full"
          >
            <span className="flex items-center justify-center gap-2">
              <Gavel className="w-4 h-4" />
              {submitting ? 'Placing Bid...' : `Bid ${formatCurrency(bidAmount)}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
