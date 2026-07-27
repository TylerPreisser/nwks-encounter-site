-- 0019_two_register_buttons.sql
-- Every encounter has TWO registrations: Attendee and Server. Give each page
-- document exactly two register buttons, each linked to its built-in form.
-- (Button text stays editable in the admin; the links are fixed.)

UPDATE page_document SET doc = json_set(doc,
  '$.register[0]', json_object('label', 'Register as an Attendee', 'href', 'https://nwks-encounter-backend.pages.dev/register/mens-attendee.html'),
  '$.register[1]', json_object('label', 'Register as a Server',   'href', 'https://nwks-encounter-backend.pages.dev/register/mens-server.html')
) WHERE program = 'mens';

UPDATE page_document SET doc = json_set(doc,
  '$.register[0]', json_object('label', 'Register as an Attendee', 'href', 'https://nwks-encounter-backend.pages.dev/register/womens-attendee.html'),
  '$.register[1]', json_object('label', 'Register as a Server',   'href', 'https://nwks-encounter-backend.pages.dev/register/womens-server.html')
) WHERE program = 'women';
