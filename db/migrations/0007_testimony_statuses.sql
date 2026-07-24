-- 0007_testimony_statuses.sql
-- New status lifecycle: unfulfilled, waiting, draft_1, draft_2, awaiting, approved (+ archived hidden)
-- Old->new mapping: in_progress->draft_1, awaiting_next->awaiting
-- Default: unfulfilled
--
-- SQLite cannot ALTER CHECK in-place. Strategy: recreate table.

CREATE TABLE testimonies_v7 (
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
                CHECK(status IN ('unfulfilled','waiting','draft_1','draft_2','awaiting','approved','archived')),
  assigned_at   TEXT    NULL,
  received_at   TEXT,
  created_at    TEXT    NOT NULL
);

INSERT INTO testimonies_v7
  (id, type, person_id, program, title, from_email, from_name,
   subject, body_text, body_html, match_confidence, status,
   assigned_at, received_at, created_at)
SELECT
  id,
  type,
  person_id,
  program,
  title,
  from_email,
  from_name,
  subject,
  body_text,
  body_html,
  match_confidence,
  CASE status
    WHEN 'in_progress'   THEN 'draft_1'
    WHEN 'awaiting_next' THEN 'awaiting'
    WHEN 'unfulfilled'   THEN 'unfulfilled'
    WHEN 'approved'      THEN 'approved'
    WHEN 'archived'      THEN 'archived'
    ELSE 'unfulfilled'
  END,
  assigned_at,
  received_at,
  created_at
FROM testimonies;

DROP TABLE testimonies;

ALTER TABLE testimonies_v7 RENAME TO testimonies;

CREATE INDEX idx_testimonies_program_status ON testimonies(program, status);
CREATE INDEX idx_testimonies_person_id ON testimonies(person_id);
CREATE INDEX idx_testimonies_type ON testimonies(type);
