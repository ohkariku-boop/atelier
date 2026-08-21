export interface Artist {
  id: string;
  name: string;
  biography: string | null;
  creative_philosophy: string | null;
  location: string | null;
  avatar_url: string | null;
  studio_verified: boolean;
  process_video_url: string | null;
  total_sales: number;
  created_at: string;
}

export type ShippingTier = 'small_canvas' | 'medium_framed' | 'heavy_sculpture' | 'intl_small' | 'intl_medium' | 'intl_heavy';

export type VerificationMethod = 'live_video' | 'evidence_based' | 'studio_partner';

export interface EvidenceItem {
  type: 'sketch' | 'wip_photo' | 'source_file' | 'receipt' | 'other';
  url: string;
  note: string;
}

export interface Artwork {
  id: string;
  artist_id: string;
  user_id: string | null;
  title: string;
  medium: string;
  dimensions: string | null;
  description: string | null;
  image_url: string;
  reserve_price: number;
  starting_bid: number;
  buy_now_price?: number | null;
  public_verify_slug?: string | null;
  year_created?: string | null;
  condition_grade?: string | null;
  condition_report?: string | null;
  shipping_tier: ShippingTier;
  studio_verified: boolean;
  verification_video_url: string | null;
  verification_method: VerificationMethod | null;
  requested_verification_method: VerificationMethod | null;
  evidence_items: EvidenceItem[];
  verified_at: string | null;
  certificate_number: string | null;
  certificate_issued_at: string | null;
  is_featured: boolean;
  view_count: number;
  like_count: number;
  created_at: string;
}

export type AuctionStatus = 'live' | 'flash' | 'upcoming' | 'ended';
export type AuctionOutcome = 'sold' | 'pending_seller_review' | 'declined' | 'no_bids' | null;

export interface Auction {
  id: string;
  artwork_id: string;
  status: AuctionStatus;
  outcome: AuctionOutcome;
  start_time: string;
  end_time: string;
  current_bid: number;
  bid_count: number;
  is_flash: boolean;
  created_at: string;
}

export interface Bid {
  id: string;
  auction_id: string;
  bidder_name: string;
  amount: number;
  user_id: string | null;
  created_at: string;
}

export type OrderStatus = 'pending_payment' | 'escrow' | 'shipped' | 'delivered' | 'completed';
export type DisputeStatus = 'none' | 'claim_raised' | 'evidence_submitted' | 'resolved_upheld' | 'resolved_denied';

export interface Order {
  id: string;
  auction_id: string;
  artwork_id: string;
  user_id: string | null;
  buyer_name: string;
  amount: number;
  shipping_cost: number;
  shipping_tier: ShippingTier;
  status: OrderStatus;
  tracking_number: string | null;
  receipt_number: string | null;
  buyer_email: string | null;
  paid_at: string | null;
  created_at: string;
  dispute_status: DisputeStatus;
  claim_reason: string | null;
  claim_raised_at: string | null;
  evidence_notes: string | null;
  evidence_submitted_at: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  artwork_id: string | null;
  order_id: string | null;
  read: boolean;
  created_at: string;
}

export type UserRole = 'buyer' | 'artist' | 'admin';

export interface Profile {
  id: string;
  display_name: string;
  role: UserRole;
  artist_id: string | null;
  stripe_customer_id?: string | null;
  stripe_account_id?: string | null;
  stripe_onboarding_complete?: boolean;
  created_at: string;
}

export interface AuctionWithDetails extends Auction {
  artwork: Artwork;
  artist: Artist | undefined;
}

export interface OrderWithDetails extends Order {
  artwork: Artwork;
  artist: Artist;
}
