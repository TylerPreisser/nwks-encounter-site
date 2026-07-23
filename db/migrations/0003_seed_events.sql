-- Seed: two inaugural 2026 events (Men's and Women's), both marked is_current.
-- Run once after 0001_init.sql and 0002_seed_templates.sql.
-- Safe to re-run: INSERT OR IGNORE uses the UNIQUE(program, year) constraint.

INSERT OR IGNORE INTO events (
  program, year, title,
  start_date, end_date,
  launch_locations,
  attendee_registration_open,
  server_registration_open,
  is_current,
  created_at, updated_at
) VALUES
(
  'mens', 2026, 'Men''s Encounter 2026',
  '2026-08-06', '2026-08-08',
  '[]',
  1, 1, 1,
  '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
),
(
  'women', 2026, 'Women''s Encounter 2026',
  '2026-07-17', '2026-07-19',
  '[]',
  1, 1, 1,
  '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
);
