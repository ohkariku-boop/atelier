import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Loader2,
  Check,
  X,
  Video,
  FileImage,
  Building2,
  LayoutGrid,
  Search,
  Gavel,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import type { Artwork } from '@/types';
import { formatCurrency, timeAgo } from '@/lib/theme';
import { Badge } from '@/components/Badge';

interface AdminReviewProps {
  navigate: (path: string) => void;
}

interface PendingArtwork extends Artwork {
  artist_name?: string;
}

interface CatalogRow extends Artwork {
  artist_name?: string;
  auction_status?: string | null;
  auction_id?: string | null;
  current_bid?: number | null;
}

type AdminTab = 'review' | 'catalog' | 'collections' | 'disputes' | 'kyc' | 'images';

const methodLabel: Record<string, string> = {
  live_video: 'Live process video',
  evidence_based: 'Evidence-based',
  studio_partner: 'Studio partner',
};

export function AdminReview({ navigate }: AdminReviewProps) {
  const { profile, session } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<AdminTab>('catalog');

  // Review queue
  const [pending, setPending] = useState<PendingArtwork[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Catalog
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'verified' | 'unverified' | 'live'>('all');

  // Collections admin
  const [collectionList, setCollectionList] = useState<any[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [collectionItems, setCollectionItems] = useState<any[]>([]);
  const [newColTitle, setNewColTitle] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [addArtworkId, setAddArtworkId] = useState('');
  const [colBusy, setColBusy] = useState(false);
  const [disputeOrders, setDisputeOrders] = useState<any[]>([]);
  const [disputeNotes, setDisputeNotes] = useState<Record<string, string>>({});
  const [disputeBusy, setDisputeBusy] = useState<string | null>(null);
  const [kycQueue, setKycQueue] = useState<any[]>([]);
  const [kycBusy, setKycBusy] = useState<string | null>(null);
  const [imageAudit, setImageAudit] = useState<any>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [visionOn, setVisionOn] = useState(false);

  const loadPending = async () => {
    setLoadingPending(true);
    const { data, error } = await supabase
      .from('artworks')
      .select('*, artist:artists(name)')
      .eq('studio_verified', false)
      .order('created_at', { ascending: false });

    if (error) {
      showToast(error.message, 'error');
      setLoadingPending(false);
      return;
    }

    const mapped: PendingArtwork[] = ((data || []) as any[]).map((row) => ({
      ...row,
      artist_name: row.artist?.name,
    }));
    mapped.sort((a, b) => {
      const score = (x: PendingArtwork) =>
        (x.requested_verification_method ? 2 : 0) +
        (x.verification_video_url ? 1 : 0) +
        ((x.evidence_items?.length || 0) > 0 ? 1 : 0);
      return score(b) - score(a);
    });
    setPending(mapped);
    setLoadingPending(false);
  };

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    const { data: artworks, error } = await supabase
      .from('artworks')
      .select('*, artist:artists(name)')
      .order('created_at', { ascending: false });

    if (error) {
      showToast(error.message, 'error');
      setLoadingCatalog(false);
      return;
    }

    const { data: auctions } = await supabase
      .from('auctions')
      .select('id, artwork_id, status, current_bid')
      .in('status', ['live', 'flash', 'upcoming']);

    const byArtwork = new Map<string, { id: string; status: string; current_bid: number }>();
    (auctions || []).forEach((a: any) => {
      byArtwork.set(a.artwork_id, {
        id: a.id,
        status: a.status,
        current_bid: a.current_bid,
      });
    });

    const rows: CatalogRow[] = ((artworks || []) as any[]).map((row) => {
      const auc = byArtwork.get(row.id);
      return {
        ...row,
        artist_name: row.artist?.name,
        auction_status: auc?.status ?? null,
        auction_id: auc?.id ?? null,
        current_bid: auc?.current_bid ?? null,
      };
    });

    setCatalog(rows);
    setLoadingCatalog(false);
  };


  const loadCollections = async () => {
    const { data } = await supabase
      .from('collections')
      .select('*')
      .order('sort_order');
    setCollectionList(data || []);
  };

  const loadCollectionItems = async (collectionId: string) => {
    const { data } = await supabase
      .from('collection_items')
      .select('artwork_id, sort_order, artwork:artworks(id, title, image_url)')
      .eq('collection_id', collectionId)
      .order('sort_order');
    setCollectionItems(data || []);
  };

  const loadDisputes = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, artwork:artworks(title, image_url)')
      .in('dispute_status', ['claim_raised', 'evidence_submitted'])
      .order('created_at', { ascending: false });
    setDisputeOrders(data || []);
  };

  
  useEffect(() => {
    if (tab !== 'kyc') return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, kyc_status, kyc_level, kyc_submitted_at, kyc_notes, aml_risk_flag')
        .in('kyc_status', ['pending', 'verified', 'rejected', 'restricted'])
        .order('kyc_submitted_at', { ascending: false })
        .limit(50);
      setKycQueue(data || []);
    })();
  }, [tab]);

  useEffect(() => {
    if (!session) return;
    loadPending();
    loadCatalog();
    loadCollections();
    loadDisputes();
  }, [session?.user?.id]);

  useEffect(() => {
    if (selectedCollectionId) loadCollectionItems(selectedCollectionId);
    else setCollectionItems([]);
  }, [selectedCollectionId]);

  const review = async (artworkId: string, approve: boolean, method?: string | null) => {
    setActingId(artworkId);
    const { error } = await supabase.rpc('review_artwork_verification', {
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
    setPending((prev) => prev.filter((i) => i.id !== artworkId));
    loadCatalog();
  };

  const filteredCatalog = useMemo(() => {
    let rows = [...catalog];
    if (filter === 'verified') rows = rows.filter((r) => r.studio_verified);
    if (filter === 'unverified') rows = rows.filter((r) => !r.studio_verified);
    if (filter === 'live') rows = rows.filter((r) => r.auction_status === 'live' || r.auction_status === 'flash');
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.artist_name || '').toLowerCase().includes(q) ||
          r.medium.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [catalog, filter, search]);

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-ink-400">Sign in with an admin account.</p>
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
        <button onClick={() => navigate('')} className="btn-secondary mt-6 text-sm">
          Back to Gallery
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-accent-500 font-semibold mb-2">
            Operations
          </p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-ink-500 mt-2">
            {catalog.length} artworks · {pending.length} pending review ·{' '}
            {catalog.filter((c) => c.auction_status).length} on the floor
          </p>
          <p className="text-[10px] uppercase tracking-widest text-ink-400 mt-2">
            Platform pulse · {collectionList.length} collections · catalog loaded
          </p>
        </div>
        <div className="flex gap-1 border border-ink-200 dark:border-ink-700 p-1 self-start">
          <button
            onClick={() => setTab('catalog')}
            className={`text-xs uppercase tracking-wider px-4 py-2 flex items-center gap-1.5 transition-colors ${
              tab === 'catalog'
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'text-ink-500 hover:text-ink-900 dark:hover:text-ink-100'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Catalog
          </button>
          <button
            onClick={() => setTab('collections')}
            className={`text-xs uppercase tracking-wider px-4 py-2 flex items-center gap-1.5 transition-colors ${
              tab === 'collections'
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'text-ink-500 hover:text-ink-900 dark:hover:text-ink-100'
            }`}
          >
            Collections
          </button>
          <button
            onClick={() => setTab('disputes')}
            className={`text-xs uppercase tracking-wider px-4 py-2 flex items-center gap-1.5 transition-colors ${
              tab === 'disputes'
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'text-ink-500 hover:text-ink-900 dark:hover:text-ink-100'
            }`}
          >
            Disputes
            {disputeOrders.length > 0 && (
              <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {disputeOrders.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('kyc')}
            className={`text-xs uppercase tracking-wider px-3 py-1.5 border transition-colors ${
              tab === 'kyc'
                ? 'border-ink-900 dark:border-ink-300 bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400'
            }`}
          >
            KYC / AML
          </button>
          <button
            type="button"
            onClick={() => setTab('images')}
            className={`text-xs uppercase tracking-wider px-3 py-1.5 border transition-colors ${
              tab === 'images'
                ? 'border-ink-900 dark:border-ink-300 bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400'
            }`}
          >
            Images
          </button>
          <button
            onClick={() => setTab('review')}
            className={`text-xs uppercase tracking-wider px-4 py-2 flex items-center gap-1.5 transition-colors ${
              tab === 'review'
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                : 'text-ink-500 hover:text-ink-900 dark:hover:text-ink-100'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Review
            {pending.length > 0 && (
              <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {pending.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {tab === 'catalog' ? (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, artist, medium…"
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none focus:border-ink-900 dark:focus:border-ink-400"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['all', 'All'],
                  ['verified', 'Verified'],
                  ['unverified', 'Unverified'],
                  ['live', 'On floor'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`text-xs uppercase tracking-wider px-3 py-2 border transition-colors ${
                    filter === value
                      ? 'border-ink-900 dark:border-ink-300 bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                      : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loadingCatalog ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-ink-400" />
            </div>
          ) : filteredCatalog.length === 0 ? (
            <p className="text-center text-ink-400 py-16">No artworks match.</p>
          ) : (
            <div className="border border-ink-200 dark:border-ink-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 dark:border-ink-800 text-left text-[10px] uppercase tracking-widest text-ink-400">
                      <th className="p-3 font-semibold">Artwork</th>
                      <th className="p-3 font-semibold hidden md:table-cell">Artist</th>
                      <th className="p-3 font-semibold hidden sm:table-cell">Medium</th>
                      <th className="p-3 font-semibold">Status</th>
                      <th className="p-3 font-semibold hidden lg:table-cell">Auction</th>
                      <th className="p-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCatalog.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-ink-100 dark:border-ink-800/80 hover:bg-ink-50 dark:hover:bg-ink-900/40"
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-12 h-12 bg-ink-100 dark:bg-ink-800 overflow-hidden flex-shrink-0">
                              <img
                                src={row.image_url}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="font-serif font-semibold truncate">{row.title}</p>
                              <p className="text-[10px] text-ink-400 md:hidden">{row.artist_name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 hidden md:table-cell text-ink-600 dark:text-ink-300">
                          {row.artist_name || '—'}
                        </td>
                        <td className="p-3 hidden sm:table-cell text-ink-500">{row.medium}</td>
                        <td className="p-3">
                          {row.studio_verified ? (
                            <Badge variant="verified" />
                          ) : (
                            <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="p-3 hidden lg:table-cell">
                          {row.auction_status ? (
                            <span className="inline-flex items-center gap-1 text-xs text-ink-600 dark:text-ink-300">
                              <Gavel className="w-3 h-3" />
                              {row.auction_status}
                              {row.current_bid != null && (
                                <span className="font-mono text-ink-400">
                                  · {formatCurrency(row.current_bid)}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {row.auction_id ? (
                            <button
                              onClick={() => navigate(`auction/${row.auction_id}`)}
                              className="text-xs text-accent-600 dark:text-accent-400 hover:underline"
                            >
                              View auction
                            </button>
                          ) : (
                            <span className="text-xs text-ink-400">No auction</span>
                          )}
                          <button
                            type="button"
                            className="block w-full text-[10px] text-ink-400 hover:text-ink-700 dark:hover:text-ink-200 mt-1"
                            onClick={() => {
                              navigator.clipboard?.writeText(row.id);
                              showToast('Artwork ID copied', 'success');
                            }}
                          >
                            Copy ID
                          </button>
                          <button
                            type="button"
                            className="block w-full text-[10px] text-accent-600 dark:text-accent-400 hover:underline mt-0.5"
                            onClick={async () => {
                              const next = !(row as any).is_featured;
                              const { error } = await supabase.rpc('set_artwork_featured', {
                                p_artwork_id: row.id,
                                p_featured: next,
                              });
                              if (error) showToast(error.message, 'error');
                              else {
                                showToast(next ? 'Featured' : 'Unfeatured', 'success');
                                loadCatalog();
                              }
                            }}
                          >
                            {(row as any).is_featured ? 'Unfeature' : 'Feature'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-ink-400 p-3 border-t border-ink-200 dark:border-ink-800">
                Showing {filteredCatalog.length} of {catalog.length}
              </p>
            </div>
          )}
        </>
      ) : tab === 'collections' ? (
        <div className="grid md:grid-cols-[280px_1fr] gap-6">
          <div className="space-y-4">
            <div className="card-surface p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">New collection</p>
              <input
                value={newColTitle}
                onChange={(e) => setNewColTitle(e.target.value)}
                placeholder="Title"
                className="w-full text-sm px-3 py-2 border border-ink-200 dark:border-ink-700 bg-transparent"
              />
              <textarea
                value={newColDesc}
                onChange={(e) => setNewColDesc(e.target.value)}
                placeholder="Description"
                rows={2}
                className="w-full text-sm px-3 py-2 border border-ink-200 dark:border-ink-700 bg-transparent"
              />
              <button
                disabled={colBusy || newColTitle.trim().length < 2}
                className="btn-primary text-xs w-full"
                onClick={async () => {
                  setColBusy(true);
                  const slug = newColTitle
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                    .slice(0, 40);
                  const { error } = await supabase.from('collections').insert({
                    title: newColTitle.trim(),
                    description: newColDesc.trim() || null,
                    slug: slug || `col-${Date.now()}`,
                    is_published: true,
                    sort_order: collectionList.length,
                  });
                  setColBusy(false);
                  if (error) showToast(error.message, 'error');
                  else {
                    showToast('Collection created', 'success');
                    setNewColTitle('');
                    setNewColDesc('');
                    loadCollections();
                  }
                }}
              >
                Create
              </button>
            </div>
            <div className="border border-ink-200 dark:border-ink-800 divide-y divide-ink-100 dark:divide-ink-800">
              {collectionList.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCollectionId(c.id)}
                  className={`w-full text-left px-3 py-3 text-sm ${
                    selectedCollectionId === c.id
                      ? 'bg-ink-100 dark:bg-ink-800'
                      : 'hover:bg-ink-50 dark:hover:bg-ink-900'
                  }`}
                >
                  <p className="font-medium">{c.title}</p>
                  <p className="text-[10px] text-ink-400">
                    {c.is_published ? 'Published' : 'Draft'} · {c.slug}
                  </p>
                </button>
              ))}
              {collectionList.length === 0 && (
                <p className="p-4 text-xs text-ink-400">No collections yet.</p>
              )}
            </div>
          </div>
          <div>
            {!selectedCollectionId ? (
              <p className="text-ink-400 text-sm py-10">Select a collection to manage artworks.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">
                      Add artwork ID
                    </label>
                    <input
                      value={addArtworkId}
                      onChange={(e) => setAddArtworkId(e.target.value)}
                      placeholder="Paste artwork UUID from catalog"
                      className="w-full text-sm px-3 py-2 border border-ink-200 dark:border-ink-700 bg-transparent mt-1"
                    />
                  </div>
                  <button
                    className="btn-primary text-xs"
                    disabled={colBusy || !addArtworkId.trim()}
                    onClick={async () => {
                      setColBusy(true);
                      const { error } = await supabase.from('collection_items').insert({
                        collection_id: selectedCollectionId,
                        artwork_id: addArtworkId.trim(),
                        sort_order: collectionItems.length,
                      });
                      setColBusy(false);
                      if (error) showToast(error.message, 'error');
                      else {
                        showToast('Artwork added', 'success');
                        setAddArtworkId('');
                        loadCollectionItems(selectedCollectionId);
                      }
                    }}
                  >
                    Add
                  </button>
                  <button
                    className="btn-secondary text-xs"
                    onClick={async () => {
                      const col = collectionList.find((c) => c.id === selectedCollectionId);
                      if (!col) return;
                      const { error } = await supabase
                        .from('collections')
                        .update({ is_published: !col.is_published })
                        .eq('id', selectedCollectionId);
                      if (error) showToast(error.message, 'error');
                      else {
                        showToast(col.is_published ? 'Unpublished' : 'Published', 'success');
                        loadCollections();
                      }
                    }}
                  >
                    Toggle publish
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {collectionItems.map((item) => (
                    <div key={item.artwork_id} className="card-surface p-3 flex gap-3 items-center">
                      <div className="w-14 h-14 bg-ink-100 dark:bg-ink-800 overflow-hidden flex-shrink-0">
                        {item.artwork?.image_url && (
                          <img src={item.artwork.image_url} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.artwork?.title || item.artwork_id}</p>
                        <button
                          className="text-[10px] text-red-600 hover:underline mt-1"
                          onClick={async () => {
                            const { error } = await supabase
                              .from('collection_items')
                              .delete()
                              .eq('collection_id', selectedCollectionId)
                              .eq('artwork_id', item.artwork_id);
                            if (error) showToast(error.message, 'error');
                            else loadCollectionItems(selectedCollectionId!);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {collectionItems.length === 0 && (
                  <p className="text-sm text-ink-400">No artworks in this collection yet.</p>
                )}
              </div>
            )}
          </div>
        </div>

      ) : tab === 'disputes' ? (
        <div className="space-y-4">
          {disputeOrders.length === 0 ? (
            <div className="card-surface p-10 text-center">
              <p className="font-serif text-lg">No open disputes</p>
              <p className="text-sm text-ink-500 mt-1">Claims and evidence queues are clear.</p>
            </div>
          ) : (
            disputeOrders.map((order) => (
              <div key={order.id} className="card-surface p-5 space-y-3">
                <div className="flex flex-col sm:flex-row gap-4">
                  {order.artwork?.image_url && (
                    <div className="w-20 h-20 bg-ink-100 dark:bg-ink-800 overflow-hidden flex-shrink-0">
                      <img src={order.artwork.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-serif font-semibold">{order.artwork?.title || 'Order'}</p>
                    <p className="text-xs text-ink-500">
                      {order.buyer_name} · {order.dispute_status} · {order.receipt_number || order.id.slice(0, 8)}
                    </p>
                    {order.claim_reason && (
                      <p className="text-sm mt-2 text-ink-600 dark:text-ink-300">Claim: {order.claim_reason}</p>
                    )}
                    {order.evidence_notes && (
                      <p className="text-sm mt-1 text-ink-500">Evidence: {order.evidence_notes}</p>
                    )}
                  </div>
                </div>
                <textarea
                  value={disputeNotes[order.id] || ''}
                  onChange={(e) => setDisputeNotes((prev) => ({ ...prev, [order.id]: e.target.value }))}
                  rows={2}
                  placeholder="Resolution notes (optional)"
                  className="w-full text-sm p-3 border border-ink-200 dark:border-ink-700 bg-transparent"
                />
                <div className="flex gap-2">
                  <button
                    className="btn-primary text-xs"
                    disabled={disputeBusy === order.id}
                    onClick={async () => {
                      setDisputeBusy(order.id);
                      const { error } = await supabase.rpc('resolve_order_dispute', {
                        p_order_id: order.id,
                        p_uphold: true,
                        p_notes: disputeNotes[order.id] || null,
                      });
                      setDisputeBusy(null);
                      if (error) showToast(error.message, 'error');
                      else {
                        showToast('Claim upheld', 'success');
                        loadDisputes();
                      }
                    }}
                  >
                    Uphold claim
                  </button>
                  <button
                    className="btn-secondary text-xs text-red-600"
                    disabled={disputeBusy === order.id}
                    onClick={async () => {
                      setDisputeBusy(order.id);
                      const { error } = await supabase.rpc('resolve_order_dispute', {
                        p_order_id: order.id,
                        p_uphold: false,
                        p_notes: disputeNotes[order.id] || null,
                      });
                      setDisputeBusy(null);
                      if (error) showToast(error.message, 'error');
                      else {
                        showToast('Claim denied', 'success');
                        loadDisputes();
                      }
                    }}
                  >
                    Deny claim
                  </button>
                  <button
                    type="button"
                    className="text-xs px-3 py-1.5 border border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
                    disabled={disputeBusy === order.id}
                    onClick={async () => {
                      setDisputeBusy(order.id);
                      const { data: refundData, error } = await supabase.rpc('admin_refund_order', {
                        p_order_id: order.id,
                        p_reason: disputeNotes[order.id] || 'Admin refund',
                      });
                      setDisputeBusy(null);
                      if (error) showToast(error.message + ' — run production_hardening_sit migration if missing.', 'error');
                      else {
                        showToast('Order marked refunded. Also refund in Stripe Dashboard if captured.', 'success');
                        loadDisputes();
                      }
                    }}
                  >
                    Mark refunded
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

      ) : loadingPending ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-ink-400" />
        </div>
      ) : pending.length === 0 ? (
        <div className="card-surface p-10 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500 mb-3" />
          <p className="font-serif text-lg">Queue is clear</p>
          <p className="text-sm text-ink-500 mt-1">No unverified listings right now.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.map((aw) => {
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
                        </p>
                        <p className="text-[10px] text-ink-400 mt-1">Listed {timeAgo(aw.created_at)}</p>
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
                    )}

                    <textarea
                      value={notes[aw.id] || ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [aw.id]: e.target.value }))}
                      rows={2}
                      placeholder="Optional notes (sent to artist on reject)"
                      className="w-full text-sm p-3 border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 rounded"
                    />

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        disabled={actingId === aw.id}
                        onClick={() =>
                          review(aw.id, true, aw.requested_verification_method || 'evidence_based')
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
