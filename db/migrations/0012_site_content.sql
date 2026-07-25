-- 0012_site_content.sql
-- CMS data model: editable form fields + page text blocks.
-- ASCII-only SQL.

-- ── form_fields ──────────────────────────────────────────────────────────────
-- One row per editable registration question.
-- program: 'mens' | 'women'
-- role:    'attendee' | 'server'
-- name:    stable field key (e.g. first_name) -- used as data column identifier
-- label:   editable question text shown on the form and used as column header
-- type:    text|textarea|dropdown|checkbox|radio|email|phone
-- options: JSON array for dropdown/checkbox/radio; NULL otherwise
-- required: 1 = required, 0 = optional
-- help:    optional hint text shown below the field
-- sort:    display order (ascending)
-- active:  1 = shown, 0 = hidden
CREATE TABLE IF NOT EXISTS form_fields (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  program    TEXT    NOT NULL CHECK(program IN ('mens','women')),
  role       TEXT    NOT NULL CHECK(role IN ('attendee','server')),
  name       TEXT    NOT NULL,
  label      TEXT    NOT NULL,
  type       TEXT    NOT NULL CHECK(type IN ('text','textarea','dropdown','checkbox','radio','email','phone')),
  options    TEXT,
  required   INTEGER NOT NULL DEFAULT 1,
  help       TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_form_fields_program_role_sort
  ON form_fields(program, role, sort);

-- ── page_content ─────────────────────────────────────────────────────────────
-- Editable page text blocks (hero copy, invite text, etc.).
-- key:   stable identifier (e.g. hero_tagline)
-- label: human-readable name shown in the admin editor
-- value: the editable text
-- sort:  display order in the editor
CREATE TABLE IF NOT EXISTS page_content (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  program    TEXT    NOT NULL CHECK(program IN ('mens','women')),
  key        TEXT    NOT NULL,
  label      TEXT    NOT NULL,
  value      TEXT    NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_page_content_program_key
  ON page_content(program, key);

-- ── Seed: form_fields from canonical MENS_ATTENDEE_FIELDS ────────────────────
INSERT INTO form_fields (program, role, name, label, type, options, required, help, sort) VALUES
  ('mens','attendee','first_name','First Name','text',NULL,1,NULL,1),
  ('mens','attendee','last_name','Last Name','text',NULL,1,NULL,2),
  ('mens','attendee','email','Email Address','email',NULL,1,NULL,3),
  ('mens','attendee','phone','Phone Number','phone',NULL,1,NULL,4),
  ('mens','attendee','phone_type','Phone Type','dropdown','["Cell","Home","Work","Other"]',1,NULL,5),
  ('mens','attendee','address','Address','text',NULL,1,NULL,6),
  ('mens','attendee','city','City','text',NULL,1,NULL,7),
  ('mens','attendee','state','State','text',NULL,1,NULL,8),
  ('mens','attendee','launch_location','Launch Location','dropdown','["Hays","Norton","Plainville","Hoxie","Colby","Gove","Sterling","Wakeeney"]',1,NULL,9),
  ('mens','attendee','shirt_size','Shirt Size','dropdown','["XS","S","M","L","XL","XXL","XXXL","XXXXL"]',1,NULL,10),
  ('mens','attendee','church','What Church do you attend, if any?','text',NULL,1,NULL,11),
  ('mens','attendee','times_attended_self_report','How many times have you attended?','dropdown','["This will be my first time!","1","2","More than 2"]',1,NULL,12),
  ('mens','attendee','invited_by','Who invited you or how did you hear about Men''s Encounter?','text',NULL,1,NULL,13),
  ('mens','attendee','prayer_contact_name','Contact Name','text',NULL,1,NULL,14),
  ('mens','attendee','prayer_contact_phone','Contact Phone Number','phone',NULL,1,NULL,15),
  ('mens','attendee','dietary_health','Dietary or health restrictions?','text',NULL,0,NULL,16),
  ('mens','attendee','questions','Questions or concerns?','textarea',NULL,0,NULL,17);

-- ── Seed: form_fields from canonical MENS_SERVER_FIELDS ──────────────────────
INSERT INTO form_fields (program, role, name, label, type, options, required, help, sort) VALUES
  ('mens','server','first_name','First Name','text',NULL,1,NULL,1),
  ('mens','server','last_name','Last Name','text',NULL,1,NULL,2),
  ('mens','server','email','Email Address','email',NULL,1,NULL,3),
  ('mens','server','phone','Phone Number','phone',NULL,1,NULL,4),
  ('mens','server','phone_type','Phone Type','dropdown','["Cell","Home","Work","Other"]',1,NULL,5),
  ('mens','server','address','Address','text',NULL,1,NULL,6),
  ('mens','server','city','City','text',NULL,1,NULL,7),
  ('mens','server','state','State','text',NULL,1,NULL,8),
  ('mens','server','launch_location','Launch Location','dropdown','["Hays","Norton","Plainville","Hoxie","Colby","Gove","Sterling","Wakeeney"]',1,NULL,9),
  ('mens','server','shirt_size','Shirt Size','dropdown','["XS","S","M","L","XL","XXL","XXXL","XXXXL"]',1,NULL,10),
  ('mens','server','church','What Church do you attend?','text',NULL,1,NULL,11),
  ('mens','server','times_served_self_report','How many times have you served?','dropdown','["This will be my first time serving!","1","2","More than 2"]',1,NULL,12),
  ('mens','server','invited_by','How did you hear about serving?','text',NULL,0,NULL,13),
  ('mens','server','prayer_contact_name','Contact Name','text',NULL,1,NULL,14),
  ('mens','server','prayer_contact_phone','Contact Phone Number','phone',NULL,1,NULL,15),
  ('mens','server','dietary_health','Dietary or health restrictions?','text',NULL,0,NULL,16),
  ('mens','server','questions','Questions or concerns?','textarea',NULL,0,NULL,17);

-- ── Seed: form_fields from canonical WOMENS_ATTENDEE_FIELDS ──────────────────
INSERT INTO form_fields (program, role, name, label, type, options, required, help, sort) VALUES
  ('women','attendee','first_name','First Name','text',NULL,1,NULL,1),
  ('women','attendee','last_name','Last Name','text',NULL,1,NULL,2),
  ('women','attendee','launch_location','Select a Launch Point location','dropdown','["Colby","Gove","Hays","Hoxie","Norton","Plainville","Sterling","Wakeeney"]',1,NULL,3),
  ('women','attendee','invited_by','Who invited you to Encounter?','text',NULL,0,NULL,4),
  ('women','attendee','email','Email Address','email',NULL,1,NULL,5),
  ('women','attendee','email_confirm','Confirm Email Address','text',NULL,1,NULL,6),
  ('women','attendee','prior_attendance','Have you attended Women''s Encounter previously?','checkbox','["1st Time Attendee - Never attended Women''s Encounter","I have attended a previous Women''s Encounter - I understand that 1st time attendees will get priority","I have attended previously but had a major life event & would be beneficial to attend again"]',1,NULL,7),
  ('women','attendee','life_event_note','Note to Leadership (major life event)','textarea',NULL,0,NULL,8),
  ('women','attendee','phone','Your Phone Number','phone',NULL,1,NULL,9),
  ('women','attendee','phone_type','Phone type','checkbox','["Land Line"]',0,NULL,10),
  ('women','attendee','address','Your Address','text',NULL,1,NULL,11),
  ('women','attendee','city','City','text',NULL,1,NULL,12),
  ('women','attendee','state','State','text',NULL,1,NULL,13),
  ('women','attendee','zip','Zip','text',NULL,1,NULL,14),
  ('women','attendee','church','What church do you attend, if any?','text',NULL,0,NULL,15),
  ('women','attendee','prayer_contact_name','Contact Name','text',NULL,1,NULL,16),
  ('women','attendee','prayer_contact_phone','Contact Person''s Phone Number','phone',NULL,1,NULL,17),
  ('women','attendee','shirt_size','T-Shirt Size','radio','["Small","Medium","Large","X-Large","XX-Large","XXX-Large","Other"]',1,NULL,18),
  ('women','attendee','sandwich_preference','What kind of sandwich do you prefer?','dropdown','["Ham/bun","Ham/lettuce wrapped unwich","Turkey/bun","Turkey/lettuce wrapped unwich","Veggie/bun","Veggie/lettuce wrapped unwich"]',1,NULL,19),
  ('women','attendee','questions','Questions or concerns?','textarea',NULL,0,NULL,20);

-- ── Seed: page_content starter blocks ────────────────────────────────────────
INSERT INTO page_content (program, key, label, value, sort) VALUES
  ('mens','hero_tagline','Hero Tagline','An encounter that changes everything.',1),
  ('mens','event_invite_text','Event Invite Text','Join us for a powerful weekend retreat designed for men who are ready to go deeper in faith, community, and purpose.',2),
  ('mens','what_is_encounter','What Is Encounter','Men''s Encounter is a weekend retreat where men from across Northwest Kansas come together for worship, teaching, and authentic community. Expect honest conversations, life-changing moments, and friendships that last.',3),
  ('mens','contact_note','Contact Note','Have questions? Reach out to your local launch location leader or email us at info@nwksencounter.com.',4),
  ('women','hero_tagline','Hero Tagline','A weekend where women encounter the love of God.',1),
  ('women','event_invite_text','Event Invite Text','Join us for a transformational weekend retreat built for women who are hungry for more - more of God, more community, and more life.',2),
  ('women','what_is_encounter','What Is Encounter','Women''s Encounter is a weekend retreat where women from across Northwest Kansas gather for worship, teaching, and deep community. Come as you are and leave changed.',3),
  ('women','contact_note','Contact Note','Have questions? Reach out to your local launch location leader or email us at info@nwksencounter.com.',4);
