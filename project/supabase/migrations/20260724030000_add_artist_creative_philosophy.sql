/*
# Add artists.creative_philosophy

Same situation as biography: this was confirmed to have real content
already live in Supabase, but the column was never captured in a
committed migration. Adding it properly here with the confirmed content
for the five known artist profiles.
*/

ALTER TABLE artists ADD COLUMN IF NOT EXISTS creative_philosophy text;

UPDATE artists SET creative_philosophy = 'Art should not be a reflection of reality, but a distortion of feeling.'
  WHERE name = 'Marcus Vance';
UPDATE artists SET creative_philosophy = 'Simplicity is not the absence of complexity, but the ultimate refinement of it.'
  WHERE name = 'Mei-Lin Chen';
UPDATE artists SET creative_philosophy = 'Art is a silent dialogue between the creator and the viewer, where words are replaced by layers of pigment.'
  WHERE name = 'Elena Rostova';
UPDATE artists SET creative_philosophy = 'To paint the landscape is to participate in the natural cycle, capturing a singular, unrepeatable breath of light.'
  WHERE name = 'Julian Thorne';
UPDATE artists SET creative_philosophy = 'I use the digital medium to peel back the layers of tradition, revealing the universal archetypes hidden beneath.'
  WHERE name = 'Amara Okafor';
