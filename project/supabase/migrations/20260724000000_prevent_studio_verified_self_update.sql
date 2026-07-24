/*
# Prevent self-assignment of studio_verified

## Issue
Artists can update their own artist/artwork rows (ownership-scoped RLS from
the previous hardening migration), but there was no column-level restriction
on `studio_verified`. Combined with the listing-creation flow setting
`studio_verified: true` unconditionally on insert, any artist could grant
themselves the "Studio Verified" badge with zero real review — undermining
the core "Studio-verified. No AI." promise of the marketplace.

## Fix
Add a BEFORE UPDATE trigger on both `artists` and `artworks` that forces
`studio_verified` back to its previous value whenever the request comes from
the `authenticated` role. Only `service_role` (a real admin/reviewer acting
outside the client app, e.g. via a future reviewer dashboard or Edge Function)
can actually flip this flag. This mirrors the same fix pattern used for
Kongsilaa's `verified` flag.

Also resets any existing self-granted verifications back to false, since they
were never actually reviewed.
*/

CREATE OR REPLACE FUNCTION prevent_studio_verified_self_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.studio_verified IS DISTINCT FROM OLD.studio_verified
     AND current_setting('request.jwt.claims', true)::json->>'role' IS DISTINCT FROM 'service_role'
  THEN
    NEW.studio_verified := OLD.studio_verified;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_artist_self_verification ON artists;
CREATE TRIGGER prevent_artist_self_verification
  BEFORE UPDATE OF studio_verified ON artists
  FOR EACH ROW
  EXECUTE FUNCTION prevent_studio_verified_self_update();

DROP TRIGGER IF EXISTS prevent_artwork_self_verification ON artworks;
CREATE TRIGGER prevent_artwork_self_verification
  BEFORE UPDATE OF studio_verified ON artworks
  FOR EACH ROW
  EXECUTE FUNCTION prevent_studio_verified_self_update();

-- Also guard INSERT: new artwork listings can no longer set studio_verified
-- true directly from the client either.
CREATE OR REPLACE FUNCTION prevent_studio_verified_self_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.studio_verified IS TRUE
     AND current_setting('request.jwt.claims', true)::json->>'role' IS DISTINCT FROM 'service_role'
  THEN
    NEW.studio_verified := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_artwork_self_verification_insert ON artworks;
CREATE TRIGGER prevent_artwork_self_verification_insert
  BEFORE INSERT ON artworks
  FOR EACH ROW
  EXECUTE FUNCTION prevent_studio_verified_self_insert();

-- Reset any previously self-granted verifications - they were never reviewed.
UPDATE artists SET studio_verified = false WHERE studio_verified = true;
UPDATE artworks SET studio_verified = false WHERE studio_verified = true;
