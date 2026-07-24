import { useState, useEffect } from 'react';
import { Plus, ShieldCheck, TrendingUp, Gavel, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuctionWithDetails } from '@/types';
import { formatCurrency } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';

interface StudioDeskProps {
  navigate: (path: string) => void;
}

export function StudioDesk({ navigate }: StudioDeskProps) {
  const { session } = useAuth();
  const [artworks, setArtworks] = useState<any[]>([]);
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!session?.user?.id) { setLoading(false); return; }

      // 1. Fetch ALL artworks for this user first
      const { data: artworkData } = await supabase
        .from('artworks')
        .select('*')
        .eq('user_id', session.user.id);

      // 2. Fetch auctions for these artworks
      const { data: auctionData } = await supabase
        .from('auctions')
        .select('*, artwork:artworks(*)')
        .in('artwork_id', (artworkData || []).map(a => a.id));

      setArtworks(artworkData || []);
      setAuctions(auctionData || []);
      setLoading(false);
    }
    load();
  }, [session]);

  const activeCount = auctions.filter(a => a.status === 'live' || a.status === 'flash').length;

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-8">
      <div className="flex justify-between mb-8">
        <h1 className="text-3xl font-semibold">Seller Dashboard</h1>
        <button className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Create New Listing</button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card-surface p-5"><p className="text-xs text-ink-400">Active Auctions</p><p className="text-2xl font-bold">{activeCount}</p></div>
        <div className="card-surface p-5"><p className="text-xs text-ink-400">Total Listings</p><p className="text-2xl font-bold">{artworks.length}</p></div>
        <div className="card-surface p-5"><p className="text-xs text-ink-400">Revenue</p><p className="text-2xl font-bold">$0</p></div>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase text-ink-500 mb-4">Your Listings</h2>
        {loading ? <div className="p-8 text-center"><Loader2 className="animate-spin inline" /></div> : 
        <div className="space-y-3">
          {artworks.map((aw) => (
            <div key={aw.id} className="card-surface w-full flex items-center gap-4 p-4 text-left">
              <div className="w-16 h-16 bg-ink-100 overflow-hidden"><img src={aw.image_url} alt="" className="w-full h-full object-cover" /></div>
              <div className="flex-1">
                <h3 className="font-semibold">{aw.title}</h3>
                <p className="text-xs text-ink-500">{aw.medium}</p>
              </div>
            </div>
          ))}
        </div>}
      </section>
    </div>
  );
}