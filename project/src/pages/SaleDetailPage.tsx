import { useEffect, useState } from 'react';
import { setPageMeta } from '@/lib/pageMeta';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/theme';

interface Props {
  slug: string;
  navigate: (path: string) => void;
}

export function SaleDetailPage({ slug, navigate }: Props) {
  const [sale, setSale] = useState<any>(null);
  const [lots, setLots] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      let s: any = null;
      try {
        const { data } = await supabase.from('sales').select('*').eq('slug', slug).maybeSingle();
        s = data;
      } catch { /* */ }
      if (!s) {
        s = {
          title: 'Human Hands — August',
          subtitle: 'Studio-verified physical works',
          description: 'A curated selection of works made by human hands.',
          status: 'open',
        };
      }
      setSale(s);
      setPageMeta({ title: `${s.title} — Atelier`, description: s.subtitle || s.description });

      const { data: auctions } = await supabase
        .from('auctions')
        .select('*, artwork:artworks(*)')
        .in('status', ['live', 'flash', 'upcoming', 'ended'])
        .order('created_at', { ascending: true })
        .limit(24);
      setLots(auctions || []);
    })();
  }, [slug]);

  if (!sale) return <div className="p-20 text-center text-ink-400">Loading sale…</div>;

  const highlights = lots.slice(0, 6);

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12">
      <p className="text-[10px] uppercase tracking-[0.25em] text-ink-400 mb-2">Named sale</p>
      <h1 className="font-serif text-4xl sm:text-5xl font-semibold mb-2">{sale.title}</h1>
      {sale.subtitle && <p className="text-ink-500 mb-4">{sale.subtitle}</p>}
      {sale.description && <p className="text-sm text-ink-500 max-w-2xl mb-8 leading-relaxed">{sale.description}</p>}
      <p className="text-xs uppercase tracking-widest text-accent-600 mb-10">{sale.status} · {lots.length} lots</p>

      <h2 className="text-xs uppercase tracking-widest text-ink-400 mb-4">Highlights</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-14">
        {highlights.map((a) => (
          <button
            key={a.id}
            onClick={() => navigate(`auction/${a.id}`)}
            className="text-left group"
          >
            <div className="aspect-[4/5] overflow-hidden bg-ink-100 dark:bg-ink-800 mb-2">
              <img src={a.artwork?.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            </div>
            <p className="font-serif text-sm font-semibold leading-tight line-clamp-2">{a.artwork?.title}</p>
            <p className="text-[10px] text-ink-400 mt-1 font-mono">
              Est. {formatCurrency(a.artwork?.estimate_low || a.artwork?.starting_bid * 0.9)} – {formatCurrency(a.artwork?.estimate_high || a.artwork?.buy_now_price || a.artwork?.starting_bid * 1.8)}
            </p>
          </button>
        ))}
      </div>

      <h2 className="text-xs uppercase tracking-widest text-ink-400 mb-4">All lots</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {lots.map((a, i) => (
          <button
            key={a.id}
            onClick={() => navigate(`auction/${a.id}`)}
            className="text-left border border-ink-200 dark:border-ink-800 p-3 hover:border-ink-400 transition-colors"
          >
            <p className="text-[10px] text-ink-400 mb-2">Lot {a.artwork?.lot_number || i + 1}</p>
            <img src={a.artwork?.image_url} alt="" className="w-full aspect-[4/5] object-cover mb-3" />
            <p className="font-serif font-semibold">{a.artwork?.title}</p>
            <p className="text-xs text-ink-500 mt-1">{a.artwork?.medium}</p>
            <p className="text-xs font-mono mt-2">
              {a.status === 'ended'
                ? a.outcome === 'sold'
                  ? `Sold ${formatCurrency(a.current_bid)}`
                  : 'Passed'
                : `Current ${formatCurrency(a.current_bid || a.artwork?.starting_bid)}`}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
