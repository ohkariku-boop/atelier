/*
# Production hardening: auth, ownership-scoped RLS, atomic bid RPC, storage, realtime

## Summary
Adds authentication support with user profiles, rewrites all RLS policies to be
ownership-scoped, creates an atomic bid placement RPC with anti-snipe protection,
sets up Supabase Storage for file uploads, and enables realtime subscriptions.

## New Tables
- `profiles`: Links authenticated users to display names and roles (artist/buyer).
  - `id` (uuid, PK, FK to auth.users)
  - `display_name` (text, the user's public display name)
  - `role` (text, 'buyer' or 'artist')
  - `artist_id` (uuid, nullable, FK to artists — set when role is 'artist')
  - `created_at` (timestamptz)

## Modified Tables
- `artworks`: Added `user_id` (uuid, DEFAULT auth.uid()) — the artist who owns this listing.
- `bids`: Added `user_id` (uuid, DEFAULT auth.uid()) — the bidder who placed this bid.
- `orders`: Added `user_id` (uuid, DEFAULT auth.uid()) — the buyer who owns this order.

## New Functions
- `place_bid(p_auction_id uuid, p_amount numeric, p_bidder_name text) RETURNS jsonb`:
  SECURITY DEFINER function that atomically:
  1. Locks the auction row (FOR UPDATE) to prevent race conditions
  2. Validates the auction is active and the bid exceeds the current bid
  3. Inserts the bid record
  4. Updates the auction's current_bid and bid_count
  5. If in the final 30 seconds, extends end_time by 2 minutes (anti-snipe)
  Returns: { new_end_time, anti_snipe_triggered }

## Storage
- Created `artwork-uploads` bucket (public read, authenticated write)
- Policies: anyone can read, authenticated users can upload/update/delete

## Realtime
- Added `auctions` and `bids` tables to `supabase_realtime` publication

## Security Changes (RLS)
All policies rewritten from wide-open USING(true) to ownership-scoped:
- Public read (anon + authenticated): artists, artworks, auctions, bids
- Authenticated writes with ownership: artworks, auctions, bids
- Private (authenticated, owner-only): profiles, orders

## Demo Users
- elena@atelier.demo / password123 (artist, linked to Elena Marchetti)
- collector@atelier.demo / password123 (buyer)
Existing artworks assigned to Elena. Existing orders/bids assigned to collector.
*/

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'artist')),
  artist_id uuid REFERENCES artists(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Add user_id columns to existing tables
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE bids ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();

-- 3. Create demo auth users + profiles + link existing data
DO $$
DECLARE
  v_elena_id uuid;
  v_collector_id uuid;
  v_elena_artist_id uuid;
BEGIN
  -- Get or create Elena auth user
  SELECT id INTO v_elena_id FROM auth.users WHERE email = 'elena@atelier.demo';
  IF v_elena_id IS NULL THEN
    v_elena_id := gen_random_uuid();
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (v_elena_id, 'authenticated', 'authenticated', 'elena@atelier.demo', crypt('password123', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb);
  END IF;

  -- Get or create collector auth user
  SELECT id INTO v_collector_id FROM auth.users WHERE email = 'collector@atelier.demo';
  IF v_collector_id IS NULL THEN
    v_collector_id := gen_random_uuid();
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (v_collector_id, 'authenticated', 'authenticated', 'collector@atelier.demo', crypt('password123', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb);
  END IF;

  -- Get Elena's artist ID
  SELECT id INTO v_elena_artist_id FROM artists WHERE name = 'Elena Marchetti';

  -- Create profiles
  INSERT INTO profiles (id, display_name, role, artist_id)
  VALUES (v_elena_id, 'Elena Marchetti', 'artist', v_elena_artist_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, display_name, role)
  VALUES (v_collector_id, 'Art Collector', 'buyer')
  ON CONFLICT (id) DO NOTHING;

  -- Assign all existing artworks to Elena
  UPDATE artworks SET user_id = v_elena_id WHERE user_id IS NULL;

  -- Assign all existing orders to collector
  UPDATE orders SET user_id = v_collector_id WHERE user_id IS NULL;

  -- Assign all existing bids to collector
  UPDATE bids SET user_id = v_collector_id WHERE user_id IS NULL;
END $$;

-- 4. Drop ALL old RLS policies (wide-open anon policies)
DROP POLICY IF EXISTS "anon_read_artists" ON artists;
DROP POLICY IF EXISTS "anon_insert_artists" ON artists;
DROP POLICY IF EXISTS "anon_update_artists" ON artists;
DROP POLICY IF EXISTS "anon_delete_artists" ON artists;
DROP POLICY IF EXISTS "anon_read_artworks" ON artworks;
DROP POLICY IF EXISTS "anon_insert_artworks" ON artworks;
DROP POLICY IF EXISTS "anon_update_artworks" ON artworks;
DROP POLICY IF EXISTS "anon_delete_artworks" ON artworks;
DROP POLICY IF EXISTS "anon_read_auctions" ON auctions;
DROP POLICY IF EXISTS "anon_insert_auctions" ON auctions;
DROP POLICY IF EXISTS "anon_update_auctions" ON auctions;
DROP POLICY IF EXISTS "anon_delete_auctions" ON auctions;
DROP POLICY IF EXISTS "anon_read_bids" ON bids;
DROP POLICY IF EXISTS "anon_insert_bids" ON bids;
DROP POLICY IF EXISTS "anon_update_bids" ON bids;
DROP POLICY IF EXISTS "anon_delete_bids" ON bids;
DROP POLICY IF EXISTS "anon_read_orders" ON orders;
DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
DROP POLICY IF EXISTS "anon_update_orders" ON orders;
DROP POLICY IF EXISTS "anon_delete_orders" ON orders;

-- 5. Create new ownership-scoped RLS policies

-- profiles (private: only owner can CRUD)
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- artists (public read, authenticated write with ownership via profile link)
DROP POLICY IF EXISTS "public_read_artists" ON artists;
CREATE POLICY "public_read_artists" ON artists FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_artists" ON artists;
CREATE POLICY "auth_insert_artists" ON artists FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "owner_update_artists" ON artists;
CREATE POLICY "owner_update_artists" ON artists FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.artist_id = artists.id AND profiles.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.artist_id = artists.id AND profiles.id = auth.uid()));
DROP POLICY IF EXISTS "owner_delete_artists" ON artists;
CREATE POLICY "owner_delete_artists" ON artists FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.artist_id = artists.id AND profiles.id = auth.uid()));

-- artworks (public read, owner-scoped writes)
DROP POLICY IF EXISTS "public_read_artworks" ON artworks;
CREATE POLICY "public_read_artworks" ON artworks FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "owner_insert_artworks" ON artworks;
CREATE POLICY "owner_insert_artworks" ON artworks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner_update_artworks" ON artworks;
CREATE POLICY "owner_update_artworks" ON artworks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner_delete_artworks" ON artworks;
CREATE POLICY "owner_delete_artworks" ON artworks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- auctions (public read, artwork-owner-scoped writes)
DROP POLICY IF EXISTS "public_read_auctions" ON auctions;
CREATE POLICY "public_read_auctions" ON auctions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "owner_insert_auctions" ON auctions;
CREATE POLICY "owner_insert_auctions" ON auctions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM artworks WHERE artworks.id = auctions.artwork_id AND artworks.user_id = auth.uid()));
DROP POLICY IF EXISTS "owner_update_auctions" ON auctions;
CREATE POLICY "owner_update_auctions" ON auctions FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM artworks WHERE artworks.id = auctions.artwork_id AND artworks.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM artworks WHERE artworks.id = auctions.artwork_id AND artworks.user_id = auth.uid()));
DROP POLICY IF EXISTS "owner_delete_auctions" ON auctions;
CREATE POLICY "owner_delete_auctions" ON auctions FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM artworks WHERE artworks.id = auctions.artwork_id AND artworks.user_id = auth.uid()));

-- bids (public read, authenticated insert with ownership)
DROP POLICY IF EXISTS "public_read_bids" ON bids;
CREATE POLICY "public_read_bids" ON bids FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "owner_insert_bids" ON bids;
CREATE POLICY "owner_insert_bids" ON bids FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner_update_bids" ON bids;
CREATE POLICY "owner_update_bids" ON bids FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner_delete_bids" ON bids;
CREATE POLICY "owner_delete_bids" ON bids FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- orders (private: only owner can CRUD)
DROP POLICY IF EXISTS "owner_read_orders" ON orders;
CREATE POLICY "owner_read_orders" ON orders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner_insert_orders" ON orders;
CREATE POLICY "owner_insert_orders" ON orders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner_update_orders" ON orders;
CREATE POLICY "owner_update_orders" ON orders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner_delete_orders" ON orders;
CREATE POLICY "owner_delete_orders" ON orders FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- 6. Create atomic place_bid RPC (SECURITY DEFINER, bypasses RLS for cross-table update)
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id uuid,
  p_amount numeric,
  p_bidder_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auction RECORD;
  v_new_end_time timestamptz;
  v_anti_snipe boolean := false;
BEGIN
  -- Lock the auction row for atomic operation (prevents race conditions)
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auction not found';
  END IF;

  IF v_auction.status NOT IN ('live', 'flash') THEN
    RAISE EXCEPTION 'Auction is not active';
  END IF;

  IF v_auction.end_time <= now() THEN
    RAISE EXCEPTION 'Auction has ended';
  END IF;

  IF p_amount <= v_auction.current_bid THEN
    RAISE EXCEPTION 'Bid must be higher than current bid of %', v_auction.current_bid;
  END IF;

  -- Anti-snipe: if in final 30 seconds, extend by 2 minutes
  v_new_end_time := v_auction.end_time;
  IF v_auction.end_time - now() < interval '30 seconds' THEN
    v_new_end_time := now() + interval '2 minutes';
    v_anti_snipe := true;
  END IF;

  -- Insert the bid
  INSERT INTO bids (auction_id, bidder_name, amount, user_id)
  VALUES (p_auction_id, p_bidder_name, p_amount, auth.uid());

  -- Update the auction atomically
  UPDATE auctions
  SET current_bid = p_amount,
      bid_count = bid_count + 1,
      end_time = v_new_end_time
  WHERE id = p_auction_id;

  RETURN jsonb_build_object(
    'new_end_time', v_new_end_time,
    'anti_snipe_triggered', v_anti_snipe
  );
END;
$$;

-- Restrict RPC to authenticated users only
REVOKE EXECUTE ON FUNCTION place_bid(uuid, numeric, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION place_bid(uuid, numeric, text) TO authenticated;

-- 7. Create storage bucket for file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('artwork-uploads', 'artwork-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "public_read_uploads" ON storage.objects;
CREATE POLICY "public_read_uploads" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'artwork-uploads');

DROP POLICY IF EXISTS "auth_upload_uploads" ON storage.objects;
CREATE POLICY "auth_upload_uploads" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'artwork-uploads');

DROP POLICY IF EXISTS "auth_update_uploads" ON storage.objects;
CREATE POLICY "auth_update_uploads" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'artwork-uploads')
  WITH CHECK (bucket_id = 'artwork-uploads');

DROP POLICY IF EXISTS "auth_delete_uploads" ON storage.objects;
CREATE POLICY "auth_delete_uploads" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'artwork-uploads');

-- 8. Enable realtime on auctions and bids tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'auctions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE auctions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bids'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bids;
  END IF;
END $$;
