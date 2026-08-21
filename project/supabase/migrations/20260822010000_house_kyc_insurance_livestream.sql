-- House mode (multi-tenant brand)
CREATE TABLE IF NOT EXISTS houses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text,
  logo_url text,
  primary_color text DEFAULT '#1a1917',
  accent_color text DEFAULT '#c45c3e',
  custom_domain text,
  fee_bps integer NOT NULL DEFAULT 1000 CHECK (fee_bps >= 0 AND fee_bps <= 5000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE artworks ADD COLUMN IF NOT EXISTS house_id uuid REFERENCES houses(id) ON DELETE SET NULL;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS house_id uuid REFERENCES houses(id) ON DELETE SET NULL;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS live_stream_url text;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS live_stream_active boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_artworks_house ON artworks(house_id);
CREATE INDEX IF NOT EXISTS idx_auctions_house ON auctions(house_id);

ALTER TABLE houses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS houses_public_read ON houses;
CREATE POLICY houses_public_read ON houses FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- KYC / AML
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'none'
  CHECK (kyc_status IN ('none', 'pending', 'verified', 'rejected', 'restricted'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kyc_level text DEFAULT 'standard'
  CHECK (kyc_level IS NULL OR kyc_level IN ('standard', 'enhanced', 'institutional'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kyc_reviewed_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kyc_notes text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS aml_risk_flag boolean NOT NULL DEFAULT false;

-- High-value bid gate helper (amount threshold in currency units)
CREATE OR REPLACE FUNCTION public.bidder_kyc_ok(p_amount numeric)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_restricted boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SELECT kyc_status, aml_risk_flag INTO v_status, v_restricted
  FROM profiles WHERE id = auth.uid();
  IF v_restricted THEN
    RETURN false;
  END IF;
  -- Bids at or above 10_000 require verified KYC
  IF p_amount >= 10000 AND COALESCE(v_status, 'none') IS DISTINCT FROM 'verified' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.bidder_kyc_ok(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bidder_kyc_ok(numeric) TO authenticated;

-- Insurance on orders / artworks
ALTER TABLE orders ADD COLUMN IF NOT EXISTS insurance_certificate_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS insured_value numeric;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS insurance_certificate_url text;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS suggested_insurance_value numeric;

-- Admin set KYC
CREATE OR REPLACE FUNCTION public.admin_set_kyc(
  p_user_id uuid,
  p_status text,
  p_level text DEFAULT 'standard',
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_status NOT IN ('none', 'pending', 'verified', 'rejected', 'restricted') THEN
    RAISE EXCEPTION 'Invalid kyc status';
  END IF;
  UPDATE profiles SET
    kyc_status = p_status,
    kyc_level = COALESCE(p_level, kyc_level, 'standard'),
    kyc_notes = COALESCE(p_notes, kyc_notes),
    kyc_reviewed_at = now(),
    aml_risk_flag = CASE WHEN p_status = 'restricted' THEN true ELSE aml_risk_flag END
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_kyc(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_kyc(uuid, text, text, text) TO authenticated;

-- User submits KYC for review
CREATE OR REPLACE FUNCTION public.submit_kyc_for_review(p_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE profiles SET
    kyc_status = 'pending',
    kyc_submitted_at = now(),
    kyc_notes = COALESCE(p_notes, kyc_notes)
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.submit_kyc_for_review(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_kyc_for_review(text) TO authenticated;

-- Seed default house (Atelier main)
INSERT INTO houses (slug, name, tagline, primary_color, accent_color)
VALUES ('atelier', 'Atelier', 'Human-made · Studio-verified · Live', '#1a1917', '#c45c3e')
ON CONFLICT (slug) DO NOTHING;
