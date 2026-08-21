import { useEffect, useState } from 'react';
import { Package, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/theme';
import { setPageMeta } from '@/lib/pageMeta';

interface CollectorVaultProps {
  navigate: (path: string) => void;
}

export function CollectorVault({ navigate }: CollectorVaultProps) {
  const { session } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPageMeta({
      title: 'Collector Vault — Atelier',
      description: 'Your acquired works and documents.',
    });
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, artwork:artworks(*, artist:artists(name))')
        .eq('user_id', session.user.id)
        .in('status', ['escrow', 'shipped', 'delivered', 'completed', 'pending_payment'])
        .order('created_at', { ascending: false });
      setRows(data || []);
      setLoading(false);
    })();
  }, [session]);

  if (!session) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <p className="font-serif text-2xl mb-3">Collector Vault</p>
        <p className="text-sm text-ink-500 mb-6">Sign in to view works you have acquired or reserved.</p>
        <button type="button" className="btn-primary text-sm" onClick={() => navigate('auth')}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-12">
      <div className="mb-10">
        <p className="text-[10px] uppercase tracking-[0.25em] text-accent-500 font-semibold mb-2">
          Collection
        </p>
        <h1 className="font-serif text-3xl md:text-4xl font-semibold">Collector Vault</h1>
        <p className="text-sm text-ink-500 mt-2 max-w-xl">
          Works you have won, reserved, or completed — with links to certificates and orders.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-ink-400">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card-surface p-10 text-center">
          <Package className="w-8 h-8 text-ink-400 mx-auto mb-3" />
          <p className="font-serif text-lg">No holdings yet</p>
          <button type="button" className="btn-secondary text-sm mt-4" onClick={() => navigate('')}>
            Browse the floor
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {rows.map((o) => {
            const aw = o.artwork;
            if (!aw) return null;
            return (
              <div key={o.id} className="card-surface overflow-hidden">
                <img src={aw.image_url} alt="" className="aspect-[4/5] w-full object-cover" />
                <div className="p-4">
                  <p className="font-serif font-semibold leading-tight">{aw.title}</p>
                  <p className="text-xs text-ink-500 mt-1">{aw.artist?.name}</p>
                  <p className="text-xs text-ink-400 mt-2 capitalize">{o.status.replace('_', ' ')}</p>
                  <p className="font-mono text-sm mt-1">{formatCurrency(o.amount)}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {aw.certificate_number && (
                      <button
                        type="button"
                        className="text-[10px] uppercase tracking-wider text-emerald-600 flex items-center gap-1"
                        onClick={() =>
                          navigate(
                            `verify/${aw.public_verify_slug || aw.certificate_number}`
                          )
                        }
                      >
                        <ShieldCheck className="w-3 h-3" /> Certificate
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-[10px] uppercase tracking-wider text-ink-500"
                      onClick={() => navigate('orders')}
                    >
                      Order
                    </button>
                    {(o.insurance_certificate_url || aw.insurance_certificate_url) && (
                      <a
                        href={o.insurance_certificate_url || aw.insurance_certificate_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] uppercase tracking-wider text-ink-500"
                      >
                        Insurance
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
