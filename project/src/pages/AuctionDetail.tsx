import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Gavel, ShieldCheck, Clock, TrendingUp, Play, Maximize2, Package, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuctionWithDetails, Bid } from '@/types';
import { formatCurrency, timeAgo, SHIPPING_RATES } from '@/lib/theme';
import { CountdownTimer } from '@/components/CountdownTimer';
import { Badge } from '@/components/Badge';
import { ImageZoom, FullscreenViewer } from '@/components/ImageZoom';
import { BidDrawer } from '@/components/BidDrawer';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';

interface AuctionDetailProps {
  auctionId: string;
  navigate: (path: string) => void;
}

type Tab = 'auction' | 'creator';

export function AuctionDetail({ auctionId, navigate }: AuctionDetailProps) {
  const { showToast } = useToast();
  const { session } = useAuth();
  const [auction, setAuction] = useState<AuctionWithDetails | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('auction');

  const loadAuction = useCallback(async () => {
    const { data: auctionData, error } = await supabase
      .from('auctions')
      .select('*, artwork:artworks(*)')
      .eq('id', auctionId)
      .maybeSingle();

    if (error || !auctionData) {
      setLoading(false);
      return;
    }

    const { data: artist } = await supabase
      .from('artists')
      .select('*')
      .eq('id', auctionData.artwork.artist_id)
      .maybeSingle();

    setAuction({ ...auctionData, artwork: auctionData.artwork, artist });
    setLoading(false);
  }, [auctionId]);

  const loadBids = useCallback(async () => {
    const { data: bidData } = await supabase
      .from('bids')
      .select('*')
      .eq('auction_id', auctionId)
      .order('created_at', { ascending: false });
    setBids(bidData || []);
  }, [auctionId]);

  useEffect(() => {
    loadAuction();
    loadBids();
  }, [loadAuction, loadBids]);

  // Realtime subscriptions
  useEffect(() => {
    const auctionChannel = supabase
      .channel(`auction-${auctionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auctions', filter: `id=eq.${auctionId}` },
        () => {
          loadAuction();
          showToast('Auction updated — new bid detected.', 'info');
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `auction_id=eq.${auctionId}` },
        () => loadBids()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(auctionChannel);
    };
  }, [auctionId, loadAuction, loadBids, showToast]);

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-20">
        <div className="animate-pulse space-y-6">
          <div className="h-6 w-32 bg-ink-100 dark:bg-ink-800" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="aspect-[4/5] bg-ink-100 dark:bg-ink-800" />
            <div className="space-y-4">
              <div className="h-10 w-3/4 bg-ink-100 dark:bg-ink-800" />
              <div className="h-6 w-1/2 bg-ink-100 dark:bg-ink-800" />
              <div className="h-32 bg-ink-100 dark:bg-ink-800" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-20 text-center">
        <p className="text-ink-400 text-lg">Auction not found.</p>
        <button onClick={() => navigate('')} className="btn-secondary mt-4">Back to Gallery</button>
      </div>
    );
  }

  const { artwork, artist, status, is_flash } = auction;
  const reserveMet = auction.current_bid >= artwork.reserve_price;
  const shipping = SHIPPING_RATES[artwork.shipping_tier];

  const badges: React.ReactNode[] = [];
  if (status === 'live' && !is_flash) badges.push(<Badge key="live" variant="live" />);
  if (is_flash) badges.push(<Badge key="flash" variant="flash" />);
  if (artwork.studio_verified) badges.push(<Badge key="verified" variant="verified" />);

  const handleBidPlaced = () => {
    setDrawerOpen(false);
    loadAuction();
    loadBids();
    showToast('Bid placed! Watching for counter-bids...', 'success');
  };

  const handleBidClick = () => {
    if (!session) {
      showToast('Please sign in to place a bid.', 'info');
      navigate('auth');
      return;
    }
    setDrawerOpen(true);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-6">
      <button
        onClick={() => navigate('')}
        className="flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Gallery
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Image */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="relative aspect-[4/5] overflow-hidden bg-ink-100 dark:bg-ink-800 group">
            <ImageZoom src={artwork.image_url} alt={artwork.title} className="w-full h-full" />
            <button
              onClick={() => setFullscreen(true)}
              className="absolute bottom-3 right-3 p-2.5 bg-ink-950/70 text-ink-50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <div className="w-16 h-16 bg-ink-100 dark:bg-ink-800 overflow-hidden">
              <img src={artwork.image_url} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="w-16 h-16 bg-ink-100 dark:bg-ink-800 overflow-hidden">
              <img src={artwork.image_url} alt="" className="w-full h-full object-cover scale-150" />
            </div>
            <div className="w-16 h-16 bg-ink-100 dark:bg-ink-800 overflow-hidden">
              <img src={artwork.image_url} alt="" className="w-full h-full object-cover scale-[2.5]" />
            </div>
          </div>
        </div>

        {/* Details */}
        <div>
          <div className="flex flex-wrap gap-2 mb-4">{badges}</div>

          <h1 className="font-serif text-3xl md:text-4xl font-semibold leading-tight mb-3">
            {artwork.title}
          </h1>

          <button className="flex items-center gap-2 mb-6 group">
            <img src={artist?.avatar_url || ''} alt={artist?.name} className="w-8 h-8 rounded-full object-cover" />
            <div className="text-left">
              <p className="text-sm font-semibold group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
                {artist?.name}
              </p>
              <p className="text-xs text-ink-500">{artist?.location}</p>
            </div>
            {artist?.studio_verified && <ShieldCheck className="w-4 h-4 text-emerald-500" />}
          </button>

          <div className="flex flex-wrap gap-4 mb-6 text-xs uppercase tracking-wider text-ink-500">
            <span><span className="text-ink-400">Medium:</span> {artwork.medium}</span>
            <span><span className="text-ink-400">Dimensions:</span> {artwork.dimensions}</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-ink-200 dark:border-ink-800 mb-6">
            <button
              onClick={() => setActiveTab('auction')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'auction'
                  ? 'border-ink-900 dark:border-ink-50 text-ink-900 dark:text-ink-50'
                  : 'border-transparent text-ink-500 hover:text-ink-900 dark:hover:text-ink-100'
              }`}
            >
              Live Auction
            </button>
            <button
              onClick={() => setActiveTab('creator')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'creator'
                  ? 'border-ink-900 dark:border-ink-50 text-ink-900 dark:text-ink-50'
                  : 'border-transparent text-ink-500 hover:text-ink-900 dark:hover:text-ink-100'
              }`}
            >
              Creator Studio
            </button>
          </div>

          {activeTab === 'auction' ? (
            <div className="space-y-6">
              {/* Timer + current bid */}
              <div className="bg-ink-100 dark:bg-ink-800 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-ink-500" />
                  <span className="text-xs uppercase tracking-widest text-ink-500 font-semibold">
                    {status === 'upcoming' ? 'Starts In' : 'Auction Ends In'}
                  </span>
                </div>
                <CountdownTimer endTime={auction.end_time} variant="large" />
                <div className="mt-5 pt-5 border-t border-ink-200 dark:border-ink-700">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-1">
                        {auction.bid_count > 0 ? 'Current Bid' : 'Starting Bid'}
                      </p>
                      <p className="font-mono text-3xl font-bold tabular-nums">
                        {formatCurrency(auction.bid_count > 0 ? auction.current_bid : artwork.starting_bid)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-1">Reserve</p>
                      <p className={`text-sm font-semibold flex items-center gap-1 ${reserveMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-gold-600'}`}>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {reserveMet ? 'Reserve Met' : 'Reserve Pending'}
                      </p>
                    </div>
                  </div>
                  {auction.bid_count > 0 && (
                    <p className="text-xs text-ink-400 mt-2">{auction.bid_count} bids placed</p>
                  )}
                </div>
              </div>

              {/* Bid button */}
              <button
                onClick={handleBidClick}
                disabled={status === 'upcoming' || status === 'ended'}
                className="btn-accent w-full text-base py-4"
              >
                <span className="flex items-center justify-center gap-2">
                  {session ? <Gavel className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                  {status === 'upcoming' ? 'Auction Not Started' : status === 'ended' ? 'Auction Ended' : session ? 'Place Bid' : 'Sign In to Bid'}
                </span>
              </button>

              {/* Anti-snipe notice */}
              <div className="flex items-start gap-2 px-4 py-3 bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-800">
                <TrendingUp className="w-4 h-4 text-gold-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-ink-500 leading-relaxed">
                  <span className="font-semibold text-ink-700 dark:text-ink-300">Anti-Sniping Protection:</span>{' '}
                  Any bid in the final 30 seconds extends the timer by 2 minutes.
                </p>
              </div>

              {/* Shipping */}
              <div className="flex items-center gap-3 px-4 py-3 border border-ink-200 dark:border-ink-800">
                <Package className="w-5 h-5 text-ink-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{shipping.label} · {formatCurrency(shipping.cost)}</p>
                  <p className="text-xs text-ink-500">{shipping.description} · Escrow held until tracking confirmed</p>
                </div>
              </div>

              {/* Bid history */}
              <div>
                <h3 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-3">Bid History</h3>
                {bids.length === 0 ? (
                  <p className="text-sm text-ink-400 py-4 text-center">No bids yet. Be the first.</p>
                ) : (
                  <div className="space-y-2">
                    {bids.slice(0, 8).map((bid, i) => (
                      <div
                        key={bid.id}
                        className={`flex items-center justify-between px-4 py-2.5 ${i === 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' : 'bg-ink-50 dark:bg-ink-900'}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-ink-200 dark:bg-ink-700 flex items-center justify-center text-xs font-bold">
                            {bid.bidder_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{bid.bidder_name}</p>
                            <p className="text-xs text-ink-400">{timeAgo(bid.created_at)}</p>
                          </div>
                        </div>
                        <p className="font-mono text-sm font-bold tabular-nums">{formatCurrency(bid.amount)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <CreatorStudio auction={auction} />
          )}
        </div>
      </div>

      {drawerOpen && session && (
        <BidDrawer
          auction={auction}
          onClose={() => setDrawerOpen(false)}
          onBidPlaced={handleBidPlaced}
        />
      )}

      {fullscreen && (
        <FullscreenViewer
          src={artwork.image_url}
          alt={artwork.title}
          onClose={() => setFullscreen(false)}
        />
      )}
    </div>
  );
}

function CreatorStudio({ auction }: { auction: AuctionWithDetails }) {
  const { artist, artwork } = auction;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Artist bio */}
      <div className="flex items-start gap-4">
        <img src={artist?.avatar_url || ''} alt={artist?.name} className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-xl font-semibold">{artist?.name}</h3>
            {artist?.studio_verified && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Studio Verified
              </span>
            )}
          </div>
          <p className="text-xs text-ink-500 mb-2">{artist?.location}</p>
          <p className="text-sm text-ink-600 dark:text-ink-400 leading-relaxed">{artist?.bio}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-ink-100 dark:bg-ink-800 p-4 text-center">
          <p className="font-mono text-2xl font-bold">{artist?.total_sales}</p>
          <p className="text-[10px] uppercase tracking-widest text-ink-400 mt-1">Total Sales</p>
        </div>
        <div className="bg-ink-100 dark:bg-ink-800 p-4 text-center">
          <p className="font-mono text-2xl font-bold">{artwork.studio_verified ? '100%' : '—'}</p>
          <p className="text-[10px] uppercase tracking-widest text-ink-400 mt-1">Human-Made</p>
        </div>
        <div className="bg-ink-100 dark:bg-ink-800 p-4 text-center">
          <p className="font-mono text-2xl font-bold">{artist?.studio_verified ? 'Yes' : 'No'}</p>
          <p className="text-[10px] uppercase tracking-widest text-ink-400 mt-1">Verified</p>
        </div>
      </div>

      {/* Process video */}
      <div>
        <h4 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-3">Process Video</h4>
        <div className="relative aspect-video bg-ink-900 overflow-hidden group cursor-pointer">
          <img src={artwork.image_url} alt="" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 bg-ink-50/90 rounded-full flex items-center justify-center transition-transform group-hover:scale-110">
              <Play className="w-7 h-7 text-ink-900 ml-1" fill="currentColor" />
            </div>
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <p className="text-ink-50 text-sm font-medium">5-Second Studio Verification</p>
            <p className="text-ink-300 text-xs">Recorded during creation of this piece</p>
          </div>
        </div>
      </div>

      {/* Artwork description */}
      <div>
        <h4 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-3">About This Piece</h4>
        <p className="text-sm text-ink-600 dark:text-ink-400 leading-relaxed">{artwork.description}</p>
      </div>

      {/* Verification */}
      <div className="flex items-start gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Studio Verified</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 leading-relaxed">
            This artwork has been verified through a 5-second studio video showing the artist
            at work. It is certified as 100% human-created, physical art.
          </p>
        </div>
      </div>
    </div>
  );
}
