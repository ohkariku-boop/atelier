import { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, SlidersHorizontal, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuctionWithDetails } from '@/types';
import { ArtworkCard } from '@/components/ArtworkCard';
import { MEDIUMS, formatCurrency } from '@/lib/theme';
import { tryCloseAuction } from '@/lib/closeAuction';
import { setPageMeta } from '@/lib/pageMeta';
import { useAuth } from '@/context/AuthContext';

interface GalleryFloorProps {
  navigate: (path: string) => void;
}

type SortOption = 'ending_soon' | 'price_low' | 'price_high' | 'newest' | 'most_bids';
type StatusFilter = 'all_active' | 'live' | 'flash' | 'ending_soon' | 'buy_now';

const PAGE_SIZE = 15;

export function GalleryFloor({ navigate }: GalleryFloorProps) {
  const { session } = useAuth();
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMediums, setSelectedMediums] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<SortOption>('ending_soon');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all_active');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [followedArtistIds, setFollowedArtistIds] = useState<Set<string>>(new Set());
  const [showFollowingOnly, setShowFollowingOnly] = useState(false);
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);
  const [ftsIds, setFtsIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    setPageMeta({
      title: 'Gallery Floor — Atelier',
      description: 'Browse live auctions of studio-verified, 100% human-made physical art.',
    });
  }, []);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('auctions')
        .select(`
          *,
          artwork:artworks(*)
        `)
        .in('status', ['live', 'flash', 'upcoming']);

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

      // Safety-net close for any overdue auctions. Primary closer is the
      // scheduled Edge Function close-expired-auctions.
      const overdue = result.filter(
        (a) => a.status !== 'ended' && new Date(a.end_time).getTime() <= Date.now()
      );
      overdue.forEach((a) => tryCloseAuction(a.id));

      if (session?.user?.id) {
        try {
          const { data: fol } = await supabase
            .from('artist_follows')
            .select('artist_id')
            .eq('user_id', session.user.id);
          if (fol) setFollowedArtistIds(new Set(fol.map((f: any) => f.artist_id)));
        } catch { /* optional */ }
      }

    }
    load();
  }, []);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [selectedMediums, sortOption, statusFilter, verifiedOnly, searchQuery, showFollowingOnly]);

  // Server full-text search when available
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setFtsIds(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('search_artworks', {
        p_query: q,
        p_limit: 100,
      });
      if (cancelled) return;
      if (error || !data) {
        setFtsIds(null); // fall back to client filter
        return;
      }
      setFtsIds(new Set((data as { id: string }[]).map((r) => r.id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

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
    const now = Date.now();

    // Status filter
    if (statusFilter === 'live') {
      result = result.filter((a) => a.status === 'live');
    } else if (statusFilter === 'flash') {
      result = result.filter((a) => a.status === 'flash' || a.is_flash);
    } else if (statusFilter === 'ending_soon') {
      const in24h = now + 24 * 60 * 60 * 1000;
      result = result.filter(
        (a) =>
          (a.status === 'live' || a.status === 'flash') &&
          new Date(a.end_time).getTime() <= in24h
      );
    } else if (statusFilter === 'buy_now') {
      result = result.filter((a) => {
        const price = (a.artwork as { buy_now_price?: number | null })?.buy_now_price;
        return price != null && Number(price) > 0;
      });
    }
    // 'all_active' keeps everything already loaded (live/flash/upcoming)

    // Medium filter
    if (selectedMediums.size > 0) {
      result = result.filter((a) => selectedMediums.has(a.artwork.medium));
    }

    // Verified only
    if (verifiedOnly) {
      result = result.filter(
        (a) => a.artwork.studio_verified && !!a.artwork.verification_method
      );
    }

    if (showFollowingOnly && followedArtistIds.size > 0) {
      result = result.filter((a) => a.artist?.id && followedArtistIds.has(a.artist.id));
    }

    if (showFeaturedOnly) {
      result = result.filter((a) => !!(a.artwork as any).is_featured);
    }

    // Search — prefer FTS ranks when RPC available
    if (searchQuery.trim()) {
      if (ftsIds) {
        result = result.filter((a) => ftsIds.has(a.artwork.id));
      } else {
        const q = searchQuery.toLowerCase().trim();
        result = result.filter(
          (a) =>
            a.artwork.title.toLowerCase().includes(q) ||
            a.artist?.name?.toLowerCase().includes(q) ||
            a.artwork.medium.toLowerCase().includes(q) ||
            (a.artwork.description || '').toLowerCase().includes(q)
        );
      }
    }

    // Sort
    switch (sortOption) {
      case 'ending_soon':
        result.sort(
          (a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime()
        );
        break;
      case 'price_low':
        result.sort((a, b) => a.current_bid - b.current_bid);
        break;
      case 'price_high':
        result.sort((a, b) => b.current_bid - a.current_bid);
        break;
      case 'newest':
        result.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      case 'most_bids':
        result.sort((a, b) => b.bid_count - a.bid_count);
        break;
    }

    return result;
  }, [auctions, selectedMediums, sortOption, statusFilter, verifiedOnly, searchQuery, showFollowingOnly, followedArtistIds, ftsIds, showFeaturedOnly]);

  // Opening lot: featured live/flash first, else most bids, else ending soon
  const openingLot = (() => {
    if (filtered.length === 0) return null;
    const featured = filtered.find(
      (a) => (a.artwork as { is_featured?: boolean }).is_featured && (a.status === 'live' || a.status === 'flash')
    );
    if (featured) return featured;
    const byBids = [...filtered].sort((a, b) => b.bid_count - a.bid_count);
    if (byBids[0]?.bid_count > 0) return byBids[0];
    return filtered[0];
  })();

  const gridSource = openingLot
    ? filtered.filter((a) => a.id !== openingLot.id)
    : filtered;
  const gridPages = Math.max(1, Math.ceil(gridSource.length / PAGE_SIZE));
  const safePage = Math.min(page, gridPages);
  const pageItems = gridSource.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasActiveFilters =
    selectedMediums.size > 0 ||
    verifiedOnly ||
    statusFilter !== 'all_active' ||
    searchQuery.trim().length > 0;

  const clearFilters = () => {
    setSelectedMediums(new Set());
    setVerifiedOnly(false);
    setStatusFilter('all_active');
    setSearchQuery('');
    setPage(1);
  };

  return (
    <div>
      {/* Anti-AI Guarantee Banner */}
      <div className="bg-ink-900 dark:bg-ink-900 text-ink-50">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-3 flex items-center justify-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-xs sm:text-sm font-medium tracking-wide text-center">
            <span className="font-bold uppercase tracking-wider">Anti-AI Guarantee</span>
            <span className="hidden sm:inline mx-2 text-ink-500">·</span>
            <span className="hidden sm:inline text-ink-300">
              Every piece is studio-verified 100% human-made. No AI art. No digital-only assets.
            </span>
            <span className="sm:hidden text-ink-300">100% human-made, studio-verified.</span>
          </p>
        </div>
      </div>

      {/* Hero + Collections */}
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 pt-12 pb-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 lg:gap-12">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.25em] text-accent-500 font-semibold mb-3">
              The Gallery Floor
            </p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight atelier-title-reveal">
              <span>Curated live auctions.</span>
              <span className="text-ink-400">Made by human hands.</span>
            </h1>
            <p className="text-sm text-ink-500 max-w-sm leading-relaxed mt-4 lg:hidden">
              Browse physical artworks from verified artists worldwide. Paint, ceramic, charcoal,
              wood — never pixels.
            </p>
          </div>

          <p className="text-sm text-ink-500 max-w-sm leading-relaxed hidden lg:block">
            Browse physical artworks from verified artists worldwide. Paint, ceramic, charcoal,
            wood — never pixels.
          </p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="border-y border-ink-200 dark:border-ink-800 sticky top-0 z-20 bg-white/95 dark:bg-ink-950/95 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-4">
          <div className="flex flex-col gap-4">
            {/* Search + sort + mobile filter toggle */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search title, artist, medium…"
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:border-ink-900 dark:focus:border-ink-400 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className="text-sm py-2.5 px-3 border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:border-ink-900 dark:focus:border-ink-400 transition-colors cursor-pointer"
                >
                  <option value="ending_soon">Ending Soon</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                  <option value="newest">Newest</option>
                  <option value="most_bids">Most Bids</option>
                </select>

                <button
                  onClick={() => setFiltersOpen((v) => !v)}
                  className={`sm:hidden flex items-center gap-1.5 text-sm py-2.5 px-3 border transition-colors ${
                    filtersOpen || hasActiveFilters
                      ? 'border-ink-900 dark:border-ink-400 bg-ink-50 dark:bg-ink-900'
                      : 'border-ink-200 dark:border-ink-700'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Filters
                  {hasActiveFilters && (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
                  )}
                </button>
              </div>
            </div>

            {/* Status chips + verified + mediums (always visible on md+) */}
            <div className={`${filtersOpen ? 'block' : 'hidden'} sm:block space-y-3`}>
              <div className="flex flex-wrap gap-2 items-center">
                {(
                  [
                    ['all_active', 'All Active'],
                    ['live', 'Live'],
                    ['buy_now', 'Buy Now'],
                    ['flash', 'Flash'],
                    ['ending_soon', 'Ending Soon'],
                  ] as [StatusFilter, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={`text-xs uppercase tracking-wider px-3 py-1.5 border transition-colors ${
                      statusFilter === value
                        ? 'border-ink-900 dark:border-ink-300 bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                        : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:border-ink-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}

                <button
                  onClick={() => setVerifiedOnly((v) => !v)}
                  className={`text-xs uppercase tracking-wider px-3 py-1.5 border transition-colors flex items-center gap-1.5 ${
                    verifiedOnly
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
                      : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:border-ink-400'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified only
                </button>

                <button
                  onClick={() => setShowFeaturedOnly((v) => !v)}
                  className={`text-xs uppercase tracking-wider px-3 py-1.5 border transition-colors ${
                    showFeaturedOnly
                      ? 'border-ink-900 dark:border-ink-300 bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                      : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:border-ink-400'
                  }`}
                >
                  Featured
                </button>

                {session && followedArtistIds.size > 0 && (
                  <button
                    onClick={() => setShowFollowingOnly((v) => !v)}
                    className={`text-xs uppercase tracking-wider px-3 py-1.5 border transition-colors ${
                      showFollowingOnly
                        ? 'border-ink-900 dark:border-ink-300 bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                        : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:border-ink-400'
                    }`}
                  >
                    Following
                  </button>
                )}

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-accent-600 dark:text-accent-400 font-medium hover:underline ml-1"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {MEDIUMS.map((medium) => (
                  <button
                    key={medium}
                    onClick={() => toggleMedium(medium)}
                    className={`text-xs px-3 py-1.5 border transition-colors ${
                      selectedMediums.has(medium)
                        ? 'border-ink-900 dark:border-ink-300 bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                        : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:border-ink-400'
                    }`}
                  >
                    {medium}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
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
              onClick={clearFilters}
              className="mt-4 text-sm text-accent-600 dark:text-accent-400 font-medium hover:underline"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-ink-400 mb-6 uppercase tracking-widest">
              {filtered.length} {filtered.length === 1 ? 'piece' : 'pieces'} on the floor
              {gridPages > 1 && (
                <span className="normal-case tracking-normal text-ink-500">
                  {' '}
                  · page {safePage} of {gridPages}
                </span>
              )}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {pageItems.map((auction) => (
                <ArtworkCard
                  key={auction.id}
                  auction={auction}
                  onClick={() => navigate(`auction/${auction.id}`)}
                  onArtistClick={(artistId) => navigate(`artist/${artistId}`)}
                />
              ))}
            </div>

            {/* Pagination */}
            {gridPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-12">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="p-2 border border-ink-200 dark:border-ink-700 disabled:opacity-30 hover:border-ink-400 transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-ink-500 font-mono">
                  {safePage} / {gridPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(gridPages, p + 1))}
                  disabled={safePage >= gridPages}
                  className="p-2 border border-ink-200 dark:border-ink-700 disabled:opacity-30 hover:border-ink-400 transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
