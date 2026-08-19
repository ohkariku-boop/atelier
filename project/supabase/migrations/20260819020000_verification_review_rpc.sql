/*
# Verification review RPC + optional admin role

Artists cannot self-verify (existing triggers). Until now, approval was a
manual service_role UPDATE with no notification and no structured queue.

This migration adds:

1. profiles.role may be 'admin' (in addition to buyer/artist)
2. review_artwork_verification() — approve or reject a pending listing
3. Seller notification on approve / reject
4. verified_at stamped on approve

Who can call the RPC:
  - service_role (dashboard / scripts), or
  - an authenticated user whose profile.role = 'admin'
*/

-- Allow admin role on profiles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('buyer', 'artist', 'admin'));

CREATE OR REPLACE FUNCTION review_artwork_verification(
  p_artwork_id uuid,
  p_approve boolean,
  p_method text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artwork RECORD;
  v_caller_role text;
  v_is_service boolean;
  v_method text;
BEGIN
  v_is_service := coalesce(
    current_setting('request.jwt.claims', true)::json->>'role',
    ''
  ) = 'service_role';

  IF NOT v_is_service THEN
    SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
    IF v_caller_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only platform admins can review verification';
    END IF;
  END IF;

  SELECT * INTO v_artwork FROM artworks WHERE id = p_artwork_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artwork not found';
  END IF;

  IF p_approve THEN
    v_method := coalesce(
      nullif(trim(p_method), ''),
      v_artwork.requested_verification_method,
      v_artwork.verification_method,
      'evidence_based'
    );

    IF v_method NOT IN ('live_video', 'evidence_based', 'studio_partner') THEN
      RAISE EXCEPTION 'Invalid verification method: %', v_method;
    END IF;

    UPDATE artworks SET
      studio_verified = true,
      verification_method = v_method,
      verified_at = now()
    WHERE id = p_artwork_id;

    IF v_artwork.user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, artwork_id)
      VALUES (
        v_artwork.user_id,
        'verification_approved',
        'Listing verified',
        '"' || v_artwork.title || '" is now studio-verified. You can start an auction from the Studio Desk.',
        p_artwork_id
      );
    END IF;

    RETURN jsonb_build_object(
      'status', 'approved',
      'artwork_id', p_artwork_id,
      'verification_method', v_method
    );
  ELSE
    -- Reject: clear verification flags; keep evidence for resubmission
    UPDATE artworks SET
      studio_verified = false,
      verification_method = NULL,
      verified_at = NULL
    WHERE id = p_artwork_id;

    IF v_artwork.user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, artwork_id)
      VALUES (
        v_artwork.user_id,
        'verification_rejected',
        'Verification needs attention',
        '"' || v_artwork.title || '" was not approved.' ||
          CASE WHEN p_notes IS NOT NULL AND length(trim(p_notes)) > 0
            THEN ' Note: ' || trim(p_notes)
            ELSE ' Please update your evidence or verification method and resubmit.'
          END,
        p_artwork_id
      );
    END IF;

    RETURN jsonb_build_object(
      'status', 'rejected',
      'artwork_id', p_artwork_id,
      'notes', p_notes
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION review_artwork_verification(uuid, boolean, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION review_artwork_verification(uuid, boolean, text, text) TO authenticated;
-- service_role always can execute SECURITY DEFINER functions
