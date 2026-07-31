import { useState, useEffect, useRef } from 'react';
import { Plus, ShieldCheck, X, Video, Image as ImageIcon, TrendingUp, Gavel, Check, Loader2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuctionWithDetails, Artist, Order, Artwork } from '@/types';
import { formatCurrency, MEDIUMS, SHIPPING_RATES } from '@/lib/theme';
import { Badge } from '@/components/Badge';
import { CountdownTimer } from '@/components/CountdownTimer';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { tryCloseAuction } from '@/lib/closeAuction';

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

      const artistMap = new Map<string, Artist>();
      (artworkData || []).forEach((aw: any) => {
        if (artistData) artistMap.set(aw.id, artistData as Artist);
      });

      const artworkIds = (artworkData || []).map((aw: any) => aw.id);
      if (artworkIds.length === 0) {
        setAuctions([]);
        setLoading(false);
        return;
      }

      // Orders on this artist's artworks with a claim awaiting a response
      const { data: orderData } = await supabase
        .from('orders')
        .select('*, artwork:artworks(title)')
        .in('artwork_id', artworkIds)
        .eq('dispute_status', 'claim_raised')
        .order('claim_raised_at', { ascending: true });

      setDisputedOrders(
        (orderData || []).map((o: any) => ({ ...o, artwork_title: o.artwork?.title || 'Untitled' }))
      );

      const { data: auctionData } = await supabase
        .from('auctions')
        .select('*, artwork:artworks(*)')
        .in('artwork_id', artworkIds)
        .order('created_at', { ascending: false });

      // Sweep for and close any of this artist's own overdue auctions -
      // don't rely solely on other visitors having viewed the gallery.
      (auctionData || [])
        .filter((a: any) => a.status !== 'ended' && new Date(a.end_time).getTime() <= Date.now())
        .forEach((a: any) => tryCloseAuction(a.id));

      const result: AuctionWithDetails[] = (auctionData || []).map((a: any) => ({
        ...a,
        artwork: a.artwork,
        artist: artistMap.get(a.artwork_id),
      }));

      setAuctions(result);
      setLoading(false);
    }
    load();
  }, [session, profile]);

  const activeAuctions = auctions.filter((a) => a.status === 'live' || a.status === 'flash');
  const upcomingAuctions = auctions.filter((a) => a.status === 'upcoming');
  const pendingReviewAuctions = auctions.filter((a) => a.outcome === 'pending_seller_review');
  const endedAuctions = auctions.filter((a) => a.status === 'ended' && a.outcome !== 'pending_seller_review');

  const artworkIdsWithActiveAuction = new Set(
    auctions.filter((a) => a.status === 'live' || a.status === 'flash' || a.status === 'upcoming').map((a) => a.artwork_id)
  );
  const unverifiedListings = myArtworks.filter((aw) => !aw.studio_verified);
  const readyToAuctionListings = myArtworks.filter((aw) => aw.studio_verified && !artworkIdsWithActiveAuction.has(aw.id));

  const totalRevenue = endedAuctions.reduce((sum, a) => sum + a.current_bid, 0);
  const totalBids = auctions.reduce((sum, a) => sum + a.bid_count, 0);

  const resolveSale = async (auctionId: string, accept: boolean) => {
    const { error } = await supabase.rpc('resolve_pending_sale', {
      p_auction_id: auctionId,
      p_accept: accept,
    });
    if (error) {
      showToast(error.message || 'Failed to record your decision.', 'error');
      return;
    }
    showToast(
      accept ? 'Sale accepted - order created and moved to escrow.' : 'Sale declined.',
      accept ? 'success' : 'info'
    );
    window.location.reload();
  };

  const submitEvidence = async (orderId: string) => {
    const evidence = (evidenceDrafts[orderId] || '').trim();
    if (evidence.length < 20) {
      showToast('Please describe your evidence in more detail (min 20 characters).', 'error');
      return;
    }
    setSubmittingEvidence(orderId);
    const { error } = await supabase.rpc('submit_claim_evidence', {
      p_order_id: orderId,
      p_evidence: evidence,
    });
    setSubmittingEvidence(null);
    if (error) {
      showToast(error.message || 'Failed to submit evidence.', 'error');
      return;
    }
    showToast('Evidence submitted. Atelier will review it against our verification policy.', 'success');
    setDisputedOrders((prev) => prev.filter((o) => o.id !== orderId));
  };

  const handleStartAuction = async (artworkId: string) => {
    setStartingAuctionFor(artworkId);
    const { error } = await supabase.rpc('start_auction_for_artwork', { p_artwork_id: artworkId });
    setStartingAuctionFor(null);
    if (error) {
      showToast(error.message || 'Failed to start auction.', 'error');
      return;
    }
    showToast('Auction started! Your listing is now live.', 'success');
    window.location.reload();
  };

  const handleDeleteListing = async (artworkId: string) => {
    if (!window.confirm('Delete this listing? This cannot be undone.')) return;
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
              <p className="font-mono text-2xl font-bold">{auctions.length}</p>
            </div>
          </div>

          {/* Disputed orders - buyer has raised a claim, awaiting artist evidence */}
          {disputedOrders.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-widest font-semibold text-amber-600 mb-4">
                Claims Awaiting Your Response
              </h2>
              <div className="space-y-3">
                {disputedOrders.map((o) => (
                  <div key={o.id} className="card-surface p-4">
                    <div className="mb-3">
                      <h3 className="font-serif text-sm font-semibold">{o.artwork_title}</h3>
                      <p className="text-xs text-ink-500 mt-1">
                        Buyer's claim: <span className="text-ink-700 dark:text-ink-300">{o.claim_reason}</span>
                      </p>
                    </div>
                    <label className="text-xs text-ink-500 mb-1 block">
                      Your evidence (dated sketches, source/layer files, timestamped WIP photos or video)
                    </label>
                    <textarea
                      value={evidenceDrafts[o.id] || ''}
                      onChange={(e) => setEvidenceDrafts((prev) => ({ ...prev, [o.id]: e.target.value }))}
                      className="w-full text-xs p-2 border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 rounded mb-3"
                      rows={3}
                      placeholder="Describe and link to your process evidence for this specific piece..."
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => submitEvidence(o.id)}
                        disabled={submittingEvidence === o.id}
                        className="btn-accent text-xs py-2 px-4 disabled:opacity-40"
                      >
                        {submittingEvidence === o.id ? 'Submitting...' : 'Submit Evidence'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pending seller review - reserve wasn't met, artist must decide */}
          {pendingReviewAuctions.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-widest font-semibold text-gold-600 mb-4">
                Pending Your Review · Reserve Not Met
              </h2>
              <div className="space-y-3">
                {pendingReviewAuctions.map((a) => (
                  <div key={a.id} className="card-surface p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-16 h-16 bg-ink-100 dark:bg-ink-800 overflow-hidden flex-shrink-0">
                      <img src={a.artwork.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-serif text-sm font-semibold truncate">{a.artwork.title}</h3>
                      <p className="text-xs text-ink-500">
                        Highest bid <span className="font-mono font-semibold">{formatCurrency(a.current_bid)}</span>
                        {' '}· Reserve was <span className="font-mono">{formatCurrency(a.artwork.reserve_price)}</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => resolveSale(a.id, false)}
                        className="btn-secondary text-xs py-2 px-4"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => resolveSale(a.id, true)}
                        className="btn-accent text-xs py-2 px-4"
                      >
                        Accept {formatCurrency(a.current_bid)}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* My listings - not yet live, either pending review or verified and ready to start */}
          {(unverifiedListings.length > 0 || readyToAuctionListings.length > 0) && (
            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-4">My Listings</h2>
              <div className="space-y-3">
                {readyToAuctionListings.map((aw) => (
                  <div key={aw.id} className="card-surface flex items-center gap-4 p-4">
                    <div className="w-16 h-16 bg-ink-100 dark:bg-ink-800 overflow-hidden flex-shrink-0">
                      <img src={aw.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Verified — Ready to List
                      </span>
                      <h3 className="font-serif text-sm font-semibold truncate">{aw.title}</h3>
                      <p className="text-xs text-ink-500">{aw.medium}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleStartAuction(aw.id)}
                        disabled={startingAuctionFor === aw.id}
                        className="btn-accent text-xs py-2 px-3 disabled:opacity-40"
                      >
                        {startingAuctionFor === aw.id ? 'Starting...' : 'Start Auction'}
                      </button>
                      <button onClick={() => { setEditingArtwork(aw); setView('create'); }} className="btn-secondary text-xs py-2 px-3">
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteListing(aw.id)}
                        disabled={deletingArtworkId === aw.id}
                        className="text-xs text-red-600 dark:text-red-400 px-3 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}

                {unverifiedListings.map((aw) => (
                  <div key={aw.id} className="card-surface flex items-center gap-4 p-4">
                    <div className="w-16 h-16 bg-ink-100 dark:bg-ink-800 overflow-hidden flex-shrink-0">
                      <img src={aw.image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-gold-600 dark:text-gold-400 mb-1 block">
                        Pending Review
                      </span>
                      <h3 className="font-serif text-sm font-semibold truncate">{aw.title}</h3>
                      <p className="text-xs text-ink-500">{aw.medium}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                      <button onClick={() => { setEditingArtwork(aw); setView('create'); }} className="btn-secondary text-xs py-2 px-3">
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteListing(aw.id)}
                        disabled={deletingArtworkId === aw.id}
                        className="text-xs text-red-600 dark:text-red-400 px-3 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Active auctions */}
          <section className="mb-8">
            <h2 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-4">Active Auctions</h2>
            {loading ? (
              <div className="card-surface p-8 text-center text-ink-400 text-sm">Loading...</div>
            ) : activeAuctions.length === 0 ? (
              <div className="card-surface p-8 text-center">
                <p className="text-ink-400 text-sm mb-4">No active auctions. Create a listing to get started.</p>
                <button onClick={() => setView('create')} className="btn-secondary text-sm">
                  Create Listing
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeAuctions.map((a) => (
                  <AuctionRow key={a.id} auction={a} navigate={navigate} />
                ))}
              </div>
            )}
          </section>

          {upcomingAuctions.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-4">Upcoming</h2>
              <div className="space-y-3">
                {upcomingAuctions.map((a) => (
                  <AuctionRow key={a.id} auction={a} navigate={navigate} />
                ))}
              </div>
            </section>
          )}

          {endedAuctions.length > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-4">Ended Auctions</h2>
              <div className="space-y-3">
                {endedAuctions.map((a) => (
                  <AuctionRow key={a.id} auction={a} navigate={navigate} />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <CreateListingForm
          artist={artist}
          editingArtwork={editingArtwork}
          onCancel={() => { setView('dashboard'); setEditingArtwork(null); }}
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

function AuctionRow({ auction, navigate }: { auction: AuctionWithDetails; navigate: (p: string) => void }) {
  const { artwork, artist } = auction;
  const reserveMet = auction.current_bid >= artwork.reserve_price;

  return (
    <button
      onClick={() => navigate(`auction/${auction.id}`)}
      className="card-surface w-full flex items-center gap-4 p-4 text-left hover:border-ink-900 dark:hover:border-ink-400 transition-colors group"
    >
      <div className="w-16 h-16 bg-ink-100 dark:bg-ink-800 overflow-hidden flex-shrink-0">
        <img src={artwork.image_url} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {auction.is_flash ? <Badge variant="flash" /> : <Badge variant="live" />}
          {artwork.studio_verified && <Badge variant="verified" />}
        </div>
        <h3 className="font-serif text-sm font-semibold truncate group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
          {artwork.title}
        </h3>
        <p className="text-xs text-ink-500">{artist?.name} · {artwork.medium}</p>
      </div>
      <div className="hidden sm:block text-right">
        <p className="font-mono text-sm font-bold">{formatCurrency(auction.current_bid || artwork.starting_bid)}</p>
        <p className="text-xs text-ink-400">{auction.bid_count} bids · {reserveMet ? 'Reserve met' : 'Reserve pending'}</p>
      </div>
      <div className="flex-shrink-0">
        {auction.status === 'live' || auction.status === 'flash' ? (
          <CountdownTimer endTime={auction.end_time} variant="minimal" />
        ) : auction.status === 'upcoming' ? (
          <span className="text-xs text-ink-400">Starts soon</span>
        ) : (
          <span className="text-xs text-ink-400">Ended</span>
        )}
      </div>
    </button>
  );
}

interface CreateListingFormProps {
  artist: Artist | null;
  editingArtwork?: Artwork | null;
  onCancel: () => void;
  onSuccess: () => void;
}

function CreateListingForm({ artist, editingArtwork, onCancel, onSuccess }: CreateListingFormProps) {
  const { showToast } = useToast();
  const { session } = useAuth();
  const [title, setTitle] = useState(editingArtwork?.title || '');
  const [medium, setMedium] = useState<string>(editingArtwork?.medium || 'Oil');
  const [dimensions, setDimensions] = useState(editingArtwork?.dimensions || '');
  const [description, setDescription] = useState(editingArtwork?.description || '');
  const [reservePrice, setReservePrice] = useState<number>(editingArtwork?.reserve_price ?? 500);
  const [startingBid, setStartingBid] = useState<number>(editingArtwork?.starting_bid ?? 200);
  const [shippingTier, setShippingTier] = useState<string>(editingArtwork?.shipping_tier || 'medium_framed');
  const [certified, setCertified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(editingArtwork?.image_url || null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(
    editingArtwork?.requested_verification_method === 'live_video' ? editingArtwork.verification_video_url : null
  );
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [verificationMethod, setVerificationMethod] = useState<'live_video' | 'evidence_based' | 'studio_partner'>(
    editingArtwork?.requested_verification_method || 'live_video'
  );
  const [evidenceItems, setEvidenceItems] = useState<{ type: 'wip_photo'; url: string; note: string }[]>(
    editingArtwork?.requested_verification_method === 'evidence_based'
      ? (editingArtwork.evidence_items as { type: 'wip_photo'; url: string; note: string }[])
      : []
  );
  const [evidenceNote, setEvidenceNote] = useState(
    editingArtwork?.requested_verification_method === 'evidence_based' ? editingArtwork.evidence_items[0]?.note || '' : ''
  );
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [partnerNote, setPartnerNote] = useState(
    editingArtwork?.requested_verification_method === 'studio_partner' ? editingArtwork.evidence_items[0]?.note || '' : ''
  );

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  // Validation
  const errors: Record<string, string> = {};
  if (title.trim().length < 2) errors.title = 'Title must be at least 2 characters.';
  if (title.trim().length > 100) errors.title = 'Title must be under 100 characters.';
  if (dimensions.trim().length === 0) errors.dimensions = 'Dimensions are required.';
  if (description.trim().length < 10) errors.description = 'Description must be at least 10 characters.';
  if (reservePrice < 0) errors.reservePrice = 'Reserve price cannot be negative.';
  if (startingBid < 0) errors.startingBid = 'Starting bid cannot be negative.';
  if (startingBid > reservePrice) errors.startingBid = 'Starting bid cannot exceed reserve price.';
  if (!imageUrl) errors.image = 'Artwork photo is required.';
  if (verificationMethod === 'live_video' && !videoUrl) {
    errors.video = 'Verification video is required.';
  }
  if (verificationMethod === 'evidence_based' && evidenceItems.length === 0) {
    errors.evidence = 'Upload at least one piece of evidence (WIP photo, sketch, source file, receipt).';
  }
  if (verificationMethod === 'studio_partner' && partnerNote.trim().length < 10) {
    errors.partner = 'Tell us which studio/gallery can vouch for this piece, or how we can verify it in person.';
  }
  if (!certified) errors.certified = 'You must certify this is human-made art.';

  const canSubmit = Object.keys(errors).length === 0 && !submitting && !!session?.user?.id && !!artist;

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('Image must be under 10MB.', 'error');
      return;
    }
    setImageFile(file);
    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `artworks/${session?.user?.id}/${Date.now()}-artwork.${ext}`;
      const { error } = await supabase.storage.from('artwork-uploads').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('artwork-uploads').getPublicUrl(path);
      setImageUrl(urlData.publicUrl);
      showToast('Artwork photo uploaded.', 'success');
    } catch {
      showToast('Failed to upload image. Please try again.', 'error');
      setImageFile(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleVideoUpload = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      showToast('Please select a video file.', 'error');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showToast('Video must be under 50MB.', 'error');
      return;
    }
    setVideoFile(file);
    setUploadingVideo(true);
    try {
      const ext = file.name.split('.').pop() || 'mp4';
      const path = `verifications/${session?.user?.id}/${Date.now()}-verification.${ext}`;
      const { error } = await supabase.storage.from('artwork-uploads').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('artwork-uploads').getPublicUrl(path);
      setVideoUrl(urlData.publicUrl);
      showToast('Verification video uploaded.', 'success');
    } catch {
      showToast('Failed to upload video. Please try again.', 'error');
      setVideoFile(null);
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleEvidenceUpload = async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      showToast('Please upload an image or PDF (photo, sketch, receipt, or source file export).', 'error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast('File must be under 15MB.', 'error');
      return;
    }
    setUploadingEvidence(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `evidence/${session?.user?.id}/${Date.now()}-evidence.${ext}`;
      const { error } = await supabase.storage.from('artwork-uploads').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('artwork-uploads').getPublicUrl(path);
      setEvidenceItems((prev) => [...prev, { type: 'wip_photo', url: urlData.publicUrl, note: '' }]);
      showToast('Evidence uploaded.', 'success');
    } catch {
      showToast('Failed to upload evidence. Please try again.', 'error');
    } finally {
      setUploadingEvidence(false);
    }
  };

  const removeEvidenceItem = (url: string) => {
    setEvidenceItems((prev) => prev.filter((item) => item.url !== url));
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      showToast('Please fix the errors before submitting.', 'error');
      return;
    }
    setSubmitting(true);

    const evidencePayload =
      verificationMethod === 'evidence_based'
        ? evidenceItems.map((item) => ({ ...item, note: evidenceNote.trim() }))
        : verificationMethod === 'studio_partner'
        ? [{ type: 'other', url: '', note: partnerNote.trim() }]
        : [];

    try {
      if (editingArtwork) {
        const { error } = await supabase.rpc('edit_artwork_listing', {
          p_artwork_id: editingArtwork.id,
          p_title: title.trim(),
          p_medium: medium,
          p_dimensions: dimensions.trim(),
          p_description: description.trim(),
          p_reserve_price: reservePrice,
          p_starting_bid: startingBid,
          p_shipping_tier: shippingTier,
          p_image_url: imageUrl,
          p_requested_verification_method: verificationMethod,
          p_verification_video_url: verificationMethod === 'live_video' ? videoUrl : null,
          p_evidence_items: evidencePayload,
        });
        if (error) throw error;
      } else {
        const { error: artError } = await supabase
          .from('artworks')
          .insert({
            artist_id: artist!.id,
            user_id: session!.user.id,
            title: title.trim(),
            medium,
            dimensions: dimensions.trim(),
            description: description.trim(),
            image_url: imageUrl,
            reserve_price: reservePrice,
            starting_bid: startingBid,
            shipping_tier: shippingTier,
            studio_verified: false,
            verification_video_url: verificationMethod === 'live_video' ? videoUrl : null,
            requested_verification_method: verificationMethod,
            evidence_items: evidencePayload,
          })
          .select()
          .single();

        if (artError) throw artError;
      }

      onSuccess();
    } catch (err: any) {
      showToast(err?.message || 'Failed to save listing. Please try again.', 'error');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <button onClick={onCancel} className="flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 transition-colors mb-6">
        <X className="w-4 h-4" />
        Cancel
      </button>

      <div className="card-surface p-8">
        <h2 className="font-serif text-2xl font-semibold mb-2">{editingArtwork ? 'Edit Listing' : 'Create New Listing'}</h2>
        <p className="text-sm text-ink-500 mb-8">
          {editingArtwork
            ? 'Changes will need to pass verification again before you can start an auction.'
            : 'Publish a new physical artwork to the Gallery Floor.'}
        </p>

        <div className="space-y-6">
          {/* Artist info (read-only) */}
          <div className="flex items-center gap-3 p-4 bg-ink-100 dark:bg-ink-800">
            <img src={artist?.avatar_url || ''} alt={artist?.name} className="w-10 h-10 rounded-full object-cover" />
            <div>
              <p className="text-sm font-semibold">{artist?.name}</p>
              <p className="text-xs text-ink-500">{artist?.location} · {artist?.studio_verified ? 'Studio Verified Artist' : 'Verification pending'}</p>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Light Through Linen III"
              className="input-field"
              maxLength={100}
            />
            {errors.title && <p className="text-xs text-accent-500 mt-1">{errors.title}</p>}
          </div>

          {/* Medium + Dimensions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Medium</label>
              <select
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
                className="input-field cursor-pointer"
              >
                {MEDIUMS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Dimensions</label>
              <input
                type="text"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
                placeholder="e.g., 36 x 48 in"
                className="input-field"
              />
              {errors.dimensions && <p className="text-xs text-accent-500 mt-1">{errors.dimensions}</p>}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the materials, process, and story behind this piece..."
              rows={4}
              className="input-field resize-none"
            />
            {errors.description && <p className="text-xs text-accent-500 mt-1">{errors.description}</p>}
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Reserve Price ($)</label>
              <input
                type="number"
                value={reservePrice}
                onChange={(e) => setReservePrice(Math.max(0, Number(e.target.value)))}
                min={0}
                className="input-field font-mono"
              />
              {errors.reservePrice && <p className="text-xs text-accent-500 mt-1">{errors.reservePrice}</p>}
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Starting Bid ($)</label>
              <input
                type="number"
                value={startingBid}
                onChange={(e) => setStartingBid(Math.max(0, Number(e.target.value)))}
                min={0}
                className="input-field font-mono"
              />
              {errors.startingBid && <p className="text-xs text-accent-500 mt-1">{errors.startingBid}</p>}
            </div>
          </div>

          {/* Shipping tier */}
          <div>
            <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Shipping Box Size</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Object.entries(SHIPPING_RATES).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setShippingTier(key)}
                  className={`p-4 text-left transition-all duration-200 ${
                    shippingTier === key
                      ? 'bg-ink-900 text-ink-50 dark:bg-ink-50 dark:text-ink-900'
                      : 'border border-ink-200 dark:border-ink-700 hover:border-ink-900 dark:hover:border-ink-400'
                  }`}
                >
                  <p className="text-sm font-semibold">{val.label}</p>
                  <p className={`text-xs mt-0.5 ${shippingTier === key ? 'text-ink-300 dark:text-ink-600' : 'text-ink-400'}`}>
                    {val.description}
                  </p>
                  <p className={`text-xs font-mono mt-1 ${shippingTier === key ? 'text-ink-300 dark:text-ink-600' : 'text-ink-500'}`}>
                    {formatCurrency(val.cost)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Upload sections */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Photo upload */}
            <div>
              <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Artwork Photo</label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                className="hidden"
              />
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImage}
                className={`w-full p-6 border-2 border-dashed transition-all duration-200 text-center ${
                  imageUrl
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-ink-200 dark:border-ink-700 hover:border-ink-900 dark:hover:border-ink-400'
                }`}
              >
                {uploadingImage ? (
                  <Loader2 className="w-8 h-8 text-ink-400 mx-auto mb-2 animate-spin" />
                ) : imageUrl ? (
                  <>
                    <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-medium">Photo Uploaded</p>
                    {imageFile && <p className="text-xs text-ink-400 mt-1 truncate">{imageFile.name}</p>}
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-8 h-8 text-ink-400 mx-auto mb-2" />
                    <p className="text-sm font-medium">Upload Photo</p>
                    <p className="text-xs text-ink-400 mt-1">High-res image (max 10MB)</p>
                  </>
                )}
              </button>
              {errors.image && <p className="text-xs text-accent-500 mt-1">{errors.image}</p>}
            </div>

            {/* Verification method selector */}
            <div className="sm:col-span-2">
              <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">
                How can we verify this piece is human-made?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setVerificationMethod('live_video')}
                  className={`p-3 border text-left transition-all ${
                    verificationMethod === 'live_video'
                      ? 'border-ink-900 dark:border-ink-100 bg-ink-50 dark:bg-ink-900'
                      : 'border-ink-200 dark:border-ink-700'
                  }`}
                >
                  <p className="text-sm font-medium">I have a process video</p>
                  <p className="text-xs text-ink-500 mt-1">Filmed while making it. Hands/tools only is fine — no face required.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setVerificationMethod('evidence_based')}
                  className={`p-3 border text-left transition-all ${
                    verificationMethod === 'evidence_based'
                      ? 'border-ink-900 dark:border-ink-100 bg-ink-50 dark:bg-ink-900'
                      : 'border-ink-200 dark:border-ink-700'
                  }`}
                >
                  <p className="text-sm font-medium">This piece is already finished</p>
                  <p className="text-xs text-ink-500 mt-1">No video, but I have WIP photos, sketches, source files, or receipts.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setVerificationMethod('studio_partner')}
                  className={`p-3 border text-left transition-all ${
                    verificationMethod === 'studio_partner'
                      ? 'border-ink-900 dark:border-ink-100 bg-ink-50 dark:bg-ink-900'
                      : 'border-ink-200 dark:border-ink-700'
                  }`}
                >
                  <p className="text-sm font-medium">Request in-person verification</p>
                  <p className="text-xs text-ink-500 mt-1">A partner studio/gallery can vouch, or ask Atelier to verify in person.</p>
                </button>
              </div>
            </div>

            {verificationMethod === 'live_video' && (
              <div>
                <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">Verification Video</label>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
                  className="hidden"
                />
                <button
                  onClick={() => videoInputRef.current?.click()}
                  disabled={uploadingVideo}
                  className={`w-full p-6 border-2 border-dashed transition-all duration-200 text-center ${
                    videoUrl
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                      : 'border-ink-200 dark:border-ink-700 hover:border-ink-900 dark:hover:border-ink-400'
                  }`}
                >
                  {uploadingVideo ? (
                    <Loader2 className="w-8 h-8 text-ink-400 mx-auto mb-2 animate-spin" />
                  ) : videoUrl ? (
                    <>
                      <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      <p className="text-sm font-medium">Video Uploaded</p>
                      {videoFile && <p className="text-xs text-ink-400 mt-1 truncate">{videoFile.name}</p>}
                    </>
                  ) : (
                    <>
                      <Video className="w-8 h-8 text-ink-400 mx-auto mb-2" />
                      <p className="text-sm font-medium">Upload Video</p>
                      <p className="text-xs text-ink-400 mt-1">5-second studio proof (max 50MB)</p>
                    </>
                  )}
                </button>
                {errors.video && <p className="text-xs text-accent-500 mt-1">{errors.video}</p>}
              </div>
            )}

            {verificationMethod === 'evidence_based' && (
              <div className="sm:col-span-2">
                <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">
                  Evidence ({evidenceItems.length} uploaded)
                </label>
                <input
                  ref={evidenceInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => e.target.files?.[0] && handleEvidenceUpload(e.target.files[0])}
                  className="hidden"
                />
                <div className="flex flex-wrap gap-2 mb-3">
                  {evidenceItems.map((item) => (
                    <div key={item.url} className="relative w-20 h-20 border border-ink-200 dark:border-ink-700">
                      <img src={item.url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeEvidenceItem(item.url)}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-ink-900 text-white rounded-full text-xs flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => evidenceInputRef.current?.click()}
                    disabled={uploadingEvidence}
                    className="w-20 h-20 border-2 border-dashed border-ink-200 dark:border-ink-700 flex items-center justify-center hover:border-ink-900 dark:hover:border-ink-400"
                  >
                    {uploadingEvidence ? (
                      <Loader2 className="w-5 h-5 text-ink-400 animate-spin" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-ink-400" />
                    )}
                  </button>
                </div>
                <textarea
                  value={evidenceNote}
                  onChange={(e) => setEvidenceNote(e.target.value)}
                  className="w-full text-sm p-3 border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 rounded"
                  rows={2}
                  placeholder="Briefly describe this evidence — e.g. dated WIP photos from March, layered PSD file, receipt for canvas/paint purchase..."
                />
                {errors.evidence && <p className="text-xs text-accent-500 mt-1">{errors.evidence}</p>}
              </div>
            )}

            {verificationMethod === 'studio_partner' && (
              <div className="sm:col-span-2">
                <label className="text-xs uppercase tracking-widest font-semibold text-ink-500 mb-2 block">
                  Verification Request
                </label>
                <textarea
                  value={partnerNote}
                  onChange={(e) => setPartnerNote(e.target.value)}
                  className="w-full text-sm p-3 border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 rounded"
                  rows={3}
                  placeholder="Which studio, gallery, or framer can vouch for this piece? Or let us know how we can arrange in-person verification."
                />
                <p className="text-xs text-ink-500 mt-1">
                  This listing will be marked pending until we've followed up with you directly.
                </p>
                {errors.partner && <p className="text-xs text-accent-500 mt-1">{errors.partner}</p>}
              </div>
            )}
          </div>

          {/* Certification checkbox */}
          <button
            onClick={() => setCertified(!certified)}
            className={`w-full flex items-start gap-3 p-4 border transition-all duration-200 text-left ${
              certified
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-ink-200 dark:border-ink-700'
            }`}
          >
            <div className={`w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
              certified ? 'bg-emerald-500 border-emerald-500' : 'border-ink-300 dark:border-ink-600'
            }`}>
              {certified && <Check className="w-3.5 h-3.5 text-white" />}
            </div>
            <div>
              <p className="text-sm font-semibold">I certify this item is a 100% human-created, physical artwork.</p>
              <p className="text-xs text-ink-500 mt-1 leading-relaxed">
                By checking this box, I confirm no AI tools were used in the creation of this piece,
                and it is a physical, tangible artwork — not a digital-only asset.
              </p>
            </div>
          </button>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button onClick={onCancel} className="btn-secondary flex-1 text-sm">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="btn-accent flex-1 text-sm"
            >
              {submitting ? 'Saving...' : editingArtwork ? 'Save Changes' : 'Publish to Gallery Floor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
