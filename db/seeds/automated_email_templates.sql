-- db/seeds/automated_email_templates.sql
--
-- SEED, NOT A MIGRATION. Email bodies are content, not schema, and the earlier
-- ones (0002/0015/0017/0028) pushed the accumulated migration text far enough
-- that the vitest Workers pool stopped booting entirely -- it fails with a bare
-- `assert(webSocket !== null)` and takes the whole suite down, giving no hint
-- that migrations are the cause. Verified by bisection: two more templates in a
-- migration passed, four failed.
--
-- Applied by scripts/seed-templates.mjs (local and remote) and by the test
-- helper applySeeds(), so the same SQL is exercised everywhere.
-- The four automated emails the operator asked for, on top of the two that
-- already existed:
--   confirmation                  registration confirmed - ATTENDEE  (existing)
--   confirmation_server           registration confirmed - SERVER    (new)
--   interest_invite               registration is open   - ATTENDEE  (existing)
--   interest_invite_server        sign-ups are open      - SERVER    (new)
--   interest_confirmation         you are on the list    - ATTENDEE  (new)
--   interest_confirmation_server  you are on the list    - SERVER    (new)
--
-- Each new template is DERIVED from an existing one with SQL string surgery
-- rather than pasting the whole branded wrapper again. Two reasons: the wrapper
-- (logo, colours, footer) then has exactly one definition per program, so a
-- rebrand cannot leave half the emails behind; and it keeps this migration a few
-- hundred bytes instead of ~26KB, which matters because the vitest Workers pool
-- fails to boot once the accumulated migration payload gets large enough --
-- observed empirically, and it takes the whole test suite down with it.
--
-- All of them stay editable in the Templates page like every other email.


-- confirmation_server: inherits the branded wrapper from 'confirmation' so the logo, colours
-- and footer stay defined in exactly one place per program.
INSERT OR REPLACE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
SELECT
  program,
  'confirmation_server',
  'Confirmation - Server (automated)',
  'You''re signed up to serve at {{encounter_name}}!',
  substr(body_html, 1, instr(body_html, '<!--EDITABLE_START-->') + 20)
    || '<p style="font-size:19px;margin:0 0 22px;">Hi {{first_name}},</p><p style="margin:0 0 20px;line-height:1.75;font-size:16px;">You''re registered to <strong>serve</strong> at this Encounter. Thank you &mdash; the weekend does not happen without the team.</p><p style="margin:0 0 20px;line-height:1.75;font-size:16px;"><strong>{{encounter_name}}</strong><br />{{start_date}} &mdash; {{end_date}}</p><p style="margin:0 0 20px;line-height:1.75;font-size:16px;">We''ll be in touch with server details, arrival time and what to bring.</p>'
    || substr(body_html, instr(body_html, '<!--EDITABLE_END-->')),
  'Hi {{first_name}},

You''re registered to SERVE at this Encounter. Thank you.

{{encounter_name}}
{{start_date}} - {{end_date}}

We''ll be in touch with server details.',
  '["first_name","encounter_name","start_date","end_date"]',
  '2026-08-02T00:00:00.000Z'
FROM email_templates WHERE key = 'confirmation';


-- interest_confirmation: inherits the branded wrapper from 'confirmation' so the logo, colours
-- and footer stay defined in exactly one place per program.
INSERT OR REPLACE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
SELECT
  program,
  'interest_confirmation',
  'Interest Confirmation - Attendee (automated)',
  'You''re on the list for the next Encounter',
  substr(body_html, 1, instr(body_html, '<!--EDITABLE_START-->') + 20)
    || '<p style="font-size:19px;margin:0 0 22px;">Hi {{first_name}},</p><p style="margin:0 0 20px;line-height:1.75;font-size:16px;">Thanks for reaching out. The upcoming Encounter is full, but <strong>you''re on the list</strong>.</p><p style="margin:0 0 20px;line-height:1.75;font-size:16px;">As soon as registration opens for the next one, we''ll email you a link to sign up. Nothing to do until then.</p><p style="margin:0 0 20px;line-height:1.75;font-size:16px;">We''d love to have you.</p>'
    || substr(body_html, instr(body_html, '<!--EDITABLE_END-->')),
  'Hi {{first_name}},

Thanks for reaching out. The upcoming Encounter is full, but you''re on the list.

As soon as registration opens for the next one, we''ll email you a link to sign up.',
  '["first_name"]',
  '2026-08-02T00:00:00.000Z'
FROM email_templates WHERE key = 'confirmation';


-- interest_confirmation_server: inherits the branded wrapper from 'confirmation' so the logo, colours
-- and footer stay defined in exactly one place per program.
INSERT OR REPLACE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
SELECT
  program,
  'interest_confirmation_server',
  'Interest Confirmation - Server (automated)',
  'You''re on the server list for the next Encounter',
  substr(body_html, 1, instr(body_html, '<!--EDITABLE_START-->') + 20)
    || '<p style="font-size:19px;margin:0 0 22px;">Hi {{first_name}},</p><p style="margin:0 0 20px;line-height:1.75;font-size:16px;">Thanks for wanting to serve. Server sign-ups for the upcoming Encounter are closed, but <strong>you''re on the list</strong>.</p><p style="margin:0 0 20px;line-height:1.75;font-size:16px;">When sign-ups open for the next one, we''ll email you a link. Nothing to do until then.</p>'
    || substr(body_html, instr(body_html, '<!--EDITABLE_END-->')),
  'Hi {{first_name}},

Thanks for wanting to serve. Server sign-ups are closed for the upcoming Encounter, but you''re on the list.

When sign-ups open for the next one, we''ll email you a link.',
  '["first_name"]',
  '2026-08-02T00:00:00.000Z'
FROM email_templates WHERE key = 'confirmation';


-- interest_invite_server: inherits the branded wrapper from 'interest_invite' so the logo, colours
-- and footer stay defined in exactly one place per program.
INSERT OR REPLACE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
SELECT
  program,
  'interest_invite_server',
  'Interest Invite - Server (sent when sign-ups open)',
  'Server sign-ups are open for {{encounter_name}}',
  substr(body_html, 1, instr(body_html, '<!--EDITABLE_START-->') + 20)
    || '<p style="font-size:19px;margin:0 0 22px;">Hi {{first_name}},</p><p style="margin:0 0 20px;line-height:1.75;font-size:16px;">You asked us to let you know when we needed servers for the next Encounter &mdash; sign-ups just opened.</p><p style="margin:0 0 20px;line-height:1.75;font-size:16px;"><strong>{{encounter_name}}</strong><br />{{start_date}} &mdash; {{end_date}}</p><p style="margin:0 0 28px;line-height:1.75;font-size:16px;">Spots fill up, so go ahead and get signed up when youre ready.</p>'
    || substr(body_html, instr(body_html, '<!--EDITABLE_END-->')),
  'Hi {{first_name}},

Server sign-ups just opened for the next Encounter.

{{encounter_name}}
{{start_date}} - {{end_date}}

Sign up here: {{register_url}}',
  '["first_name","encounter_name","start_date","end_date","register_url"]',
  '2026-08-02T00:00:00.000Z'
FROM email_templates WHERE key = 'interest_invite';
