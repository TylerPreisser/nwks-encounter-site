-- 0008_testimony_draft_workflow.sql
-- New draft workflow status lifecycle:
--   not_received, awaiting_draft_1, draft_1_review, awaiting_draft_2, draft_2_review, approved, archived
-- Default: not_received
--
-- SQLite cannot ALTER CHECK in-place. Strategy: recreate table.
--
-- Old->new mapping from 0007 statuses:
--   unfulfilled  -> not_received
--   waiting      -> awaiting_draft_1
--   draft_1      -> draft_1_review
--   awaiting     -> awaiting_draft_2
--   draft_2      -> draft_2_review
--   approved     -> approved
--   archived     -> archived

CREATE TABLE testimonies_v8 (
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
  status        TEXT    NOT NULL DEFAULT 'not_received'
                CHECK(status IN (
                  'not_received','awaiting_draft_1','draft_1_review',
                  'awaiting_draft_2','draft_2_review','approved','archived'
                )),
  assigned_at   TEXT    NULL,
  received_at   TEXT,
  created_at    TEXT    NOT NULL
);

INSERT INTO testimonies_v8
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
    WHEN 'unfulfilled' THEN 'not_received'
    WHEN 'waiting'     THEN 'awaiting_draft_1'
    WHEN 'draft_1'     THEN 'draft_1_review'
    WHEN 'awaiting'    THEN 'awaiting_draft_2'
    WHEN 'draft_2'     THEN 'draft_2_review'
    WHEN 'approved'    THEN 'approved'
    WHEN 'archived'    THEN 'archived'
    ELSE 'not_received'
  END,
  assigned_at,
  received_at,
  created_at
FROM testimonies;

DROP TABLE testimonies;

ALTER TABLE testimonies_v8 RENAME TO testimonies;

CREATE INDEX idx_testimonies_program_status ON testimonies(program, status);
CREATE INDEX idx_testimonies_person_id ON testimonies(person_id);
CREATE INDEX idx_testimonies_type ON testimonies(type);
