-- Dedup table for ending-soon alerts (in-app + web push)
CREATE TABLE IF NOT EXISTS auction_ending_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_label text NOT NULL, -- e.g. '1h' | '15m'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auction_id, user_id, window_label)
);

CREATE INDEX IF NOT EXISTS idx_auction_ending_alerts_auction ON auction_ending_alerts(auction_id);

ALTER TABLE auction_ending_alerts ENABLE ROW LEVEL SECURITY;
-- no client policies needed; service role only

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS auction_id uuid REFERENCES auctions(id) ON DELETE SET NULL;
