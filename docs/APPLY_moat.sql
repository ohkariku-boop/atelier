-- Moat: condition report, provenance events, ensure COA fields

ALTER TABLE artworks ADD COLUMN IF NOT EXISTS condition_report text;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS condition_grade text
  CHECK (condition_grade IS NULL OR condition_grade IN ('excellent', 'good', 'fair', 'restored'));
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS year_created text;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS public_verify_slug text UNIQUE;

-- Provenance timeline events
CREATE TABLE IF NOT EXISTS provenance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_id uuid NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  detail text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provenance_artwork ON provenance_events(artwork_id, occurred_at);

ALTER TABLE provenance_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provenance_public_read ON provenance_events;
CREATE POLICY provenance_public_read ON provenance_events
  FOR SELECT TO anon, authenticated USING (true);

-- Collector vault: completed/escrow orders visible as holdings
-- (no new table required; query orders by user)

-- Auto-issue certificate number on verification approve if missing
CREATE OR REPLACE FUNCTION public.issue_certificate_if_needed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.studio_verified IS TRUE
     AND (OLD.studio_verified IS DISTINCT FROM TRUE)
     AND (NEW.certificate_number IS NULL OR NEW.certificate_number = '') THEN
    NEW.certificate_number := 'ATL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    NEW.certificate_issued_at := now();
    IF NEW.public_verify_slug IS NULL THEN
      NEW.public_verify_slug := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_issue_certificate ON artworks;
CREATE TRIGGER trg_issue_certificate
  BEFORE UPDATE OF studio_verified ON artworks
  FOR EACH ROW
  EXECUTE FUNCTION public.issue_certificate_if_needed();

-- Record provenance on verification
CREATE OR REPLACE FUNCTION public.log_verification_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.studio_verified IS TRUE AND (OLD.studio_verified IS DISTINCT FROM TRUE) THEN
    INSERT INTO provenance_events (artwork_id, event_type, title, detail, occurred_at, actor_label, metadata)
    VALUES (
      NEW.id,
      'verified',
      'Studio verification cleared',
      'Method: ' || COALESCE(NEW.verification_method, 'unspecified'),
      COALESCE(NEW.verified_at, now()),
      'Atelier',
      jsonb_build_object('verification_method', NEW.verification_method, 'certificate_number', NEW.certificate_number)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_verification_provenance ON artworks;
CREATE TRIGGER trg_log_verification_provenance
  AFTER UPDATE OF studio_verified ON artworks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_verification_provenance();
