-- 0004_testimonies.sql
-- Testimonies & Teachings: email-in testimonies, attachments, and admin comments

CREATE TABLE testimonies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'testimony' CHECK(type IN ('testimony','teaching')),
  person_id INTEGER NULL REFERENCES people(id),
  program TEXT NULL CHECK(program IN ('mens','women')),
  from_email TEXT NOT NULL,
  from_name TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  match_confidence TEXT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','read','replied','archived')),
  received_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE testimony_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  testimony_id INTEGER NOT NULL REFERENCES testimonies(id),
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  r2_key TEXT NULL,
  link_url TEXT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE testimony_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  testimony_id INTEGER NOT NULL REFERENCES testimonies(id),
  admin_user_id INTEGER REFERENCES admin_users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_testimonies_program_status ON testimonies(program, status);
CREATE INDEX idx_testimonies_person_id ON testimonies(person_id);
