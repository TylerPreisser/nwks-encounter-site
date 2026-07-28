# Encounter Lifecycle — "Start Next Encounter" + year navigation

**Date:** 2026-07-28  ·  **Status:** built  ·  **Spec 1 of 2** (Spec 2 = "Ask the data" chat, deferred)

## Problem
When a new encounter comes around, the admin needs to archive the finished one
(registrations + testimonies/teachings), start next year fresh, and still be able
to browse/edit past years. It must be a **manual button** — post-encounter emails
may go out weeks after the dates end, so nothing should auto-roll-over.

## Decisions (from brainstorm)
- **One click:** archive the finished encounter AND open next year, atomically.
- **Next event = blank form** each year (year, dates, launch points, cap, reg-open).
- **Board sweep = clean sweep:** ALL of the finished encounter's testimonies/
  teachings → that year's history; the new board starts empty.
- **Year navigation = switcher on existing pages** (Registrations, Testimonies);
  past years are viewable **and editable**.
- **Per-program** rollover; button lives on the **Events** page.

## Design (in-place archival — no data moves)
- Registrations already link to an `events` row (per year). No change.
- Migration `0025`: add `testimonies.event_id` (nullable) + backfill each
  program-assigned row to its current encounter + index. Testimony inserts
  (admin create + inbound ingest) stamp the current `event_id`.
- Rollover: `POST /api/admin/events/rollover` (per program) — one atomic batch:
  (1) `UPDATE testimonies SET status='archived'` for the finishing event,
  (2) create the next `events` row from the form, (3) flip `is_current`.
  Guards: current must exist; must have ended (`force` overrides); `confirm_year`
  must equal `year` (typed confirmation). `GET .../rollover/preview` feeds the button.
- Cron: retired the auto-advance swap (`advanceCurrentEvents` removed) — it would
  fight the manual button and cut the email window short. Cron now only logs a
  needs-next advisory; scheduled-campaign sending is unchanged.
- Year filters: registrations list already supports `event_id`; added `event_id`
  to the testimonies list. Shared `EncounterYearSelect` (loads via `listEncounters`)
  on both pages; defaults to current, offers past years. Selecting a past year on
  the testimonies board auto-reveals its archived items.

## Tests
Migration/backfill + event_id stamping + year filter (testimonies); rollover
happy path + guards (not-ended, force, confirm mismatch, no-current, dup-year) +
preview (events); admin page tests updated for the switcher. API 575 / admin 313
/ photos 26 green. E2E + live verification follow.
