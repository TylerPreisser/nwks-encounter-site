// functions/_api/emails/inviteEmail.ts
// The "you've been invited to the NWKS admin" email.
//
// Backend-only, like loginCode.ts and for the same reason: it wraps a live
// single-use credential, so it must not be editable from the admin panel.
// Neutral near-black with BOTH Encounter logos, matching the login screen —
// this arrives before the recipient has any program context at all.

export interface InviteEmailInput {
  inviterName: string;
  acceptUrl: string;
  expiresInDays: number;
}

export function inviteEmail({ inviterName, acceptUrl, expiresInDays }: InviteEmailInput) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You've been invited</title></head>
<body style="margin:0;padding:0;background:#0B0B0C;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0B0B0C;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="440" cellpadding="0" cellspacing="0" border="0" style="width:440px;max-width:440px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 24px 48px -20px rgba(0,0,0,.6);">
      <tr><td style="padding:34px 40px 8px;text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px;">
          <tr>
            <td style="padding:0 10px;"><img src="https://nwks-encounter-backend.pages.dev/email-assets/men-logo-300x300-1.jpg" alt="NWKS Men's Encounter" width="52" height="52" style="display:block;border-radius:50%;border:1px solid #E4E4E7;" /></td>
            <td style="padding:0;"><div style="width:1px;height:34px;background:#E4E4E7;"></div></td>
            <td style="padding:0 10px;"><img src="https://nwks-encounter-backend.pages.dev/email-assets/source-womens-logo-1024x1024.jpg" alt="NWKS Women's Encounter" width="52" height="52" style="display:block;border-radius:50%;border:1px solid #E4E4E7;background:#FFFFFF;" /></td>
          </tr>
        </table>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:bold;color:#18181B;">NWKS Encounter</div>
        <div style="margin-top:6px;font-size:11px;font-weight:600;letter-spacing:2px;color:#71717A;text-transform:uppercase;">Admin Panel</div>
      </td></tr>

      <tr><td style="padding:20px 40px 0;"><div style="height:1px;background:#E4E4E7;"></div></td></tr>

      <tr><td style="padding:28px 40px 0;font-size:15px;line-height:1.6;color:#3F3F46;">
        <p style="margin:0 0 18px;"><strong style="color:#18181B;">${inviterName}</strong> has invited you to help run the NWKS Encounter admin panel.</p>
        <p style="margin:0 0 26px;">Use the button below to choose a password and set up sign-in security. It only takes a minute.</p>
      </td></tr>

      <tr><td style="padding:0 40px;text-align:center;">
        <a href="${acceptUrl}" style="display:inline-block;background:#18181B;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px;">Accept your invitation</a>
        <p style="margin:14px 0 0;font-size:13px;color:#71717A;">This link expires in ${expiresInDays} days and can only be used once.</p>
      </td></tr>

      <tr><td style="padding:30px 40px 34px;">
        <div style="height:1px;background:#E4E4E7;margin-bottom:18px;"></div>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#A1A1AA;text-align:center;">
          If you weren't expecting this, you can ignore it &mdash; nothing happens until you accept.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = `${inviterName} has invited you to help run the NWKS Encounter admin panel.

Accept your invitation and set your password:
${acceptUrl}

This link expires in ${expiresInDays} days and can only be used once.
If you weren't expecting this, you can ignore it — nothing happens until you accept.

NWKS Encounter — Admin Panel`;

  return { subject: `${inviterName} invited you to the NWKS Encounter admin`, html, text };
}
