import type { AuctionWithDetails } from '@/types';
import { formatCurrency } from '@/lib/theme';
import { Badge } from '@/components/Badge';
import { CountdownTimer } from '@/components/CountdownTimer';

interface AuctionRowProps {
  auction: AuctionWithDetails;
  navigate: (path: string) => void;
}

export function AuctionRow({ auction, navigate }: AuctionRowProps) {
  const { artwork, artist } = auction;
  const reserveMet = auction.current_bid >= artwork.reserve_price;

  return (
    <button
      onClick={() => navigate(`auction/${auction.id}`)}
      className="card-surface w-full flex items-center gap-4 p-4 text-left hover:border-ink-900 dark:hover:border-ink-400 transition-colors group"
    >
      <div className="w-16 h-16 bg-ink-100 dark:bg-ink-800 overflow-hidden flex-shrink-0">
        <img src={artwork.image_url} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {auction.is_flash ? <Badge variant="flash" /> : <Badge variant="live" />}
          {artwork.studio_verified && artwork.verification_method && <Badge variant="verified" />}
        </div>
        <h3 className="font-serif text-sm font-semibold truncate group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
          {artwork.title}
        </h3>
        <p className="text-xs text-ink-500">
          {artist?.name} · {artwork.medium}
        </p>
      </div>
      <div className="hidden sm:block text-right">
        <p className="font-mono text-sm font-bold">
          {formatCurrency(auction.current_bid || artwork.starting_bid)}
        </p>
        <p className="text-xs text-ink-400">
          {auction.bid_count} bids · {reserveMet ? 'Reserve met' : 'Reserve pending'}
        </p>
      </div>
      <div className="flex-shrink-0">
        {auction.status === 'live' || auction.status === 'flash' ? (
          <CountdownTimer endTime={auction.end_time} variant="minimal" />
        ) : auction.status === 'upcoming' ? (
          <span className="text-xs text-ink-400">Starts soon</span>
        ) : (
          <span className="text-xs text-ink-400">Ended</span>
        )}
      </div>
    </button>
  );
}
