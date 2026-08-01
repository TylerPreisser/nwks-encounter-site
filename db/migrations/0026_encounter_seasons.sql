-- 0026_encounter_seasons.sql
-- NWKS runs TWO encounters per year per program: a spring one and a fall one.
-- The original schema had UNIQUE(program, year), which made "Spring 2026" and
-- "Fall 2026" mutually exclusive. This adds a `season` column and re-keys the
-- table on (program, year, season).
--
-- SQLite cannot drop or alter a UNIQUE constraint in place, so this is a
-- create/copy/drop/rename rebuild (same strategy as 0006_testimonies_board.sql).
-- The new table is created WITH `season` already on it — there is deliberately
-- no separate ALTER TABLE ... ADD COLUMN step.
--
-- Ids are copied verbatim: registrations.event_id references events(id) and must
-- keep pointing at the same encounters.
--
-- Existing rows: the two seeded 2026 encounters (Men's Aug 6-8, Women's Jul
-- 17-19) are each their program's only encounter on the books and both fall in
-- the back half of the year, so both are labeled 'fall'. Rollover then produces
-- Spring 2027 and Fall 2027 normally.
--
-- NOTE: the constraint permits 0, 1, or 2 encounters per program-year. It never
-- FORCES two. 2026 legitimately has one, and no phantom spring row is invented.

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

DROP TABLE events;

ALTER TABLE events_new RENAME TO events;

-- Encounter lists are always ordered most-recent-first. A plain `season DESC`
-- sorts alphabetically and would put 'spring' above 'fall', so every query
-- orders by an explicit ordinal instead:
--   ORDER BY year DESC, CASE season WHEN 'fall' THEN 1 ELSE 0 END DESC
CREATE INDEX idx_events_program_year_season ON events(program, year, season);
