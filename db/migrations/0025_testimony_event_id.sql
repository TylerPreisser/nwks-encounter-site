-- 0025_testimony_event_id.sql
-- Tie testimonies/teachings to the encounter (event) they belong to, so the
-- board can be scoped per-encounter, archived on rollover, and navigated by year.
--
-- Registrations were already event_id-tagged; testimonies only had program.
-- Backfill: stamp every existing program-assigned testimony with that program's
-- current encounter. Unassigned (program IS NULL) rows stay event_id=NULL and
-- persist across encounters until they're assigned.

ALTER TABLE testimonies ADD COLUMN event_id INTEGER;

UPDATE testimonies
SET event_id = (
  SELECT e.id FROM events e
  WHERE e.program = testimonies.program AND e.is_current = 1
)
WHERE testimonies.program IS NOT NULL AND testimonies.event_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_testimonies_event_id ON testimonies(event_id);
