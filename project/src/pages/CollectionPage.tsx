import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuctionWithDetails } from '@/types';
import { ArtworkCard } from '@/components/ArtworkCard';
import { setPageMeta, resetPageMeta } from '@/lib/pageMeta';

interface CollectionPageProps {
  slug: string;
  navigate: (path: string) => void;
}

export function CollectionPage({ slug, navigate }: CollectionPageProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<string | null>(null);
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: col, error } = await supabase
        .from('collections')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();

      if (error || !col) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setTitle(col.title);
      setDescription(col.description);
      setPageMeta({
        title: `${col.title} — Atelier`,
        description: col.description || 'Curated collection on Atelier',
      });

      const { data: items } = await supabase
        .from('collection_items')
        .select('artwork_id')
        .eq('collection_id', col.id);

      const artworkIds = (items || []).map((i: any) => i.artwork_id);
      if (artworkIds.length === 0) {
        setAuctions([]);
        setLoading(false);
        return;
      }

      const { data: auctionData } = await supabase
        .from('auctions')
        .select('*, artwork:artworks(*)')
        .in('artwork_id', artworkIds)
        .in('status', ['live', 'flash', 'upcoming']);

      const { data: artworks } = await supabase
        .from('artworks')
        .select('id, artist:artists(*)')
        .in('id', artworkIds);

      const artistMap = new Map();
      (artworks || []).forEach((aw: any) => {
        if (aw.artist) artistMap.set(aw.id, aw.artist);
      });

      const result: AuctionWithDetails[] = ((auctionData || []) as any[]).map((a) => ({
        ...a,
        artist: artistMap.get(a.artwork_id),
      }));

      setAuctions(result);
      setLoading(false);
    })();
    return () => resetPageMeta();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-ink-400" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <p className="text-ink-400">Collection not found.</p>
        <button onClick={() => navigate('')} className="btn-secondary mt-4 text-sm">
          Gallery
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-10">
      <button
        onClick={() => navigate('')}
        className="flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-800 dark:hover:text-ink-200 mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Gallery
      </button>
      <p className="text-xs uppercase tracking-[0.25em] text-accent-500 font-semibold mb-2">Collection</p>
      <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight mb-3">{title}</h1>
      {description && <p className="text-sm text-ink-500 max-w-2xl mb-10 leading-relaxed">{description}</p>}

      {auctions.length === 0 ? (
        <p className="text-ink-400 py-12">No active auctions in this collection right now.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {auctions.map((auction) => (
            <ArtworkCard
              key={auction.id}
              auction={auction}
              onClick={() => navigate(`auction/${auction.id}`)}
              onArtistClick={(artistId) => navigate(`artist/${artistId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
