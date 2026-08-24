-- =============================================================================
-- Atelier P0–P2 — house-class upgrades (estimates, sales, journal, soft-close)
-- Idempotent: safe to re-run in Supabase SQL Editor.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Columns on artworks / auctions
-- -----------------------------------------------------------------------------
ALTER TABLE public.artworks
  ADD COLUMN IF NOT EXISTS estimate_low  numeric,
  ADD COLUMN IF NOT EXISTS estimate_high numeric,
  ADD COLUMN IF NOT EXISTS lot_number    integer,
  ADD COLUMN IF NOT EXISTS sale_id       uuid;

ALTER TABLE public.auctions
  ADD COLUMN IF NOT EXISTS soft_close_extensions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_end_time     timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'artworks_estimate_range_chk'
  ) THEN
    ALTER TABLE public.artworks
      ADD CONSTRAINT artworks_estimate_range_chk
      CHECK (
        estimate_low IS NULL
        OR estimate_high IS NULL
        OR estimate_high >= estimate_low
      ) NOT VALID;
    ALTER TABLE public.artworks VALIDATE CONSTRAINT artworks_estimate_range_chk;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Named sales (create before sale_id FK)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   text NOT NULL,
  title                  text NOT NULL,
  subtitle               text,
  description            text,
  cover_url              text,
  starts_at              timestamptz,
  ends_at                timestamptz,
  status                 text NOT NULL DEFAULT 'open'
                           CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  highlight_artwork_ids  uuid[] NOT NULL DEFAULT '{}',
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_slug_key UNIQUE (slug),
  CONSTRAINT sales_dates_chk CHECK (
    starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at
  )
);

CREATE INDEX IF NOT EXISTS sales_status_starts_idx
  ON public.sales (status, starts_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS sales_slug_idx ON public.sales (slug);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_public_read ON public.sales;
CREATE POLICY sales_public_read ON public.sales
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS sales_admin_write ON public.sales;
CREATE POLICY sales_admin_write ON public.sales
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'artworks_sale_id_fkey'
  ) THEN
    ALTER TABLE public.artworks
      ADD CONSTRAINT artworks_sale_id_fkey
      FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS artworks_sale_id_idx
  ON public.artworks (sale_id)
  WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS artworks_estimate_low_idx
  ON public.artworks (estimate_low)
  WHERE estimate_low IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Lot watches
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lot_watches (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, auction_id)
);

CREATE INDEX IF NOT EXISTS lot_watches_auction_idx ON public.lot_watches (auction_id);
CREATE INDEX IF NOT EXISTS lot_watches_user_created_idx
  ON public.lot_watches (user_id, created_at DESC);

ALTER TABLE public.lot_watches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lot_watches_own ON public.lot_watches;
DROP POLICY IF EXISTS lot_watches_select_own ON public.lot_watches;
DROP POLICY IF EXISTS lot_watches_insert_own ON public.lot_watches;
DROP POLICY IF EXISTS lot_watches_delete_own ON public.lot_watches;

CREATE POLICY lot_watches_select_own ON public.lot_watches
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY lot_watches_insert_own ON public.lot_watches
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY lot_watches_delete_own ON public.lot_watches
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 4. Journal
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL,
  title        text NOT NULL,
  excerpt      text,
  body         text NOT NULL,
  cover_url    text,
  published_at timestamptz NOT NULL DEFAULT now(),
  is_published boolean NOT NULL DEFAULT true,
  CONSTRAINT journal_posts_slug_key UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS journal_posts_published_idx
  ON public.journal_posts (published_at DESC)
  WHERE is_published;

ALTER TABLE public.journal_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_public_read ON public.journal_posts;
CREATE POLICY journal_public_read ON public.journal_posts
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS journal_admin_write ON public.journal_posts;
CREATE POLICY journal_admin_write ON public.journal_posts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Soft-close (returns new end_time or current end_time)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_soft_close(p_auction_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end      timestamptz;
  v_ext      integer;
  v_status   text;
  v_new_end  timestamptz;
  c_window   constant interval := interval '3 minutes';
  c_max_ext  constant integer  := 20;
BEGIN
  SELECT end_time, COALESCE(soft_close_extensions, 0), status
    INTO v_end, v_ext, v_status
  FROM public.auctions
  WHERE id = p_auction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_status IS DISTINCT FROM 'live' AND v_status IS DISTINCT FROM 'flash' THEN
    RETURN v_end;
  END IF;

  IF v_end IS NULL OR v_end <= now() OR v_end > now() + c_window THEN
    RETURN v_end;
  END IF;

  IF v_ext >= c_max_ext THEN
    RETURN v_end;
  END IF;

  v_new_end := now() + c_window;

  UPDATE public.auctions SET
    end_time = v_new_end,
    soft_close_extensions = v_ext + 1,
    original_end_time = COALESCE(original_end_time, v_end)
  WHERE id = p_auction_id;

  RETURN v_new_end;
END;
$$;

COMMENT ON FUNCTION public.apply_soft_close(uuid) IS
  'Anti-snipe: live/flash lots within 3 minutes of close extend to now()+3m (max 20).';

REVOKE ALL ON FUNCTION public.apply_soft_close(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_soft_close(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Seed estimates (null-only, valid starting_bid)
-- -----------------------------------------------------------------------------
UPDATE public.artworks a
SET
  estimate_low  = ROUND(GREATEST(a.starting_bid::numeric, 0) * 0.90, 0),
  estimate_high = ROUND(
    GREATEST(
      COALESCE(NULLIF(a.buy_now_price, 0), a.starting_bid::numeric * 1.80),
      GREATEST(a.starting_bid::numeric, 0) * 0.90
    ),
    0
  )
WHERE a.estimate_low IS NULL
  AND a.starting_bid IS NOT NULL
  AND a.starting_bid > 0;

-- -----------------------------------------------------------------------------
-- 7. Default sale, highlights, lot numbers
-- -----------------------------------------------------------------------------
INSERT INTO public.sales (slug, title, subtitle, description, starts_at, ends_at, status)
VALUES (
  'human-hands-august',
  'Human Hands — August',
  'Studio-verified physical works',
  'A curated selection of oil, charcoal, ceramic and wood works made entirely by human hands.',
  now() - interval '2 days',
  now() + interval '5 days',
  'open'
)
ON CONFLICT (slug) DO UPDATE SET
  title       = EXCLUDED.title,
  subtitle    = EXCLUDED.subtitle,
  description = EXCLUDED.description,
  status      = EXCLUDED.status;

WITH sale AS (
  SELECT id FROM public.sales WHERE slug = 'human-hands-august'
),
live_art AS (
  SELECT * FROM (
    SELECT
      aw.id,
      aw.image_url,
      row_number() OVER (ORDER BY a.bid_count DESC NULLS LAST, a.created_at) AS rn
    FROM public.auctions a
    JOIN public.artworks aw ON aw.id = a.artwork_id
    WHERE a.status IN ('live', 'flash')
  ) x
  WHERE rn <= 6
),
agg AS (
  SELECT
    array_agg(id ORDER BY rn) AS ids,
    (array_agg(image_url ORDER BY rn))[1] AS cover
  FROM live_art
)
UPDATE public.sales s
SET
  highlight_artwork_ids = COALESCE(agg.ids, '{}'),
  cover_url = COALESCE(agg.cover, s.cover_url)
FROM sale, agg
WHERE s.id = sale.id;

UPDATE public.artworks aw
SET sale_id = s.id
FROM public.sales s
WHERE s.slug = 'human-hands-august'
  AND aw.sale_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.auctions a
    WHERE a.artwork_id = aw.id
      AND a.status IN ('live', 'flash', 'upcoming')
  );

WITH ranked AS (
  SELECT
    aw.id AS artwork_id,
    row_number() OVER (
      PARTITION BY COALESCE(aw.sale_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY a.created_at, aw.created_at
    ) AS rn
  FROM public.artworks aw
  JOIN public.auctions a ON a.artwork_id = aw.id
  WHERE a.status IN ('live', 'flash', 'upcoming')
)
UPDATE public.artworks aw
SET lot_number = ranked.rn
FROM ranked
WHERE aw.id = ranked.artwork_id
  AND (aw.lot_number IS DISTINCT FROM ranked.rn);

-- -----------------------------------------------------------------------------
-- 8. Journal seed (insert-only)
-- -----------------------------------------------------------------------------
INSERT INTO public.journal_posts (slug, title, excerpt, body, published_at) VALUES
(
  'how-studio-verification-works',
  'How Studio Verification Works',
  'Every listing on Atelier is reviewed for human authorship and physical existence.',
  $b$Atelier only lists physical, human-made art. Studio verification combines artist identity, process evidence, and curator review.

Artists submit work-in-progress photos or live process video. Our team (or the licensed operator on House Mode) confirms the work matches the medium and description before it goes live on the floor.

Verified lots carry the Studio Verified badge — our analogue to a specialist guarantee.$b$,
  now() - interval '20 days'
),
(
  'how-estimates-work',
  'How Estimates Work on Atelier',
  'Estimates guide collectors without replacing competitive bidding.',
  $b$Each lot carries an estimate range — a fair market band based on medium, scale, and comparable works.

The starting bid may sit near the low estimate. Buy Now, when offered, sits above the competitive range so collectors who want certainty can transact immediately.

Estimates are guidance, not a guarantee of sale price.$b$,
  now() - interval '10 days'
),
(
  'buying-on-atelier',
  'A Collector''s Guide to Buying on Atelier',
  'Register, watch, bid or Buy Now, then settle and ship.',
  $b$1. Create an account and complete any verification your operator requires.
2. Browse the Gallery Floor or a named sale.
3. Watch lots you care about.
4. Place bids before the countdown ends — late bids may extend the clock (soft close).
5. Or use Buy Now when available.
6. Complete payment and track shipping from Orders.

Fees and conditions of sale are published under How to Buy.$b$,
  now() - interval '5 days'
)
ON CONFLICT (slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 9. Grants
-- -----------------------------------------------------------------------------
GRANT SELECT ON public.sales TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.lot_watches TO authenticated;
GRANT SELECT ON public.journal_posts TO anon, authenticated;

COMMIT;
