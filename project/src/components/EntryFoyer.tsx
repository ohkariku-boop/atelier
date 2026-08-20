import { useEffect, useMemo, useState } from 'react';
import { Palette } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const SESSION_KEY = 'atelier_foyer_seen';
const MIN_MS = 2800;
const MAX_MS = 5200;
const SLIDE_MS = 1600;

export type FoyerSlide = {
  id: string;
  title: string;
  image_url: string;
  artist_name?: string;
  status?: string;
};

interface EntryFoyerProps {
  onComplete: () => void;
}

/**
 * Once-per-session ceremonial entry: crossfade live/featured works,
 * then curtain lifts into the app. Skippable; respects reduced motion.
 */
export function EntryFoyer({ onComplete }: EntryFoyerProps) {
  const [slides, setSlides] = useState<FoyerSlide[]>([]);
  const [index, setIndex] = useState(0);
  const [lifting, setLifting] = useState(false);
  const [ready, setReady] = useState(false);
  const [startedAt] = useState(() => Date.now());

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Prefer live floor, then featured verified works
      const { data: auctions } = await supabase
        .from('auctions')
        .select('id, status, artwork:artworks(id, title, image_url, is_featured, artist:artists(name))')
        .in('status', ['live', 'flash'])
        .order('end_time', { ascending: true })
        .limit(8);

      let next: FoyerSlide[] = ((auctions || []) as any[]).map((a) => ({
        id: a.artwork?.id || a.id,
        title: a.artwork?.title || 'Untitled',
        image_url: a.artwork?.image_url || '',
        artist_name: a.artwork?.artist?.name,
        status: a.status,
      })).filter((s) => s.image_url);

      if (next.length < 3) {
        const { data: artworks } = await supabase
          .from('artworks')
          .select('id, title, image_url, is_featured, artist:artists(name)')
          .eq('studio_verified', true)
          .order('is_featured', { ascending: false })
          .limit(8);
        const extra: FoyerSlide[] = ((artworks || []) as any[]).map((aw) => ({
          id: aw.id,
          title: aw.title,
          image_url: aw.image_url,
          artist_name: aw.artist?.name,
        }));
        const seen = new Set(next.map((s) => s.id));
        for (const s of extra) {
          if (!seen.has(s.id)) {
            next.push(s);
            seen.add(s.id);
          }
        }
      }

      if (!cancelled) {
        setSlides(next.slice(0, 8));
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Advance slides
  useEffect(() => {
    if (!ready || slides.length < 2 || reducedMotion || lifting) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_MS);
    return () => window.clearInterval(t);
  }, [ready, slides.length, reducedMotion, lifting]);

  // Auto-dismiss after min time once ready, hard cap MAX
  useEffect(() => {
    if (!ready) return;
    const elapsed = Date.now() - startedAt;
    const wait = reducedMotion
      ? Math.max(400, MIN_MS / 3 - elapsed)
      : Math.max(0, MIN_MS - elapsed);
    const auto = window.setTimeout(() => beginLift(), wait);
    const hard = window.setTimeout(() => beginLift(), MAX_MS);
    return () => {
      window.clearTimeout(auto);
      window.clearTimeout(hard);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, reducedMotion]);

  const beginLift = () => {
    if (lifting) return;
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* ignore */
    }
    if (reducedMotion) {
      onComplete();
      return;
    }
    setLifting(true);
    window.setTimeout(() => onComplete(), 900);
  };

  const current = slides[index];

  return (
    <div
      className={`atelier-foyer fixed inset-0 z-[100] flex flex-col ${lifting ? 'is-lifting' : ''}`}
      role="dialog"
      aria-label="Welcome to Atelier"
      aria-modal="true"
    >
      {/* Artwork stage */}
      <div className="absolute inset-0 bg-ink-950 overflow-hidden">
        {slides.length === 0 ? (
          <div className="absolute inset-0 bg-ink-900" />
        ) : (
          slides.map((s, i) => (
            <div
              key={s.id + i}
              className={`atelier-foyer__slide absolute inset-0 transition-opacity duration-700 ease-out ${
                i === index ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <img
                src={s.image_url}
                alt=""
                className={`w-full h-full object-cover ${i === index && !reducedMotion ? 'atelier-foyer__ken' : ''}`}
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/30 to-ink-950/40" />
            </div>
          ))
        )}
      </div>

      {/* Curtain panel (lifts upward) */}
      <div className="atelier-foyer__curtain absolute inset-0 pointer-events-none" aria-hidden />

      {/* Brand + caption */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 bg-ink-50 flex items-center justify-center mb-5 shadow-lg">
          <Palette className="w-7 h-7 text-ink-900" />
        </div>
        <p className="font-serif text-3xl sm:text-4xl text-ink-50 tracking-tight">Atelier</p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.28em] text-ink-300">
          Human-made · Studio-verified · Live
        </p>
        {current && (
          <div className="mt-10 max-w-md">
            <p className="font-serif text-lg sm:text-xl text-ink-50/95">{current.title}</p>
            {current.artist_name && (
              <p className="text-xs text-ink-400 mt-1">{current.artist_name}</p>
            )}
            {current.status && (
              <p className="text-[10px] uppercase tracking-widest text-accent-400 mt-2">
                {current.status === 'flash' ? 'Flash sale' : 'On the floor'}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="relative z-10 pb-10 flex flex-col items-center gap-3">
        {!ready && (
          <p className="text-[10px] uppercase tracking-widest text-ink-500">Opening the floor…</p>
        )}
        <button
          type="button"
          onClick={beginLift}
          className="text-xs uppercase tracking-[0.2em] text-ink-200 border border-ink-50/30 px-5 py-2.5 hover:bg-ink-50 hover:text-ink-900 transition-colors"
        >
          Enter gallery
        </button>
      </div>
    </div>
  );
}

export function shouldShowFoyer(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Still show briefly is optional; we allow show but auto-skip faster
    }
    return sessionStorage.getItem(SESSION_KEY) !== '1';
  } catch {
    return false;
  }
}
