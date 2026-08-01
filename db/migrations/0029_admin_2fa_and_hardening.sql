-- 0029_admin_2fa_and_hardening.sql
-- Admin two-factor auth (passkeys), the recovery ladder, rate limiting, and the
-- audit trail. See docs/superpowers/specs/2026-08-01-admin-2fa-and-hardening-design.md
--
-- Behind this login sits every attendee's home address, phone, dietary/health
-- notes and prayer-contact details. The realistic threat is automated --
-- credential stuffing, bots, phishing -- which is what passkeys and rate
-- limiting are good at.
--
-- ROLLOUT SAFETY: every new flag defaults to OFF. Applying this migration
-- changes nothing about how anyone logs in. Enforcement (two_factor_required)
-- flips per-user, and only after that user has proven a working passkey.
-- A deploy must never be able to lock the team out of their own admin.

-- ── admin_users: enrollment state + lockout ─────────────────────────────────
-- Added as separate ALTERs (no table rebuild) precisely because admin_users is
-- referenced by testimony_comments; see 0026 for why that matters on D1.
ALTER TABLE admin_users ADD COLUMN totp_enabled        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN webauthn_enabled    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN two_factor_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN failed_login_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN locked_until        TEXT;
ALTER TABLE admin_users ADD COLUMN password_changed_at TEXT;

-- ── Passkeys ────────────────────────────────────────────────────────────────
-- public_key is the COSE key bytes returned at registration; counter is the
-- authenticator's signature counter, used to detect a cloned device (a counter
-- that goes backwards means the credential was copied).
CREATE TABLE webauthn_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL REFERENCES admin_users(id),
  credential_id TEXT NOT NULL UNIQUE,
  public_key    BLOB NOT NULL,
  counter       INTEGER NOT NULL DEFAULT 0,
  transports    TEXT,
  device_label  TEXT,
  created_at    TEXT NOT NULL,
  last_used_at  TEXT
);
CREATE INDEX idx_webauthn_user ON webauthn_credentials(admin_user_id);

-- ── Emailed one-time codes AND printable recovery codes ─────────────────────
-- Both are single-use secrets, so they share a table and differ only by `kind`.
-- Only the SHA-256 hash is stored: a database leak yields nothing usable.
-- expires_at is NULL for recovery codes -- they are the offline backstop for
-- "I can't get to my email", so an expiry would defeat the point.
CREATE TABLE auth_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL REFERENCES admin_users(id),
  kind TEXT NOT NULL CHECK(kind IN ('email_otp','recovery')),
  code_hash  TEXT NOT NULL,
  expires_at TEXT,
  used_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_auth_codes_user_kind ON auth_codes(admin_user_id, kind, used_at);

-- ── Trusted devices ─────────────────────────────────────────────────────────
-- Skips the SECOND factor for 48h on one browser. The password is still
-- required, so a stolen session cookie alone still cannot log in.
CREATE TABLE trusted_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL REFERENCES admin_users(id),
  token_hash TEXT NOT NULL UNIQUE,
  label      TEXT,
  user_agent TEXT,
  ip         TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);
CREATE INDEX idx_trusted_user ON trusted_devices(admin_user_id);

-- ── Login attempts (rate limiting + lockout) ────────────────────────────────
-- Keyed by email AND ip so a single account can be protected without letting
-- one attacker lock out the whole team from one address.
CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT,
  ip    TEXT,
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at);
CREATE INDEX idx_login_attempts_ip    ON login_attempts(ip, created_at);

-- ── Audit log ───────────────────────────────────────────────────────────────
-- admin_email is denormalised on purpose: the trail has to outlive the account
-- it describes, or it cannot answer "who did this" after someone is removed.
-- Deliberately NO foreign key on admin_user_id for the same reason.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER,
  admin_email   TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_user    ON audit_log(admin_user_id, created_at);
