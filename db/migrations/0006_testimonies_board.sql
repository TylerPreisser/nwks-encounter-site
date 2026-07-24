-- 0006_testimonies_board.sql
-- Redesign testimonies from email-inbox to fulfillment tracking board.
-- New statuses: unfulfilled, in_progress, awaiting_next, approved, archived
-- New columns:  title TEXT, assigned_at TEXT
--
-- SQLite cannot ALTER a CHECK constraint in-place. Strategy:
--   1. Create a temp table with the new shape
--   2. Copy existing rows, mapping old statuses to new lifecycle values
--   3. Drop old table
--   4. Rename temp table to testimonies
--   5. Recreate indexes
--
-- Old status mapping:
--   new | read | replied  ->  in_progress
--   archived              ->  archived

CREATE TABLE testimonies_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT    NOT NULL DEFAULT 'testimony'
                CHECK(type IN ('testimony','teaching')),
  person_id     INTEGER NULL REFERENCES people(id),
  program       TEXT    NULL CHECK(program IN ('mens','women')),
  title         TEXT    NULL,
  from_email    TEXT    NOT NULL DEFAULT '',
  from_name     TEXT    NOT NULL DEFAULT '',
  subject       TEXT,
  body_text     TEXT,
  body_html     TEXT,
  match_confidence TEXT NULL,
  status        TEXT    NOT NULL DEFAULT 'unfulfilled'
                CHECK(status IN ('unfulfilled','in_progress','awaiting_next','approved','archived')),
  assigned_at   TEXT    NULL,
  received_at   TEXT,
  created_at    TEXT    NOT NULL
);

INSERT INTO testimonies_new
  (id, type, person_id, program, title, from_email, from_name,
   subject, body_text, body_html, match_confidence, status,
   assigned_at, received_at, created_at)
SELECT
  id,
  type,
  person_id,
  program,
  NULL,
  from_email,
  from_name,
  subject,
  body_text,
  body_html,
  match_confidence,
  CASE status
    WHEN 'archived' THEN 'archived'
    ELSE 'in_progress'
  END,
  NULL,
  received_at,
  created_at
FROM testimonies;

DROP TABLE testimonies;

ALTER TABLE testimonies_new RENAME TO testimonies;

CREATE INDEX idx_testimonies_program_status ON testimonies(program, status);
CREATE INDEX idx_testimonies_person_id ON testimonies(person_id);
CREATE INDEX idx_testimonies_type ON testimonies(type);
