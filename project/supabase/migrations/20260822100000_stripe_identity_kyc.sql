-- P0: Stripe Identity columns + kyc event log + protect KYC columns

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_identity_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_identity_last_error text,
  ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_stripe_identity_session
  ON profiles (stripe_identity_session_id)
  WHERE stripe_identity_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS kyc_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  stripe_session_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kyc_events_user ON kyc_events(user_id, created_at DESC);

ALTER TABLE kyc_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kyc_events_own_select ON kyc_events;
CREATE POLICY kyc_events_own_select ON kyc_events
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Block authenticated clients from escalating KYC fields; service_role & SECURITY DEFINER still need a bypass.
-- Service role JWT role is service_role; SECURITY DEFINER RPCs set a session flag.
CREATE OR REPLACE FUNCTION public.protect_profile_kyc_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  jwt_role text;
BEGIN
  BEGIN
    jwt_role := coalesce(auth.jwt() ->> 'role', '');
  EXCEPTION WHEN OTHERS THEN
    jwt_role := '';
  END;

  -- Allow service role (Edge Functions with service key)
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Allow when session flag set by SECURITY DEFINER RPCs
  BEGIN
    IF current_setting('atelier.kyc_admin', true) = '1' THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Revert protected columns for normal authenticated updates
  NEW.kyc_status := OLD.kyc_status;
  NEW.kyc_level := OLD.kyc_level;
  NEW.kyc_submitted_at := OLD.kyc_submitted_at;
  NEW.kyc_reviewed_at := OLD.kyc_reviewed_at;
  NEW.kyc_notes := OLD.kyc_notes;
  NEW.aml_risk_flag := OLD.aml_risk_flag;
  NEW.stripe_identity_session_id := OLD.stripe_identity_session_id;
  NEW.stripe_identity_last_error := OLD.stripe_identity_last_error;
  NEW.kyc_verified_at := OLD.kyc_verified_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_kyc ON profiles;
CREATE TRIGGER trg_protect_profile_kyc
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_kyc_columns();

-- admin_set_kyc sets flag so trigger allows change
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

  PERFORM set_config('atelier.kyc_admin', '1', true);

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
