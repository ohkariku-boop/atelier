/*
# Consolidate artists.bio into artists.biography

## Background
The original schema (see 20260723084200_create_auction_marketplace_schema.sql)
only had `bio`. A `biography` column was added directly against the live
Supabase project at some point during the artist-profile-pages work - not
through a committed migration, so it never existed in git until now. Having
both `bio` and `biography` on the same table was a redundant, ambiguous
design with no clear rule for which one is authoritative.

## Decision
Keep `biography` only. Backfill it from `bio` for any row where it's
still empty (defensive - in case any artist has bio content not covered
by the confirmed set below), apply the real content for the five known
artist profiles, then drop `bio` entirely.
*/

ALTER TABLE artists ADD COLUMN IF NOT EXISTS biography text;

-- Defensive backfill: don't lose any existing bio content that hasn't
-- already been migrated to biography.
UPDATE artists SET biography = bio WHERE biography IS NULL AND bio IS NOT NULL;

-- Apply confirmed real content for the known artist profiles
UPDATE artists SET biography = 'A visionary of Abstract Expressionism, Marcus focuses on the intersection of memory and spatial architecture.'
  WHERE name = 'Marcus Vance';
UPDATE artists SET biography = 'A master of Sumi-e Fusion, Mei-Lin brings traditional ink techniques into the digital and minimalist modern age.'
  WHERE name = 'Mei-Lin Chen';
UPDATE artists SET biography = 'Recognized for her evocative contemporary abstract paintings that challenge the perception of color and depth.'
  WHERE name = 'Elena Rostova';
UPDATE artists SET biography = 'Julian Thorne captures the fleeting beauty of nature through his refined plein air landscape techniques.'
  WHERE name = 'Julian Thorne';
UPDATE artists SET biography = 'Amara Okafor blends ancient cultural iconography with digital surrealism, creating new visual mythologies.'
  WHERE name = 'Amara Okafor';

ALTER TABLE artists DROP COLUMN IF EXISTS bio;
