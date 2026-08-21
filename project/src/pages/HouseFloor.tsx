import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/theme';
import { setPageMeta } from '@/lib/pageMeta';
import { CountdownTimer } from '@/components/CountdownTimer';

interface HouseFloorProps {
  slug: string;
  navigate: (path: string) => void;
}

export function HouseFloor({ slug, navigate }: HouseFloorProps) {
  const [house, setHouse] = useState<any>(null);
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: h } = await supabase
        .from('houses')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
      if (!h) {
        setLoading(false);
        return;
      }
      setHouse(h);
      setPageMeta({ title: `${h.name} — Atelier House`, description: h.tagline || h.name });
      const { data: auctions } = await supabase
        .from('auctions')
        .select('*, artwork:artworks(*, artist:artists(name))')
        .eq('house_id', h.id)
        .in('status', ['live', 'flash', 'upcoming'])
        .order('end_time', { ascending: true })
        .limit(48);
      // fallback: artworks tagged with house
      let list = auctions || [];
      if (list.length === 0) {
        const { data: aws } = await supabase
          .from('artworks')
          .select('id, title, image_url, medium, artist:artists(name)')
          .eq('house_id', h.id)
          .limit(24);
        list = (aws || []).map((aw: any) => ({
          id: aw.id,
          status: 'upcoming',
          end_time: null,
          current_bid: null,
          artwork: aw,
        }));
      }
      setLots(list);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return <div className="py-20 text-center text-sm text-ink-400">Loading house…</div>;
  }
  if (!house) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <p className="font-serif text-2xl mb-2">House not found</p>
        <button type="button" className="btn-secondary text-sm mt-4" onClick={() => navigate('')}>
          Gallery floor
        </button>
      </div>
    );
  }

  const accent = house.accent_color || '#c45c3e';

  return (
    <div>
      <div className="border-b border-ink-200 dark:border-ink-800" style={{ borderBottomColor: accent + '55' }}>
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-12 flex flex-col sm:flex-row sm:items-end gap-6 justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] font-semibold mb-2" style={{ color: accent }}>
              House
            </p>
            <h1 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight">{house.name}</h1>
            {house.tagline && <p className="text-sm text-ink-500 mt-3 max-w-md">{house.tagline}</p>}
          </div>
          {house.logo_url && (
            <img src={house.logo_url} alt="" className="h-14 object-contain opacity-90" />
          )}
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-10">
        <p className="text-xs uppercase tracking-widest text-ink-400 mb-6">
          {lots.length} lot{lots.length === 1 ? '' : 's'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          {lots.map((lot) => {
            const aw = lot.artwork;
            if (!aw) return null;
            return (
              <button
                key={lot.id}
                type="button"
                onClick={() => navigate(lot.status ? `auction/${lot.id}` : '')}
                className="card-surface text-left overflow-hidden hover:border-ink-400 transition-colors"
              >
                <img src={aw.image_url} alt="" className="aspect-[4/5] w-full object-cover" />
                <div className="p-4">
                  <p className="font-serif font-semibold leading-tight line-clamp-2">{aw.title}</p>
                  <p className="text-xs text-ink-500 mt-1">{aw.artist?.name}</p>
                  {lot.current_bid != null && (
                    <p className="font-mono text-sm mt-2">{formatCurrency(lot.current_bid)}</p>
                  )}
                  {lot.end_time && (
                    <div className="mt-2">
                      <CountdownTimer endTime={lot.end_time} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {lots.length === 0 && (
          <p className="text-sm text-ink-500 py-12 text-center">No active lots under this house yet.</p>
        )}
      </div>
    </div>
  );
}
