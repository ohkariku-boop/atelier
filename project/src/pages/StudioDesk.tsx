import { useState, useEffect, useRef } from 'react';
import { Plus, ShieldCheck, X, Video, Image as ImageIcon, TrendingUp, Gavel, Check, Loader2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuctionWithDetails, Artist } from '@/types';
import { formatCurrency, MEDIUMS, SHIPPING_RATES } from '@/lib/theme';
import { Badge } from '@/components/Badge';
import { CountdownTimer } from '@/components/CountdownTimer';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';

interface StudioDeskProps {
  navigate: (path: string) => void;
}

type View = 'dashboard' | 'create';

export function StudioDesk({ navigate }: StudioDeskProps) {
  const { showToast } = useToast();
  const { profile, session } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [auctions, setAuctions] = useState<AuctionWithDetails[]>([]);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);

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

      // Load auctions for this artist's artworks
      const { data: artworkData } = await supabase
        .from('artworks')
        .select('id, artist:artists(*)')
        .eq('user_id', session.user.id);

      const artistMap = new Map<string, Artist>();
      (artworkData || []).forEach((aw: any) => {
        if (aw.artist) artistMap.set(aw.id, aw.artist);
      });

      const artworkIds = (artworkData || []).map((aw: any) => aw.id);
      if (artworkIds.length === 0) {
        setAuctions([]);
        setLoading(false);
        return;
      }

      const { data: auctionData } = await supabase
        .from('auctions')
        .select('*, artwork:artworks(*)')
        .in('artwork_id', artworkIds)
        .order('created_at', { ascending: false });

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
  const endedAuctions = auctions.filter((a) => a.status === 'ended');

  const totalRevenue = endedAuctions.reduce((sum, a) => sum + a.current_bid, 0);
  const totalBids = auctions.reduce((sum, a) => sum + a.bid_count, 0);

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
          onCancel={() => setView('dashboard')}
          onSuccess={() => {
            setView('dashboard');
            showToast('Listing published! Your studio verification is pending review.', 'success');
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
  onCancel: () => void;
  onSuccess: () => void;
}

function CreateListingForm({ artist, onCancel, onSuccess }: CreateListingFormProps) {
  const { showToast } = useToast();
  const { session } = useAuth();
  const [title, setTitle] = useState('');
  const [medium, setMedium] = useState<string>('Oil');
  const [dimensions, setDimensions] = useState('');
  const [description, setDescription] = useState('');
  const [reservePrice, setReservePrice] = useState<number>(500);
  const [startingBid, setStartingBid] = useState<number>(200);
  const [shippingTier, setShippingTier] = useState<string>('medium_framed');
  const [certified, setCertified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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
  if (!videoUrl) errors.video = 'Verification video is required.';
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

  const handleSubmit = async () => {
    if (!canSubmit) {
      showToast('Please fix the errors before submitting.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const { data: artwork, error: artError } = await supabase
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
          verification_video_url: videoUrl,
        })
        .select()
        .single();

      if (artError) throw artError;

      const endTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: auctionError } = await supabase.from('auctions').insert({
        artwork_id: artwork.id,
        status: 'live',
        end_time: endTime,
        current_bid: startingBid,
        bid_count: 0,
        is_flash: false,
      });

      if (auctionError) throw auctionError;
      onSuccess();
    } catch {
      showToast('Failed to create listing. Please try again.', 'error');
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
        <h2 className="font-serif text-2xl font-semibold mb-2">Create New Listing</h2>
        <p className="text-sm text-ink-500 mb-8">Publish a new physical artwork to the Gallery Floor.</p>

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

            {/* Verification video upload */}
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
              {submitting ? 'Publishing...' : 'Publish to Gallery Floor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
