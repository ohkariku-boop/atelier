export interface Artist {
  id: string;
  name: string;
  biography: string | null;
  location: string | null;
  avatar_url: string | null;
  studio_verified: boolean;
  process_video_url: string | null;
  total_sales: number;
  created_at: string;
}

export type ShippingTier = 'small_canvas' | 'medium_framed' | 'heavy_sculpture';

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
  shipping_tier: ShippingTier;
  studio_verified: boolean;
  verification_video_url: string | null;
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

export type OrderStatus = 'escrow' | 'shipped' | 'delivered' | 'completed';

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
}

export type UserRole = 'buyer' | 'artist';

export interface Profile {
  id: string;
  display_name: string;
  role: UserRole;
  artist_id: string | null;
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
