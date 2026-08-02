// functions/_api/emails/loginCode.ts
// The admin sign-in code email.
//
// Deliberately NOT a row in email_templates: this is a security email, not
// office copy. It must not be editable from the admin panel, because anyone who
// could edit it could rewrite the instructions around a live one-time code, and
// a broken edit would lock the whole team out. It lives here, in the backend.
//
// Styled to match the admin LOGIN screen — near-black and neutral, not the
// per-program olive/cranberry. The login screen is brand-free because no
// program has been chosen at that point, and this email is part of that same
// moment.

export interface LoginCodeEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * @param code       the 6-digit one-time code
 * @param minutes    how long it stays valid
 * @param firstName  optional, for a warmer opening
 */
export function loginCodeEmail(code: string, minutes: number, firstName?: string): LoginCodeEmail {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

  // Letter-spaced digits in a monospace face: this is a string someone reads off
  // one screen and types into another, so legibility beats prettiness. Grouping
  // is avoided — a space in the middle invites typing the space.
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your sign-in code</title></head>
<body style="margin:0;padding:0;background:#0B0B0C;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0B0B0C;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="440" cellpadding="0" cellspacing="0" border="0" style="width:440px;max-width:440px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 24px 48px -20px rgba(0,0,0,.6);">

      <tr><td style="padding:34px 40px 8px;text-align:center;">
        <!-- Both marks, mirroring the admin login screen: this email belongs to
             the moment BEFORE a program has been chosen, and you toggle between
             men's and women's once you are inside. A table (not flex) because
             Outlook ignores flex. -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px;">
          <tr>
            <td style="padding:0 10px;">
              <img src="https://nwks-encounter-backend.pages.dev/email-assets/men-logo-300x300-1.jpg"
                   alt="NWKS Men's Encounter" width="52" height="52"
                   style="display:block;border-radius:50%;border:1px solid #E4E4E7;" />
            </td>
            <td style="padding:0;">
              <div style="width:1px;height:34px;background:#E4E4E7;"></div>
            </td>
            <td style="padding:0 10px;">
              <img src="https://nwks-encounter-backend.pages.dev/email-assets/source-womens-logo-1024x1024.jpg"
                   alt="NWKS Women's Encounter" width="52" height="52"
                   style="display:block;border-radius:50%;border:1px solid #E4E4E7;background:#FFFFFF;" />
            </td>
          </tr>
        </table>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:bold;color:#18181B;letter-spacing:-0.2px;">NWKS Encounter</div>
        <div style="margin-top:6px;font-size:11px;font-weight:600;letter-spacing:2px;color:#71717A;text-transform:uppercase;">Admin Panel</div>
      </td></tr>

      <tr><td style="padding:20px 40px 0;">
        <div style="height:1px;background:#E4E4E7;"></div>
      </td></tr>

      <tr><td style="padding:28px 40px 0;font-size:15px;line-height:1.6;color:#3F3F46;">
        <p style="margin:0 0 18px;">${greeting}</p>
        <p style="margin:0 0 24px;">Here is your code to finish signing in:</p>
      </td></tr>

      <tr><td style="padding:0 40px;">
        <div style="background:#FAFAFA;border:1px solid #E4E4E7;border-radius:12px;padding:22px 16px;text-align:center;">
          <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#18181B;text-indent:10px;">${code}</div>
        </div>
        <p style="margin:14px 0 0;text-align:center;font-size:13px;color:#71717A;">
          Expires in ${minutes} minutes. It can only be used once.
        </p>
      </td></tr>

      <tr><td style="padding:26px 40px 0;">
        <div style="background:#FFFFFF;border-left:3px solid #B91C1C;padding:10px 14px;">
          <p style="margin:0;font-size:13px;line-height:1.55;color:#7F1D1D;">
            If you did not just try to sign in, someone has your password. Change it as soon as you can.
          </p>
        </div>
      </td></tr>

      <tr><td style="padding:30px 40px 34px;">
        <div style="height:1px;background:#E4E4E7;margin-bottom:18px;"></div>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#A1A1AA;text-align:center;">
          This code was requested from the NWKS Encounter admin panel.<br />
          Nobody from NWKS will ever ask you for it.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  const text = `${greeting}

Here is your code to finish signing in:

    ${code}

It expires in ${minutes} minutes and can only be used once.

If you did not just try to sign in, someone has your password — change it as soon as you can. Nobody from NWKS will ever ask you for this code.

NWKS Encounter — Admin Panel`;

  return { subject: `${code} is your NWKS admin sign-in code`, html, text };
}
