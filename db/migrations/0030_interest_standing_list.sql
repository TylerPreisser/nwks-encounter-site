-- 0030_interest_standing_list.sql
-- Two changes, both from operator feedback after using the first version:
--
-- 1) THE INTEREST QUEUE IS A STANDING LIST, NOT A PER-ENCOUNTER ONE.
--    Originally an entry belonged to the encounter it was collected during, and
--    a rollover started the next encounter with an empty queue. Tyler: "we''ve
--    got to keep all those people that have expressed interest in the database,
--    and when we create a new encounter, boom, it just pops all of them up."
--    So an entry now persists until the person actually registers (or is
--    removed), and is re-invited whenever a new encounter becomes current --
--    whether that happens via rollover or by simply switching the current
--    encounter to one that already exists.
--
--    event_id is kept as "where they first raised their hand" (history), and
--    last_notified_event_id records the most recent invite. Uniqueness moves
--    from (event_id, email) to (program, role, email): one standing entry per
--    person per program per role.
--
-- 2) SERVERS CAN EXPRESS INTEREST TOO. Server sign-ups close independently of
--    attendee enrollment, so the waitlist needs the same role split.
--
-- interest_queue is referenced by nothing, so the rebuild needed to widen the
-- status CHECK is safe (contrast 0026, where registrations blocked the drop).

CREATE TABLE interest_queue_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program  TEXT    NOT NULL CHECK(program IN ('mens','women')),
  role     TEXT    NOT NULL DEFAULT 'attendee' CHECK(role IN ('attendee','server')),
  event_id INTEGER NOT NULL REFERENCES events(id),
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK(status IN ('waiting','notified','registered','removed')),
  notified_at            TEXT,
  last_notified_event_id INTEGER REFERENCES events(id),
  registered_at          TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO interest_queue_new
  (id, program, role, event_id, first_name, last_name, email, phone,
   status, notified_at, last_notified_event_id, created_at)
SELECT
   id, program, 'attendee', event_id, first_name, last_name, email, phone,
   status, notified_at, notified_event_id, created_at
FROM interest_queue;

DROP TABLE interest_queue;
ALTER TABLE interest_queue_new RENAME TO interest_queue;

-- One standing entry per person, per program, per role.
CREATE UNIQUE INDEX idx_interest_person ON interest_queue(program, role, email);
CREATE INDEX idx_interest_status ON interest_queue(program, status);

-- == Email templates ==
-- Four automated emails now exist per program:
--   confirmation                  registration confirmed (attendee)
--   confirmation_server           registration confirmed (server)
--   interest_confirmation         "you''re on the list" (attendee)
--   interest_confirmation_server  "you''re on the list" (server)
--   interest_invite               "registration is open" (attendee)
--   interest_invite_server        "server sign-ups are open" (server)
-- All editable in the Templates page like every other email.


