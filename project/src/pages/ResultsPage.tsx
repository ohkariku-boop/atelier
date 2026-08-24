import { useEffect, useState } from 'react';
import { setPageMeta } from '@/lib/pageMeta';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/theme';

interface Props {
  navigate: (path: string) => void;
}

export function ResultsPage({ navigate }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPageMeta({
      title: 'Recent Results — Atelier',
      description: 'Sold and passed lots from recent Atelier sales.',
    });
    (async () => {
      const { data } = await supabase
        .from('auctions')
        .select('id, status, outcome, current_bid, end_time, artwork:artworks(id, title, image_url, medium, estimate_low, estimate_high, starting_bid)')
        .eq('status', 'ended')
        .order('end_time', { ascending: false })
        .limit(40);
      setRows(data || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-10 py-14">
      <p className="text-[10px] uppercase tracking-[0.25em] text-ink-400 mb-3">Transparency</p>
      <h1 className="font-serif text-4xl font-semibold mb-3">Recent results</h1>
      <p className="text-sm text-ink-500 mb-10 max-w-lg">
        Closed lots with outcomes. Sold prices reflect the hammer (final bid); buyer&apos;s premium may apply at settlement.
      </p>
      {loading ? (
        <p className="text-sm text-ink-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-500">No closed lots yet.</p>
      ) : (
        <ul className="divide-y divide-ink-200 dark:divide-ink-800 border border-ink-200 dark:border-ink-800">
          {rows.map((r) => {
            const art = r.artwork;
            const sold = r.outcome === 'sold';
            const passed = r.outcome === 'no_bids' || r.outcome === 'declined' || (!r.outcome && !r.current_bid);
            return (
              <li
                key={r.id}
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-ink-50/80 dark:hover:bg-ink-900/40"
                onClick={() => navigate(`auction/${r.id}`)}
              >
                <img src={art?.image_url} alt="" className="w-16 h-16 object-cover bg-ink-100" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{art?.title}</p>
                  <p className="text-xs text-ink-400">{art?.medium}</p>
                </div>
                <div className="text-right">
                  {sold ? (
                    <>
                      <p className="text-[10px] uppercase tracking-widest text-emerald-600">Sold</p>
                      <p className="font-mono font-semibold">{formatCurrency(r.current_bid)}</p>
                    </>
                  ) : passed ? (
                    <p className="text-[10px] uppercase tracking-widest text-ink-400">Passed</p>
                  ) : (
                    <>
                      <p className="text-[10px] uppercase tracking-widest text-ink-400">{r.outcome || 'Ended'}</p>
                      {r.current_bid > 0 && (
                        <p className="font-mono text-sm">{formatCurrency(r.current_bid)}</p>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
