-- 0015_templates_general.sql
-- Collapse ALL email templates into ONE editable "general" template per program.
--   mens/general   -> "Men's Encounter"
--   women/general  -> "Women's Encounter"
-- This is the single starting-point template the office edits and/or "Saves as"
-- a new named template. Users may create additional templates (any key) via the
-- POST /api/admin/templates route; those are preserved by this migration.
--
-- Men's branding uses the EXACT logo colors: olive #6E765F bands, #FFEB00 yellow
-- heading text. Women's uses its own plum palette. Header/footer are branded;
-- the middle (top/middle/bottom paragraphs) is fully editable. Contact email is
-- shown in the footer so recipients can reach the ministry.
--
-- ASCII-only SQL; HTML entities for non-ASCII characters; '' escapes apostrophes.

-- Remove the old fixed-purpose templates (welcome / reminder / packing_list / etc.)
DELETE FROM email_templates WHERE key IN
  ('welcome', 'reminder', 'packing_list', 'confirmation', 'post_event', 'prayer_partner');

-- ── Men's general template ───────────────────────────────────────────────────
INSERT OR REPLACE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'mens',
  'general',
  'Men''s Encounter',
  'A message from NWKS Men''s Encounter',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NWKS Men''s Encounter</title></head>
<body style="margin:0;padding:0;background:#f2efe6;font-family:Georgia,''Times New Roman'',serif;color:#2c2c2c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2efe6;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

  <!-- Header band (olive #6E765F, yellow #FFEB00 heading) -->
  <tr>
    <td style="background:#6E765F;padding:34px 40px;text-align:center;">
      <img src="https://nwks-encounter-backend.pages.dev/email-assets/men-logo-300x300-1.jpg"
           alt="NWKS Men''s Encounter" width="92" height="92"
           style="border-radius:50%;display:block;margin:0 auto 16px;border:3px solid #FFEB00;" />
      <h1 style="margin:0;color:#FFEB00;font-size:27px;line-height:1.2;letter-spacing:0.5px;font-family:Georgia,serif;font-weight:bold;">
        NWKS Men''s Encounter
      </h1>
      <p style="margin:8px 0 0;color:#e9ecdf;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;">
        Northwest Kansas
      </p>
    </td>
  </tr>

  <!-- Body (top / middle / bottom - fully editable) -->
  <tr>
    <td style="padding:38px 46px;font-size:16px;line-height:1.75;color:#2c2c2c;">
      <!--EDITABLE_START-->
      <p style="font-size:19px;margin:0 0 22px;color:#3D4127;">Hi {{first_name}},</p>
      <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">Write your opening here. This is the top of the message &mdash; a warm greeting or the headline of what you want to share.</p>
      <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">This is the middle. Put the details here: dates, what to bring, encouragement, or anything the men need to know.</p>
      <p style="margin:0 0 8px;line-height:1.75;font-size:16px;">And this is the closing. Sign off however you like &mdash; see you there, in His grip, etc.</p>
      <!--EDITABLE_END-->
    </td>
  </tr>

  <!-- Footer band (olive #6E765F, yellow #FFEB00 contact) -->
  <tr>
    <td style="background:#6E765F;padding:22px 40px;text-align:center;">
      <p style="margin:0 0 4px;font-size:14px;color:#FFEB00;font-weight:bold;">
        <a href="mailto:nwksmensencounter@gmail.com" style="color:#FFEB00;text-decoration:none;">nwksmensencounter@gmail.com</a>
      </p>
      <p style="margin:0;font-size:12px;color:#d7dcc9;">NWKS Men''s Encounter &bull; Northwest Kansas &bull; nwksencounter.com</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>',
  'Hi {{first_name}},

Write your opening here. This is the top of the message.

This is the middle. Put the details here: dates, what to bring, encouragement.

And this is the closing. Sign off however you like.

--
NWKS Men''s Encounter - Northwest Kansas
nwksmensencounter@gmail.com - nwksencounter.com',
  '["first_name"]',
  '2026-07-27T00:00:00.000Z'
);

-- ── Women's general template ─────────────────────────────────────────────────
INSERT OR REPLACE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'women',
  'general',
  'Women''s Encounter',
  'A message from NWKS Women''s Encounter',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NWKS Women''s Encounter</title></head>
<body style="margin:0;padding:0;background:#fdf5f7;font-family:Georgia,''Times New Roman'',serif;color:#2c2c2c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdf5f7;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

  <!-- Header band -->
  <tr>
    <td style="background:#6B2740;padding:34px 40px;text-align:center;">
      <img src="https://nwks-encounter-backend.pages.dev/email-assets/source-womens-logo-1024x1024.jpg"
           alt="NWKS Women''s Encounter" width="92" height="92"
           style="border-radius:50%;display:block;margin:0 auto 16px;border:3px solid #E6B85C;background:#ffffff;" />
      <h1 style="margin:0;color:#F4D58D;font-size:27px;line-height:1.2;letter-spacing:0.5px;font-family:Georgia,serif;font-weight:bold;">
        NWKS Women''s Encounter
      </h1>
      <p style="margin:8px 0 0;color:#e8cdd6;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;">
        Northwest Kansas
      </p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:38px 46px;font-size:16px;line-height:1.75;color:#2c2c2c;">
      <!--EDITABLE_START-->
      <p style="font-size:19px;margin:0 0 22px;color:#6B2740;">Hi {{first_name}},</p>
      <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">Write your opening here. This is the top of the message &mdash; a warm greeting or the headline of what you want to share.</p>
      <p style="margin:0 0 20px;line-height:1.75;font-size:16px;">This is the middle. Put the details here: dates, what to bring, encouragement, or anything the women need to know.</p>
      <p style="margin:0 0 8px;line-height:1.75;font-size:16px;">And this is the closing. Sign off however you like.</p>
      <!--EDITABLE_END-->
    </td>
  </tr>

  <!-- Footer band -->
  <tr>
    <td style="background:#6B2740;padding:22px 40px;text-align:center;">
      <p style="margin:0 0 4px;font-size:14px;color:#F4D58D;font-weight:bold;">
        <a href="mailto:nwkswomensencounter@gmail.com" style="color:#F4D58D;text-decoration:none;">nwkswomensencounter@gmail.com</a>
      </p>
      <p style="margin:0;font-size:12px;color:#e8cdd6;">NWKS Women''s Encounter &bull; Northwest Kansas &bull; nwksencounter.com</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>',
  'Hi {{first_name}},

Write your opening here. This is the top of the message.

This is the middle. Put the details here: dates, what to bring, encouragement.

And this is the closing. Sign off however you like.

--
NWKS Women''s Encounter - Northwest Kansas
nwkswomensencounter@gmail.com - nwksencounter.com',
  '["first_name"]',
  '2026-07-27T00:00:00.000Z'
);
