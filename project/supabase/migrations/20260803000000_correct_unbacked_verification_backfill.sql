/*
# Correct a flawed backfill: don't claim a verification method with no evidence behind it

## The mistake
20260802000000 backfilled `verification_method = 'live_video'` for every row
where `studio_verified = true` and `verification_method` was NULL - to
satisfy the new "verified requires a method" constraint. That was too
generous an assumption: some of those rows (e.g. seed/demo artworks marked
verified with no video, no evidence_items, nothing on file at all) got
labeled as video-verified when there's no video and never was one. That's
the exact kind of overclaim the whole verification_method feature exists to
prevent - visible on "Whispers of Dawn," which now honestly shows "No
verification video was uploaded for this piece" directly contradicting its
own "Studio Verified" badge.

## The fix
For any artwork where verification_method = 'live_video' but there is no
actual verification_video_url on file, and no evidence_items either - there
is nothing to point to backing the claim. Demote these back to unverified
rather than let an unbacked claim stand. This is intentionally conservative:
it only demotes rows with truly no evidence of any kind, not rows that just
have a different evidence type.

Going forward, the reviewer sets verification_method explicitly and
deliberately per the internal checklist - no more blanket assumptions.
*/

UPDATE artworks
SET studio_verified = false,
    verification_method = NULL,
    verified_at = NULL
WHERE verification_method = 'live_video'
  AND verification_video_url IS NULL
  AND (evidence_items IS NULL OR evidence_items = '[]'::jsonb);
