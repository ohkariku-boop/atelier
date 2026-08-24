import { useEffect, useState } from 'react';
import { setPageMeta } from '@/lib/pageMeta';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/theme';
import { Gavel, Eye } from 'lucide-react';

interface Props {
  navigate: (path: string) => void;
}

export function MyBidsPage({ navigate }: Props) {
  const { session } = useAuth();
  const [bids, setBids] = useState<any[]>([]);
  const [watches, setWatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPageMeta({ title: 'My Bids — Atelier', description: 'Your bids and watched lots.' });
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }
    (async () => {
      const uid = session.user.id;
      const { data: myBids } = await supabase
        .from('bids')
        .select('*, auction:auctions(id, status, current_bid, end_time, artwork:artworks(id, title, image_url))')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(50);
      setBids(myBids || []);

      try {
        const { data: w } = await supabase
          .from('lot_watches')
          .select('auction_id, auction:auctions(id, status, current_bid, end_time, artwork:artworks(id, title, image_url))')
          .eq('user_id', uid);
        setWatches(w || []);
      } catch {
        // fallback: artwork likes as watch proxy
        const { data: likes } = await supabase
          .from('artwork_likes')
          .select('artwork_id')
          .eq('user_id', uid);
        setWatches((likes || []).map((l: any) => ({ auction_id: null, artwork_id: l.artwork_id })));
      }
      setLoading(false);
    })();
  }, [session]);

  if (!session) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <h1 className="font-serif text-3xl mb-4">My bids</h1>
        <p className="text-sm text-ink-500 mb-6">Sign in to see your bids and watched lots.</p>
        <button onClick={() => navigate('auth')} className="btn-primary px-6 py-3 text-xs uppercase tracking-widest">
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-14">
      <h1 className="font-serif text-4xl font-semibold mb-10">My bids</h1>
      {loading ? (
        <p className="text-sm text-ink-400">Loading…</p>
      ) : (
        <>
          <section className="mb-12">
            <h2 className="text-xs uppercase tracking-widest text-ink-400 mb-4 flex items-center gap-2">
              <Gavel className="w-3.5 h-3.5" /> Bid history
            </h2>
            {bids.length === 0 ? (
              <p className="text-sm text-ink-500">No bids yet. Explore the floor to place your first.</p>
            ) : (
              <ul className="space-y-3">
                {bids.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-4 border border-ink-200 dark:border-ink-800 p-3 cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-900/40"
                    onClick={() => b.auction?.id && navigate(`auction/${b.auction.id}`)}
                  >
                    {b.auction?.artwork?.image_url && (
                      <img src={b.auction.artwork.image_url} alt="" className="w-14 h-14 object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{b.auction?.artwork?.title || 'Lot'}</p>
                      <p className="text-xs text-ink-400">
                        Your bid {formatCurrency(b.amount)} · Current {formatCurrency(b.auction?.current_bid || b.amount)}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-ink-400">{b.auction?.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="text-xs uppercase tracking-widest text-ink-400 mb-4 flex items-center gap-2">
              <Eye className="w-3.5 h-3.5" /> Watching
            </h2>
            {watches.length === 0 ? (
              <p className="text-sm text-ink-500">No watched lots yet.</p>
            ) : (
              <ul className="space-y-3">
                {watches.map((w, i) => (
                  <li
                    key={w.auction_id || i}
                    className="flex items-center gap-4 border border-ink-200 dark:border-ink-800 p-3 cursor-pointer"
                    onClick={() => w.auction?.id && navigate(`auction/${w.auction.id}`)}
                  >
                    {w.auction?.artwork?.image_url && (
                      <img src={w.auction.artwork.image_url} alt="" className="w-14 h-14 object-cover" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{w.auction?.artwork?.title || 'Watched lot'}</p>
                      <p className="text-xs text-ink-400">{w.auction?.status}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
