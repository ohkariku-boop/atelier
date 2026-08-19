/*
# Artist follows + curated collections

## Tables
- artist_follows: user follows an artist (buyer or any authenticated user)
- collections: named curated sets (admin or system); public read
- collection_items: artworks in a collection

## RPCs
- toggle_follow_artist(artist_id)
- is handled client-side with insert/delete under RLS
*/

CREATE TABLE IF NOT EXISTS artist_follows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, artist_id)
);
ALTER TABLE artist_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_select_own" ON artist_follows;
CREATE POLICY "follows_select_own" ON artist_follows
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "follows_select_public_count" ON artist_follows;
CREATE POLICY "follows_select_public_count" ON artist_follows
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "follows_insert_own" ON artist_follows;
CREATE POLICY "follows_insert_own" ON artist_follows
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "follows_delete_own" ON artist_follows;
CREATE POLICY "follows_delete_own" ON artist_follows
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_artist_follows_artist ON artist_follows(artist_id);

CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  cover_image_url text,
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collections_public_read" ON collections;
CREATE POLICY "collections_public_read" ON collections
  FOR SELECT TO anon, authenticated USING (is_published = true);

DROP POLICY IF EXISTS "collections_admin_all" ON collections;
CREATE POLICY "collections_admin_all" ON collections
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  artwork_id uuid NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, artwork_id)
);
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collection_items_public_read" ON collection_items;
CREATE POLICY "collection_items_public_read" ON collection_items
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collections c
      WHERE c.id = collection_id AND c.is_published = true
    )
  );

DROP POLICY IF EXISTS "collection_items_admin_all" ON collection_items;
CREATE POLICY "collection_items_admin_all" ON collection_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Seed a starter published collection (empty items; admin can fill)
INSERT INTO collections (slug, title, description, is_published, sort_order)
VALUES (
  'human-hands',
  'Made by Human Hands',
  'A rotating selection of studio-verified works from the Gallery Floor.',
  true,
  0
)
ON CONFLICT (slug) DO NOTHING;
