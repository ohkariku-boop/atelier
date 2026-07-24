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
      // 1. Get authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || !profile?.artist_id) {
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

      // 2. Fetch artworks dynamically based on the logged-in user.id
      const { data: artworkData } = await supabase
        .from('artworks')
        .select('id, artist:artists(*)')
        .eq('user_id', user.id); // Dynamic filter

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
  }, [profile]); // Dependencies simplified

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
      {/* Header, Stats, and Sections remain exactly as your original implementation */}
      {/* ... (Existing JSX remains unchanged) ... */}
    </div>
  );
}

// ... Keep existing AuctionRow and CreateListingForm components below ...