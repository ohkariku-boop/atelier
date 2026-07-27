import { useState, useEffect } from 'react';
import { ShieldCheck, MapPin, PlayCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Artist, AuctionWithDetails } from '@/types';
import { ArtworkCard } from '@/components/ArtworkCard';
import { tryCloseAuction } from '@/lib/closeAuction';

interface ArtistProfileProps {
  artistId: string;
  navigate: (path: string) => void;
}

export function ArtistProfile({ artistId, navigate }: ArtistProfileProps) {
  const [artist, setArtist] = useState<Artist | null>(null);
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setNotFound(false);

      const { data: artistData, error: artistError } = await supabase
        .from('artists')
        .select('*')
        .eq('id', artistId)
        .maybeSingle();

      if (cancelled) return;

      if (artistError || !artistData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setArtist(artistData as Artist);

      // This artist's artworks, each with its auction - every artwork gets
      // an auction created alongside it at listing time, so this join is
      // expected to always resolve.
      const { data: artworkData } = await supabase
        .from('artworks')
        .select('*, auction:auctions(*)')
        .eq('artist_id', artistId)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      const result: AuctionWithDetails[] = (artworkData || [])
        .filter((aw: any) => aw.auction)
        .map((aw: any) => ({
          ...aw.auction,
          artwork: aw,
          artist: artistData as Artist,
        }));

      setAuctions(result);
      setLoading(false);

      // Lazily close any of this artist's overdue auctions, same pattern
      // used on the gallery and auction detail pages.
      result
        .filter((a) => a.status !== 'ended' && new Date(a.end_time).getTime() <= Date.now())
        .forEach((a) => tryCloseAuction(a.id));
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ink-400" />
      </div>
    );
  }

  if (notFound || !artist) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-serif">Artist not found</p>
        <button onClick={() => navigate('gallery')} className="btn-secondary text-sm py-2 px-4">
          Back to Gallery
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <button
        onClick={() => navigate('gallery')}
        className="flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-700 dark:hover:text-ink-300 mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Gallery
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mb-10 pb-8 border-b border-ink-100 dark:border-ink-800">
        <div className="w-20 h-20 rounded-full overflow-hidden bg-ink-100 dark:bg-ink-800 flex-shrink-0">
          {artist.avatar_url && (
            <img src={artist.avatar_url} alt={artist.name} className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold">{artist.name}</h1>
            {artist.studio_verified ? (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                Studio Verified
              </span>
            ) : (
              <span className="text-xs font-medium text-ink-400">Verification pending</span>
            )}
          </div>
          {artist.location && (
            <p className="flex items-center gap-1 text-sm text-ink-500 mt-1">
              <MapPin className="w-3.5 h-3.5" />
              {artist.location}
            </p>
          )}
          <p className="text-xs text-ink-400 mt-1">
            {artist.total_sales} {artist.total_sales === 1 ? 'sale' : 'sales'}
          </p>
        </div>
      </div>

      {/* Biography + philosophy */}
      <div className="grid sm:grid-cols-2 gap-8 mb-10">
        {artist.biography && (
          <div>
            <h2 className="text-xs uppercase tracking-widest font-semibold text-ink-400 mb-2">Biography</h2>
            <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-300">{artist.biography}</p>
          </div>
        )}
        {artist.creative_philosophy && (
          <div>
            <h2 className="text-xs uppercase tracking-widest font-semibold text-ink-400 mb-2">
              Creative Philosophy
            </h2>
            <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-300 italic">
              "{artist.creative_philosophy}"
            </p>
          </div>
        )}
      </div>

      {artist.process_video_url && (
        <a
          href={artist.process_video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-accent-600 dark:text-accent-400 hover:underline mb-10"
        >
          <PlayCircle className="w-4 h-4" />
          Watch studio process video
        </a>
      )}

      {/* Artworks grid */}
      <h2 className="text-xs uppercase tracking-widest font-semibold text-ink-400 mb-4">
        {auctions.length > 0 ? `Artworks (${auctions.length})` : 'Artworks'}
      </h2>
      {auctions.length === 0 ? (
        <p className="text-sm text-ink-500">This artist hasn't listed any artworks yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {auctions.map((auction) => (
            <ArtworkCard key={auction.id} auction={auction} onClick={() => navigate(`auction/${auction.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
