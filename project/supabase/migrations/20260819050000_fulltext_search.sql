/*
# Full-text search on artworks + artists
*/

ALTER TABLE artworks ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION artworks_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.medium, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_artworks_search_vector ON artworks;
CREATE TRIGGER trg_artworks_search_vector
  BEFORE INSERT OR UPDATE OF title, medium, description ON artworks
  FOR EACH ROW
  EXECUTE FUNCTION artworks_search_vector_update();

UPDATE artworks SET
  search_vector =
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(medium, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_artworks_search_vector ON artworks USING GIN (search_vector);

CREATE OR REPLACE FUNCTION search_artworks(p_query text, p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  title text,
  medium text,
  image_url text,
  rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    a.id,
    a.title,
    a.medium,
    a.image_url,
    ts_rank(a.search_vector, websearch_to_tsquery('english', p_query)) AS rank
  FROM artworks a
  WHERE a.search_vector @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 100));
$$;

GRANT EXECUTE ON FUNCTION search_artworks(text, integer) TO anon, authenticated;
