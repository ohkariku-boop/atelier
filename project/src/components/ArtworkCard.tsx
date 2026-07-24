import { ShieldCheck, Zap, Radio, Gavel } from 'lucide-react';
import type { AuctionWithDetails } from '@/types';
import { formatCurrency } from '@/lib/theme';
import { CountdownTimer } from './CountdownTimer';
import { Badge } from './Badge';

interface ArtworkCardProps {
  auction: AuctionWithDetails;
  onClick: () => void;
}

export function ArtworkCard({ auction, onClick }: ArtworkCardProps) {
  const { artwork, artist, status, is_flash } = auction;
  const reserveMet = auction.current_bid >= artwork.reserve_price;

  const badges: React.ReactNode[] = [];
  if (status === 'live' && !is_flash) badges.push(<Badge key="live" variant="live" />);
  if (is_flash) badges.push(<Badge key="flash" variant="flash" />);
  if (status === 'upcoming') badges.push(<Badge key="upcoming" variant="upcoming" />);
  if (status === 'ended') badges.push(<Badge key="ended" variant="ended" />);
  if (artwork.studio_verified) badges.push(<Badge key="verified" variant="verified" />);

  return (
    <button
      onClick={onClick}
      className="card-surface group text-left animate-slide-up"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-ink-100 dark:bg-ink-800">
        <img
          src={artwork.image_url}
          alt={artwork.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {badges}
        </div>
        {status === 'live' && (
          <div className="absolute bottom-3 left-3">
            <CountdownTimer endTime={auction.end_time} variant="compact" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      <div className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <img
            src={artist.avatar_url || ''}
            alt={artist.name}
            className="w-5 h-5 rounded-full object-cover"
          />
          <span className="text-xs text-ink-500 font-medium">{artist.name}</span>
          {artist.studio_verified && <ShieldCheck className="w-3 h-3 text-emerald-500" />}
        </div>

        <h3 className="font-serif text-lg font-semibold leading-tight mb-1 group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
          {artwork.title}
        </h3>
        <p className="text-xs text-ink-500 uppercase tracking-wider mb-4">
          {artwork.medium} {artwork.dimensions ? `· ${artwork.dimensions}` : ''}
        </p>

        <div className="flex items-end justify-between pt-3 border-t border-ink-100 dark:border-ink-800">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-0.5">
              {auction.bid_count > 0 ? 'Current Bid' : 'Starting Bid'}
            </p>
            <p className="font-mono text-lg font-bold tabular-nums">
              {formatCurrency(auction.bid_count > 0 ? auction.current_bid : artwork.starting_bid)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-0.5">Reserve</p>
            <p className={`text-xs font-semibold ${reserveMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-500'}`}>
              {reserveMet ? 'Met' : 'Pending'}
            </p>
          </div>
        </div>

        {auction.bid_count > 0 && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-ink-400">
            <Gavel className="w-3 h-3" />
            <span>{auction.bid_count} bids placed</span>
          </div>
        )}
      </div>
    </button>
  );
}
