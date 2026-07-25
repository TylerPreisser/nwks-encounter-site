-- 0014_page_content_labels.sql
-- Update page_content labels to clear, human-readable names.
-- ASCII-only SQL.

UPDATE page_content SET label = 'Main tagline (top of the page)'   WHERE key = 'hero_tagline';
UPDATE page_content SET label = 'Invitation paragraph'             WHERE key = 'event_invite_text';
UPDATE page_content SET label = '"What is Encounter?" section'     WHERE key = 'what_is_encounter';
UPDATE page_content SET label = 'Contact note (bottom)'            WHERE key = 'contact_note';
