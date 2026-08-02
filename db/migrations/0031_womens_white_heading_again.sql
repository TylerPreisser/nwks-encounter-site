-- 0031_womens_white_heading_again.sql
-- Re-applies 0021: the women's heading and footer link must be WHITE on the
-- plum band, not the men's gold.
--
-- 0021 fixed the templates that existed then. The interest_invite templates
-- added later hardcoded #F4D58D again, and interest_invite_server inherited it,
-- so the gold came back on exactly two emails. Anything DERIVED from a
-- corrected template was fine -- which is the argument for deriving rather than
-- pasting the wrapper, and the reason this had to be fixed at the source.
--
-- Written as a blanket REPLACE over the whole program so it also catches any
-- future template that reintroduces the gold before this migration runs.

UPDATE email_templates
SET body_html = REPLACE(body_html, '#F4D58D', '#FFFFFF')
WHERE program = 'women' AND body_html LIKE '%F4D58D%';
