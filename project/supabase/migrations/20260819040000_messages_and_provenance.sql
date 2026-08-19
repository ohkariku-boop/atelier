/*
# Buyer–artist messages + simple provenance certificate fields
*/

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_id uuid REFERENCES artworks(id) ON DELETE SET NULL,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artwork_id, buyer_id)
);
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_participants" ON conversations;
CREATE POLICY "conversations_participants" ON conversations
  FOR ALL TO authenticated
  USING (buyer_id = auth.uid() OR artist_user_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid() OR artist_user_id = auth.uid());

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_participants_select" ON messages;
CREATE POLICY "messages_participants_select" ON messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.artist_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_participants_insert" ON messages;
CREATE POLICY "messages_participants_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.artist_user_id = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- Provenance certificate number on artworks (issued when verified)
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS certificate_number text UNIQUE;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS certificate_issued_at timestamptz;

-- Backfill certificate numbers for already-verified works missing one
UPDATE artworks
SET
  certificate_number = 'ATL-COA-' || upper(substr(md5(id::text), 1, 10)),
  certificate_issued_at = coalesce(verified_at, now())
WHERE studio_verified = true
  AND certificate_number IS NULL;

-- Issue certificate on approve (extend review function lightly via trigger)
CREATE OR REPLACE FUNCTION issue_certificate_on_verify()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.studio_verified = true AND (OLD.studio_verified IS DISTINCT FROM true) THEN
    IF NEW.certificate_number IS NULL THEN
      NEW.certificate_number := 'ATL-COA-' || upper(substr(md5(NEW.id::text || clock_timestamp()::text), 1, 10));
      NEW.certificate_issued_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_issue_certificate_on_verify ON artworks;
CREATE TRIGGER trg_issue_certificate_on_verify
  BEFORE UPDATE ON artworks
  FOR EACH ROW
  EXECUTE FUNCTION issue_certificate_on_verify();

CREATE OR REPLACE FUNCTION open_or_get_conversation(
  p_artwork_id uuid,
  p_artist_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  IF p_artist_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot message yourself';
  END IF;

  SELECT id INTO v_id FROM conversations
  WHERE artwork_id = p_artwork_id AND buyer_id = auth.uid();

  IF v_id IS NULL THEN
    INSERT INTO conversations (artwork_id, buyer_id, artist_user_id)
    VALUES (p_artwork_id, auth.uid(), p_artist_user_id)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION open_or_get_conversation(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION open_or_get_conversation(uuid, uuid) TO authenticated;
