-- 0028_interest_invite_template.sql
-- The automated email sent to everyone on the interest queue when the next
-- encounter opens (fired by the rollover). Same locked branded wrapper as the
-- confirmation template, with an editable middle section, so it shows up in the
-- Templates page and reads like every other NWKS email.
--
-- Variables: first_name, encounter_name, start_date, end_date, register_url
-- ASCII-only; '' escapes apostrophes; &mdash; etc. for non-ASCII.

-- Men's INTEREST INVITE
INSERT OR REPLACE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'mens', 'interest_invite', 'Interest Invite (sent when the next encounter opens)',
  'Registration is open for {{encounter_name}}',
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2efe6;font-family:Georgia,''Times New Roman'',serif;color:#2c2c2c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2efe6;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
  <tr><td style="background:#6E765F;padding:34px 40px;text-align:center;">
    <img src="https://nwks-encounter-backend.pages.dev/email-assets/men-logo-300x300-1.jpg" alt="NWKS Men''s Encounter" width="120" height="120" style="border-radius:50%;display:block;margin:0 auto 16px;" />
    <h1 style="margin:0;color:#FFEB00;font-size:27px;line-height:1.2;letter-spacing:0.5px;font-family:Georgia,serif;font-weight:bold;">NWKS Men''s Encounter</h1>
  </td></tr>
  <tr><td style="padding:38px 46px;font-size:16px;line-height:1.75;color:#2c2c2c;">
    <!--EDITABLE_START-->
    <p style="font-size:19px;margin:0 0 22px;color:#3D4127;">Hi {{first_name}},</p>
    <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">You asked us to let you know when the next Men''s Encounter opened up &mdash; it just did.</p>
    <p style="margin:0 0 20px;line-height:1.75;font-size:16px;"><strong>{{encounter_name}}</strong><br />{{start_date}} &mdash; {{end_date}}</p>
    <p style="margin:0 0 28px;line-height:1.75;font-size:16px;">Spots fill up, so go ahead and get your registration in when you are ready.</p>
    <!--EDITABLE_END-->
    <p style="margin:0 0 8px;text-align:center;">
      <a href="{{register_url}}" style="display:inline-block;background:#6E765F;color:#FFEB00;font-family:Georgia,serif;font-weight:bold;font-size:17px;text-decoration:none;padding:14px 34px;border-radius:6px;">Register Now</a>
    </p>
  </td></tr>
  <tr><td style="background:#6E765F;padding:22px 40px;text-align:center;">
    <p style="margin:0 0 4px;font-size:14px;color:#FFEB00;font-weight:bold;"><a href="mailto:nwksmensencounter@gmail.com" style="color:#FFEB00;text-decoration:none;">nwksmensencounter@gmail.com</a></p>
    <p style="margin:0;font-size:12px;color:#d7dcc9;">NWKS Men''s Encounter &bull; nwksencounter.com</p>
  </td></tr>
</table></td></tr></table></body></html>',
  'Hi {{first_name}},

You asked us to let you know when the next Men''s Encounter opened up -- it just did.

{{encounter_name}}
{{start_date}} - {{end_date}}

Register here: {{register_url}}

--
NWKS Men''s Encounter
nwksmensencounter@gmail.com',
  '["first_name","encounter_name","start_date","end_date","register_url"]',
  '2026-08-01T12:00:00.000Z'
);

-- Women's INTEREST INVITE
INSERT OR REPLACE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'women', 'interest_invite', 'Interest Invite (sent when the next encounter opens)',
  'Registration is open for {{encounter_name}}',
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fdf5f7;font-family:Georgia,''Times New Roman'',serif;color:#2c2c2c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdf5f7;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
  <tr><td style="background:#6B2740;padding:34px 40px;text-align:center;">
    <img src="https://nwks-encounter-backend.pages.dev/email-assets/source-womens-logo-1024x1024.jpg" alt="NWKS Women''s Encounter" width="120" height="120" style="border-radius:50%;display:block;margin:0 auto 16px;background:#ffffff;" />
    <h1 style="margin:0;color:#F4D58D;font-size:27px;line-height:1.2;letter-spacing:0.5px;font-family:Georgia,serif;font-weight:bold;">NWKS Women''s Encounter</h1>
  </td></tr>
  <tr><td style="padding:38px 46px;font-size:16px;line-height:1.75;color:#2c2c2c;">
    <!--EDITABLE_START-->
    <p style="font-size:19px;margin:0 0 22px;color:#6B2740;">Hi {{first_name}},</p>
    <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">You asked us to let you know when the next Women''s Encounter opened up &mdash; it just did.</p>
    <p style="margin:0 0 20px;line-height:1.75;font-size:16px;"><strong>{{encounter_name}}</strong><br />{{start_date}} &mdash; {{end_date}}</p>
    <p style="margin:0 0 28px;line-height:1.75;font-size:16px;">Spots fill up, so go ahead and get your registration in when you are ready.</p>
    <!--EDITABLE_END-->
    <p style="margin:0 0 8px;text-align:center;">
      <a href="{{register_url}}" style="display:inline-block;background:#6B2740;color:#F4D58D;font-family:Georgia,serif;font-weight:bold;font-size:17px;text-decoration:none;padding:14px 34px;border-radius:6px;">Register Now</a>
    </p>
  </td></tr>
  <tr><td style="background:#6B2740;padding:22px 40px;text-align:center;">
    <p style="margin:0 0 4px;font-size:14px;color:#F4D58D;font-weight:bold;"><a href="mailto:nwkswomensencounter@gmail.com" style="color:#F4D58D;text-decoration:none;">nwkswomensencounter@gmail.com</a></p>
    <p style="margin:0;font-size:12px;color:#e8cdd6;">NWKS Women''s Encounter &bull; nwksencounter.com</p>
  </td></tr>
</table></td></tr></table></body></html>',
  'Hi {{first_name}},

You asked us to let you know when the next Women''s Encounter opened up -- it just did.

{{encounter_name}}
{{start_date}} - {{end_date}}

Register here: {{register_url}}

--
NWKS Women''s Encounter
nwkswomensencounter@gmail.com',
  '["first_name","encounter_name","start_date","end_date","register_url"]',
  '2026-08-01T12:00:00.000Z'
);
