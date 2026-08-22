-- Automated image verification metadata
ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS image_status text DEFAULT 'unchecked'
    CHECK (image_status IS NULL OR image_status IN ('unchecked', 'ok', 'broken', 'duplicate', 'mismatch', 'error')),
  ADD COLUMN IF NOT EXISTS image_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS image_verify_notes text,
  ADD COLUMN IF NOT EXISTS image_content_type text;

CREATE INDEX IF NOT EXISTS idx_artworks_image_status ON artworks(image_status);
CREATE INDEX IF NOT EXISTS idx_artworks_image_url ON artworks(image_url);

COMMENT ON COLUMN artworks.image_status IS 'ok | broken | duplicate | mismatch | unchecked | error';
