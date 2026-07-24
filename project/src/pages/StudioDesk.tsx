import { useState, useEffect, useRef } from 'react';
import { Plus, ShieldCheck, X, Video, Image as ImageIcon, TrendingUp, Gavel, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuctionWithDetails, Artist } from '@/types';
import { formatCurrency, MEDIUMS, SHIPPING_RATES } from '@/lib/theme';
import { Badge } from '@/components/Badge';
import { CountdownTimer } from '@/components/CountdownTimer';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';

interface StudioDeskProps {
  navigate: (path: string) => void;
}

type View = 'dashboard' | 'create';

export function StudioDesk({ navigate }: StudioDeskProps) {
  const { showToast } = useToast();
  const { profile, session } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Use authenticated session for security
      if (!session?.user?.id || !profile?.artist_id) {
        setLoading(false);
        return;
      }

      // Load artist record
      const { data: artistData } = await supabase
        .from('artists')
        .select('*')
        .eq('id', profile.artist_id)
        .maybeSingle();
      setArtist(artistData as Artist | null);

      // Fetch auctions for this user's artworks
      const { data: artworkData } = await supabase
        .from('artworks')
        .select('id, artist:artists(*)')
        .eq('user_id', session.user.id);

      const artistMap = new Map<string, Artist>();
      (artworkData || []).forEach((aw: any) => {
        if (aw.artist) artistMap.set(aw.id, aw.artist);
      });

      const artworkIds = (artworkData || []).map((aw: any) => aw.id);
      if (artworkIds.length === 0) {
        setAuctions([]);
        setLoading(false);
        return;
      }

      const { data: auctionData } = await supabase
        .from('auctions')
        .select('*, artwork:artworks(*)')
        .in('artwork_id', artworkIds)
        .order('created_at', { ascending: false });

      const result: AuctionWithDetails[] = (auctionData || []).map((a: any) => ({
        ...a,
        artwork: a.artwork,
        artist: artistMap.get(a.artwork_id),
      }));

      setAuctions(result);
      setLoading(false);
    }
    load();
  }, [session, profile]);

  const activeAuctions = auctions.filter((a) => a.status === 'live' || a.status === 'flash');
  const upcomingAuctions = auctions.filter((a) => a.status === 'upcoming');
  const endedAuctions = auctions.filter((a) => a.status === 'ended');

  const totalRevenue = endedAuctions.reduce((sum, a) => sum + a.current_bid, 0);
  const totalBids = auctions.reduce((sum, a) => sum + a.bid_count, 0);

  if (!session) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-20 text-center">
        <p className="text-ink-400 text-lg">Please sign in to access the Studio Desk.</p>
        <button onClick={() => navigate('auth')} className="btn-primary mt-4 text-sm">Sign In</button>
      </div>
    );
  }

  if (profile?.role !== 'artist') {
    return (
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-20 text-center">
        <p className="text-ink-400 text-lg">The Studio Desk is for artist accounts only.</p>
        <p className="text-sm text-ink-500 mt-2">Sign in with an artist account to manage your listings.</p>
        <button onClick={() => navigate('auth')} className="btn-secondary mt-4 text-sm">Switch Account</button>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-accent-500 font-semibold mb-2">The Studio Desk</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight">Seller Dashboard</h1>
          <p className="text-sm text-ink-500 mt-2">Welcome back, {profile?.display_name}</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="btn-primary text-sm flex items-center gap-2 self-start"
        >
          <Plus className="w-4 h-4" />
          Create New Listing
        </button>
      </div>

      {view === 'dashboard' ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="card-surface p-5">
              <div className="flex items-center gap-2 mb-2">
                <Gavel className="w-4 h-4 text-accent-500" />
                <span className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">Active</span>
              </div>
              <p className="font-mono text-2xl font-bold">{activeAuctions.length}</p>
            </div>
            <div className="card-surface p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">Revenue</span>
              </div>
              <p className="font-mono text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="card-surface p-5">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-gold-500" />
                <span className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">Total Bids</span>
              </div>
              <p className="font-mono text-2xl font-bold">{totalBids}</p>
            </div>
            <div className="card-surface p-5">
              <div className="flex items-center gap-2 mb-2">
                <Plus className="w-4 h-4 text-ink-500" />
                <span className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">Listings</span>
              </div>
              <p className="font-mono text-2xl font-bold">{auctions.length}</p>
            </div>
          </div>

          {/* Active auctions */}
          <section className="mb-8">
            <h2 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-4">Active Auctions</h2>
            {loading ? (
              <div className="card-surface p-8 text-center text-ink-400 text-sm">Loading...</div>
            ) : activeAuctions.length === 0 ? (
              <div className="card-surface p-8 text-center">
                <p className="text-ink-400 text-sm mb-4">No active auctions. Create a listing to get started.</p>
                <button onClick={() => setView('create')} className="btn-secondary text-sm">
                  Create Listing
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeAuctions.map((a) => (
                  <AuctionRow key={a.id} auction={a} navigate={navigate} />
                ))}
              </div>
            )}
          </section>

          {upcomingAuctions.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-4">Upcoming</h2>
              <div className="space-y-3">
                {upcomingAuctions.map((a) => (
                  <AuctionRow key={a.id} auction={a} navigate={navigate} />
                ))}
              </div>
            </section>
          )}

          {endedAuctions.length > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-4">Ended Auctions</h2>
              <div className="space-y-3">
                {endedAuctions.map((a) => (
                  <AuctionRow key={a.id} auction={a} navigate={navigate} />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="text-center p-8">Feature not fully active in this view yet. Please return to dashboard.</div>
      )}
    </div>
  );
}

function AuctionRow({ auction, navigate }: { auction: AuctionWithDetails; navigate: (p: string) => void }) {
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
          {artwork.studio_verified && <Badge variant="verified" />}
        </div>
        <h3 className="font-serif text-sm font-semibold truncate group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
          {artwork.title}
        </h3>
        <p className="text-xs text-ink-500">{artist?.name} · {artwork.medium}</p>
      </div>
      <div className="hidden sm:block text-right">
        <p className="font-mono text-sm font-bold">{formatCurrency(auction.current_bid || artwork.starting_bid)}</p>
        <p className="text-xs text-ink-400">{auction.bid_count} bids · {reserveMet ? 'Reserve met' : 'Reserve pending'}</p>
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