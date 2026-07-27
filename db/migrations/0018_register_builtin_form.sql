-- 0018_register_builtin_form.sql
-- The public register button must point to the site's BUILT-IN registration form
-- (the native attendee form that feeds the admin), NOT the old Google Form.
-- json_set updates just the register href inside each program's page document.

UPDATE page_document
SET doc = json_set(doc, '$.register[0].href', 'https://nwks-encounter-backend.pages.dev/register/mens-attendee.html'),
    updated_at = '2026-07-27T13:00:00.000Z'
WHERE program = 'mens';

UPDATE page_document
SET doc = json_set(doc, '$.register[0].href', 'https://nwks-encounter-backend.pages.dev/register/womens-attendee.html'),
    updated_at = '2026-07-27T13:00:00.000Z'
WHERE program = 'women';
