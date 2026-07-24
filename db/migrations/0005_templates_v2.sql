-- 0005_templates_v2.sql
-- Remove deprecated templates and upgrade remaining three with beautiful,
-- branded, program-specific HTML. Logo images served from email-assets/.
-- ASCII-only SQL; HTML entities used for non-ASCII characters.

-- ── Remove deprecated templates ─────────────────────────────────────────────
DELETE FROM email_templates WHERE key IN ('post_event', 'prayer_partner');

-- ── Men's Welcome ───────────────────────────────────────────────────────────
UPDATE email_templates SET
  name       = 'Welcome - Men''s Encounter',
  subject    = 'You''re registered for {{event_title}}!',
  body_html  = '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome</title></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr>
    <td style="background:#4a5240;padding:32px 40px;text-align:center;">
      <img src="https://nwks-encounter-backend.pages.dev/email-assets/men-logo-300x300-1.jpg"
           alt="Northwest Men''s Encounter" width="100" height="100"
           style="border-radius:50%;display:block;margin:0 auto 16px;" />
      <h1 style="margin:0;color:#d4af37;font-size:26px;letter-spacing:1px;font-family:Georgia,serif;">
        Northwest Men''s Encounter
      </h1>
      <p style="margin:8px 0 0;color:#c8c0a8;font-size:13px;letter-spacing:2px;text-transform:uppercase;">
        It is for freedom that Christ has set us free &mdash; Galatians 5:1
      </p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:40px 48px;">
      <p style="font-size:20px;margin:0 0 20px;color:#2c2c2c;">Hey {{first_name}},</p>

      <p style="margin:0 0 16px;line-height:1.7;">
        You''re in. We are grateful God stirred something in you to say <em>yes</em> to this
        weekend &mdash; and we believe He is going to meet you right where you are.
      </p>

      <!-- Event details box -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#f5f0e8;border-left:4px solid #d4af37;border-radius:4px;margin:24px 0;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#8a7a60;">Event Details</p>
            <p style="margin:0 0 6px;font-size:15px;"><strong>Event:</strong> {{event_title}}</p>
            <p style="margin:0 0 6px;font-size:15px;"><strong>Dates:</strong> {{start_date}} &mdash; {{end_date}}</p>
            <p style="margin:0;font-size:15px;"><strong>Launch location:</strong> {{launch_location}}</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 16px;line-height:1.7;">
        Connect with other men and take an honest look at your walk with God. Over the weekend
        you will examine 14 areas of your life through worship, testimonies, teaching, and ministry.
        Leave Thursday evening from your launch-point church. Park there &mdash; you will ride together.
        Return Saturday, 4:00&ndash;5:00 pm.
      </p>

      <p style="margin:0 0 16px;line-height:1.7;">
        More details &mdash; including your packing list and where to meet &mdash; will arrive in your inbox soon.
        If you have questions before then, just reply to this email and someone from our team will get back to you.
      </p>

      <p style="margin:32px 0 0;line-height:1.7;">
        Stand firm, brother.<br>
        <strong>&mdash; The NWKS Encounter Team</strong>
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#4a5240;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#c8c0a8;">
        Northwest Kansas Encounter &bull; nwksencounter.com
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>',
  body_text  = 'Hey {{first_name}},

You''re in. We are grateful God stirred something in you to say yes to this weekend -- and we believe He is going to meet you right where you are.

EVENT DETAILS
Event: {{event_title}}
Dates: {{start_date}} -- {{end_date}}
Launch location: {{launch_location}}

Connect with other men and take an honest look at your walk with God. Over the weekend you will examine 14 areas of your life through worship, testimonies, teaching, and ministry. Leave Thursday evening from your launch-point church. Park there -- you will ride together. Return Saturday, 4:00-5:00 pm.

More details -- including your packing list and where to meet -- will arrive in your inbox soon. If you have questions before then, just reply to this email and someone from our team will get back to you.

Stand firm, brother.
-- The NWKS Encounter Team',
  variables  = '["first_name","event_title","start_date","end_date","launch_location"]',
  updated_at = '2026-07-24T00:00:00.000Z'
WHERE program = 'mens' AND key = 'welcome';

-- ── Women's Welcome ──────────────────────────────────────────────────────────
UPDATE email_templates SET
  name       = 'Welcome - Women''s Encounter',
  subject    = 'You''re registered for {{event_title}}!',
  body_html  = '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome</title></head>
<body style="margin:0;padding:0;background:#fdf6f6;font-family:Georgia,serif;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdf6f6;">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr>
    <td style="background:#7b2d52;padding:32px 40px;text-align:center;">
      <img src="https://nwks-encounter-backend.pages.dev/email-assets/source-womens-logo-1024x1024.jpg"
           alt="Northwest Kansas Women''s Encounter" width="100" height="100"
           style="border-radius:50%;display:block;margin:0 auto 16px;" />
      <h1 style="margin:0;color:#f9d0e0;font-size:26px;letter-spacing:1px;font-family:Georgia,serif;">
        Northwest Kansas Women''s Encounter
      </h1>
      <p style="margin:8px 0 0;color:#e8b4c8;font-size:13px;letter-spacing:2px;text-transform:uppercase;">
        It is for freedom that Christ has set us free &mdash; Galatians 5:1
      </p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:40px 48px;">
      <p style="font-size:20px;margin:0 0 20px;color:#2c2c2c;">Hi {{first_name}},</p>

      <p style="margin:0 0 16px;line-height:1.7;">
        We are so glad you said yes! This weekend is set apart just for you &mdash; to rest, to be renewed,
        and to hear from the Lord in a fresh way.
      </p>

      <!-- Event details box -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#fdf6f6;border-left:4px solid #c06090;border-radius:4px;margin:24px 0;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#9a5070;">Event Details</p>
            <p style="margin:0 0 6px;font-size:15px;"><strong>Event:</strong> {{event_title}}</p>
            <p style="margin:0 0 6px;font-size:15px;"><strong>Dates:</strong> {{start_date}} &mdash; {{end_date}}</p>
            <p style="margin:0;font-size:15px;"><strong>Launch location:</strong> {{launch_location}}</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 16px;line-height:1.7;">
        This is not a typical retreat. Through teaching, testimonies, and worship, you are free to be
        as social or as quiet as you wish &mdash; no comfort zones forced. It is an individual, personal
        experience between you and God. Leave Friday evening from your launch-point church
        (Colby, Gove, Hays, Hoxie, Norton, Plainville, Sterling, or WaKeeney).
        Return Sunday, 4:00&ndash;5:00 pm.
      </p>

      <p style="margin:0 0 16px;line-height:1.7;">
        Keep an eye on your inbox &mdash; we will send packing details and what to expect closer to the date.
        In the meantime, reply to this email with any questions and our team will happily help.
      </p>

      <p style="margin:32px 0 0;line-height:1.7;">
        With joy,<br>
        <strong>&mdash; The NWKS Encounter Team</strong>
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#7b2d52;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#e8b4c8;">
        Northwest Kansas Encounter &bull; nwksencounter.com
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>',
  body_text  = 'Hi {{first_name}},

We are so glad you said yes! This weekend is set apart just for you -- to rest, to be renewed, and to hear from the Lord in a fresh way.

EVENT DETAILS
Event: {{event_title}}
Dates: {{start_date}} -- {{end_date}}
Launch location: {{launch_location}}

This is not a typical retreat. Through teaching, testimonies, and worship, you are free to be as social or as quiet as you wish -- no comfort zones forced. It is an individual, personal experience between you and God. Leave Friday evening from your launch-point church. Return Sunday, 4:00-5:00 pm.

Keep an eye on your inbox -- we will send packing details and what to expect closer to the date. In the meantime, reply to this email with any questions and our team will happily help.

With joy,
-- The NWKS Encounter Team',
  variables  = '["first_name","event_title","start_date","end_date","launch_location"]',
  updated_at = '2026-07-24T00:00:00.000Z'
WHERE program = 'women' AND key = 'welcome';

-- ── Reminder (shared) ────────────────────────────────────────────────────────
UPDATE email_templates SET
  name       = 'One-Week Reminder',
  subject    = '{{event_title}} is one week away, {{first_name}}!',
  body_html  = '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>One Week Away</title></head>
<body style="margin:0;padding:0;background:#f8f8f5;font-family:Georgia,serif;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f8f5;">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr>
    <td style="background:#3d4a3a;padding:32px 40px;text-align:center;">
      <p style="margin:0 0 4px;color:#c8c0a8;font-size:13px;letter-spacing:3px;text-transform:uppercase;">One week away</p>
      <h1 style="margin:0;color:#d4af37;font-size:28px;letter-spacing:1px;font-family:Georgia,serif;">
        NWKS Encounter
      </h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:40px 48px;">
      <p style="font-size:20px;margin:0 0 20px;color:#2c2c2c;">{{first_name}},</p>

      <p style="margin:0 0 16px;line-height:1.7;">
        One week from now you will be on your way to <strong>{{event_title}}</strong>.
        We are so excited to see what God has in store for you this weekend.
      </p>

      <!-- Countdown box -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#f8f8f5;border-left:4px solid #d4af37;border-radius:4px;margin:24px 0;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 6px;font-size:15px;"><strong>Dates:</strong> {{start_date}} &mdash; {{end_date}}</p>
            <p style="margin:0;font-size:15px;"><strong>Launch location:</strong> {{launch_location}}</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 16px;line-height:1.7;">
        Your packing list is in your previous email (or check below if this is your first one).
        Please make sure you have confirmed your ride to the launch location.
        If anything has changed in your plans, reply to this email as soon as possible so we can update your spot.
      </p>

      <p style="margin:0 0 16px;line-height:1.7;">
        Praying for you this week as you prepare your heart.
      </p>

      <p style="margin:32px 0 0;line-height:1.7;">
        See you soon!<br>
        <strong>&mdash; The NWKS Encounter Team</strong>
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#3d4a3a;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#c8c0a8;">
        Northwest Kansas Encounter &bull; nwksencounter.com
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>',
  body_text  = '{{first_name}},

One week from now you will be on your way to {{event_title}}. We are so excited to see what God has in store for you this weekend.

Dates: {{start_date}} -- {{end_date}}
Launch location: {{launch_location}}

Your packing list is in your previous email. Please make sure you have confirmed your ride to the launch location. If anything has changed in your plans, reply to this email as soon as possible so we can update your spot.

Praying for you this week as you prepare your heart.

See you soon!
-- The NWKS Encounter Team',
  variables  = '["first_name","event_title","start_date","end_date","launch_location"]',
  updated_at = '2026-07-24T00:00:00.000Z'
WHERE program = 'shared' AND key = 'reminder';

-- ── Packing List (shared) ────────────────────────────────────────────────────
-- Content drawn from src/content/men.js (bring:[]) and src/content/women.js (bring:[])
UPDATE email_templates SET
  name       = 'Packing List',
  subject    = 'What to bring to {{event_title}}',
  body_html  = '<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Packing List</title></head>
<body style="margin:0;padding:0;background:#f8f8f5;font-family:Georgia,serif;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f8f5;">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr>
    <td style="background:#3d4a3a;padding:28px 40px;text-align:center;">
      <p style="margin:0 0 4px;color:#c8c0a8;font-size:13px;letter-spacing:3px;text-transform:uppercase;">What to bring</p>
      <h1 style="margin:0;color:#d4af37;font-size:26px;letter-spacing:1px;font-family:Georgia,serif;">
        NWKS Encounter &mdash; Packing List
      </h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:40px 48px;">
      <p style="font-size:18px;margin:0 0 8px;color:#2c2c2c;">{{first_name}},</p>
      <p style="margin:0 0 24px;line-height:1.7;">
        Here is everything you will want to bring for <strong>{{event_title}}</strong>
        ({{start_date}} &mdash; {{end_date}}):
      </p>

      <!-- Packing list items (merged from men + women content) -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#f8f8f5;border-radius:6px;margin:0 0 24px;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#6a7a60;">
              Sleeping &amp; personal
            </p>
            <ul style="margin:0 0 16px;padding-left:20px;line-height:2.0;">
              <li>Sleeping bag <em>(or bedding for a twin bed)</em></li>
              <li>Pillow(s)</li>
              <li>Toiletries &amp; any personal medications</li>
              <li>Bath towel &amp; washcloth</li>
              <li>Flashlight</li>
            </ul>
            <p style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#6a7a60;">
              Clothing
            </p>
            <ul style="margin:0 0 16px;padding-left:20px;line-height:2.0;">
              <li>Casual clothes for the full weekend</li>
              <li>Layers &mdash; Kansas evenings can get cool</li>
              <li>A jacket</li>
            </ul>
            <p style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#6a7a60;">
              For the weekend sessions
            </p>
            <ul style="margin:0;padding-left:20px;line-height:2.0;">
              <li>A Bible <em>(don''t pack it &mdash; you will need it Thursday/Friday evening)</em></li>
              <li>Journal or notebook &amp; pen</li>
            </ul>
          </td>
        </tr>
      </table>

      <!-- Leave behind callout -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#fff8e8;border-left:4px solid #d4af37;border-radius:4px;margin:0 0 24px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#8a7a40;">
              Please leave behind
            </p>
            <p style="margin:0;line-height:1.7;">
              Unnecessary distractions. Consider limiting screen time so you can be fully present.
              This weekend is yours and God''s &mdash; protect it.
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 16px;line-height:1.7;">
        We will see you at <strong>{{launch_location}}</strong> on {{start_date}}.
        Reply to this email with any questions!
      </p>

      <p style="margin:32px 0 0;line-height:1.7;">
        Can''t wait,<br>
        <strong>&mdash; The NWKS Encounter Team</strong>
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#3d4a3a;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#c8c0a8;">
        Northwest Kansas Encounter &bull; nwksencounter.com
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>',
  body_text  = '{{first_name}},

Here is everything you will want to bring for {{event_title}} ({{start_date}} -- {{end_date}}):

SLEEPING & PERSONAL
- Sleeping bag (or bedding for a twin bed)
- Pillow(s)
- Toiletries & any personal medications
- Bath towel & washcloth
- Flashlight

CLOTHING
- Casual clothes for the full weekend
- Layers -- Kansas evenings can get cool
- A jacket

FOR THE WEEKEND SESSIONS
- A Bible (don''t pack it -- you will need it Thursday/Friday evening)
- Journal or notebook & pen

Please leave behind unnecessary distractions. Consider limiting screen time so you can be fully present.

We will see you at {{launch_location}} on {{start_date}}. Reply to this email with any questions!

Can''t wait,
-- The NWKS Encounter Team',
  variables  = '["first_name","event_title","start_date","end_date","launch_location"]',
  updated_at = '2026-07-24T00:00:00.000Z'
WHERE program = 'shared' AND key = 'packing_list';
