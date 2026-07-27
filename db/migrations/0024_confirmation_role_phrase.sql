-- 0024_confirmation_role_phrase.sql
-- Collapse the two role tokens into one clean {{role_phrase}} merge field so the
-- confirmation editor shows a single tidy pill instead of "{{role_article}}
-- {{role_lower}}". Resolves to "an attendee" / "a server" per registrant.

UPDATE email_templates SET
  body_html = REPLACE(body_html, '{{role_article}} {{role_lower}}', '{{role_phrase}}'),
  body_text = REPLACE(body_text, '{{role_article}} {{role_lower}}', '{{role_phrase}}')
WHERE key = 'confirmation';
