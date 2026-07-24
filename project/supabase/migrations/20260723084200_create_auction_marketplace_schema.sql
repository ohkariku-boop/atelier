/*
# Create Art Auction Marketplace Schema

1. Overview
A premium live auction marketplace for hand-crafted, human-made physical art.
Single-tenant (no auth) demo app — anon key reads/writes all data.

2. New Tables
- `artists`: verified artists with bios, studio info, process videos, sales history.
- `artworks`: physical art listings (paintings, sculptures, ceramics, prints) with images, medium, dimensions, reserve price, starting bid, shipping tier, verification video.
- `auctions`: auction sessions tied to an artwork with status (live/flash/upcoming/ended), start/end times, current bid, bid count.
- `bids`: individual bids placed on auctions with bidder name and amount.
- `orders`: checkout records with shipping cost, escrow status, tracking number.

3. Security
- RLS enabled on all tables.
- All policies scoped to `anon, authenticated` (single-tenant public app).
*/

-- Artists
CREATE TABLE IF NOT EXISTS artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bio text,
  location text,
  avatar_url text,
  studio_verified boolean NOT NULL DEFAULT false,
  process_video_url text,
  total_sales integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_artists" ON artists;
CREATE POLICY "anon_read_artists" ON artists FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_artists" ON artists;
CREATE POLICY "anon_insert_artists" ON artists FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_artists" ON artists;
CREATE POLICY "anon_update_artists" ON artists FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_artists" ON artists;
CREATE POLICY "anon_delete_artists" ON artists FOR DELETE TO anon, authenticated USING (true);

-- Artworks
CREATE TABLE IF NOT EXISTS artworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid REFERENCES artists(id) ON DELETE CASCADE,
  title text NOT NULL,
  medium text NOT NULL,
  dimensions text,
  description text,
  image_url text NOT NULL,
  reserve_price numeric NOT NULL DEFAULT 0,
  starting_bid numeric NOT NULL DEFAULT 0,
  shipping_tier text NOT NULL DEFAULT 'medium_framed',
  studio_verified boolean NOT NULL DEFAULT false,
  verification_video_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE artworks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_artworks" ON artworks;
CREATE POLICY "anon_read_artworks" ON artworks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_artworks" ON artworks;
CREATE POLICY "anon_insert_artworks" ON artworks FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_artworks" ON artworks;
CREATE POLICY "anon_update_artworks" ON artworks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_artworks" ON artworks;
CREATE POLICY "anon_delete_artworks" ON artworks FOR DELETE TO anon, authenticated USING (true);

-- Auctions
CREATE TABLE IF NOT EXISTS auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_id uuid REFERENCES artworks(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'live',
  start_time timestamptz DEFAULT now(),
  end_time timestamptz NOT NULL,
  current_bid numeric NOT NULL DEFAULT 0,
  bid_count integer NOT NULL DEFAULT 0,
  is_flash boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_auctions" ON auctions;
CREATE POLICY "anon_read_auctions" ON auctions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_auctions" ON auctions;
CREATE POLICY "anon_insert_auctions" ON auctions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_auctions" ON auctions;
CREATE POLICY "anon_update_auctions" ON auctions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_auctions" ON auctions;
CREATE POLICY "anon_delete_auctions" ON auctions FOR DELETE TO anon, authenticated USING (true);

-- Bids
CREATE TABLE IF NOT EXISTS bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid REFERENCES auctions(id) ON DELETE CASCADE,
  bidder_name text NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_bids" ON bids;
CREATE POLICY "anon_read_bids" ON bids FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_bids" ON bids;
CREATE POLICY "anon_insert_bids" ON bids FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_bids" ON bids;
CREATE POLICY "anon_update_bids" ON bids FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_bids" ON bids;
CREATE POLICY "anon_delete_bids" ON bids FOR DELETE TO anon, authenticated USING (true);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid REFERENCES auctions(id) ON DELETE CASCADE,
  artwork_id uuid REFERENCES artworks(id) ON DELETE CASCADE,
  buyer_name text NOT NULL,
  amount numeric NOT NULL,
  shipping_cost numeric NOT NULL DEFAULT 0,
  shipping_tier text NOT NULL DEFAULT 'medium_framed',
  status text NOT NULL DEFAULT 'escrow',
  tracking_number text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_orders" ON orders;
CREATE POLICY "anon_read_orders" ON orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE TO anon, authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_artworks_artist_id ON artworks(artist_id);
CREATE INDEX IF NOT EXISTS idx_auctions_artwork_id ON auctions(artwork_id);
CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_bids_auction_id ON bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_orders_auction_id ON orders(auction_id);
