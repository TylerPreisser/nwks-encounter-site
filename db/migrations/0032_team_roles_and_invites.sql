-- 0032_team_roles_and_invites.sql
-- Two permission levels and email invitations.
--
-- EXACTLY TWO ROLES, deliberately: 'super_admin' manages who has access;
-- 'admin' does everything else. With a team of about four, finer-grained tiers
-- are bureaucracy that nobody maintains -- the audit log already answers "who
-- did what". role already exists on admin_users (default 'admin'), so this only
-- promotes the owner.

UPDATE admin_users SET role = 'super_admin' WHERE email = 'tylerpreisser@gmail.com';

-- Invitations.
--
-- token_hash, never the token: the raw value exists only in the email we send.
-- A database leak must not hand someone a working invite link, and we cannot
-- resend a lost one -- a fresh invite is issued instead.
CREATE TABLE admin_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','super_admin')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by INTEGER REFERENCES admin_users(id),
  invited_by_email TEXT,
  expires_at  TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at  TEXT,
  created_at  TEXT NOT NULL
);

-- One live invite per address. Accepted and revoked rows fall out of the index
-- so the same person can be re-invited later without deleting history.
CREATE UNIQUE INDEX idx_invite_pending_email
  ON admin_invites(email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX idx_invite_expiry ON admin_invites(expires_at);
