-- 0027_interest_queue.sql
-- The "Express Interest" waitlist.
--
-- When an encounter's attendee enrollment is closed -- either because the cap
-- was reached or because an admin closed it by hand -- the public Register
-- button becomes "Express Interest" and collects four fields. On rollover,
-- everyone still 'waiting' is emailed a link to register for the new encounter.
--
-- Entries are SCOPED to the encounter they were collected during (event_id), so
-- a rollover starts the new encounter with an empty queue while the old list
-- survives for history. Nothing is ever hard-deleted: "31 people asked about
-- Fall 2026 after we filled up" is exactly the number that says raise the cap.
--
-- notified_event_id records which encounter they were eventually invited to,
-- which is how conversion gets measured (waiting -> notified -> registered).
-- 'expired' is reserved for hard-bounced invites; nothing sets it in this phase.

CREATE TABLE interest_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program  TEXT    NOT NULL CHECK(program IN ('mens','women')),
  event_id INTEGER NOT NULL REFERENCES events(id),
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK(status IN ('waiting','notified','registered','expired')),
  notified_at       TEXT,
  notified_event_id INTEGER REFERENCES events(id),
  created_at TEXT NOT NULL
);

-- One person, one entry per encounter. A repeat submission updates the existing
-- row rather than queueing a second invite email to the same address.
CREATE UNIQUE INDEX idx_interest_event_email ON interest_queue(event_id, email);

-- Drives the admin queue list and the rollover "who still needs notifying" scan.
CREATE INDEX idx_interest_program_status ON interest_queue(program, status);
