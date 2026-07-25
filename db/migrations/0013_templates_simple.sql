-- 0013_templates_simple.sql
-- Replace ALL existing email_templates with 6 clean, program-specific rows:
--   mens/welcome  mens/reminder  mens/packing_list
--   women/welcome women/reminder women/packing_list
-- No "shared" rows. Each template carries ONLY its program's logo.
-- Bodies are minimal: branded header + greeting + Placeholder sections.
-- ASCII-only SQL; HTML entities for non-ASCII characters.

DELETE FROM email_templates;

-- ── Men's Welcome ────────────────────────────────────────────────────────────
INSERT INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'mens',
  'welcome',
  'Welcome - Men''s Encounter',
  'Welcome to Men''s Encounter',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome</title></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="background:#3D4127;padding:32px 40px;text-align:center;">
      <img src="https://nwks-encounter-backend.pages.dev/email-assets/men-logo-300x300-1.jpg"
           alt="Northwest Men''s Encounter" width="96" height="96"
           style="border-radius:50%;display:block;margin:0 auto 16px;" />
      <h1 style="margin:0;color:#B8972A;font-size:26px;letter-spacing:1px;font-family:Georgia,serif;">
        Northwest Men''s Encounter
      </h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:40px 48px;">
      <p style="font-size:20px;margin:0 0 24px;">{{first_name}},</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#3D4127;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#c8c0a8;">Northwest Kansas Encounter &bull; nwksencounter.com</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>',
  '{{first_name}},

Placeholder

Placeholder

Placeholder',
  '["first_name"]',
  '2026-07-24T00:00:00.000Z'
);

-- ── Men's Reminder ───────────────────────────────────────────────────────────
INSERT INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'mens',
  'reminder',
  'Reminder - Men''s Encounter',
  'Men''s Encounter &mdash; One Week to Go',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reminder</title></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="background:#3D4127;padding:32px 40px;text-align:center;">
      <img src="https://nwks-encounter-backend.pages.dev/email-assets/men-logo-300x300-1.jpg"
           alt="Northwest Men''s Encounter" width="96" height="96"
           style="border-radius:50%;display:block;margin:0 auto 16px;" />
      <h1 style="margin:0;color:#B8972A;font-size:26px;letter-spacing:1px;font-family:Georgia,serif;">
        Northwest Men''s Encounter
      </h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:40px 48px;">
      <p style="font-size:20px;margin:0 0 24px;">{{first_name}},</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#3D4127;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#c8c0a8;">Northwest Kansas Encounter &bull; nwksencounter.com</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>',
  '{{first_name}},

Placeholder

Placeholder',
  '["first_name"]',
  '2026-07-24T00:00:00.000Z'
);

-- ── Men's Packing List ───────────────────────────────────────────────────────
INSERT INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'mens',
  'packing_list',
  'Packing List - Men''s Encounter',
  'Men''s Encounter &mdash; What to Bring',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Packing List</title></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="background:#3D4127;padding:32px 40px;text-align:center;">
      <img src="https://nwks-encounter-backend.pages.dev/email-assets/men-logo-300x300-1.jpg"
           alt="Northwest Men''s Encounter" width="96" height="96"
           style="border-radius:50%;display:block;margin:0 auto 16px;" />
      <h1 style="margin:0;color:#B8972A;font-size:26px;letter-spacing:1px;font-family:Georgia,serif;">
        Northwest Men''s Encounter
      </h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:40px 48px;">
      <p style="font-size:20px;margin:0 0 24px;">{{first_name}},</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#3D4127;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#c8c0a8;">Northwest Kansas Encounter &bull; nwksencounter.com</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>',
  '{{first_name}},

Placeholder

Placeholder',
  '["first_name"]',
  '2026-07-24T00:00:00.000Z'
);

-- ── Women's Welcome ──────────────────────────────────────────────────────────
INSERT INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'women',
  'welcome',
  'Welcome - Women''s Encounter',
  'Welcome to Women''s Encounter',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome</title></head>
<body style="margin:0;padding:0;background:#fdf6f6;font-family:Georgia,serif;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="background:#5c1f3b;padding:32px 40px;text-align:center;">
      <img src="https://nwks-encounter-backend.pages.dev/email-assets/source-womens-logo-1024x1024.jpg"
           alt="Northwest Kansas Women''s Encounter" width="96" height="96"
           style="border-radius:50%;display:block;margin:0 auto 16px;" />
      <h1 style="margin:0;color:#f9d0e0;font-size:26px;letter-spacing:1px;font-family:Georgia,serif;">
        Northwest Kansas Women''s Encounter
      </h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:40px 48px;">
      <p style="font-size:20px;margin:0 0 24px;">{{first_name}},</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#5c1f3b;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#e8b4c8;">Northwest Kansas Encounter &bull; nwksencounter.com</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>',
  '{{first_name}},

Placeholder

Placeholder

Placeholder',
  '["first_name"]',
  '2026-07-24T00:00:00.000Z'
);

-- ── Women's Reminder ─────────────────────────────────────────────────────────
INSERT INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'women',
  'reminder',
  'Reminder - Women''s Encounter',
  'Women''s Encounter &mdash; One Week to Go',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reminder</title></head>
<body style="margin:0;padding:0;background:#fdf6f6;font-family:Georgia,serif;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="background:#5c1f3b;padding:32px 40px;text-align:center;">
      <img src="https://nwks-encounter-backend.pages.dev/email-assets/source-womens-logo-1024x1024.jpg"
           alt="Northwest Kansas Women''s Encounter" width="96" height="96"
           style="border-radius:50%;display:block;margin:0 auto 16px;" />
      <h1 style="margin:0;color:#f9d0e0;font-size:26px;letter-spacing:1px;font-family:Georgia,serif;">
        Northwest Kansas Women''s Encounter
      </h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:40px 48px;">
      <p style="font-size:20px;margin:0 0 24px;">{{first_name}},</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#5c1f3b;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#e8b4c8;">Northwest Kansas Encounter &bull; nwksencounter.com</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>',
  '{{first_name}},

Placeholder

Placeholder',
  '["first_name"]',
  '2026-07-24T00:00:00.000Z'
);

-- ── Women's Packing List ─────────────────────────────────────────────────────
INSERT INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES (
  'women',
  'packing_list',
  'Packing List - Women''s Encounter',
  'Women''s Encounter &mdash; What to Bring',
  '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Packing List</title></head>
<body style="margin:0;padding:0;background:#fdf6f6;font-family:Georgia,serif;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="background:#5c1f3b;padding:32px 40px;text-align:center;">
      <img src="https://nwks-encounter-backend.pages.dev/email-assets/source-womens-logo-1024x1024.jpg"
           alt="Northwest Kansas Women''s Encounter" width="96" height="96"
           style="border-radius:50%;display:block;margin:0 auto 16px;" />
      <h1 style="margin:0;color:#f9d0e0;font-size:26px;letter-spacing:1px;font-family:Georgia,serif;">
        Northwest Kansas Women''s Encounter
      </h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:40px 48px;">
      <p style="font-size:20px;margin:0 0 24px;">{{first_name}},</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
      <p style="margin:0 0 20px;line-height:1.7;">Placeholder</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#5c1f3b;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#e8b4c8;">Northwest Kansas Encounter &bull; nwksencounter.com</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>',
  '{{first_name}},

Placeholder

Placeholder',
  '["first_name"]',
  '2026-07-24T00:00:00.000Z'
);
