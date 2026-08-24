import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Gavel } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const SLIDE_MS = 2800;

/** Viscosity model: higher = thicker ink (more drag, slower spread). */
const VISCOSITY = 0.82;
const FRICTION = 0.88 + VISCOSITY * 0.08; // ~0.94
const GRAVITY = 0.12 * (1.15 - VISCOSITY * 0.3);
const SPREAD = 0.012 * (1.1 - VISCOSITY * 0.4);
const MAX_PARTICLES = 55;
const MIN_MOVE_INTERVAL = 55;

/** Saturated ink / pigment colors for splatters */
const INK_PALETTE = [
  '#c41e3a', // cardinal red
  '#1d4ed8', // cobalt
  '#ca8a04', // ochre gold
  '#0f766e', // viridian
  '#7c3aed', // violet
  '#ea580c', // cadmium orange
  '#be185d', // magenta
  '#0369a1', // cerulean
  '#15803d', // sap green
  '#9f1239', // alizarin
];

export type FoyerSlide = {
  id: string;
  title: string;
  image_url: string;
  artist_name?: string;
  medium?: string;
  status?: string;
};

type InkDrop = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  targetSize: number;
  rot: number;
  spin: number;
  opacity: number;
  life: number;
  maxLife: number;
  variant: number;
  color: string;
};

interface EntryFoyerProps {
  onComplete: () => void;
}

/**
 * Session foyer: cycles available art until the visitor chooses
 * "Browse full collection". Auction gavel cursor + ink accent physics.
 */
export function EntryFoyer({ onComplete }: EntryFoyerProps) {
  const [slides, setSlides] = useState<FoyerSlide[]>([]);
  const [index, setIndex] = useState(0);
  const [lifting, setLifting] = useState(false);
  const [ready, setReady] = useState(false);
  const [brushPos, setBrushPos] = useState<{ x: number; y: number } | null>(null);
  const [brushVisible, setBrushVisible] = useState(false);
  const [drops, setDrops] = useState<InkDrop[]>([]);

  const dropsRef = useRef<InkDrop[]>([]);
  const rafRef = useRef<number>(0);
  const lastSpawnRef = useRef(0);
  const idRef = useRef(0);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Physics loop
  useEffect(() => {
    if (reducedMotion) return;

    const tick = () => {
      const prev = dropsRef.current;
      if (prev.length === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const next: InkDrop[] = [];
      for (const d of prev) {
        // Viscous drag on velocity
        let vx = d.vx * FRICTION;
        let vy = d.vy * FRICTION + GRAVITY;

        // Near-stop threshold — ink “sets”
        if (Math.hypot(vx, vy) < 0.04) {
          vx = 0;
          vy = 0;
        }

        const x = d.x + vx;
        const y = d.y + vy;

        // Slow organic spread (thick ink blooms slowly)
        const size =
          d.size + (d.targetSize - d.size) * SPREAD * 8 + (vy > 0.2 ? 0.02 : 0);

        const rot = d.rot + d.spin;
        const spin = d.spin * 0.92;
        const life = d.life + 1;
        const fadeStart = d.maxLife * 0.55;
        const opacity =
          life > fadeStart
            ? d.opacity * Math.max(0, 1 - (life - fadeStart) / (d.maxLife - fadeStart))
            : d.opacity;

        if (life < d.maxLife && opacity > 0.02) {
          next.push({
            ...d,
            x,
            y,
            vx,
            vy,
            size: Math.min(size, d.targetSize * 1.05),
            rot,
            spin,
            life,
            opacity,
          });
        }
      }

      dropsRef.current = next;
      setDrops(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [reducedMotion]);

  const spawnDrops = useCallback(
    (x: number, y: number, opts: { burst: number; speedX?: number; speedY?: number }) => {
      if (reducedMotion) return;
      const { burst, speedX = 0, speedY = 0 } = opts;
      const batch: InkDrop[] = [];

      for (let i = 0; i < burst; i++) {
        const angle = Math.random() * Math.PI * 2;
        // Thick ink: low initial velocity, tight spray cone on strokes
        const eject = (0.4 + Math.random() * 1.8) * (burst > 3 ? 1.6 : 1);
        const inherit = 0.25;
        batch.push({
          id: ++idRef.current,
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * eject + speedX * inherit,
          vy: Math.sin(angle) * eject * 0.7 + speedY * inherit + Math.random() * 0.3,
          size: 2 + Math.random() * 4,
          targetSize: 10 + Math.random() * (burst > 3 ? 34 : 18),
          rot: Math.random() * 360,
          spin: (Math.random() - 0.5) * 2,
          opacity: 0.55 + Math.random() * 0.4,
          life: 0,
          maxLife: 90 + Math.floor(Math.random() * 50),
          variant: Math.floor(Math.random() * 3),
          color: INK_PALETTE[Math.floor(Math.random() * INK_PALETTE.length)],
        });
      }

      const merged = [...dropsRef.current, ...batch].slice(-MAX_PARTICLES);
      dropsRef.current = merged;
      setDrops(merged);
    },
    [reducedMotion]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      setBrushPos({ x: e.clientX, y: e.clientY });
      setBrushVisible(true);
      if (reducedMotion) return;

      const now = performance.now();
      const tipX = e.clientX + 4;
      const tipY = e.clientY - 4;
      const speed = Math.hypot(e.movementX, e.movementY);

      if (speed > 2.5 && now - lastSpawnRef.current > MIN_MOVE_INTERVAL) {
        lastSpawnRef.current = now;
        spawnDrops(tipX, tipY, {
          burst: speed > 14 ? 3 : 1,
          speedX: e.movementX * 0.15,
          speedY: e.movementY * 0.15,
        });
      }
    },
    [reducedMotion, spawnDrops]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      spawnDrops(e.clientX, e.clientY, { burst: 10 });
    },
    [spawnDrops]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auctions } = await supabase
        .from('auctions')
        .select(
          'id, status, artwork:artworks(id, title, image_url, medium, is_featured, artist:artists(name))'
        )
        .in('status', ['live', 'flash', 'upcoming'])
        .order('end_time', { ascending: true })
        .limit(12);

      let next: FoyerSlide[] = ((auctions || []) as any[])
        .map((a) => ({
          id: a.artwork?.id || a.id,
          title: a.artwork?.title || 'Untitled',
          image_url: a.artwork?.image_url || '',
          artist_name: a.artwork?.artist?.name,
          medium: a.artwork?.medium,
          status: a.status,
        }))
        .filter((s) => s.image_url);

      if (next.length < 3) {
        const { data: artworks } = await supabase
          .from('artworks')
          .select('id, title, image_url, medium, is_featured, artist:artists(name)')
          .eq('studio_verified', true)
          .order('is_featured', { ascending: false })
          .limit(12);
        const seen = new Set(next.map((s) => s.id));
        for (const aw of (artworks || []) as any[]) {
          if (seen.has(aw.id)) continue;
          next.push({
            id: aw.id,
            title: aw.title,
            image_url: aw.image_url,
            artist_name: aw.artist?.name,
            medium: aw.medium,
          });
          seen.add(aw.id);
        }
      }

      if (!cancelled) {
        setSlides(next.slice(0, 12));
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || slides.length < 2 || reducedMotion || lifting) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_MS);
    return () => window.clearInterval(t);
  }, [ready, slides.length, reducedMotion, lifting]);

  const beginLift = () => {
    if (lifting) return;
    if (reducedMotion) {
      markFoyerSeen();
      onComplete();
      return;
    }
    setLifting(true);
    window.setTimeout(() => {
      markFoyerSeen();
      onComplete();
    }, 900);
  };

  const current = slides[index];

  return (
    <div
      className={`atelier-foyer fixed inset-0 z-[100] flex flex-col ${lifting ? 'is-lifting' : ''}`}
      role="dialog"
      aria-label="Welcome to Atelier"
      aria-modal="true"
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={() => setBrushVisible(false)}
      onPointerEnter={() => setBrushVisible(true)}
    >
      <div className="atelier-foyer__ink-layer pointer-events-none fixed inset-0 z-[105]" aria-hidden>
        {drops.map((d) => (
          <span
            key={d.id}
            className={`atelier-foyer__splat atelier-foyer__splat--${d.variant} atelier-foyer__splat--viscous`}
            style={{
              left: d.x,
              top: d.y,
              width: d.size,
              height: d.size * (0.72 + d.variant * 0.08 + Math.min(0.35, Math.abs(d.vy) * 0.08)),
              opacity: d.opacity,
              transform: `translate(-50%, -50%) rotate(${d.rot}deg)`,
              background: `radial-gradient(circle at 35% 30%, ${d.color}ee 0%, ${d.color} 55%, ${d.color}99 100%)`,
              boxShadow: `2px 3px 0 -1px ${d.color}88, -3px 1px 0 -1px ${d.color}66, 1px -2px 0 -1px ${d.color}55`,
            }}
          />
        ))}
      </div>

      {brushPos && (
        <div
          className={`atelier-foyer__brush pointer-events-none fixed z-[110] ${
            brushVisible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            left: brushPos.x,
            top: brushPos.y,
            transform: 'translate(-8px, -42px)',
          }}
          aria-hidden
        >
          {/* Auction gavel cursor */}
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Head (striking block) */}
            <rect
              x="6"
              y="8"
              width="28"
              height="14"
              rx="2.5"
              transform="rotate(-28 20 15)"
              fill="#5c4030"
              stroke="#1a1510"
              strokeWidth="1.4"
            />
            {/* Head highlight */}
            <path
              d="M10 14.5l18-9.5"
              stroke="#8b6914"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.55"
              transform="rotate(-28 20 15)"
            />
            {/* Metal band on head */}
            <rect
              x="12"
              y="12"
              width="16"
              height="3"
              rx="0.8"
              transform="rotate(-28 20 15)"
              fill="#c5ccd4"
              stroke="#1a1510"
              strokeWidth="0.9"
            />
            {/* Handle */}
            <path
              d="M26 22 L42 48"
              stroke="#3d2914"
              strokeWidth="5.5"
              strokeLinecap="round"
            />
            <path
              d="M26 22 L42 48"
              stroke="#a67c52"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            {/* Handle grain highlight */}
            <path
              d="M27.5 24.5 L40.5 45.5"
              stroke="#d4b896"
              strokeWidth="0.9"
              strokeLinecap="round"
              opacity="0.7"
            />
            {/* Ferrule / joint */}
            <circle cx="26" cy="22" r="3.2" fill="#c5ccd4" stroke="#1a1510" strokeWidth="1.1" />
            <circle cx="26" cy="22" r="1.4" fill="#8a9098" />
            {/* Sound block (optional base under tip of motion) */}
            <ellipse cx="14" cy="48" rx="9" ry="2.2" fill="#2a2118" opacity="0.35" />
            <rect x="6" y="42" width="16" height="6" rx="1.2" fill="#4a3728" stroke="#1a1510" strokeWidth="1.1" />
            <rect x="7.5" y="43.2" width="13" height="1.4" rx="0.4" fill="#6b5340" opacity="0.7" />
          </svg>
        </div>
      )}

      <div className="absolute inset-0 bg-ink-950 overflow-hidden">
        {slides.length === 0 ? (
          <div className="absolute inset-0 bg-ink-900" />
        ) : (
          slides.map((s, i) => (
            <div
              key={s.id + String(i)}
              className={`atelier-foyer__slide absolute inset-0 transition-opacity duration-1000 ease-out ${
                i === index ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <img
                src={s.image_url}
                alt=""
                className={`w-full h-full object-cover ${
                  i === index && !reducedMotion ? 'atelier-foyer__ken' : ''
                }`}
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-ink-950/35 to-ink-950/45" />
            </div>
          ))
        )}
      </div>

      <div className="atelier-foyer__curtain absolute inset-0 pointer-events-none" aria-hidden />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 bg-ink-50 flex items-center justify-center mb-5 shadow-lg">
          <Gavel className="w-7 h-7 text-ink-900" />
        </div>
        <p className="font-serif text-3xl sm:text-5xl text-ink-50 tracking-tight">Atelier</p>
        <p className="mt-3 text-[10px] uppercase tracking-[0.28em] text-ink-300">
          Human-made · Studio-verified · Live
        </p>

        {current && (
          <div className="mt-12 max-w-lg">
            <p className="text-[10px] uppercase tracking-[0.25em] text-ink-500 mb-3">Now showing</p>
            <p className="font-serif text-xl sm:text-2xl text-ink-50/95 leading-snug">{current.title}</p>
            <p className="text-sm text-ink-400 mt-2">
              {[current.artist_name, current.medium].filter(Boolean).join(' · ')}
            </p>
            {current.status && (
              <p className="text-[10px] uppercase tracking-widest text-accent-400 mt-3">
                {current.status === 'flash'
                  ? 'Flash sale'
                  : current.status === 'upcoming'
                    ? 'Upcoming'
                    : 'On the floor'}
              </p>
            )}
          </div>
        )}

        {slides.length > 1 && (
          <div className="flex gap-1.5 mt-8" aria-hidden>
            {slides.map((s, i) => (
              <span
                key={s.id}
                className={`h-0.5 w-6 transition-colors ${i === index ? 'bg-ink-50' : 'bg-ink-50/25'}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="relative z-10 pb-12 flex flex-col items-center gap-3">
        {!ready && (
          <p className="text-[10px] uppercase tracking-widest text-ink-500">Loading the collection…</p>
        )}
        <button
          type="button"
          onClick={beginLift}
          disabled={!ready && slides.length === 0}
          className="text-xs uppercase tracking-[0.22em] text-ink-100 border border-ink-50/40 px-8 py-3.5 hover:bg-ink-50 hover:text-ink-900 transition-colors disabled:opacity-40"
        >
          Browse full collection
        </button>
        <p className="text-[10px] text-ink-500 tracking-wide">Stay as long as you like</p>
      </div>
    </div>
  );
}

const FOYER_SEEN_KEY = 'atelier_foyer_seen';
const FOYER_FORCE_KEY = 'atelier_foyer_force';

/** Show foyer once per browser tab session; allow explicit replay from Gallery. */
export function shouldShowFoyer(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(FOYER_FORCE_KEY) === '1') {
      sessionStorage.removeItem(FOYER_FORCE_KEY);
      return true;
    }
    // Returning visitors in this tab (or with prior SPA navigation) skip auto-foyer
    if (sessionStorage.getItem(FOYER_SEEN_KEY) === '1') return false;
    // If the browser already has history beyond a fresh landing, treat as returning
    if (window.history.length > 2 && sessionStorage.getItem(FOYER_SEEN_KEY) === '1') return false;
    return true;
  } catch {
    return true;
  }
}

export function markFoyerSeen(): void {
  try {
    sessionStorage.setItem(FOYER_SEEN_KEY, '1');
  } catch {
    /* private mode */
  }
}

/** Call before opening foyer from Gallery "View foyer" link. */
export function requestFoyerReplay(): void {
  try {
    sessionStorage.setItem(FOYER_FORCE_KEY, '1');
  } catch {
    /* ignore */
  }
}
