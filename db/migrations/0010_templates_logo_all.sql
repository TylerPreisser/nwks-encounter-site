-- 0010_templates_logo_all.sql
-- Add program logo header to the reminder (shared) and packing_list (shared)
-- templates so every email template displays the branded logo.
-- ASCII-only SQL; non-ASCII characters expressed as HTML entities.
-- mens logo: men-logo-300x300-1.jpg  (gold on forest green)
-- womens logo: source-womens-logo-1024x1024.jpg  (rose on burgundy)
-- shared templates: include BOTH logos side by side so the email works
-- regardless of which program sends it.  The welcome templates already
-- carry their respective logos (from 0005_templates_v2.sql).

-- ── Reminder (shared) -- add dual logo header block ──────────────────────────
UPDATE email_templates SET
  body_html = REPLACE(
    body_html,
    '  <!-- Header -->
  <tr>
    <td style="background:#3d4a3a;padding:32px 40px;text-align:center;">
      <p style="margin:0 0 4px;color:#c8c0a8;font-size:13px;letter-spacing:3px;text-transform:uppercase;">One week away</p>
      <h1 style="margin:0;color:#d4af37;font-size:28px;letter-spacing:1px;font-family:Georgia,serif;">
        NWKS Encounter
      </h1>
    </td>
  </tr>',
    '  <!-- Header -->
  <tr>
    <td style="background:#3d4a3a;padding:32px 40px;text-align:center;">
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px;">
        <tr>
          <td style="padding:0 10px;">
            <img src="https://nwks-encounter-backend.pages.dev/email-assets/men-logo-300x300-1.jpg"
                 alt="Northwest Men''s Encounter" width="72" height="72"
                 style="border-radius:50%;display:block;" />
          </td>
          <td style="padding:0 10px;">
            <img src="https://nwks-encounter-backend.pages.dev/email-assets/source-womens-logo-1024x1024.jpg"
                 alt="Northwest Kansas Women''s Encounter" width="72" height="72"
                 style="border-radius:50%;display:block;" />
          </td>
        </tr>
      </table>
      <p style="margin:0 0 4px;color:#c8c0a8;font-size:13px;letter-spacing:3px;text-transform:uppercase;">One week away</p>
      <h1 style="margin:0;color:#d4af37;font-size:28px;letter-spacing:1px;font-family:Georgia,serif;">
        NWKS Encounter
      </h1>
    </td>
  </tr>'
  ),
  updated_at = '2026-07-24T12:00:00.000Z'
WHERE program = 'shared' AND key = 'reminder';

-- ── Packing List (shared) -- add dual logo header block ──────────────────────
UPDATE email_templates SET
  body_html = REPLACE(
    body_html,
    '  <!-- Header -->
  <tr>
    <td style="background:#3d4a3a;padding:28px 40px;text-align:center;">
      <p style="margin:0 0 4px;color:#c8c0a8;font-size:13px;letter-spacing:3px;text-transform:uppercase;">What to bring</p>
      <h1 style="margin:0;color:#d4af37;font-size:26px;letter-spacing:1px;font-family:Georgia,serif;">
        NWKS Encounter &mdash; Packing List
      </h1>
    </td>
  </tr>',
    '  <!-- Header -->
  <tr>
    <td style="background:#3d4a3a;padding:28px 40px;text-align:center;">
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px;">
        <tr>
          <td style="padding:0 10px;">
            <img src="https://nwks-encounter-backend.pages.dev/email-assets/men-logo-300x300-1.jpg"
                 alt="Northwest Men''s Encounter" width="72" height="72"
                 style="border-radius:50%;display:block;" />
          </td>
          <td style="padding:0 10px;">
            <img src="https://nwks-encounter-backend.pages.dev/email-assets/source-womens-logo-1024x1024.jpg"
                 alt="Northwest Kansas Women''s Encounter" width="72" height="72"
                 style="border-radius:50%;display:block;" />
          </td>
        </tr>
      </table>
      <p style="margin:0 0 4px;color:#c8c0a8;font-size:13px;letter-spacing:3px;text-transform:uppercase;">What to bring</p>
      <h1 style="margin:0;color:#d4af37;font-size:26px;letter-spacing:1px;font-family:Georgia,serif;">
        NWKS Encounter &mdash; Packing List
      </h1>
    </td>
  </tr>'
  ),
  updated_at = '2026-07-24T12:00:00.000Z'
WHERE program = 'shared' AND key = 'packing_list';
