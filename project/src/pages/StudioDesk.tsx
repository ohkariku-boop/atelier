import { useState, useEffect } from 'react';
import { Plus, ShieldCheck, TrendingUp, Gavel, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuctionWithDetails, Artist } from '@/types';
import { formatCurrency } from '@/lib/theme';
import { Badge } from '@/components/Badge';
import { CountdownTimer } from '@/components/CountdownTimer';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

interface StudioDeskProps {
  navigate: (path: string) => void;
}

type View = 'dashboard' | 'create';

export function StudioDesk({ navigate }: StudioDeskProps) {
  const { session } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }

      const { data: artworkData, error: artworkError } = await supabase
        .from('artworks')
        .select('id, title, medium, image_url, artist:artists(*)')
        .eq('user_id', session.user.id);

      if (artworkError) {
        console.error('DEBUG: Error fetching artworks:', artworkError);
      }

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
        artist: artworkData?.find(aw => aw.id === a.artwork_id)?.artist,
      }));

      setAuctions(result);
      setLoading(false);
    }
    load();
  }, [session]);

  const activeAuctions = auctions.filter((a) => a.status === 'live' || a.status === 'flash');
  const endedAuctions = auctions.filter((a) => a.status === 'ended');
  const totalRevenue = endedAuctions.reduce((sum, a) => sum + (a.current_bid || 0), 0);
  const totalBids = auctions.reduce((sum, a) => sum + (a.bid_count || 0), 0);

  if (!session) return <div className="p-20 text-center">Please sign in to access the Studio Desk.</div>;

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-8">
      <div className="flex justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold">Seller Dashboard</h1>
        </div>
        <button onClick={() => setView('create')} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create New Listing
        </button>
      </div>

      {view === 'dashboard' ? (
        <>
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="card-surface p-5"><p className="text-xs text-ink-400">Active</p><p className="text-2xl font-bold">{activeAuctions.length}</p></div>
            <div className="card-surface p-5"><p className="text-xs text-ink-400">Revenue</p><p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p></div>
            <div className="card-surface p-5"><p className="text-xs text-ink-400">Total Bids</p><p className="text-2xl font-bold">{totalBids}</p></div>
          </div>

          <section>
            <h2 className="text-xs font-semibold uppercase text-ink-500 mb-4">Your Listings</h2>
            {loading ? <div className="p-8 text-center"><Loader2 className="animate-spin inline" /></div> : 
            <div className="space-y-3">
              {auctions.map((a) => <AuctionRow key={a.id} auction={a} navigate={navigate} />)}
            </div>}
          </section>
        </>
      ) : (
        <div className="card-surface p-8 text-center">Create Listing Form Placeholder</div>
      )}
    </div>
  );
}

function AuctionRow({ auction, navigate }: { auction: AuctionWithDetails; navigate: (p: string) => void }) {
  return (
    <button onClick={() => navigate(`auction/${auction.id}`)} className="card-surface w-full flex items-center gap-4 p-4 text-left">
      <div className="w-16 h-16 bg-ink-100 overflow-hidden"><img src={auction.artwork.image_url} alt="" className="w-full h-full object-cover" /></div>
      <div className="flex-1">
        <h3 className="font-semibold">{auction.artwork.title}</h3>
        <p className="text-xs text-ink-500">{auction.artwork.medium}</p>
      </div>
      <div className="text-right font-mono font-bold">{formatCurrency(auction.current_bid)}</div>
    </button>
  );
}