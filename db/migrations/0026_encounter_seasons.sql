-- 0026_encounter_seasons.sql
-- NWKS runs TWO encounters per year per program: a spring one and a fall one.
-- The original schema had UNIQUE(program, year), which made "Spring 2026" and
-- "Fall 2026" mutually exclusive. This adds a `season` column and re-keys the
-- table on (program, year, season).
--
-- SQLite cannot drop or alter a UNIQUE constraint in place, so `events` has to
-- be rebuilt (create/copy/drop/rename, same strategy as 0006_testimonies_board).
--
-- WHY registrations IS REBUILT TOO
-- --------------------------------
-- registrations.event_id is declared `REFERENCES events(id)`, and D1 enforces
-- foreign keys. DROP TABLE performs an implicit DELETE FROM, so dropping the old
-- `events` while any registration still points at it fails outright with
-- SQLITE_CONSTRAINT. D1 does NOT honour `PRAGMA defer_foreign_keys` or
-- `PRAGMA legacy_alter_table` from a migration, so the constraint cannot simply
-- be deferred -- verified empirically against a local D1 carrying 3,013 rows.
--
-- The fix is ordering: build both new tables first, point the new registrations
-- at the new events, drop the old pair once nothing references them, then rename.
-- Renaming events_new -> events makes SQLite rewrite the child's REFERENCES
-- clause to match, so the final schema is exactly what a fresh install produces.
--
-- Production currently holds 0 registrations, so the naive version would have
-- LOOKED fine on deploy and broken the first time this ran anywhere with data
-- (a restored backup, a dev box, a second environment). It is fixed properly.
--
-- testimonies.event_id is deliberately NOT involved: 0025 added it as a plain
-- INTEGER with no REFERENCES clause, so it never blocked the drop.
--
-- Ids are copied verbatim throughout -- registrations.event_id must keep
-- pointing at the same encounters.
--
-- Existing rows: the two seeded 2026 encounters (Men's Aug 6-8, Women's Jul
-- 17-19) are each their program's only encounter on the books and both fall in
-- the back half of the year, so both are labeled 'fall'. Rollover then produces
-- Spring 2027 and Fall 2027 normally.
--
-- NOTE: the constraint permits 0, 1, or 2 encounters per program-year. It never
-- FORCES two. 2026 legitimately has one, and no phantom spring row is invented.

-- 1. The new events shape.
CREATE TABLE events_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  year INTEGER NOT NULL,
  season TEXT NOT NULL DEFAULT 'fall' CHECK(season IN ('spring','fall')),
  title TEXT,
  start_date TEXT,
  end_date TEXT,
  launch_locations TEXT NOT NULL DEFAULT '[]',
  attendee_registration_open INTEGER NOT NULL DEFAULT 1,
  server_registration_open   INTEGER NOT NULL DEFAULT 1,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  attendee_limit INTEGER,
  attendee_full_message TEXT,
  UNIQUE(program, year, season)
);

INSERT INTO events_new
  (id, program, year, season, title, start_date, end_date, launch_locations,
   attendee_registration_open, server_registration_open, is_current,
   created_at, updated_at, attendee_limit, attendee_full_message)
SELECT
  id, program, year, 'fall', title, start_date, end_date, launch_locations,
  attendee_registration_open, server_registration_open, is_current,
  created_at, updated_at, attendee_limit, attendee_full_message
FROM events;

-- 2. registrations, identical in every respect except that its foreign key now
--    points at events_new. Columns are listed explicitly rather than SELECT *
--    so a future column added to one table can never silently shift the copy.
CREATE TABLE registrations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  event_id  INTEGER NOT NULL REFERENCES events_new(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  role TEXT NOT NULL CHECK(role IN ('attendee','server')),
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  email TEXT, phone TEXT, phone_type TEXT,
  address TEXT, city TEXT, state TEXT,
  launch_location TEXT, shirt_size TEXT, church TEXT,
  times_attended_self_report TEXT,
  invited_by TEXT,
  prayer_contact_name TEXT, prayer_contact_phone TEXT,
  dietary_health TEXT,
  questions TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK(status IN ('registered','cancelled','attended','no_show')),
  created_at TEXT NOT NULL
);

INSERT INTO registrations_new
  (id, program, event_id, person_id, role, first_name, last_name,
   email, phone, phone_type, address, city, state,
   launch_location, shirt_size, church, times_attended_self_report, invited_by,
   prayer_contact_name, prayer_contact_phone, dietary_health, questions,
   extra, status, created_at)
SELECT
   id, program, event_id, person_id, role, first_name, last_name,
   email, phone, phone_type, address, city, state,
   launch_location, shirt_size, church, times_attended_self_report, invited_by,
   prayer_contact_name, prayer_contact_phone, dietary_health, questions,
   extra, status, created_at
FROM registrations;

-- 3. Drop the old pair. registrations first (nothing references it), which
--    leaves events unreferenced and therefore droppable.
DROP TABLE registrations;
DROP TABLE events;

-- 4. Rename into place. Renaming events_new rewrites registrations_new's
--    REFERENCES clause from events_new to events.
ALTER TABLE events_new RENAME TO events;
ALTER TABLE registrations_new RENAME TO registrations;

-- 5. Indexes lived on the dropped tables; recreate them.
CREATE INDEX idx_reg_program_event_role ON registrations(program, event_id, role);
CREATE INDEX idx_reg_person ON registrations(person_id);

-- Encounter lists are always ordered most-recent-first. A plain `season DESC`
-- sorts alphabetically and would put 'spring' above 'fall', so every query
-- orders by an explicit ordinal instead:
--   ORDER BY year DESC, CASE season WHEN 'fall' THEN 1 ELSE 0 END DESC
CREATE INDEX idx_events_program_year_season ON events(program, year, season);
