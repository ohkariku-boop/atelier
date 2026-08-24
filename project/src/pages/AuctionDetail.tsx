import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Gavel, ShieldCheck, Clock, TrendingUp, Play, Maximize2, Package, Lock, Heart, Eye, ChevronLeft, ChevronRight, MessageSquare, Award } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuctionWithDetails, Bid } from '@/types';
import { formatCurrency, timeAgo, SHIPPING_RATES } from '@/lib/theme';
import { getEstimateRange } from '@/lib/estimates';
import { CountdownTimer } from '@/components/CountdownTimer';
import { Badge } from '@/components/Badge';
import { ImageZoom, FullscreenViewer } from '@/components/ImageZoom';
import { BidDrawer } from '@/components/BidDrawer';
import { tryCloseAuction } from '@/lib/closeAuction';
import { startStripeCheckout } from '@/lib/stripe';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { setPageMeta, resetPageMeta } from '@/lib/pageMeta';
import { LiveStreamRoom } from '@/components/LiveStreamRoom';

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
  const [editingReserve, setEditingReserve] = useState(false);
  const [reserveInput, setReserveInput] = useState('');
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [viewCounted, setViewCounted] = useState(false);
  const [displayViewCount, setDisplayViewCount] = useState(0);
  const [galleryOrder, setGalleryOrder] = useState<string[]>([]);
  const [provenance, setProvenance] = useState<any[]>([]);

  useEffect(() => {
    if (!auction) return;
    const { artwork, artist } = auction;
    setPageMeta({
      title: `${artwork.title} — Atelier Auction`,
      description: (artwork.description || `${artwork.medium} by ${artist?.name || 'a verified artist'}`).slice(0, 160),
      image: artwork.image_url,
    });
    return () => resetPageMeta();
  }, [auction?.id, auction?.artwork?.title]);


  const messageArtist = async () => {
    if (!session) {
      showToast('Sign in to message the artist.', 'error');
      navigate('auth');
      return;
    }
    if (!auction?.artwork?.user_id) {
      showToast('Artist contact unavailable.', 'error');
      return;
    }
    const { data, error } = await supabase.rpc('open_or_get_conversation', {
      p_artwork_id: auction.artwork.id,
      p_artist_user_id: auction.artwork.user_id,
    });
    if (error) {
      showToast(error.message || 'Could not open conversation. Run the messages migration first.', 'error');
      return;
    }
    navigate(`messages/${data}`);
  };

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
    setLikeCount(auctionData.artwork.like_count || 0);
        const { data: prov } = await supabase
          .from('provenance_events')
          .select('*')
          .eq('artwork_id', auctionData.artwork.id)
          .order('occurred_at', { ascending: true });
        setProvenance(prov || []);
    setDisplayViewCount(auctionData.artwork.view_count || 0);
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

  // Fetch the default gallery order (matches GalleryFloor's default
  // "Ending Soon" sort) once, so left/right can page through it without
  // going back to the Gallery Floor. Fetched once per mount, not
  // re-fetched on every auctionId change, so browsing forward/back stays
  // within the same snapshot rather than jittering as auctions change.
  useEffect(() => {
    supabase
      .from('auctions')
      .select('id, end_time')
      .order('end_time', { ascending: true })
      .then(({ data }) => {
        setGalleryOrder((data || []).map((a) => a.id));
      });
  }, []);

  const currentGalleryIndex = galleryOrder.indexOf(auctionId);
  const prevAuctionId = currentGalleryIndex > 0 ? galleryOrder[currentGalleryIndex - 1] : null;
  const nextAuctionId =
    currentGalleryIndex >= 0 && currentGalleryIndex < galleryOrder.length - 1
      ? galleryOrder[currentGalleryIndex + 1]
      : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prevAuctionId) navigate(`auction/${prevAuctionId}`);
      if (e.key === 'ArrowRight' && nextAuctionId) navigate(`auction/${nextAuctionId}`);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevAuctionId, nextAuctionId, navigate]);

  // Increment view count once per mount - cosmetic engagement data, not
  // a trust signal, so a small amount of over-counting from refreshes
  // is an acceptable tradeoff rather than building dedupe logic for it.
  useEffect(() => {
    if (!auction?.artwork.id || viewCounted) return;
    setViewCounted(true);
    setDisplayViewCount((c) => c + 1);
    supabase.rpc('increment_artwork_view', { p_artwork_id: auction.artwork.id }).then(({ error }) => {
      if (error) console.error('Failed to record view:', error.message);
    });
  }, [auction?.artwork.id, viewCounted]);

  // Check whether the current user has already liked this piece
  useEffect(() => {
    if (!auction?.artwork.id || !session?.user?.id) return;
    supabase
      .from('artwork_likes')
      .select('id')
      .eq('artwork_id', auction.artwork.id)
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setLiked(!!data));
  }, [auction?.artwork.id, session?.user?.id]);

  
  const [buyingNow, setBuyingNow] = useState(false);
  const handleBuyNow = async () => {
    if (!session?.user) {
      showToast('Sign in to buy now.', 'error');
      navigate('auth');
      return;
    }
    if (!auction) return;
    setBuyingNow(true);
    try {
      const { data, error } = await supabase.rpc('purchase_buy_now', { p_auction_id: auction.id });
      if (error) throw error;
      const orderId = (data as { order_id?: string })?.order_id;
      if (!orderId) {
        showToast('Order created — complete payment in Orders.', 'success');
        navigate('orders');
        return;
      }
      // Immediately open Stripe Checkout
      const checkout = await startStripeCheckout(orderId);
      if (checkout.url) {
        showToast('Redirecting to secure checkout…', 'success');
        window.location.href = checkout.url;
        return;
      }
      if (checkout.notConfigured) {
        showToast('Order reserved. Card payments are not configured yet — see Orders.', 'info');
        navigate('orders');
        return;
      }
      showToast(checkout.error || 'Checkout could not start. Pay from Orders.', 'error');
      navigate('orders');
    } catch (err: any) {
      showToast(err?.message || 'Buy Now failed.', 'error');
    } finally {
      setBuyingNow(false);
    }
  };

  const toggleLike = async () => {
    if (!auction?.artwork.id) return;
    if (!session?.user?.id) {
      showToast('Sign in to like a piece.', 'info');
      return;
    }
    // Optimistic update
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => (wasLiked ? Math.max(c - 1, 0) : c + 1));

    const { data, error } = await supabase.rpc('toggle_artwork_like', { p_artwork_id: auction.artwork.id });
    if (error) {
      // revert on failure
      setLiked(wasLiked);
      setLikeCount((c) => (wasLiked ? c + 1 : Math.max(c - 1, 0)));
      showToast(error.message || 'Failed to update like.', 'error');
      return;
    }
    setLiked(!!data?.liked);
  };

  // Lazily close this auction if its timer has passed - there is no cron
  // job in this stack, so viewing the page is what actually triggers
  // winner determination / escrow order creation.
  useEffect(() => {
    if (!auction) return;
    if (auction.status === 'ended') return;
    if (new Date(auction.end_time).getTime() > Date.now()) return;

    tryCloseAuction(auction.id).then((result) => {
      if (result.outcome) {
        loadAuction();
        if (result.outcome === 'sold') {
          showToast('Auction closed - reserve met, sold to the highest bidder!', 'success');
        } else if (result.outcome === 'pending_seller_review') {
          showToast('Auction closed - reserve not met, awaiting seller review.', 'info');
        }
      }
    });
  }, [auction, loadAuction, showToast]);

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
  const estimate = getEstimateRange(artwork);
  const reserveMet = auction.current_bid >= artwork.reserve_price;
  const shipping = SHIPPING_RATES[artwork.shipping_tier];
  const isOwner = !!session && session.user.id === artwork.user_id;

  const badges: React.ReactNode[] = [];
  if (status === 'live' && !is_flash) badges.push(<Badge key="live" variant="live" />);
  if (is_flash) badges.push(<Badge key="flash" variant="flash" />);
  if (artwork.studio_verified && artwork.verification_method) badges.push(<Badge key="verified" variant="verified" />);

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

  const handleCancelListing = async () => {
    if (!confirm('Cancel this listing? This cannot be undone.')) return;
    const { error } = await supabase.rpc('cancel_listing', { p_auction_id: auction.id });
    if (error) {
      showToast(error.message || 'Failed to cancel listing.', 'error');
      return;
    }
    showToast('Listing cancelled.', 'info');
    loadAuction();
  };

  const handleEndAuctionNow = async () => {
    if (!confirm('End this auction now? Anyone who might have bid in the remaining time will lose that chance.')) return;
    const { error } = await supabase.rpc('end_auction_now', { p_auction_id: auction.id });
    if (error) {
      showToast(error.message || 'Failed to end auction.', 'error');
      return;
    }
    showToast('Auction ended.', 'success');
    loadAuction();
  };

  const handleResolveSale = async (accept: boolean) => {
    const { error } = await supabase.rpc('resolve_pending_sale', {
      p_auction_id: auction.id,
      p_accept: accept,
    });
    if (error) {
      showToast(error.message || 'Failed to record your decision.', 'error');
      return;
    }
    showToast(accept ? 'Sale accepted - order created and moved to escrow.' : 'Sale declined.', accept ? 'success' : 'info');
    loadAuction();
  };

  const handleUpdateReserve = async () => {
    const newReserve = parseFloat(reserveInput);
    if (isNaN(newReserve) || newReserve <= 0) {
      showToast('Enter a valid reserve price.', 'error');
      return;
    }
    const { error } = await supabase.from('artworks').update({ reserve_price: newReserve }).eq('id', artwork.id);
    if (error) {
      showToast(error.message || 'Failed to update reserve price.', 'error');
      return;
    }
    showToast('Reserve price updated.', 'success');
    setEditingReserve(false);
    loadAuction();
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
          <div
            className="relative aspect-[4/5] overflow-hidden bg-ink-100 dark:bg-ink-800"
            onDoubleClick={() => {
              if (!liked) toggleLike();
            }}
          >
            <ImageZoom src={artwork.image_url} alt={artwork.title} className="w-full h-full" onOpenFullscreen={() => setFullscreen(true)} />
            <button
              onClick={toggleLike}
              aria-label={liked ? 'Unlike' : 'Like'}
              className="absolute top-3 left-3 p-2 bg-ink-950/60 backdrop-blur-sm rounded-full transition-transform active:scale-90"
            >
              <Heart
                className={`w-5 h-5 transition-colors ${liked ? 'fill-red-500 text-red-500' : 'text-ink-50'}`}
              />
            </button>
            {prevAuctionId && (
              <button
                onClick={() => navigate(`auction/${prevAuctionId}`)}
                aria-label="Previous artwork"
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 bg-ink-950/60 backdrop-blur-sm rounded-full transition-transform active:scale-90 hover:bg-ink-950/80"
              >
                <ChevronLeft className="w-5 h-5 text-ink-50" />
              </button>
            )}
            {nextAuctionId && (
              <button
                onClick={() => navigate(`auction/${nextAuctionId}`)}
                aria-label="Next artwork"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-ink-950/60 backdrop-blur-sm rounded-full transition-transform active:scale-90 hover:bg-ink-950/80"
              >
                <ChevronRight className="w-5 h-5 text-ink-50" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-2">
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

            <div className="flex items-center gap-3 text-xs text-ink-500">
              <span className="flex items-center gap-1">
                <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-red-500 text-red-500' : ''}`} />
                {likeCount}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                {displayViewCount}
              </span>
            </div>
          </div>

          <button
            onClick={() => setFullscreen(true)}
            className="w-full mt-3 py-2.5 border border-ink-200 dark:border-ink-700 text-sm font-medium flex items-center justify-center gap-2 hover:border-ink-900 dark:hover:border-ink-400 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
            Tap to Zoom
          </button>
        </div>

        {/* Details */}
        <div>
          <div className="flex flex-wrap gap-2 mb-4">{badges}</div>

          <h1 className="font-serif text-3xl md:text-4xl font-semibold leading-tight mb-3">
            {artwork.title}
          </h1>

          <button
            className="flex items-center gap-2 mb-6 group"
            onClick={() => artist?.id && navigate(`artist/${artist.id}`)}
          >
            <img src={artist?.avatar_url || ''} alt={artist?.name} className="w-8 h-8 rounded-full object-cover" />
            <div className="text-left">
              <p className="text-sm font-semibold group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
                {artist?.name}
              </p>
              <p className="text-xs text-ink-500">{artist?.location}</p>
            </div>
            {artwork.studio_verified && artwork.verification_method && <ShieldCheck className="w-4 h-4 text-emerald-500" />}
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
                <CountdownTimer endTime={auction.end_time} variant="large" mode={is_flash || status === 'flash' ? 'flash' : 'default'} />
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
                      <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-1">Estimate</p>
                      <p className="font-mono text-sm font-semibold tabular-nums text-ink-600 dark:text-ink-300 mb-3">
                        {formatCurrency(estimate.low)} – {formatCurrency(estimate.high)}
                      </p>
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

              {/* Owner controls vs buyer bid button */}
              {isOwner ? (
                <div className="space-y-3">
                  {auction.outcome === 'pending_seller_review' && (
                    <div className="p-4 bg-gold-50 dark:bg-gold-900/20 border border-gold-300 dark:border-gold-800">
                      <p className="text-sm font-semibold mb-1">Reserve not met</p>
                      <p className="text-xs text-ink-500 mb-3">
                        Highest bid was {formatCurrency(auction.current_bid)}, below your reserve of {formatCurrency(artwork.reserve_price)}.
                        Accept this price or decline the sale.
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => handleResolveSale(false)} className="btn-secondary text-xs py-2 px-4 flex-1">
                          Decline
                        </button>
                        <button onClick={() => handleResolveSale(true)} className="btn-accent text-xs py-2 px-4 flex-1">
                          Accept {formatCurrency(auction.current_bid)}
                        </button>
                      </div>
                    </div>
                  )}

                  {(status === 'live' || status === 'flash') && (
                    <button onClick={handleEndAuctionNow} className="btn-secondary w-full text-sm py-3">
                      End Auction Now
                    </button>
                  )}

                  {auction.bid_count === 0 && (status === 'live' || status === 'flash' || status === 'upcoming') && (
                    <>
                      {editingReserve ? (
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={reserveInput}
                            onChange={(e) => setReserveInput(e.target.value)}
                            className="flex-1 px-3 py-2 text-sm bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-700"
                            placeholder="New reserve price"
                          />
                          <button onClick={handleUpdateReserve} className="btn-accent text-xs py-2 px-4">Save</button>
                          <button onClick={() => setEditingReserve(false)} className="btn-secondary text-xs py-2 px-4">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setReserveInput(String(artwork.reserve_price));
                            setEditingReserve(true);
                          }}
                          className="btn-secondary w-full text-sm py-3"
                        >
                          Adjust Reserve Price
                        </button>
                      )}
                      <button onClick={handleCancelListing} className="w-full text-xs text-red-600 dark:text-red-400 py-2 hover:underline">
                        Cancel Listing
                      </button>
                    </>
                  )}

                  {status === 'ended' && auction.outcome && (
                    <div className="p-4 bg-ink-100 dark:bg-ink-800 text-center">
                      <p className="text-sm font-semibold">
                        {auction.outcome === 'sold' ? 'Sold' :
                         auction.outcome === 'declined' ? 'Sale Declined' :
                         'No Bids Received'}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <button
                    onClick={handleBidClick}
                    disabled={status === 'upcoming' || status === 'ended' || !(artwork.studio_verified && artwork.verification_method)}
                    className="btn-accent w-full text-base py-4"
                  >
                    <span className="flex items-center justify-center gap-2">
                      {session ? <Gavel className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                      {!(artwork.studio_verified && artwork.verification_method)
                        ? 'Pending Studio Verification'
                        : status === 'upcoming' ? 'Auction Not Started' : status === 'ended' ? 'Auction Ended' : session ? 'Place Bid' : 'Sign In to Bid'}
                    </span>
                  </button>
                  {artwork.buy_now_price != null &&
                    Number(artwork.buy_now_price) > 0 &&
                    (status === 'live' || status === 'flash') &&
                    artwork.studio_verified &&
                    artwork.verification_method && (
                      <button
                        type="button"
                        disabled={buyingNow}
                        onClick={handleBuyNow}
                        className="btn-secondary w-full text-sm py-3 mt-2"
                      >
                        {buyingNow ? 'Processing…' : `Buy Now · ${formatCurrency(Number(artwork.buy_now_price))}`}
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => navigate(session ? 'messages' : 'auth')}
                    className="w-full mt-2 text-xs uppercase tracking-widest text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 border border-ink-200 dark:border-ink-700 py-2.5 transition-colors"
                  >
                    Ask about this lot
                  </button>
                </>
              )}

              {((artwork as any).condition_grade || (artwork as any).condition_report) && (
                <div className="px-4 py-3 border border-ink-200 dark:border-ink-800">
                  <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-1">Condition</p>
                  <p className="text-sm capitalize font-medium">{(artwork as any).condition_grade || 'See report'}</p>
                  {(artwork as any).condition_report && (
                    <p className="text-xs text-ink-500 mt-1 leading-relaxed">{(artwork as any).condition_report}</p>
                  )}
                </div>
              )}

              {((artwork as any).certificate_number || (artwork as any).public_verify_slug) && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `verify/${(artwork as any).public_verify_slug || (artwork as any).certificate_number}`
                    )
                  }
                  className="w-full text-xs uppercase tracking-wider py-2.5 border border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                >
                  Verify certificate publicly
                </button>
              )}

              {provenance.length > 0 && (
                <div className="px-4 py-4 border border-ink-200 dark:border-ink-800">
                  <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-3">Provenance</p>
                  <ol className="space-y-3">
                    {provenance.map((e) => (
                      <li key={e.id} className="text-xs">
                        <span className="text-ink-400">
                          {new Date(e.occurred_at).toLocaleDateString()}
                        </span>
                        <span className="font-medium text-ink-800 dark:text-ink-100 ml-2">{e.title}</span>
                        {e.detail && <p className="text-ink-500 mt-0.5 ml-0">{e.detail}</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {(auction as any).live_stream_url && (
                <div className="mb-4">
                  <LiveStreamRoom
                    url={(auction as any).live_stream_url}
                    active={!!(auction as any).live_stream_active}
                    title={artwork.title}
                  />
                </div>
              )}

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

              {(artwork as any).certificate_number && (
                <div className="card-surface p-4 mb-4 flex items-start gap-3">
                  <Award className="w-5 h-5 text-gold-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs uppercase tracking-widest text-ink-400 font-semibold">Certificate of Authenticity</p>
                    <p className="font-mono text-sm mt-1">{(artwork as any).certificate_number}</p>
                    <p className="text-xs text-ink-500 mt-1">Studio-verified human-made work on Atelier.</p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={messageArtist}
                className="btn-secondary w-full text-sm mb-4 flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                Message artist
              </button>

              {/* Bid history */}
              <div>
                <h3 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-3">Bid History</h3>
                {bids.length === 0 ? (
                  <p className="text-sm text-ink-400 py-4 text-center">No bids yet. Be the first.</p>
                ) : (
                  <div className="space-y-2">
                    {bids.slice(0, 8).map((bid, i) => {
                      const maskIdentity = isOwner && (status === 'live' || status === 'flash');
                      const displayName = maskIdentity ? `Bidder ${bids.length - i}` : bid.bidder_name;
                      return (
                      <div
                        key={bid.id}
                        className={`flex items-center justify-between px-4 py-2.5 ${i === 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' : 'bg-ink-50 dark:bg-ink-900'}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-ink-200 dark:bg-ink-700 flex items-center justify-center text-xs font-bold">
                            {maskIdentity ? '?' : bid.bidder_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{displayName}</p>
                            <p className="text-xs text-ink-400">{timeAgo(bid.created_at)}</p>
                          </div>
                        </div>
                        <p className="font-mono text-sm font-bold tabular-nums">{formatCurrency(bid.amount)}</p>
                      </div>
                      );
                    })}
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
            {artwork.studio_verified && artwork.verification_method && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Studio Verified
              </span>
            )}
          </div>
          <p className="text-xs text-ink-500 mb-2">{artist?.location}</p>
          <p className="text-sm text-ink-600 dark:text-ink-400 leading-relaxed">{artist?.biography}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-ink-100 dark:bg-ink-800 p-4 text-center">
          <p className="font-mono text-2xl font-bold">{artist?.total_sales}</p>
          <p className="text-[10px] uppercase tracking-widest text-ink-400 mt-1">Total Sales</p>
        </div>
        <div className="bg-ink-100 dark:bg-ink-800 p-4 text-center">
          <p className="font-mono text-2xl font-bold">{artwork.studio_verified && artwork.verification_method ? '100%' : '—'}</p>
          <p className="text-[10px] uppercase tracking-widest text-ink-400 mt-1">Human-Made</p>
        </div>
        <div className="bg-ink-100 dark:bg-ink-800 p-4 text-center">
          <p className="font-mono text-2xl font-bold">{artwork.studio_verified && artwork.verification_method ? 'Yes' : 'No'}</p>
          <p className="text-[10px] uppercase tracking-widest text-ink-400 mt-1">Verified</p>
        </div>
      </div>

      {/* Verification */}
      {artwork.verification_method === 'live_video' && (
        <div>
          <h4 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-3">Process Video</h4>
          {artwork.verification_video_url ? (
            <a
              href={artwork.verification_video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-video bg-ink-900 overflow-hidden group cursor-pointer block"
            >
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
            </a>
          ) : (
            <div className="relative aspect-video bg-ink-900 overflow-hidden flex items-center justify-center">
              <p className="text-ink-400 text-sm">No verification video was uploaded for this piece.</p>
            </div>
          )}
        </div>
      )}

      {artwork.verification_method === 'evidence_based' && (
        <div>
          <h4 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-3">Verified by Evidence</h4>
          <p className="text-xs text-ink-500 mb-3">
            This piece was completed before joining Atelier. It was verified using dated process evidence
            rather than a live video.
          </p>
          {artwork.evidence_items.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {artwork.evidence_items.map((item, i) => (
                <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="aspect-square bg-ink-100 dark:bg-ink-800 overflow-hidden block">
                  <img src={item.url} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {artwork.verification_method === 'studio_partner' && (
        <div className="p-4 bg-ink-100 dark:bg-ink-800 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Verified In Person</p>
            <p className="text-xs text-ink-500 mt-0.5">A partner studio or Atelier team member verified this piece directly.</p>
          </div>
        </div>
      )}

      {!artwork.verification_method && (
        <div className="p-4 bg-ink-100 dark:bg-ink-800">
          <p className="text-sm text-ink-500">Verification for this piece is still pending review.</p>
        </div>
      )}

      {/* Artwork description */}
      <div>
        <h4 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-3">About This Piece</h4>
        <p className="text-sm text-ink-600 dark:text-ink-400 leading-relaxed">{artwork.description}</p>
      </div>
    </div>
  );
}
