-- 0009_testimony_substates.sql
-- Expands draft workflow to 3 drafts with sub-states per draft.
--
-- New status set (ASCII-only):
--   not_received
--   draft_1_awaiting, draft_1_review
--   draft_2_awaiting, draft_2_review
--   draft_3_awaiting, draft_3_review
--   approved
--   archived
--
-- Column mapping (status -> kanban column):
--   not_received               -> not_received
--   draft_1_awaiting           -> draft_1
--   draft_1_review             -> draft_1
--   draft_2_awaiting           -> draft_2
--   draft_2_review             -> draft_2
--   draft_3_awaiting           -> draft_3
--   draft_3_review             -> draft_3
--   approved                   -> approved
--   archived                   -> (archived section)
--
-- Migration from 0008 statuses:
--   not_received    -> not_received
--   awaiting_draft_1 -> draft_1_awaiting
--   draft_1_review  -> draft_1_review
--   awaiting_draft_2 -> draft_2_awaiting
--   draft_2_review  -> draft_2_review
--   approved        -> approved
--   archived        -> archived
--
-- SQLite cannot ALTER CHECK in-place. Strategy: recreate table.

CREATE TABLE testimonies_v9 (
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
                  'not_received',
                  'draft_1_awaiting','draft_1_review',
                  'draft_2_awaiting','draft_2_review',
                  'draft_3_awaiting','draft_3_review',
                  'approved','archived'
                )),
  assigned_at   TEXT    NULL,
  received_at   TEXT,
  created_at    TEXT    NOT NULL
);

INSERT INTO testimonies_v9
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
    WHEN 'not_received'    THEN 'not_received'
    WHEN 'awaiting_draft_1' THEN 'draft_1_awaiting'
    WHEN 'draft_1_review'  THEN 'draft_1_review'
    WHEN 'awaiting_draft_2' THEN 'draft_2_awaiting'
    WHEN 'draft_2_review'  THEN 'draft_2_review'
    WHEN 'approved'        THEN 'approved'
    WHEN 'archived'        THEN 'archived'
    ELSE 'not_received'
  END,
  assigned_at,
  received_at,
  created_at
FROM testimonies;

DROP TABLE testimonies;

ALTER TABLE testimonies_v9 RENAME TO testimonies;

CREATE INDEX idx_testimonies_program_status ON testimonies(program, status);
CREATE INDEX idx_testimonies_person_id ON testimonies(person_id);
CREATE INDEX idx_testimonies_type ON testimonies(type);
