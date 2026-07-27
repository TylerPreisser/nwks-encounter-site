-- 0021_womens_email_white_heading.sql
-- The women's email heading + footer link used a men's-style gold (#F4D58D) that
-- reads wrong on the plum band. Switch it to clean white on the plum.

UPDATE email_templates
SET body_html = REPLACE(body_html, '#F4D58D', '#FFFFFF')
WHERE program = 'women';
