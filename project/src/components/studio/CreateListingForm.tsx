import { useState, useRef } from 'react';
import { X, Video, Image as ImageIcon, Check, Loader2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Artist, Artwork } from '@/types';
import { MEDIUMS, SHIPPING_RATES, formatCurrency } from '@/lib/theme';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';

interface CreateListingFormProps {
  artist: Artist | null;
  editingArtwork?: Artwork | null;
  onCancel: () => void;
  onSuccess: () => void;
}

export function CreateListingForm({ artist, editingArtwork, onCancel, onSuccess }: CreateListingFormProps) {
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
