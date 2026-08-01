# Admin 2FA & Security Hardening — Design

**Date:** 2026-08-01
**Status:** Approved (Tyler, 2026-08-01)
**Scope:** Project B of two. Project A (attendees, seasons, interest queue) is shipped and live.

---

## 1. What this defends against

The realistic threat to NWKS is **not** a targeted attacker who wants this church specifically.
It is automated: credential stuffing from password dumps, bots probing the login form, phishing
pages that harvest a password, and scripted scraping of personal data once inside.

That matters because it picks the defenses. Against automation, the things that actually work are
a phishing-proof second factor, rate limiting, and lockout — not complexity for its own sake.

**What is behind this login:** every attendee's full name, home address, phone number, email,
church, dietary and health restrictions, and their prayer contact's name and phone. For a few
hundred people. That is the asset.

**Team size:** ~4 people, all equally trusted. Deliberately NO role tiers — with a team that
small, tiers are bureaucracy. An audit trail is what actually answers "what happened".

---

## 2. Login flow

```
email + password  ->  passkey (Face ID / Touch ID / security key)  ->  in
                       |
                       +-- Duo push          (only if Duo secrets are configured)
                       +-- emailed 6-digit code
                       +-- one-time recovery code
                       +-- another admin resets your 2FA   (logged)
```

**Password stays** as the first factor (existing scrypt hashing is already sound: N=16384, r=8,
p=1, 64-byte key, `timingSafeEqual` comparison). The passkey is added as a second factor, not a
replacement — losing the phone must not mean losing the password too.

**Why passkeys are the primary second factor:** a WebAuthn credential is bound by the browser to
the real origin. A phishing page on `nwks-encounter-backdoor.com` physically cannot replay it,
because the browser refuses to sign for the wrong domain. `userVerification: 'required'` means the
device must confirm a human (biometric or PIN), so a stolen unlocked laptop is not enough either.
This single property defeats the most common way small organizations actually get breached.

### Recovery ladder — nobody gets permanently locked out

Every rung is free and none depends on SMS.

1. **Passkey** — normal path.
2. **Duo push** — only offered when `DUO_IKEY`/`DUO_SKEY`/`DUO_API_HOST` are set as Worker
   secrets. Absent secrets, the option is not rendered and not accepted. This keeps Duo genuinely
   optional without a half-wired code path.
3. **Emailed code** — 6 digits, 10-minute expiry, single use, hashed at rest, rate limited.
4. **Recovery codes** — 10 single-use codes generated at enrollment, shown exactly once,
   downloadable/printable. This is the answer to "what if they can't get to their email" — the
   codes work with no phone, no email, and no network beyond the login page itself.
5. **Admin-assisted reset** — any other admin can clear a locked-out user's 2FA enrollment. The
   reset is written to the audit log with both user ids. With four people this is the realistic
   backstop, and logging is what keeps it from becoming a quiet backdoor.

---

## 3. Data model

```sql
-- admin_users gains:
totp_enabled            INTEGER NOT NULL DEFAULT 0   -- reserved; not used in this phase
webauthn_enabled        INTEGER NOT NULL DEFAULT 0   -- has >=1 active passkey
two_factor_required     INTEGER NOT NULL DEFAULT 0   -- enforcement flag, see rollout
failed_login_count      INTEGER NOT NULL DEFAULT 0
locked_until            TEXT                          -- ISO; NULL = not locked
password_changed_at     TEXT

CREATE TABLE webauthn_credentials (
  id, admin_user_id, credential_id (UNIQUE), public_key BLOB, counter INTEGER,
  transports TEXT, device_label TEXT, created_at, last_used_at
);

CREATE TABLE auth_codes (        -- emailed OTPs AND recovery codes
  id, admin_user_id, kind ('email_otp' | 'recovery'),
  code_hash TEXT,                -- sha-256; never the plaintext
  expires_at TEXT,               -- NULL for recovery codes (they don't expire)
  used_at TEXT, created_at
);

CREATE TABLE trusted_devices (
  id, admin_user_id, token_hash TEXT, label TEXT,
  user_agent TEXT, ip TEXT, expires_at TEXT, created_at, last_seen_at
);

CREATE TABLE login_attempts (    -- drives rate limiting + lockout
  id, email TEXT, ip TEXT, outcome TEXT, created_at
);

CREATE TABLE audit_log (
  id, admin_user_id, admin_email TEXT,   -- email denormalised: survives user deletion
  action TEXT, target_type TEXT, target_id TEXT,
  detail TEXT, ip TEXT, user_agent TEXT, created_at
);
```

**Nothing sensitive is stored in plaintext.** OTPs and recovery codes are stored as SHA-256
hashes, trusted-device tokens likewise. A database leak yields no usable credential.

---

## 4. Sessions and trust

- Session TTL drops **7 days → 12 hours**. The trusted-device cookie is what keeps that from
  being annoying.
- **Trusted device**: opt-in checkbox at 2FA time, 48 hours (Tyler: "every couple of days"),
  bound to one browser via a random 32-byte token stored hashed. It skips the *second factor*
  only — the password is still required. A stolen session cookie alone still cannot log in.
- **Step-up re-auth** regardless of trusted device, for: adding/removing an admin, resetting
  someone's 2FA, exporting the full attendee CSV, and sending a mass email. These are the actions
  that either exfiltrate everyone's data or reach every person on the list.
- Cookies: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`.
- Changing a password invalidates every other session for that user.

---

## 5. Against automation

- **Turnstile on the admin login form.** `TURNSTILE_SECRET` is already wired for public
  registration, so this is nearly free and directly targets scripted login attempts.
- **Rate limits:** per-email and per-IP on login; per-user on OTP issuance (so the email backup
  can't be used to spam someone) and on OTP verification (so a 6-digit code can't be brute forced
  — 10 minutes at even 10 guesses/min is nowhere near 10^6).
- **Lockout** with exponential backoff after repeated failures, recorded in `login_attempts`.
- **No user enumeration:** a failed login returns exactly the same body and timing shape whether
  the email exists or not. Same rule already applied to the interest form in Project A.

## 6. Response headers

Admin responses get `Content-Security-Policy` (self only; no inline script), `Strict-Transport-
Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Frame-Options: DENY`, and a restrictive `Permissions-Policy`. The admin is a same-origin SPA,
so a strict CSP costs nothing.

---

## 7. Rollout — this must not lock Tyler out

Enforcement is per-user (`two_factor_required`) and defaults **off**:

1. Deploy. Nothing changes for anyone; login still works exactly as today.
2. Each admin visits Security settings, enrolls a passkey, and is shown their 10 recovery codes.
3. Enrolling successfully flips `two_factor_required = 1` **for that user only**, and only after
   a passkey has been verified to work end to end.
4. Recovery codes and email OTP are live from the moment enforcement turns on.

An admin who never enrolls keeps password-only login — visibly flagged in the UI. That is a
deliberate trade: a half-migrated team must not mean a locked-out team.

---

## 8. Testing

Red test first, in the layer the code runs.

**API (vitest):** passkey registration + authentication happy paths; every failure mode — wrong
code, expired code, replayed/already-used code, unknown user, wrong password, forged WebAuthn
response, counter regression (cloned authenticator); rate limit and lockout thresholds; trusted
device honored and expiring; recovery code single-use; admin-assisted reset; audit rows written
for every sensitive action; step-up required on the four protected actions; no user enumeration.

**Admin (vitest):** enrollment screen, challenge screen and its fallbacks, recovery-code display,
security settings, locked-out messaging.

**E2E (Playwright):** real enrollment and login through Chrome's **virtual authenticator** (CDP
`WebAuthn.addVirtualAuthenticator`), so the passkey path is exercised by a real browser rather
than mocked.

**Live:** verify on the deployed admin before declaring done, per project doctrine.

---

## 9. Explicitly out of scope

TOTP authenticator apps (the `totp_enabled` column is reserved but unused — passkeys plus the
recovery ladder already cover it); SMS; per-role permission tiers; hardware-key attestation
verification (`attestationType: 'none'` is correct here — we care that the credential is bound to
our origin, not which vendor made the device); SSO/OIDC.

---

## 10. Dependency note

`@simplewebauthn/server@13` **is** verified to run in the Cloudflare Workers runtime — proven by
`functions/_api/__tests__/webauthn.runtime.test.ts`, written before any other Project B code. Its
`@peculiar/asn1-*` transitive deps ship CJS interop against `tslib`, which the Workers vitest pool
cannot externalize, so `vitest.config.ts` sets `ssr.noExternal` for that dependency subtree. If
the library had failed, the fallback was direct WebCrypto verification — never a silent downgrade
to email-only 2FA.
