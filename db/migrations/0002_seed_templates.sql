-- 0002_seed_templates.sql
-- Seed 5 template keys (7 rows total: shared + per-program variants).
-- Uses INSERT OR IGNORE so re-running is safe.

INSERT OR IGNORE INTO email_templates
  (program, key, name, subject, body_html, body_text, variables, updated_at)
VALUES

-- --- WELCOME: Men's --------------------------------------------------------
('mens', 'welcome', 'Welcome - Men''s Encounter',
 'You''re registered for {{event_title}}!',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#f5f0e8;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#4a5240;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#d4af37;font-size:28px;letter-spacing:1px;">NWKS Men''s Encounter</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">Hey {{first_name}},</p>
  <p>You''re in. We''re grateful God stirred something in you to say <em>yes</em> to this weekend -- and we believe He''s going to meet you right where you are.</p>
  <p><strong>Event:</strong> {{event_title}}<br>
     <strong>Dates:</strong> {{start_date}} - {{end_date}}<br>
     <strong>Launch location:</strong> {{launch_location}}</p>
  <p>More details -- including what to bring and where to meet -- will arrive in your inbox soon. If you have questions before then, just reply to this email and someone from our team will get back to you.</p>
  <p style="margin-top:32px;">Stand firm, brother.<br><strong>-- The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#f5f0e8;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 'Hey {{first_name}},

You''re in. We''re grateful God stirred something in you to say yes to this weekend -- and we believe He''s going to meet you right where you are.

Event: {{event_title}}
Dates: {{start_date}} - {{end_date}}
Launch location: {{launch_location}}

More details -- including what to bring and where to meet -- will arrive in your inbox soon. If you have questions before then, just reply to this email and someone from our team will get back to you.

Stand firm, brother.
-- The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z'),

-- --- WELCOME: Women's ------------------------------------------------------
('women', 'welcome', 'Welcome - Women''s Encounter',
 'You''re registered for {{event_title}}!',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#fdf6f6;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#8b3a5a;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#f9d0e0;font-size:28px;letter-spacing:1px;">NWKS Women''s Encounter</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">Hi {{first_name}},</p>
  <p>We are so glad you said yes! This weekend is set apart just for you -- to rest, to be renewed, and to hear from the Lord in a fresh way.</p>
  <p><strong>Event:</strong> {{event_title}}<br>
     <strong>Dates:</strong> {{start_date}} - {{end_date}}<br>
     <strong>Launch location:</strong> {{launch_location}}</p>
  <p>Keep an eye on your inbox -- we''ll send packing details and what to expect closer to the date. In the meantime, reply to this email with any questions and our team will happily help.</p>
  <p style="margin-top:32px;">With joy,<br><strong>-- The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#fdf6f6;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 'Hi {{first_name}},

We are so glad you said yes! This weekend is set apart just for you -- to rest, to be renewed, and to hear from the Lord in a fresh way.

Event: {{event_title}}
Dates: {{start_date}} - {{end_date}}
Launch location: {{launch_location}}

Keep an eye on your inbox -- we''ll send packing details and what to expect closer to the date. In the meantime, reply to this email with any questions and our team will happily help.

With joy,
-- The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z'),

-- --- REMINDER: Shared ------------------------------------------------------
('shared', 'reminder', 'One-Week Reminder',
 '{{event_title}} is one week away, {{first_name}}!',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#f8f8f5;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#3d4a3a;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#d4af37;font-size:26px;letter-spacing:1px;">NWKS Encounter</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">{{first_name}},</p>
  <p>One week from now you''ll be on your way to <strong>{{event_title}}</strong>. We''re so excited to see what God has in store for you this weekend.</p>
  <p><strong>Dates:</strong> {{start_date}} - {{end_date}}<br>
     <strong>Launch location:</strong> {{launch_location}}</p>
  <p>Your packing list is attached (or check the previous email we sent). Please make sure you''ve confirmed your ride to the launch location. If anything has changed in your plans, reply to this email as soon as possible so we can update your spot.</p>
  <p>Praying for you this week as you prepare your heart.</p>
  <p style="margin-top:32px;">See you soon!<br><strong>-- The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#f8f8f5;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 '{{first_name}},

One week from now you''ll be on your way to {{event_title}}. We''re so excited to see what God has in store for you this weekend.

Dates: {{start_date}} - {{end_date}}
Launch location: {{launch_location}}

Your packing list is attached (or check the previous email we sent). Please make sure you''ve confirmed your ride to the launch location. If anything has changed in your plans, reply to this email as soon as possible so we can update your spot.

Praying for you this week as you prepare your heart.

See you soon!
-- The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z'),

-- --- PACKING LIST: Shared --------------------------------------------------
('shared', 'packing_list', 'Packing List',
 'What to bring to {{event_title}}',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#f8f8f5;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#3d4a3a;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#d4af37;font-size:26px;letter-spacing:1px;">NWKS Encounter -- Packing List</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">{{first_name}},</p>
  <p>Here''s everything you''ll want to bring for <strong>{{event_title}}</strong> ({{start_date}} - {{end_date}}):</p>
  <ul style="line-height:2;">
    <li>Bible &amp; journal</li>
    <li>Pen / pencil</li>
    <li>Comfortable clothes for outdoor activities</li>
    <li>Layers -- Kansas evenings can get cool</li>
    <li>Toiletries &amp; any personal medications</li>
    <li>Bedding or sleeping bag (if overnight)</li>
    <li>Snacks for the road</li>
    <li>A heart ready to receive</li>
  </ul>
  <p><strong>Please leave behind:</strong> unnecessary distractions. Consider limiting screen time so you can be fully present.</p>
  <p>We''ll see you at <strong>{{launch_location}}</strong> on {{start_date}}. Reply to this email with any questions!</p>
  <p style="margin-top:32px;">Can''t wait,<br><strong>-- The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#f8f8f5;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 '{{first_name}},

Here''s everything you''ll want to bring for {{event_title}} ({{start_date}} - {{end_date}}):

- Bible & journal
- Pen / pencil
- Comfortable clothes for outdoor activities
- Layers -- Kansas evenings can get cool
- Toiletries & any personal medications
- Bedding or sleeping bag (if overnight)
- Snacks for the road
- A heart ready to receive

Please leave behind unnecessary distractions. Consider limiting screen time so you can be fully present.

We''ll see you at {{launch_location}} on {{start_date}}. Reply to this email with any questions!

Can''t wait,
-- The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z'),

-- --- PRAYER PARTNER: Shared ------------------------------------------------
('shared', 'prayer_partner', 'Prayer Partner Introduction',
 'Meet your prayer partner for {{event_title}}',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#f8f8f5;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#3d4a3a;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#d4af37;font-size:26px;letter-spacing:1px;">Prayer Partner</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">{{first_name}},</p>
  <p>As you prepare for <strong>{{event_title}}</strong>, we wanted to let you know that someone is praying for you specifically. One of the best things you can do between now and the weekend is to pray -- for yourself, for the team, and for those attending alongside you.</p>
  <p>We''d love for you to take a moment this week to pray:</p>
  <ul style="line-height:2;">
    <li>That God softens every heart coming into the weekend</li>
    <li>That distractions and obstacles fall away</li>
    <li>That the Holy Spirit moves powerfully at {{event_title}}</li>
  </ul>
  <p>If you have a specific prayer request you''d like us to lift up, simply reply to this email. We''re honored to stand with you.</p>
  <p style="margin-top:32px;">Praying with you,<br><strong>-- The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#f8f8f5;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 '{{first_name}},

As you prepare for {{event_title}}, we wanted to let you know that someone is praying for you specifically. One of the best things you can do between now and the weekend is to pray -- for yourself, for the team, and for those attending alongside you.

We''d love for you to take a moment this week to pray:
- That God softens every heart coming into the weekend
- That distractions and obstacles fall away
- That the Holy Spirit moves powerfully at {{event_title}}

If you have a specific prayer request you''d like us to lift up, simply reply to this email. We''re honored to stand with you.

Praying with you,
-- The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z'),

-- --- POST EVENT: Men's -----------------------------------------------------
('mens', 'post_event', 'Post-Event Thank You - Men''s',
 'Thank you for being part of {{event_title}}',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#f5f0e8;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#4a5240;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#d4af37;font-size:28px;letter-spacing:1px;">NWKS Men''s Encounter</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">{{first_name}},</p>
  <p>What a weekend. We are humbled and grateful to have shared those days with you at <strong>{{event_title}}</strong>.</p>
  <p>The work God began in you this weekend is not finished -- it''s just starting. Lean into what He stirred. Stay connected to your brothers. Don''t let the fire go out when you get home.</p>
  <p>If you have any reflections, feedback, or just want to share what God did, reply to this email. We''d love to hear from you.</p>
  <p>And if you know someone who needs this weekend next year -- bring them. That''s how the Kingdom grows.</p>
  <p style="margin-top:32px;">For His glory,<br><strong>-- The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#f5f0e8;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 '{{first_name}},

What a weekend. We are humbled and grateful to have shared those days with you at {{event_title}}.

The work God began in you this weekend is not finished -- it''s just starting. Lean into what He stirred. Stay connected to your brothers. Don''t let the fire go out when you get home.

If you have any reflections, feedback, or just want to share what God did, reply to this email. We''d love to hear from you.

And if you know someone who needs this weekend next year -- bring them. That''s how the Kingdom grows.

For His glory,
-- The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z'),

-- --- POST EVENT: Women's ---------------------------------------------------
('women', 'post_event', 'Post-Event Thank You - Women''s',
 'Thank you for being part of {{event_title}}',
 '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;font-family:Georgia,serif;background:#fdf6f6;color:#2c2c2c;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#8b3a5a;padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#f9d0e0;font-size:28px;letter-spacing:1px;">NWKS Women''s Encounter</h1>
</td></tr>
<tr><td style="padding:40px;">
  <p style="font-size:18px;margin-top:0;">{{first_name}},</p>
  <p>Thank you for trusting us with your weekend. It was an honor to walk alongside you at <strong>{{event_title}}</strong>.</p>
  <p>Carry what God placed in your heart this weekend back into your home, your community, and your church. You are not the same woman who arrived -- and that is a gift.</p>
  <p>Stay close to the women you met. Reach out to the team any time you need prayer or support. And keep your eyes open for who God might be nudging you to invite next year.</p>
  <p style="margin-top:32px;">With so much love,<br><strong>-- The NWKS Encounter Team</strong></p>
</td></tr>
<tr><td style="background:#fdf6f6;padding:20px 40px;text-align:center;font-size:12px;color:#888;">
  Northwest Kansas Encounter &bull; nwksencounter.com
</td></tr>
</table></td></tr></table>
</body></html>',
 '{{first_name}},

Thank you for trusting us with your weekend. It was an honor to walk alongside you at {{event_title}}.

Carry what God placed in your heart this weekend back into your home, your community, and your church. You are not the same woman who arrived -- and that is a gift.

Stay close to the women you met. Reach out to the team any time you need prayer or support. And keep your eyes open for who God might be nudging you to invite next year.

With so much love,
-- The NWKS Encounter Team',
 '["first_name","event_title","start_date","end_date","launch_location"]',
 '2026-07-23T00:00:00.000Z');
