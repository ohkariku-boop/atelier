/*
# Multiple verification methods for artwork authenticity

## Context
Live process video only works for pieces filmed during creation. Two real
cases it misses:
1. Already-completed work an artist brings to the platform after the fact
   (no video exists, and never will).
2. Artists who don't want to be on camera or show their face - the video
   requirement was accidentally also a face-visibility requirement, which
   isn't actually necessary (hands/tools-only footage was always enough,
   it just wasn't offered as an explicit option).

## Design
`verification_method` records HOW a piece was verified, once it has been.
It sits alongside `studio_verified` (the existing yes/no gate) rather than
replacing it - `studio_verified` stays the single source of truth for
"is this listing allowed to show the verified badge," and
`verification_method` explains which of three ways got it there:

  - 'live_video'      : existing flow, video recorded during creation.
                         Hands/tools-only footage counts - no face required.
  - 'evidence_based'   : retroactive evidence for already-completed work -
                         dated WIP photos, sketches, source/layer files,
                         material receipts. Stored in `evidence_items`.
  - 'studio_partner'   : a partner studio/gallery or Atelier team member
                         vouches in person. No file evidence required by
                         definition; `evidence_items` may be empty.

`requested_verification_method` is separate and artist-writable - it's
just what the artist is asking for, not a granted status. Joe (or a future
reviewer) reviews `evidence_items` / the partner vouch and sets
`verification_method` + `studio_verified` together, same manual process
already used for the existing studio_verified review.

`evidence_items` is artist-writable (it's just supporting material, not a
trust claim by itself) - only `verification_method` and `studio_verified`
are locked down.

## Security
Extends the existing prevent_studio_verified_self_update /
prevent_studio_verified_self_insert triggers (see
20260724000000_prevent_studio_verified_self_update.sql) to also guard
`verification_method`, so an artist can't just self-declare
'studio_partner' the same way they previously couldn't self-declare
studio_verified = true.
*/

ALTER TABLE artworks ADD COLUMN IF NOT EXISTS verification_method text
  CHECK (verification_method IS NULL OR verification_method IN ('live_video', 'evidence_based', 'studio_partner'));
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS requested_verification_method text
  CHECK (requested_verification_method IS NULL OR requested_verification_method IN ('live_video', 'evidence_based', 'studio_partner'));
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS evidence_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: any artwork that already has a verification video was verified
-- via that method.
UPDATE artworks SET verification_method = 'live_video'
  WHERE verification_video_url IS NOT NULL AND verification_method IS NULL;

CREATE OR REPLACE FUNCTION prevent_studio_verified_self_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_service_role boolean;
BEGIN
  v_is_service_role := current_setting('request.jwt.claims', true)::json->>'role' = 'service_role';

  IF NOT v_is_service_role THEN
    IF NEW.studio_verified IS DISTINCT FROM OLD.studio_verified THEN
      NEW.studio_verified := OLD.studio_verified;
    END IF;
    IF NEW.verification_method IS DISTINCT FROM OLD.verification_method THEN
      NEW.verification_method := OLD.verification_method;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_artwork_self_verification ON artworks;
CREATE TRIGGER prevent_artwork_self_verification
  BEFORE UPDATE OF studio_verified, verification_method ON artworks
  FOR EACH ROW
  EXECUTE FUNCTION prevent_studio_verified_self_update();

CREATE OR REPLACE FUNCTION prevent_studio_verified_self_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_service_role boolean;
BEGIN
  v_is_service_role := current_setting('request.jwt.claims', true)::json->>'role' = 'service_role';

  IF NOT v_is_service_role THEN
    IF NEW.studio_verified IS TRUE THEN
      NEW.studio_verified := false;
    END IF;
    NEW.verification_method := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_artwork_self_verification_insert ON artworks;
CREATE TRIGGER prevent_artwork_self_verification_insert
  BEFORE INSERT ON artworks
  FOR EACH ROW
  EXECUTE FUNCTION prevent_studio_verified_self_insert();

/*
Manual review, once evidence or a partner request comes in:

  UPDATE artworks
  SET studio_verified = true, verification_method = 'evidence_based'
  WHERE id = '<artwork_id>';

Run via the Supabase SQL Editor (which executes as service_role and
bypasses the trigger's restriction, same as the existing studio_verified
review process).
*/
