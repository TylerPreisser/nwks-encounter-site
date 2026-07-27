-- 0017_templates_branding_confirmation.sql
-- 1) Corrects the email branding on the general templates:
--    - remove the "Northwest Kansas" subheader under the title
--    - remove the yellow ring/border around the logo
--    - make the logo bigger (92 -> 120px)
--    - remove "Northwest Kansas" from the footer (NWKS already means that)
-- 2) Adds an editable "Confirmation" template per program (the AUTOMATED email
--    sent when someone registers). Same locked branded wrapper + editable message.
-- ASCII-only; '' escapes apostrophes; &mdash; etc. for non-ASCII.

-- ── Men's GENERAL (rebranded) ────────────────────────────────────────────────
INSERT OR REPLACE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'mens', 'general', 'Men''s Encounter', 'A message from NWKS Men''s Encounter',
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
    <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">Write your opening here &mdash; a warm greeting or the headline of what you want to share.</p>
    <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">This is the middle. Put the details here: dates, what to bring, encouragement.</p>
    <p style="margin:0 0 8px;line-height:1.75;font-size:16px;">And this is the closing. Sign off however you like.</p>
    <!--EDITABLE_END-->
  </td></tr>
  <tr><td style="background:#6E765F;padding:22px 40px;text-align:center;">
    <p style="margin:0 0 4px;font-size:14px;color:#FFEB00;font-weight:bold;"><a href="mailto:nwksmensencounter@gmail.com" style="color:#FFEB00;text-decoration:none;">nwksmensencounter@gmail.com</a></p>
    <p style="margin:0;font-size:12px;color:#d7dcc9;">NWKS Men''s Encounter &bull; nwksencounter.com</p>
  </td></tr>
</table></td></tr></table></body></html>',
  'Hi {{first_name}},

Write your opening here.

--
NWKS Men''s Encounter
nwksmensencounter@gmail.com',
  '["first_name"]', '2026-07-27T12:00:00.000Z'
);

-- ── Men's CONFIRMATION (automated registration email) ────────────────────────
INSERT OR REPLACE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'mens', 'confirmation', 'Confirmation (sent on registration)', 'You''re registered for {{program}} Encounter!',
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
    <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">Thank you for registering for NWKS Men''s Encounter! We''re excited to have you join us as a {{role}}.</p>
    <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">You''ll receive more details closer to the event. If you have any questions, just reply to this email &mdash; it comes straight to our team.</p>
    <p style="margin:0 0 8px;line-height:1.75;font-size:16px;">Blessings,<br>The NWKS Men''s Encounter Team</p>
    <!--EDITABLE_END-->
  </td></tr>
  <tr><td style="background:#6E765F;padding:22px 40px;text-align:center;">
    <p style="margin:0 0 4px;font-size:14px;color:#FFEB00;font-weight:bold;"><a href="mailto:nwksmensencounter@gmail.com" style="color:#FFEB00;text-decoration:none;">nwksmensencounter@gmail.com</a></p>
    <p style="margin:0;font-size:12px;color:#d7dcc9;">NWKS Men''s Encounter &bull; nwksencounter.com</p>
  </td></tr>
</table></td></tr></table></body></html>',
  'Hi {{first_name}},

Thank you for registering for NWKS Men''s Encounter! We''re excited to have you join us as a {{role}}. You''ll receive more details closer to the event.

Blessings,
The NWKS Men''s Encounter Team',
  '["first_name","program","role"]', '2026-07-27T12:00:00.000Z'
);

-- ── Women's GENERAL (rebranded) ──────────────────────────────────────────────
INSERT OR REPLACE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'women', 'general', 'Women''s Encounter', 'A message from NWKS Women''s Encounter',
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
    <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">Write your opening here &mdash; a warm greeting or the headline of what you want to share.</p>
    <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">This is the middle. Put the details here: dates, what to bring, encouragement.</p>
    <p style="margin:0 0 8px;line-height:1.75;font-size:16px;">And this is the closing. Sign off however you like.</p>
    <!--EDITABLE_END-->
  </td></tr>
  <tr><td style="background:#6B2740;padding:22px 40px;text-align:center;">
    <p style="margin:0 0 4px;font-size:14px;color:#F4D58D;font-weight:bold;"><a href="mailto:nwkswomensencounter@gmail.com" style="color:#F4D58D;text-decoration:none;">nwkswomensencounter@gmail.com</a></p>
    <p style="margin:0;font-size:12px;color:#e8cdd6;">NWKS Women''s Encounter &bull; nwksencounter.com</p>
  </td></tr>
</table></td></tr></table></body></html>',
  'Hi {{first_name}},

Write your opening here.

--
NWKS Women''s Encounter
nwkswomensencounter@gmail.com',
  '["first_name"]', '2026-07-27T12:00:00.000Z'
);

-- ── Women's CONFIRMATION ─────────────────────────────────────────────────────
INSERT OR REPLACE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'women', 'confirmation', 'Confirmation (sent on registration)', 'You''re registered for {{program}} Encounter!',
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
    <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">Thank you for registering for NWKS Women''s Encounter! We''re excited to have you join us as a {{role}}.</p>
    <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">You''ll receive more details closer to the event. If you have any questions, just reply to this email &mdash; it comes straight to our team.</p>
    <p style="margin:0 0 8px;line-height:1.75;font-size:16px;">Blessings,<br>The NWKS Women''s Encounter Team</p>
    <!--EDITABLE_END-->
  </td></tr>
  <tr><td style="background:#6B2740;padding:22px 40px;text-align:center;">
    <p style="margin:0 0 4px;font-size:14px;color:#F4D58D;font-weight:bold;"><a href="mailto:nwkswomensencounter@gmail.com" style="color:#F4D58D;text-decoration:none;">nwkswomensencounter@gmail.com</a></p>
    <p style="margin:0;font-size:12px;color:#e8cdd6;">NWKS Women''s Encounter &bull; nwksencounter.com</p>
  </td></tr>
</table></td></tr></table></body></html>',
  'Hi {{first_name}},

Thank you for registering for NWKS Women''s Encounter! We''re excited to have you join us as a {{role}}. You''ll receive more details closer to the event.

Blessings,
The NWKS Women''s Encounter Team',
  '["first_name","program","role"]', '2026-07-27T12:00:00.000Z'
);
