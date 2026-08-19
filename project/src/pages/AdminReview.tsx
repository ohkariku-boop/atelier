import { useEffect, useState } from 'react';
import { ShieldCheck, Loader2, Check, X, Video, FileImage, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import type { Artwork } from '@/types';
import { timeAgo } from '@/lib/theme';

interface AdminReviewProps {
  navigate: (path: string) => void;
}

interface PendingArtwork extends Artwork {
  artist_name?: string;
}

const methodLabel: Record<string, string> = {
  live_video: 'Live process video',
  evidence_based: 'Evidence-based',
  studio_partner: 'Studio partner',
};

export function AdminReview({ navigate }: AdminReviewProps) {
  const { profile, session } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<PendingArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    // Pending = not verified, has some submission signal
    const { data, error } = await supabase
      .from('artworks')
      .select('*, artist:artists(name)')
      .eq('studio_verified', false)
      .order('created_at', { ascending: false });

    if (error) {
      showToast(error.message, 'error');
      setLoading(false);
      return;
    }

    const mapped: PendingArtwork[] = ((data || []) as any[]).map((row) => ({
      ...row,
      artist_name: row.artist?.name,
    }));

    // Prefer those with a requested method or evidence; still show all unverified for ops
    mapped.sort((a, b) => {
      const score = (x: PendingArtwork) =>
        (x.requested_verification_method ? 2 : 0) +
        (x.verification_video_url ? 1 : 0) +
        ((x.evidence_items?.length || 0) > 0 ? 1 : 0);
      return score(b) - score(a);
    });

    setItems(mapped);
    setLoading(false);
  };

  useEffect(() => {
    if (session) load();
    else setLoading(false);
  }, [session?.user?.id]);

  const review = async (artworkId: string, approve: boolean, method?: string | null) => {
    setActingId(artworkId);
    const { data, error } = await supabase.rpc('review_artwork_verification', {
      p_artwork_id: artworkId,
      p_approve: approve,
      p_method: method || null,
      p_notes: notes[artworkId] || null,
    });
    setActingId(null);

    if (error) {
      showToast(error.message || 'Review failed', 'error');
      return;
    }

    showToast(
      approve ? 'Artwork verified. Artist notified.' : 'Verification rejected. Artist notified.',
      'success'
    );
    setItems((prev) => prev.filter((i) => i.id !== artworkId));
  };

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-ink-400">Sign in with an admin account to review verifications.</p>
        <button onClick={() => navigate('auth')} className="btn-primary mt-4 text-sm">
          Sign In
        </button>
      </div>
    );
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <ShieldCheck className="w-10 h-10 mx-auto text-ink-300 mb-4" />
        <p className="text-ink-400 text-lg">Admin access required</p>
        <p className="text-sm text-ink-500 mt-2">
          This queue is only available to platform administrators.
        </p>
        <button onClick={() => navigate('')} className="btn-secondary mt-6 text-sm">
          Back to Gallery
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 lg:px-10 py-10">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.25em] text-accent-500 font-semibold mb-2">
          Operations
        </p>
        <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight">
          Verification Review
        </h1>
        <p className="text-sm text-ink-500 mt-2">
          Approve or reject studio verification for listings. Artists are notified in-app.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-ink-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="card-surface p-10 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500 mb-3" />
          <p className="font-serif text-lg">Queue is clear</p>
          <p className="text-sm text-ink-500 mt-1">No unverified listings right now.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {items.map((aw) => {
            const method = aw.requested_verification_method || aw.verification_method;
            return (
              <article key={aw.id} className="card-surface overflow-hidden">
                <div className="flex flex-col sm:flex-row gap-0">
                  <div className="sm:w-48 aspect-[4/5] sm:aspect-auto bg-ink-100 dark:bg-ink-800 flex-shrink-0">
                    <img
                      src={aw.image_url}
                      alt=""
                      className="w-full h-full object-cover min-h-[160px]"
                    />
                  </div>
                  <div className="flex-1 p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="font-serif text-lg font-semibold">{aw.title}</h2>
                        <p className="text-xs text-ink-500">
                          {aw.artist_name || 'Unknown artist'} · {aw.medium}
                          {aw.dimensions ? ` · ${aw.dimensions}` : ''}
                        </p>
                        <p className="text-[10px] text-ink-400 mt-1">
                          Listed {timeAgo(aw.created_at)}
                        </p>
                      </div>
                      {method && (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-1 border border-ink-200 dark:border-ink-700 flex items-center gap-1">
                          {method === 'live_video' && <Video className="w-3 h-3" />}
                          {method === 'evidence_based' && <FileImage className="w-3 h-3" />}
                          {method === 'studio_partner' && <Building2 className="w-3 h-3" />}
                          {methodLabel[method] || method}
                        </span>
                      )}
                    </div>

                    {aw.description && (
                      <p className="text-sm text-ink-600 dark:text-ink-300 line-clamp-3">
                        {aw.description}
                      </p>
                    )}

                    {aw.verification_video_url && (
                      <a
                        href={aw.verification_video_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent-600 dark:text-accent-400 hover:underline inline-flex items-center gap-1"
                      >
                        <Video className="w-3.5 h-3.5" />
                        Open verification video
                      </a>
                    )}

                    {(aw.evidence_items?.length || 0) > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">
                          Evidence
                        </p>
                        <ul className="space-y-1">
                          {aw.evidence_items.map((ev, idx) => (
                            <li key={idx} className="text-xs text-ink-600 dark:text-ink-300">
                              <span className="font-medium">{ev.type}</span>
                              {ev.note ? ` — ${ev.note}` : ''}
                              {ev.url && (
                                <>
                                  {' · '}
                                  <a
                                    href={ev.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-accent-600 dark:text-accent-400 hover:underline"
                                  >
                                    view
                                  </a>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <textarea
                      value={notes[aw.id] || ''}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [aw.id]: e.target.value }))
                      }
                      rows={2}
                      placeholder="Optional notes (sent to artist on reject)"
                      className="w-full text-sm p-3 border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 rounded"
                    />

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        disabled={actingId === aw.id}
                        onClick={() =>
                          review(
                            aw.id,
                            true,
                            aw.requested_verification_method || 'evidence_based'
                          )
                        }
                        className="btn-primary text-xs flex items-center gap-1.5"
                      >
                        {actingId === aw.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        Approve
                      </button>
                      <button
                        disabled={actingId === aw.id}
                        onClick={() => review(aw.id, false)}
                        className="btn-secondary text-xs flex items-center gap-1.5 text-red-600"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
