-- 0022_confirmation_article_fix.sql
-- Fix the "a/an" grammar in the confirmation email: "as an attendee" vs
-- "as a server". Uses the {{role_article}} + {{role_lower}} merge fields
-- (resolved per-registrant in register.ts). Handles both the original
-- "as a {{role}}" and any hand-edited "as a/an {{role}}".

UPDATE email_templates SET
  body_html = REPLACE(REPLACE(body_html, 'as a/an {{role}}', 'as {{role_article}} {{role_lower}}'), 'as a {{role}}', 'as {{role_article}} {{role_lower}}'),
  body_text = REPLACE(REPLACE(body_text, 'as a/an {{role}}', 'as {{role_article}} {{role_lower}}'), 'as a {{role}}', 'as {{role_article}} {{role_lower}}')
WHERE key = 'confirmation';
