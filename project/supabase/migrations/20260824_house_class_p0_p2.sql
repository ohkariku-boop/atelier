-- Atelier P0–P2 house-class upgrades
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS estimate_low numeric;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS estimate_high numeric;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS lot_number integer;

ALTER TABLE auctions ADD COLUMN IF NOT EXISTS soft_close_extensions integer DEFAULT 0;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS original_end_time timestamptz;

CREATE TABLE IF NOT EXISTS lot_watches (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auction_id uuid NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, auction_id)
);
ALTER TABLE lot_watches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lot_watches_own ON lot_watches;
CREATE POLICY lot_watches_own ON lot_watches FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS journal_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  excerpt text,
  body text NOT NULL,
  cover_url text,
  published_at timestamptz DEFAULT now(),
  is_published boolean DEFAULT true
);
ALTER TABLE journal_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS journal_public_read ON journal_posts;
CREATE POLICY journal_public_read ON journal_posts FOR SELECT USING (is_published = true);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  subtitle text,
  description text,
  cover_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text DEFAULT 'open',
  highlight_artwork_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_public_read ON sales;
CREATE POLICY sales_public_read ON sales FOR SELECT USING (true);

ALTER TABLE artworks ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES sales(id);

UPDATE artworks SET
  estimate_low = ROUND(starting_bid::numeric * 0.9, 0),
  estimate_high = ROUND(COALESCE(buy_now_price, starting_bid * 1.8)::numeric, 0)
WHERE estimate_low IS NULL;

CREATE OR REPLACE FUNCTION public.apply_soft_close(p_auction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end timestamptz;
  v_ext int;
BEGIN
  SELECT end_time, COALESCE(soft_close_extensions, 0)
    INTO v_end, v_ext
  FROM auctions WHERE id = p_auction_id FOR UPDATE;
  IF v_end IS NULL THEN RETURN; END IF;
  IF v_end > now() AND v_end <= now() + interval '3 minutes' THEN
    UPDATE auctions SET
      end_time = now() + interval '3 minutes',
      soft_close_extensions = v_ext + 1,
      original_end_time = COALESCE(original_end_time, v_end)
    WHERE id = p_auction_id;
  END IF;
END;
$$;

INSERT INTO sales (slug, title, subtitle, description, starts_at, ends_at, status)
VALUES (
  'human-hands-august',
  'Human Hands — August',
  'Studio-verified physical works',
  'A curated selection of oil, charcoal, ceramic and wood works made entirely by human hands.',
  now() - interval '2 days',
  now() + interval '5 days',
  'open'
)
ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title;

INSERT INTO journal_posts (slug, title, excerpt, body) VALUES
(
  'how-studio-verification-works',
  'How Studio Verification Works',
  'Every listing on Atelier is reviewed for human authorship and physical existence.',
  'Atelier only lists physical, human-made art. Studio verification combines artist identity, process evidence, and curator review.'
),
(
  'how-estimates-work',
  'How Estimates Work on Atelier',
  'Estimates guide collectors without replacing competitive bidding.',
  'Each lot carries an estimate range — a fair market band based on medium, scale, and comparable works.'
),
(
  'buying-on-atelier',
  'A Collector''s Guide to Buying on Atelier',
  'Register, watch, bid or Buy Now, then settle and ship.',
  'Browse the Gallery Floor, watch lots, place bids or use Buy Now, then complete payment from Orders.'
)
ON CONFLICT (slug) DO NOTHING;
