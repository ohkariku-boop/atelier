import { useEffect, useState } from 'react';
import { setPageMeta } from '@/lib/pageMeta';
import { supabase } from '@/lib/supabase';
import { Calendar } from 'lucide-react';

interface Props {
  navigate: (path: string) => void;
}

type Sale = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  cover_url: string | null;
  highlight_artwork_ids?: string[];
};

const FALLBACK: Sale[] = [
  {
    id: '1',
    slug: 'human-hands-august',
    title: 'Human Hands — August',
    subtitle: 'Studio-verified physical works',
    description: 'Oil, charcoal, ceramic and wood — made by human hands.',
    starts_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    ends_at: new Date(Date.now() + 86400000 * 5).toISOString(),
    status: 'open',
    cover_url: null,
  },
];

export function SalesCalendar({ navigate }: Props) {
  const [sales, setSales] = useState<Sale[]>(FALLBACK);

  useEffect(() => {
    setPageMeta({
      title: 'Sales Calendar — Atelier',
      description: 'Named sales and curated drops on Atelier.',
    });
    (async () => {
      try {
        const { data } = await supabase.from('sales').select('*').order('starts_at', { ascending: false });
        if (data && data.length) setSales(data as Sale[]);
      } catch { /* fallback */ }
    })();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-10 py-14">
      <p className="text-[10px] uppercase tracking-[0.25em] text-ink-400 mb-3">Calendar</p>
      <h1 className="font-serif text-4xl font-semibold mb-3">Sales</h1>
      <p className="text-ink-500 mb-10 max-w-lg text-sm leading-relaxed">
        Named sales group lots into catalogue moments — closer to a house sale than a endless scroll.
      </p>

      <ul className="space-y-6">
        {sales.map((s) => (
          <li key={s.id} className="border border-ink-200 dark:border-ink-800 p-6 flex flex-col sm:flex-row gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-xs text-ink-400 mb-2">
                <Calendar className="w-3.5 h-3.5" />
                <span className="uppercase tracking-widest">{s.status}</span>
              </div>
              <h2 className="font-serif text-2xl font-semibold mb-1">{s.title}</h2>
              {s.subtitle && <p className="text-sm text-ink-500 mb-2">{s.subtitle}</p>}
              {s.description && <p className="text-sm text-ink-500 leading-relaxed mb-4">{s.description}</p>}
              <p className="text-xs text-ink-400 font-mono">
                {s.starts_at ? new Date(s.starts_at).toLocaleDateString() : '—'}
                {' → '}
                {s.ends_at ? new Date(s.ends_at).toLocaleDateString() : '—'}
              </p>
            </div>
            <div className="flex sm:flex-col gap-2 justify-end">
              <button
                onClick={() => navigate(`sale/${s.slug}`)}
                className="btn-primary px-5 py-2.5 text-xs uppercase tracking-widest"
              >
                View sale
              </button>
              <button
                onClick={() => navigate('')}
                className="px-5 py-2.5 text-xs uppercase tracking-widest border border-ink-300 dark:border-ink-700"
              >
                Floor
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
