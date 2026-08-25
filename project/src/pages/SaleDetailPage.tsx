import { useEffect, useMemo, useState } from 'react';
import { setPageMeta } from '@/lib/pageMeta';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/theme';
import { getEstimateRange } from '@/lib/estimates';
import { Loader2 } from 'lucide-react';

interface Props {
  slug: string;
  navigate: (path: string) => void;
}

type SaleRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  status: string;
  cover_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  highlight_artwork_ids: string[] | null;
};

type LotRow = {
  id: string;
  status: string;
  outcome: string | null;
  current_bid: number;
  end_time: string;
  artwork: any;
};

export function SaleDetailPage({ slug, navigate }: Props) {
  const [sale, setSale] = useState<SaleRow | null>(null);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: saleData, error: saleErr } = await supabase
          .from('sales')
          .select('*')
          .eq('slug', slug)
          .maybeSingle();

        if (saleErr) throw saleErr;
        if (!saleData) {
          if (!cancelled) {
            setSale(null);
            setLots([]);
            setError('Sale not found.');
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setSale(saleData as SaleRow);
          setPageMeta({
            title: `${saleData.title} — Atelier`,
            description: saleData.subtitle || saleData.description || 'Named sale on Atelier',
          });
        }

        let auctionRows: LotRow[] = [];

        // Primary: artworks assigned to this sale via sale_id
        const { data: bySale, error: bySaleErr } = await supabase
          .from('auctions')
          .select('id, status, outcome, current_bid, end_time, artwork:artworks!inner(*)')
          .eq('artwork.sale_id', saleData.id)
          .order('created_at', { ascending: true });

        if (!bySaleErr && bySale && bySale.length > 0) {
          auctionRows = bySale as any;
        } else {
          // Fallback: highlight_artwork_ids only (never dump the whole floor)
          const ids = ((saleData.highlight_artwork_ids as string[]) || []).filter(Boolean);
          if (ids.length > 0) {
            const { data: byIds } = await supabase
              .from('auctions')
              .select('id, status, outcome, current_bid, end_time, artwork:artworks(*)')
              .in('artwork_id', ids)
              .order('created_at', { ascending: true });
            auctionRows = (byIds || []) as any;
          }
        }

        auctionRows = [...auctionRows].sort((a, b) => {
          const la = a.artwork?.lot_number ?? 9999;
          const lb = b.artwork?.lot_number ?? 9999;
          return la - lb;
        });

        if (!cancelled) setLots(auctionRows);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load sale.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const highlightIds = useMemo(() => {
    const raw = sale?.highlight_artwork_ids || [];
    return new Set(raw.filter(Boolean));
  }, [sale]);

  const highlights = useMemo(() => {
    if (highlightIds.size === 0) return lots.slice(0, 6);
    const fromIds = lots.filter((l) => highlightIds.has(l.artwork?.id));
    return fromIds.length > 0 ? fromIds.slice(0, 6) : lots.slice(0, 6);
  }, [lots, highlightIds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-ink-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <h1 className="font-serif text-2xl mb-3">Sale not found</h1>
        <p className="text-sm text-ink-500 mb-6">{error || 'This named sale is unavailable.'}</p>
        <button
          onClick={() => navigate('sales')}
          className="btn-primary px-6 py-3 text-xs uppercase tracking-widest"
        >
          Back to sales calendar
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12">
      <button
        type="button"
        onClick={() => navigate('sales')}
        className="text-xs uppercase tracking-widest text-ink-400 hover:text-ink-700 mb-6"
      >
        ← Sales calendar
      </button>

      <p className="text-[10px] uppercase tracking-[0.25em] text-ink-400 mb-2">Named sale</p>
      <h1 className="font-serif text-4xl sm:text-5xl font-semibold mb-2">{sale.title}</h1>
      {sale.subtitle && <p className="text-ink-500 mb-4">{sale.subtitle}</p>}
      {sale.description && (
        <p className="text-sm text-ink-500 max-w-2xl mb-6 leading-relaxed">{sale.description}</p>
      )}
      <p className="text-xs uppercase tracking-widest text-accent-600 mb-2">
        {sale.status} · {lots.length} lot{lots.length === 1 ? '' : 's'}
      </p>
      {(sale.starts_at || sale.ends_at) && (
        <p className="text-xs font-mono text-ink-400 mb-10">
          {sale.starts_at ? new Date(sale.starts_at).toLocaleDateString() : '—'}
          {' → '}
          {sale.ends_at ? new Date(sale.ends_at).toLocaleDateString() : '—'}
        </p>
      )}

      {lots.length === 0 ? (
        <div className="border border-ink-200 dark:border-ink-800 p-10 text-center">
          <p className="text-sm text-ink-500 mb-4">No lots linked to this sale yet.</p>
          <button
            onClick={() => navigate('')}
            className="text-xs uppercase tracking-widest text-accent-600 hover:underline"
          >
            Browse gallery floor
          </button>
        </div>
      ) : (
        <>
          {highlights.length > 0 && (
            <>
              <h2 className="text-xs uppercase tracking-widest text-ink-400 mb-4">Highlights</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-14">
                {highlights.map((a) => {
                  const est = getEstimateRange(a.artwork || {});
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => navigate(`auction/${a.id}`)}
                      className="text-left group"
                    >
                      <div className="aspect-[4/5] overflow-hidden bg-ink-100 dark:bg-ink-800 mb-2">
                        <img
                          src={a.artwork?.image_url}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                      <p className="font-serif text-sm font-semibold leading-tight line-clamp-2">
                        {a.artwork?.title}
                      </p>
                      <p className="text-[10px] text-ink-400 mt-1 font-mono">
                        Est. {formatCurrency(est.low)} – {formatCurrency(est.high)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <h2 className="text-xs uppercase tracking-widest text-ink-400 mb-4">All lots in this sale</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {lots.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`auction/${a.id}`)}
                className="text-left border border-ink-200 dark:border-ink-800 p-3 hover:border-ink-400 transition-colors"
              >
                <p className="text-[10px] text-ink-400 mb-2">
                  Lot {a.artwork?.lot_number || i + 1}
                  {a.status === 'live' || a.status === 'flash'
                    ? ' · Live'
                    : a.status === 'ended'
                      ? ' · Closed'
                      : ''}
                </p>
                <img
                  src={a.artwork?.image_url}
                  alt=""
                  className="w-full aspect-[4/5] object-cover mb-3 bg-ink-100"
                />
                <p className="font-serif font-semibold">{a.artwork?.title}</p>
                <p className="text-xs text-ink-500 mt-1">{a.artwork?.medium}</p>
                <p className="text-xs font-mono mt-2">
                  {a.status === 'ended'
                    ? a.outcome === 'sold'
                      ? `Sold ${formatCurrency(a.current_bid)}`
                      : 'Passed'
                    : `Current ${formatCurrency(a.current_bid || a.artwork?.starting_bid || 0)}`}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
