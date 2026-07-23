-- schema.sql — canonical full schema mirror (reference only; authoritative source is db/migrations/)
-- Generated from: db/migrations/0001_init.sql
-- Keep in sync when new migrations are added.

-- 0001_init.sql — NWKS Encounter full schema
-- All timestamps: ISO-8601 UTC TEXT.  All dates: YYYY-MM-DD TEXT.
-- program CHECK enforced on every table that partitions by program.

CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  phone_type TEXT,
  address TEXT, city TEXT, state TEXT,
  church TEXT,
  times_attended INTEGER NOT NULL DEFAULT 0,
  times_served   INTEGER NOT NULL DEFAULT 0,
  first_seen_year     INTEGER,
  last_activity_year  INTEGER,
  notes TEXT,
  merged_into_id INTEGER REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_people_program_name ON people(program, last_name, first_name);
CREATE UNIQUE INDEX idx_people_program_email
  ON people(program, email)
  WHERE email IS NOT NULL AND merged_into_id IS NULL;

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  year INTEGER NOT NULL,
  title TEXT,
  start_date TEXT,
  end_date TEXT,
  launch_locations TEXT NOT NULL DEFAULT '[]',
  attendee_registration_open INTEGER NOT NULL DEFAULT 1,
  server_registration_open   INTEGER NOT NULL DEFAULT 1,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(program, year)
);

CREATE TABLE registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  event_id  INTEGER NOT NULL REFERENCES events(id),
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
CREATE INDEX idx_reg_program_event_role ON registrations(program, event_id, role);
CREATE INDEX idx_reg_person ON registrations(person_id);

CREATE TABLE email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT CHECK(program IN ('mens','women','shared')),
  key  TEXT NOT NULL,
  name TEXT NOT NULL,
  subject   TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  UNIQUE(program, key)
);

CREATE TABLE admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name  TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE email_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  template_key TEXT,
  subject   TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  segment TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','scheduled','sending','sent','failed')),
  scheduled_for    TEXT,
  recipient_count  INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES admin_users(id),
  created_at TEXT NOT NULL,
  sent_at    TEXT
);

CREATE TABLE email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES email_campaigns(id),
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  person_id INTEGER REFERENCES people(id),
  to_email TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('transactional','broadcast')),
  template_key TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','sent','delivered','bounced','failed')),
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at    TEXT
);

CREATE TABLE photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  year INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  caption TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  width INTEGER, height INTEGER, content_type TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_photos_program_year ON photos(program, year, sort);

CREATE TABLE ai_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  created_by INTEGER REFERENCES admin_users(id),
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES ai_threads(id),
  role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
  content   TEXT NOT NULL,
  tool_calls TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE ai_pending_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER REFERENCES ai_threads(id),
  program TEXT NOT NULL CHECK(program IN ('mens','women')),
  kind TEXT NOT NULL CHECK(kind IN ('send_campaign','schedule_campaign')),
  summary TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','executed')),
  created_at  TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES admin_users(id)
);
