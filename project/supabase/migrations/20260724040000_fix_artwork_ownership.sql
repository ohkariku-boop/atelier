/*
# Fix artwork ownership (user_id) to match the real owning artist

## Root cause
The earlier security-hardening migration blanket-assigned every
previously-ownerless artwork's user_id to one demo account (Elena's),
regardless of which artist actually made the piece:

    UPDATE artworks SET user_id = v_elena_id WHERE user_id IS NULL;

This meant every artist's Studio Desk dashboard - which filters by
user_id = the logged-in user - only ever worked correctly for Elena.
Every other artist (confirmed with real data: Julian Thorne specifically)
saw 0 listings despite artist_id correctly attributing pieces to them,
because the ownership/permission column (user_id) didn't match their own
login.

## Fix
Confirmed via direct query that this project's design uses the same UUID
for both an artist's auth login (profiles.id) and their public artist
profile (artists.id / artworks.artist_id) - they are literally the same
value for every real artist account. That makes the fix safe and exact:
realign every artwork's user_id to match its own artist_id directly, no
separate lookup needed.

This also fixes the underlying RLS permission issue, not just the
dashboard's display query - owner_update_artworks and related policies
check auth.uid() = user_id, so this is what actually restores each
artist's ability to manage their own listings, not just see them.

Idempotent / safe to re-run: only touches rows where user_id is
currently different from artist_id.
*/

UPDATE artworks
SET user_id = artist_id
WHERE user_id IS DISTINCT FROM artist_id;
