# Attendees, Seasons & the Interest Queue — Design

**Date:** 2026-08-01
**Status:** Approved (Tyler, 2026-08-01)
**Scope:** Project A of two. Project B (2FA + admin security hardening) is specced separately and lands next.

---

## 1. The business process this serves

NWKS Encounter runs **two encounters per year per program** — a spring one and a fall one — for
Men's and Women's separately. That's four encounters a year in total, and the two programs are
run by different teams and never mix: a registration lands in *either* the men's world or the
women's world, decided by which door the person walked through on the public site.

Each encounter has a lifecycle the admin panel has to model honestly:

1. **Open.** The encounter is `is_current` for its program and accepts sign-ups. Two roles
   register through two different forms: **attendees** (the people the weekend is *for*) and
   **servers** (the team that works it). Only one encounter per program is open at a time —
   NWKS never collects for spring and fall simultaneously.
2. **Filling.** As attendee registrations accumulate they're counted against `attendee_limit`.
   The venue has a real physical capacity; this is not a soft number.
3. **Closed.** Enrollment ends one of two ways — the cap is reached, or an admin closes it by
   hand. **Both must behave identically to the public**, because to a visitor there is no
   difference between "full" and "we stopped taking names."
4. **Interest.** Once closed, the public Register button becomes **Express Interest**. A short
   four-field form (first name, last name, email, phone) puts the person in a queue for the
   *next* encounter. This is the digital version of what NWKS does today by hand, which is
   answer emails from people who found out too late.
5. **Rollover.** When the encounter is over, an admin hits "Start Next Encounter." The next
   encounter is created and becomes current, and **everyone in the interest queue is emailed
   automatically** with a link to register. The new encounter starts with an empty queue.

The admin's daily job against that lifecycle is roster work: *who is coming, what do they need,
have they been before.* That's what the attendee and server pages exist to answer.

### What's already built (do not rebuild)

- `registrations` already stores a **complete snapshot** of every submission — contact details,
  address, church, launch location, shirt size, self-reported prior attendance, who invited them,
  prayer contact name and phone, dietary/health restrictions, free-text questions, plus an
  `extra` JSON blob holding every custom question added in the Forms editor.
- `attendee_registration_open` / `server_registration_open` toggles exist per encounter.
- `attendee_limit` + `attendee_full_message` exist, are enforced server-side in
  `register.ts:406`, and are surfaced to the public site via `attendee_full` / `attendee_open`
  on `GET /api/public/events/current`.
- `src/js/app.js:64` already reads `attendee_full`, `attendee_open`, and `attendee_full_message`
  into `NWKS.regStatus[door]`.
- `NWKS.forms.render(specKey, mountEl)` renders any form declared in `src/content/forms.js`,
  with themed styling, phone formatting, and validation.
- The "Start Next Encounter" rollover flow exists (`POST /api/admin/events/rollover`).
- `PersonPage.tsx:194-230` already renders a full registration — every named field plus every
  `extra` key — inside a collapsible event-history row.

### The gaps this design closes

| Gap | Cause |
|---|---|
| Can't have Spring **and** Fall 2026 | `events` has `UNIQUE(program, year)` |
| Roster shows 6 of ~18 captured fields | `RegistrationTable.tsx` renders a fixed 6-column table |
| Attendees and servers share one filtered list | No separate pages |
| No interest queue | Doesn't exist |
| Close-enrollment is buried in an edit form | No one-click control |

---

## 2. Data model

### 2.1 Seasons

Add `season` to `events` and replace the year-unique constraint. SQLite cannot drop a constraint
in place, so this is a **single create/copy/drop/rename rebuild** — the new table is created with
`season` already on it, so there is no separate `ALTER TABLE ... ADD COLUMN` step:

```sql
CREATE TABLE events_new (
  ...                                             -- every existing column, unchanged
  season TEXT NOT NULL DEFAULT 'fall' CHECK(season IN ('spring','fall')),
  UNIQUE(program, year, season)                   -- was UNIQUE(program, year)
);
INSERT INTO events_new (...) SELECT ..., 'fall' FROM events;
DROP TABLE events; ALTER TABLE events_new RENAME TO events;
```

There are **zero** registrations in production, so no data is at risk. The `registrations.event_id`
foreign key targets `events(id)` and ids are preserved by the copy.

The constraint permits 0, 1, or 2 encounters per program per year — it never *forces* two. This
matters for history: 2026 has one encounter per program on the books and must not require a
phantom spring row to be invented for it.

**Display name** is derived, never stored: `"Spring 2026"` / `"Fall 2026"`.

**Sort order** puts the most recent encounter first. Note that a plain `season DESC` sorts
alphabetically and would wrongly place spring above fall, so ordering must be explicit:

```sql
ORDER BY year DESC, CASE season WHEN 'fall' THEN 1 ELSE 0 END DESC
```

The same ordinal governs "which season comes next" in rollover: fall → spring of the following
year, spring → fall of the same year.

**Existing rows:** Men's 2026 (Aug 6–8) and Women's 2026 (Jul 17–19) are both mid-summer and are
each their program's only 2026 encounter. Both are labeled **`fall`**. Rollover then produces
Spring 2027 and Fall 2027 normally.

### 2.2 Interest queue

```sql
CREATE TABLE interest_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program  TEXT    NOT NULL CHECK(program IN ('mens','women')),
  event_id INTEGER NOT NULL REFERENCES events(id),   -- encounter they were turned away from
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK(status IN ('waiting','notified','registered','expired')),
  notified_at       TEXT,
  notified_event_id INTEGER REFERENCES events(id),   -- encounter they were invited to
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_interest_event_email ON interest_queue(event_id, email);
CREATE INDEX idx_interest_program_status ON interest_queue(program, status);
```

Entries are **scoped to the encounter they were collected during**, so a rollover starts the new
encounter with an empty queue while the old list survives for history. `notified_event_id`
records which encounter someone was eventually invited to, which is how conversion gets measured.
Nothing is ever hard-deleted.

`status` transitions: `waiting` → `notified` (email sent on rollover) → `registered` (they
completed a real registration for `notified_event_id`). `expired` is reserved for entries whose
notify email hard-bounced; nothing sets it automatically in this phase.

### 2.3 Email template

One new seeded row in `email_templates`: key `interest_invite`, program-scoped (`mens`/`women`),
editable in the existing Templates page like every other email. Variables: `{{first_name}}`,
`{{encounter_name}}`, `{{start_date}}`, `{{end_date}}`, `{{register_url}}`.

---

## 3. API

### Admin

| Route | Purpose |
|---|---|
| `GET /api/admin/registrations?role=attendee\|server&event_id=` | Existing; gains full-field rows |
| `GET /api/admin/registrations/:id` | **New.** One registration, every field + parsed `extra` |
| `GET /api/admin/interest?event_id=` | **New.** The queue for an encounter |
| `POST /api/admin/events/:id/enrollment` | **New.** `{ attendee_open, server_open }` one-click toggle |
| `POST /api/admin/events/rollover` | Existing; gains `season`, and `notify_interest` |
| `POST /api/admin/events` | Existing; gains required `season` |
| `PATCH /api/admin/events/:id` | Existing; gains `season` |

Every existing event response gains `season` and a derived `display_name`.

### Public

| Route | Purpose |
|---|---|
| `GET /api/public/events/current` | Existing; gains `season`, `display_name` |
| `POST /api/register/interest` | **New.** Four fields; 202 on accept |

`POST /api/register/interest` accepts only when the encounter is genuinely closed
(`!attendee_open`). If enrollment is open it returns 409 telling the client to register normally —
this prevents a stale browser tab from parking someone in a queue when they could just sign up.

---

## 4. Admin UI

### Navigation

`Registrations` is replaced by **`Attendees`** and **`Servers`**. Both render the same roster
component with a different `role`, scoped by the encounter dropdown, which now reads
"Fall 2026 / Spring 2027" instead of bare years.

### Roster

A list, not a six-column squeeze. Each row:

- **Primary line:** full name + a first-timer / returning badge
- **Secondary line:** email, phone, launch location, shirt size
- **Flag:** a visible marker when `dietary_health` is non-empty — the single field most likely
  to matter operationally and most likely to be missed in a table

Search, role-scoped counts, and CSV export carry over unchanged. The whole row is the click
target, not just the name.

### Detail page

`PersonPage` becomes the detail view, reached at `/people/:id?reg=<registrationId>&from=<path>`:

- Profile card + attendance badges
- **The registration you clicked into, expanded by default** — every named field, every custom
  Forms-editor answer
- Full history of past encounters below, collapsed
- **`← Back to Fall 2026 Attendees`** honoring `from`

The field-rendering logic currently trapped inside `PersonPage.tsx` is extracted into a
`RegistrationDetail` component used by both the detail page and any future consumer. PersonPage
ends up smaller than it started.

### Encounter controls

On the encounter view: a live `registered / limit` count, a one-click **Close enrollment** /
**Reopen enrollment** button, and an interest-queue count with a link to the list.

### Rollover dialog

Gains a season selector (defaulting to the opposite of the current encounter's season, rolling
the year over when going fall → spring) and a checkbox:

> ☑ Email the 31 people on the interest list

Checked by default, showing the real count. The email is automatic; the count is visible so a
blast is never a surprise.

---

## 5. Public site

When `attendee_open` is false — whether by cap or by hand — the Register button becomes
**Express Interest** and opens a form rendered through `NWKS.forms.render('interest_mens' | 'interest_women', …)`
declared in `src/content/forms.js`. Four fields: first name, last name, email, phone. Because it
goes through the same renderer, it inherits identical styling, phone formatting, and validation
with no new form code.

Above the fields, the encounter's `attendee_full_message` explains why. On success, a themed
confirmation: they'll get an email when the next encounter opens.

Server registration is governed independently by `server_registration_open` — closing attendee
enrollment does not close server sign-ups.

---

## 6. Error handling & edge cases

- **Duplicate interest** collapses on `UNIQUE(event_id, email)` — a second submission updates the
  existing row and returns success. One person, one email.
- **Already registered** for the current encounter → 200 with a message saying so. The public
  response never discloses whether an email exists in the system.
- **Partial email failure on rollover:** entries stay `waiting` rather than flipping to
  `notified`, the failure is logged to `email_log`, and the admin sees an explicit banner with a
  retry. No silent drops, per project doctrine.
- **Rollover with an empty queue** skips the email step silently — no empty campaign.
- **Cap lowered below current count:** existing registrations stand; enrollment simply reads full.
- **Race at the cap boundary:** the count check and insert already run server-side in
  `register.ts`; the interest endpoint re-reads status at submit time rather than trusting the
  client.
- **No current encounter** for a program → public site shows the existing "no current event"
  path; the interest form is not offered.

---

## 7. Testing

Red test first, in the layer the code runs in.

**API (vitest, `functions/_api/__tests__/`)**
- `UNIQUE(program, year, season)` permits Spring+Fall in one year, rejects a duplicate season
- Migration preserves both existing events and labels them `fall`
- `GET /admin/registrations/:id` returns every named field and parsed `extra`
- `POST /register/interest`: accepts when closed, 409 when open, dedupes on repeat, rejects bad input
- Enrollment toggle flips both flags and is reflected on the public endpoint
- Rollover creates the next season, flips `is_current`, notifies `waiting` entries, marks them
  `notified` with `notified_event_id`, and leaves them `waiting` when the send fails

**Admin (vitest, `admin/src/__tests__/`)**
- Roster renders name/badges/contact and the dietary flag; empty state; role scoping
- `RegistrationDetail` renders named + extra fields, including a custom Forms question
- Detail page expands the clicked registration and renders a back link honoring `from`
- Encounter controls call the toggle and reflect the returned state

**E2E (Playwright)**
- Register → hit cap → button swaps to Express Interest → submit → appears in admin queue
- Roster → click row → detail → back returns to the same roster
- Rollover with notify checked → entries flip to `notified`

**Visual verification (required before merge):** Playwright screenshots of the attendee roster,
the detail page, and the public Express Interest form at desktop and mobile widths, reviewed by
eye — not by grep.

---

## 8. Explicitly out of scope

Per-attendee notes; cabin/table assignments; CSV import; interest-queue priority ordering;
auto-conversion of interest entries into registrations; SMS notification. All deferred.

---

## 9. Migration order

1. `0026_encounter_seasons.sql` — season column + constraint rebuild + label existing rows `fall`
2. `0027_interest_queue.sql` — new table + indexes
3. `0028_interest_invite_template.sql` — seed the email template
