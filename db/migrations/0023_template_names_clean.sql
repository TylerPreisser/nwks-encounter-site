-- 0023_template_names_clean.sql
-- Cleaner sidebar labels: the general template is just "General template" and the
-- automated confirmation is "Registration Confirmation" (the program is already
-- clear from the Men's/Women's toggle, so no need to repeat it in the name).

UPDATE email_templates SET name = 'General template'         WHERE key = 'general';
UPDATE email_templates SET name = 'Registration Confirmation' WHERE key = 'confirmation';
