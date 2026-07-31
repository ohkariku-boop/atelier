/*
# View counts and likes for artworks

## Design
- `view_count` is a simple counter, incremented via RPC on page load.
  No auth required to view, so no auth required to increment - this is
  cosmetic engagement data, not a trust signal, so a small amount of
  over-counting from refreshes is an acceptable v1 tradeoff.
- `like_count` is a denormalized counter kept in sync with the
  `artwork_likes` join table, which requires auth (so a like can be
  toggled on/off per user, and can't be spammed anonymously).
- Deliberately NOT surfaced anywhere near the verification badge or
  used in any sort/ranking logic - likes are cosmetic social proof, not
  a trust or quality signal, and mixing the two would blur the one
  signal on this platform that's actually supposed to mean something.
*/

ALTER TABLE artworks ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS artwork_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_id uuid REFERENCES artworks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (artwork_id, user_id)
);

ALTER TABLE artwork_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_likes" ON artwork_likes;
CREATE POLICY "read_own_likes" ON artwork_likes FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- No direct INSERT/UPDATE/DELETE policies - all writes go through
-- toggle_artwork_like below, which keeps like_count in sync atomically.

CREATE OR REPLACE FUNCTION increment_artwork_view(p_artwork_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE artworks SET view_count = view_count + 1 WHERE id = p_artwork_id;
$$;

GRANT EXECUTE ON FUNCTION increment_artwork_view(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION toggle_artwork_like(p_artwork_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to like a piece';
  END IF;

  SELECT id INTO v_existing FROM artwork_likes
    WHERE artwork_id = p_artwork_id AND user_id = auth.uid();

  IF v_existing IS NOT NULL THEN
    DELETE FROM artwork_likes WHERE id = v_existing;
    UPDATE artworks SET like_count = GREATEST(like_count - 1, 0) WHERE id = p_artwork_id;
    RETURN jsonb_build_object('liked', false);
  ELSE
    INSERT INTO artwork_likes (artwork_id, user_id) VALUES (p_artwork_id, auth.uid());
    UPDATE artworks SET like_count = like_count + 1 WHERE id = p_artwork_id;
    RETURN jsonb_build_object('liked', true);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION toggle_artwork_like(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION toggle_artwork_like(uuid) TO authenticated;
