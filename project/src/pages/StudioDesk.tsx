import { useState, useEffect } from 'react';
import { Plus, ShieldCheck, TrendingUp, Gavel, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuctionWithDetails, Artist, Order, Artwork } from '@/types';
import { formatCurrency } from '@/lib/theme';
import { Badge } from '@/components/Badge';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { tryCloseAuction } from '@/lib/closeAuction';
import { AuctionRow } from '@/components/studio/AuctionRow';
import { CreateListingForm } from '@/components/studio/CreateListingForm';
import { MiniBars } from '@/components/studio/MiniBars';
import { startStripeConnectOnboarding } from '@/lib/stripe';

interface StudioDeskProps {
  navigate: (path: string) => void;
}

type View = 'dashboard' | 'create';

export function StudioDesk({ navigate }: StudioDeskProps) {
  const { showToast } = useToast();
  const { profile, session } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [myArtworks, setMyArtworks] = useState<Artwork[]>([]);
  const [editingArtwork, setEditingArtwork] = useState<Artwork | null>(null);
  const [startingAuctionFor, setStartingAuctionFor] = useState<string | null>(null);
  const [deletingArtworkId, setDeletingArtworkId] = useState<string | null>(null);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [disputedOrders, setDisputedOrders] = useState<(Order & { artwork_title: string })[]>([]);
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, string>>({});
  const [submittingEvidence, setSubmittingEvidence] = useState<string | null>(null);
  const [soldArtworkIds, setSoldArtworkIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      if (!session?.user?.id || !profile?.artist_id) {
        setLoading(false);
        return;
      }

      // Load artist record
      const { data: artistData } = await supabase
        .from('artists')
        .select('*')
        .eq('id', profile.artist_id)
        .maybeSingle();
      setArtist(artistData as Artist | null);

      // Load all of this artist's artwork listings (full rows, for edit/delete/start-auction)
      const { data: artworkData } = await supabase
        .from('artworks')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      setMyArtworks((artworkData || []) as Artwork[]);

      const artworkIds = (artworkData || []).map((a: any) => a.id);

      // Load auctions for those artworks
      if (artworkIds.length > 0) {
        const { data: auctionData } = await supabase
          .from('auctions')
          .select(`
            *,
            artwork:artworks(*)
          `)
          .in('artwork_id', artworkIds)
          .order('created_at', { ascending: false });

        const result: AuctionWithDetails[] = ((auctionData || []) as any[]).map((a) => ({
          ...a,
          artwork: a.artwork,
          artist: artistData || undefined,
        }));

        setAuctions(result);

        // Lazily close any overdue auctions belonging to this artist
        result
          .filter((a) => a.status !== 'ended' && new Date(a.end_time).getTime() <= Date.now())
          .forEach((a: any) => tryCloseAuction(a.id));
      }

      // Load disputed orders for artworks owned by this artist
      if (artworkIds.length > 0) {
        const { data: orderData } = await supabase
          .from('orders')
          .select('*, artwork:artworks(title)')
          .in('artwork_id', artworkIds)
          .neq('dispute_status', 'none')
          .order('created_at', { ascending: false });

        setDisputedOrders(
          ((orderData || []) as any[]).map((o) => ({
            ...o,
            artwork_title: o.artwork?.title || 'Untitled',
          }))
        );

        // Track sold artwork IDs so we don't show them as "ready to auction"
        const { data: soldOrders } = await supabase
          .from('orders')
          .select('artwork_id')
          .in('artwork_id', artworkIds)
          .in('status', ['pending_payment', 'escrow', 'shipped', 'delivered', 'completed']);

        setSoldArtworkIds(new Set((soldOrders || []).map((o: any) => o.artwork_id)));
      }

      setLoading(false);
    }
    load();
  }, [session?.user?.id, profile?.artist_id]);

  const activeAuctions = auctions.filter((a) => a.status === 'live' || a.status === 'flash' || a.status === 'upcoming');
  const endedAuctions = auctions.filter((a) => a.status === 'ended');
  const pendingReview = endedAuctions.filter((a) => a.outcome === 'pending_seller_review');

  // Build map of most recent ended auction per artwork (for resubmission logic)
  const lastEndedByArtwork = new Map<string, AuctionWithDetails>();
  endedAuctions.forEach((a) => {
    const existing = lastEndedByArtwork.get(a.artwork_id);
    if (!existing || new Date(a.end_time) > new Date(existing.end_time)) {
      lastEndedByArtwork.set(a.artwork_id, a);
    }
  });

  const artworkIdsWithActiveAuction = new Set(
    activeAuctions.map((a) => a.artwork_id)
  );

  const isVerified = (aw: Artwork) => aw.studio_verified && !!aw.verification_method;
  const needsResubmission = (aw: Artwork) => {
    const lastEnded = lastEndedByArtwork.get(aw.id);
    if (!lastEnded) return false;
    const verifiedAt = aw.verified_at ? new Date(aw.verified_at).getTime() : 0;
    const endedAt = new Date(lastEnded.end_time).getTime();
    return verifiedAt < endedAt;
  };

  const notCurrentlyActive = myArtworks.filter((aw) => !artworkIdsWithActiveAuction.has(aw.id) && !soldArtworkIds.has(aw.id));
  const resubmissionListings = notCurrentlyActive.filter((aw) => isVerified(aw) && needsResubmission(aw));
  const readyToAuctionListings = notCurrentlyActive.filter((aw) => isVerified(aw) && !needsResubmission(aw));
  const unverifiedListings = notCurrentlyActive.filter((aw) => !isVerified(aw));

  const totalRevenue = endedAuctions.reduce((sum, a) => sum + a.current_bid, 0);
  const totalBids = auctions.reduce((sum, a) => sum + a.bid_count, 0);
  const totalViews = myArtworks.reduce((sum, a) => sum + (a.view_count || 0), 0);
  const totalLikes = myArtworks.reduce((sum, a) => sum + (a.like_count || 0), 0);
  const soldCount = endedAuctions.filter((a) => a.outcome === 'sold').length;
  const avgBid = totalBids > 0 ? totalRevenue / Math.max(soldCount, 1) : 0;


  const resolveSale = async (auctionId: string, accept: boolean) => {
    const { error } = await supabase.rpc('resolve_pending_sale', {
      p_auction_id: auctionId,
      p_accept: accept,
    });
    if (error) {
      showToast(error.message || 'Failed to resolve sale.', 'error');
      return;
    }
    showToast(accept ? 'Sale accepted. Buyer has been notified to complete payment.' : 'Sale declined.', 'success');
    // Refresh by reloading
    window.location.reload();
  };

  const submitEvidence = async (orderId: string) => {
    const evidence = (evidenceDrafts[orderId] || '').trim();
    if (!evidence) {
      showToast('Please provide evidence notes.', 'error');
      return;
    }
    setSubmittingEvidence(orderId);
    const { error } = await supabase.rpc('submit_claim_evidence', {
      p_order_id: orderId,
      p_evidence_notes: evidence,
    });
    setSubmittingEvidence(null);
    if (error) {
      showToast(error.message || 'Failed to submit evidence.', 'error');
      return;
    }
    showToast('Evidence submitted. Our team will review shortly.', 'success');
    window.location.reload();
  };

  const handleStartAuction = async (artworkId: string) => {
    setStartingAuctionFor(artworkId);
    const { error } = await supabase.rpc('start_auction_for_artwork', { p_artwork_id: artworkId });
    setStartingAuctionFor(null);
    if (error) {
      showToast(error.message || 'Failed to start auction.', 'error');
      return;
    }
    showToast('Auction started!', 'success');
    window.location.reload();
  };

  const handleDeleteListing = async (artworkId: string) => {
    if (!confirm('Delete this listing permanently? This cannot be undone.')) return;
    setDeletingArtworkId(artworkId);
    const { error } = await supabase.rpc('delete_artwork_listing', { p_artwork_id: artworkId });
    setDeletingArtworkId(null);
    if (error) {
      showToast(error.message || 'Failed to delete listing.', 'error');
      return;
    }
    showToast('Listing deleted.', 'success');
    setMyArtworks((prev) => prev.filter((aw) => aw.id !== artworkId));
  };

  if (!session) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-20 text-center">
        <p className="text-ink-400 text-lg">Please sign in to access the Studio Desk.</p>
        <button onClick={() => navigate('auth')} className="btn-primary mt-4 text-sm">Sign In</button>
      </div>
    );
  }

  if (profile?.role !== 'artist') {
    return (
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-20 text-center">
        <p className="text-ink-400 text-lg">The Studio Desk is for artist accounts only.</p>
        <p className="text-sm text-ink-500 mt-2">Sign in with an artist account to manage your listings.</p>
        <button onClick={() => navigate('auth')} className="btn-secondary mt-4 text-sm">Switch Account</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-20 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ink-400" />
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-accent-500 font-semibold mb-2">The Studio Desk</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight">Seller Dashboard</h1>
          <p className="text-sm text-ink-500 mt-2">Welcome back, {profile?.display_name}</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="btn-primary text-sm flex items-center gap-2 self-start"
        >
          <Plus className="w-4 h-4" />
          Create New Listing
        </button>
      </div>

      {view === 'dashboard' ? (
        <>
          {/* Stripe Connect */}
          <div className="card-surface p-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-ink-400 font-semibold mb-1">Payouts</p>
              <p className="text-sm text-ink-600 dark:text-ink-300">
                Connect Stripe to receive funds when buyers pay and escrow releases.
                Without Connect, payments can still be collected by the platform.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary text-sm whitespace-nowrap"
              onClick={async () => {
                const res = await startStripeConnectOnboarding();
                if (res.url) {
                  window.location.href = res.url;
                  return;
                }
                showToast(
                  res.notConfigured
                    ? 'Stripe keys not set yet. Add STRIPE_SECRET_KEY in Supabase secrets.'
                    : res.error || 'Could not start Connect onboarding',
                  res.notConfigured ? 'info' : 'error'
                );
              }}
            >
              Connect Stripe
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="card-surface p-5">
              <div className="flex items-center gap-2 mb-2">
                <Gavel className="w-4 h-4 text-accent-500" />
                <span className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">Active</span>
              </div>
              <p className="font-mono text-2xl font-bold">{activeAuctions.length}</p>
            </div>
            <div className="card-surface p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">Revenue</span>
              </div>
              <p className="font-mono text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="card-surface p-5">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-gold-500" />
                <span className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">Total Bids</span>
              </div>
              <p className="font-mono text-2xl font-bold">{totalBids}</p>
            </div>
            <div className="card-surface p-5">
              <div className="flex items-center gap-2 mb-2">
                <Plus className="w-4 h-4 text-ink-500" />
                <span className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">Listings</span>
              </div>
              <p className="font-mono text-2xl font-bold">{myArtworks.length}</p>
            </div>
          </div>

          {/* Analytics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold mb-1">Views</p>
              <p className="font-mono text-xl font-bold">{totalViews}</p>
            </div>
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold mb-1">Likes</p>
              <p className="font-mono text-xl font-bold">{totalLikes}</p>
            </div>
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold mb-1">Sold</p>
              <p className="font-mono text-xl font-bold">{soldCount}</p>
            </div>
            <div className="card-surface p-4">
              <p className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold mb-1">Avg sale</p>
              <p className="font-mono text-xl font-bold">{soldCount ? formatCurrency(avgBid) : '—'}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <div className="card-surface p-5">
              <p className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold mb-3">Views by listing</p>
              <MiniBars
                items={[...myArtworks]
                  .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
                  .map((a) => ({ label: a.title, value: a.view_count || 0 }))}
              />
            </div>
            <div className="card-surface p-5">
              <p className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold mb-3">Likes by listing</p>
              <MiniBars
                items={[...myArtworks]
                  .sort((a, b) => (b.like_count || 0) - (a.like_count || 0))
                  .map((a) => ({ label: a.title, value: a.like_count || 0 }))}
              />
            </div>
          </div>

          {/* Pending seller review */}
          {pendingReview.length > 0 && (
            <section className="mb-10">
              <h2 className="font-serif text-xl font-semibold mb-4">Pending Your Decision</h2>
              <p className="text-sm text-ink-500 mb-4">
                These auctions ended below reserve. Accept the highest bid or decline.
              </p>
              <div className="space-y-3">
                {pendingReview.map((a) => (
                  <div key={a.id} className="card-surface p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-serif font-semibold truncate">{a.artwork.title}</p>
                      <p className="text-sm text-ink-500">
                        Top bid {formatCurrency(a.current_bid)} · Reserve {formatCurrency(a.artwork.reserve_price)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => resolveSale(a.id, true)}
                        className="btn-primary text-xs px-4 py-2"
                      >
                        Accept Bid
                      </button>
                      <button
                        onClick={() => resolveSale(a.id, false)}
                        className="btn-secondary text-xs px-4 py-2"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Active auctions */}
          {activeAuctions.length > 0 && (
            <section className="mb-10">
              <h2 className="font-serif text-xl font-semibold mb-4">Active Auctions</h2>
              <div className="space-y-3">
                {activeAuctions.map((a) => (
                  <AuctionRow key={a.id} auction={a} navigate={navigate} />
                ))}
              </div>
            </section>
          )}

          {/* Ready to auction */}
          {readyToAuctionListings.length > 0 && (
            <section className="mb-10">
              <h2 className="font-serif text-xl font-semibold mb-4">Ready to Auction</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {readyToAuctionListings.map((aw) => (
                  <div key={aw.id} className="card-surface p-4">
                    <div className="aspect-[4/3] bg-ink-100 dark:bg-ink-800 mb-3 overflow-hidden">
                      <img src={aw.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="verified" />
                    </div>
                    <h3 className="font-serif font-semibold truncate">{aw.title}</h3>
                    <p className="text-xs text-ink-500 mb-3">{aw.medium} · {formatCurrency(aw.starting_bid)} start</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStartAuction(aw.id)}
                        disabled={startingAuctionFor === aw.id}
                        className="btn-primary text-xs flex-1"
                      >
                        {startingAuctionFor === aw.id ? 'Starting…' : 'Start Auction'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingArtwork(aw);
                          setView('create');
                        }}
                        className="btn-secondary text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteListing(aw.id)}
                        disabled={deletingArtworkId === aw.id}
                        className="btn-secondary text-xs text-red-600"
                      >
                        {deletingArtworkId === aw.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Needs resubmission */}
          {resubmissionListings.length > 0 && (
            <section className="mb-10">
              <h2 className="font-serif text-xl font-semibold mb-4">Needs Re-verification</h2>
              <p className="text-sm text-ink-500 mb-4">
                These pieces previously sold or ended. Update verification evidence before starting a new auction.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {resubmissionListings.map((aw) => (
                  <div key={aw.id} className="card-surface p-4 border-amber-300 dark:border-amber-700">
                    <div className="aspect-[4/3] bg-ink-100 dark:bg-ink-800 mb-3 overflow-hidden">
                      <img src={aw.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="font-serif font-semibold truncate">{aw.title}</h3>
                    <p className="text-xs text-ink-500 mb-3">{aw.medium}</p>
                    <button
                      onClick={() => {
                        setEditingArtwork(aw);
                        setView('create');
                      }}
                      className="btn-primary text-xs w-full"
                    >
                      Update Verification
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Unverified */}
          {unverifiedListings.length > 0 && (
            <section className="mb-10">
              <h2 className="font-serif text-xl font-semibold mb-4">Pending Verification</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {unverifiedListings.map((aw) => (
                  <div key={aw.id} className="card-surface p-4">
                    <div className="aspect-[4/3] bg-ink-100 dark:bg-ink-800 mb-3 overflow-hidden">
                      <img src={aw.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="font-serif font-semibold truncate">{aw.title}</h3>
                    <p className="text-xs text-ink-500 mb-3">{aw.medium} · Awaiting studio review</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingArtwork(aw);
                          setView('create');
                        }}
                        className="btn-secondary text-xs flex-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteListing(aw.id)}
                        disabled={deletingArtworkId === aw.id}
                        className="btn-secondary text-xs text-red-600"
                      >
                        {deletingArtworkId === aw.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Disputes */}
          {disputedOrders.length > 0 && (
            <section className="mb-10">
              <h2 className="font-serif text-xl font-semibold mb-4">Open Disputes</h2>
              <div className="space-y-4">
                {disputedOrders.map((order) => (
                  <div key={order.id} className="card-surface p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-serif font-semibold">{order.artwork_title}</p>
                        <p className="text-xs text-ink-500">
                          Order {order.receipt_number || order.id.slice(0, 8)} · Status: {order.dispute_status}
                        </p>
                        {order.claim_reason && (
                          <p className="text-sm text-ink-600 dark:text-ink-300 mt-2">Claim: {order.claim_reason}</p>
                        )}
                      </div>
                      <Badge variant={order.dispute_status === 'claim_raised' ? 'flash' : 'live'} />
                    </div>
                    {order.dispute_status === 'claim_raised' && (
                      <div className="mt-3">
                        <textarea
                          value={evidenceDrafts[order.id] || ''}
                          onChange={(e) =>
                            setEvidenceDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))
                          }
                          rows={3}
                          className="w-full text-sm p-3 border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 rounded mb-2"
                          placeholder="Provide evidence notes for this claim (photos of packaging, shipping labels, communication, etc.)"
                        />
                        <button
                          onClick={() => submitEvidence(order.id)}
                          disabled={submittingEvidence === order.id}
                          className="btn-primary text-xs"
                        >
                          {submittingEvidence === order.id ? 'Submitting…' : 'Submit Evidence'}
                        </button>
                      </div>
                    )}
                    {order.evidence_notes && (
                      <p className="text-sm text-ink-500 mt-2">Your evidence: {order.evidence_notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {myArtworks.length === 0 && (
            <div className="text-center py-16">
              <p className="text-ink-400 text-lg mb-2">No listings yet</p>
              <p className="text-sm text-ink-500 mb-6">Create your first artwork listing to start selling on Atelier.</p>
              <button onClick={() => setView('create')} className="btn-primary text-sm">
                Create First Listing
              </button>
            </div>
          )}
        </>
      ) : (
        <CreateListingForm
          artist={artist}
          editingArtwork={editingArtwork}
          onCancel={() => {
            setView('dashboard');
            setEditingArtwork(null);
          }}
          onSuccess={() => {
            setView('dashboard');
            showToast(
              editingArtwork
                ? 'Listing updated! Changes are pending re-verification before you can start an auction.'
                : 'Listing published! Your studio verification is pending review.',
              'success'
            );
            setEditingArtwork(null);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
