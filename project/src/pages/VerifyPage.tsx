import { useEffect, useState } from 'react';
import { ShieldCheck, Award, Calendar, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { setPageMeta } from '@/lib/pageMeta';

interface VerifyPageProps {
  slug: string;
  navigate: (path: string) => void;
}

export function VerifyPage({ slug, navigate }: VerifyPageProps) {
  const [row, setRow] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from('artworks')
        .select('*, artist:artists(name, location)')
        .or(`public_verify_slug.eq.${slug},certificate_number.eq.${slug}`)
        .maybeSingle();
      if (err || !data) {
        setError('Certificate not found.');
        setLoading(false);
        return;
      }
      setRow(data);
      setPageMeta({
        title: `Verify ${data.certificate_number || data.title} — Atelier`,
        description: `Public verification for ${data.title}`,
      });
      const { data: ev } = await supabase
        .from('provenance_events')
        .select('*')
        .eq('artwork_id', data.id)
        .order('occurred_at', { ascending: true });
      setEvents(ev || []);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-ink-400 text-sm">
        Checking certificate…
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <p className="font-serif text-2xl mb-2">Not found</p>
        <p className="text-sm text-ink-500 mb-6">{error}</p>
        <button type="button" className="btn-secondary text-sm" onClick={() => navigate('')}>
          Back to gallery
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 lg:px-10 py-16">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-emerald-600 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-600 font-semibold">
            Public verification
          </p>
          <h1 className="font-serif text-2xl font-semibold">Atelier Certificate</h1>
        </div>
      </div>

      <div className="card-surface p-6 mb-8 border border-emerald-500/30">
        <div className="flex gap-5">
          <img src={row.image_url} alt="" className="w-28 h-36 object-cover bg-ink-100" />
          <div className="flex-1 min-w-0">
            <p className="font-serif text-xl font-semibold leading-tight">{row.title}</p>
            <p className="text-sm text-ink-500 mt-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              {row.artist?.name || 'Artist'}
              {row.artist?.location ? ` · ${row.artist.location}` : ''}
            </p>
            <p className="text-xs text-ink-500 mt-2">
              {[row.medium, row.dimensions, row.year_created].filter(Boolean).join(' · ')}
            </p>
            {row.studio_verified && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <Award className="w-4 h-4" /> Studio-verified human-made work
              </p>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-ink-200 dark:border-ink-800">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink-400">Certificate</p>
            <p className="font-mono text-sm mt-1">{row.certificate_number || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink-400">Issued</p>
            <p className="text-sm mt-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-ink-400" />
              {row.certificate_issued_at
                ? new Date(row.certificate_issued_at).toLocaleDateString()
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink-400">Method</p>
            <p className="text-sm mt-1 capitalize">{(row.verification_method || '—').replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ink-400">Condition</p>
            <p className="text-sm mt-1 capitalize">{row.condition_grade || 'Not stated'}</p>
          </div>
        </div>
      </div>

      {events.length > 0 && (
        <div className="mb-10">
          <h2 className="font-serif text-lg font-semibold mb-4">Provenance timeline</h2>
          <ol className="relative border-l border-ink-200 dark:border-ink-700 ml-2 space-y-5">
            {events.map((e) => (
              <li key={e.id} className="ml-4">
                <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-ink-900 dark:bg-ink-100" />
                <p className="text-[10px] uppercase tracking-wider text-ink-400">
                  {new Date(e.occurred_at).toLocaleDateString()}
                  {e.actor_label ? ` · ${e.actor_label}` : ''}
                </p>
                <p className="font-medium text-sm mt-0.5">{e.title}</p>
                {e.detail && <p className="text-xs text-ink-500 mt-0.5">{e.detail}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-xs text-ink-400 leading-relaxed">
        This page is the public record for an Atelier studio-verified work. Always match certificate
        number and image to the physical piece before completing a high-value transfer.
      </p>
    </div>
  );
}
