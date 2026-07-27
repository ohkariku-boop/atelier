import { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, SlidersHorizontal, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuctionWithDetails } from '@/types';
import { ArtworkCard } from '@/components/ArtworkCard';
import { MEDIUMS } from '@/lib/theme';
import { tryCloseAuction } from '@/lib/closeAuction';

interface GalleryFloorProps {
  navigate: (path: string) => void;
}

type SortOption = 'ending_soon' | 'price_low' | 'price_high' | 'newest';

export function GalleryFloor({ navigate }: GalleryFloorProps) {
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMediums, setSelectedMediums] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<SortOption>('ending_soon');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('auctions')
        .select(`
          *,
          artwork:artworks(*)
        `);

      if (error || !data) {
        setLoading(false);
        return;
      }

      // Fetch artists separately and join
      const { data: artworks } = await supabase
        .from('artworks')
        .select(`
          id,
          artist:artists(*)
        `);

      const artistMap = new Map();
      (artworks || []).forEach((aw: any) => {
        if (aw.artist) artistMap.set(aw.id, aw.artist);
      });

      const result: AuctionWithDetails[] = (data as any[]).map((a) => ({
        ...a,
        artwork: a.artwork,
        artist: artistMap.get(a.artwork_id) || a.artwork?.artist,
      }));

      setAuctions(result);
      setLoading(false);

      // Lazily close any overdue auctions - there is no cron job in this
      // stack, so someone loading the gallery is what actually triggers
      // closing. Fire-and-forget; each auction's own detail page will
      // reflect the outcome once closed.
      const overdue = result.filter(
        (a) => a.status !== 'ended' && new Date(a.end_time).getTime() <= Date.now()
      );
      overdue.forEach((a) => tryCloseAuction(a.id));
    }
    load();
  }, []);

  const toggleMedium = (medium: string) => {
    setSelectedMediums((prev) => {
      const next = new Set(prev);
      if (next.has(medium)) next.delete(medium);
      else next.add(medium);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = [...auctions];

    if (selectedMediums.size > 0) {
      // Real artwork.medium values are descriptive (e.g. "Oil on Linen",
      // "Acrylic and Oil Pastel on Canvas") rather than the bare category
      // labels shown in the filter UI - exact equality would only ever
      // match the rare artwork whose medium happens to be the bare word
      // itself. Match by substring instead so "Oil" correctly matches
      // "Oil on Linen", "Impasto Oil on Canvas", etc.
      result = result.filter((a) => {
        const medium = a.artwork.medium.toLowerCase();
        return Array.from(selectedMediums).some((m) => medium.includes(m.toLowerCase()));
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.artwork.title.toLowerCase().includes(q) ||
          a.artist?.name.toLowerCase().includes(q)
      );
    }

    switch (sortOption) {
      case 'ending_soon':
        result.sort((a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime());
        break;
      case 'price_low':
        result.sort((a, b) => a.current_bid - b.current_bid);
        break;
      case 'price_high':
        result.sort((a, b) => b.current_bid - a.current_bid);
        break;
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
    }

    return result;
  }, [auctions, selectedMediums, sortOption, searchQuery]);

  return (
    <div>
      {/* Anti-AI Guarantee Banner */}
      <div className="bg-ink-900 dark:bg-ink-900 text-ink-50">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-3 flex items-center justify-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-xs sm:text-sm font-medium tracking-wide text-center">
            <span className="font-bold uppercase tracking-wider">Anti-AI Guarantee</span>
            <span className="hidden sm:inline mx-2 text-ink-500">·</span>
            <span className="hidden sm:inline text-ink-300">Every piece is studio-verified 100% human-made. No AI art. No digital-only assets.</span>
            <span className="sm:hidden text-ink-300">100% human-made, studio-verified.</span>
          </p>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 pt-12 pb-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-accent-500 font-semibold mb-3">The Gallery Floor</p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight">
              Curated live auctions.<br />
              <span className="text-ink-400">Made by human hands.</span>
            </h1>
          </div>
          <p className="text-sm text-ink-500 max-w-sm leading-relaxed">
            Browse physical artworks from verified artists worldwide. Paint, ceramic, charcoal, wood —
            never pixels.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="sticky top-16 z-40 bg-ink-50/80 dark:bg-ink-950/80 backdrop-blur-xl border-y border-ink-200 dark:border-ink-800">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex items-center gap-2 flex-shrink-0">
              <SlidersHorizontal className="w-4 h-4 text-ink-400" />
              <span className="text-xs uppercase tracking-widest font-semibold text-ink-500">Filter</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {MEDIUMS.map((medium) => {
                const active = selectedMediums.has(medium);
                return (
                  <button
                    key={medium}
                    onClick={() => toggleMedium(medium)}
                    className={`px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                      active
                        ? 'bg-ink-900 text-ink-50 dark:bg-ink-50 dark:text-ink-900'
                        : 'border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:border-ink-900 dark:hover:border-ink-400'
                    }`}
                  >
                    {medium}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 lg:ml-auto">
              <div className="relative flex-1 lg:w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search art or artist..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-transparent border border-ink-200 dark:border-ink-700 focus:outline-none focus:border-ink-900 dark:focus:border-ink-400 transition-colors"
                />
              </div>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="px-3 py-2 text-xs font-medium bg-transparent border border-ink-200 dark:border-ink-700 focus:outline-none focus:border-ink-900 dark:focus:border-ink-400 transition-colors cursor-pointer"
              >
                <option value="ending_soon">Ending Soon</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card-surface">
                <div className="aspect-[4/5] bg-ink-100 dark:bg-ink-800 animate-pulse" />
                <div className="p-5 space-y-3">
                  <div className="h-4 w-24 bg-ink-100 dark:bg-ink-800 animate-pulse" />
                  <div className="h-6 w-3/4 bg-ink-100 dark:bg-ink-800 animate-pulse" />
                  <div className="h-4 w-1/2 bg-ink-100 dark:bg-ink-800 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-ink-400 text-lg font-serif">No artworks match your filters.</p>
            <button
              onClick={() => { setSelectedMediums(new Set()); setSearchQuery(''); }}
              className="mt-4 text-sm text-accent-600 dark:text-accent-400 font-medium hover:underline"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-ink-400 mb-6 uppercase tracking-widest">
              {filtered.length} {filtered.length === 1 ? 'piece' : 'pieces'} on the floor
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((auction) => (
                <ArtworkCard
                  key={auction.id}
                  auction={auction}
                  onClick={() => navigate(`auction/${auction.id}`)}
                  onArtistClick={(artistId) => navigate(`artist/${artistId}`)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
