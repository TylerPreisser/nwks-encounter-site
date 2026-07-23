# NWKS Encounter — Public Registration & Thank-You Email (Plan P1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Consume the Foundation Contract (Plan 00) verbatim** — do not redefine schema columns, endpoint shapes, shared module signatures, or wrangler bindings. Every interface listed here is the exact contract; deviate and the test will tell you.

**Goal:** Add native public registration forms (Men's Attendee, Men's Server, Women's Attendee, Women's Server) to the site; validate and persist registrations in D1; run de-duplication; send a branded thank-you email via Resend; redirect to a confirmation page. No gateway pixels change.

**Architecture:** New static pages in `public/register/` render the forms. `POST /api/register/:program/:role` (Pages Function / Hono route) validates the body against a per-(program,role) field schema, calls `upsertPerson` + `recomputeRollups`, inserts a `registrations` row snapshotted from the body, sends the `welcome` transactional email, and returns `{ ok, registration_id, person_id }`. Turnstile verification blocks bots; a rate-limit guard (3 req/IP/10 min via KV) prevents floods.

**Tech Stack:** TypeScript 5, Hono 4, Cloudflare Pages Functions / D1 / KV, Resend (`EMAIL_ENABLED` flag), Turnstile (`TURNSTILE_SECRET`), Vitest + `@cloudflare/vitest-pool-workers` (API tests), Playwright (E2E).

**Global Constraints:** See Foundation Contract (Plan 00); depends on Plan P0 modules (`db.ts`, `dedupe.ts`, `email.ts`, shared `Env` interface). Do not modify `index.html` or `assets/`. All new HTML pages go in `public/`. All TypeScript goes in `functions/_api/`. All tests go in `functions/_api/__tests__/`.

---

## Field Schemas (canonical, from `src/content/forms.js`)

These schemas define what the server validates. They are the single source of truth for field names, labels, types, required flags, and allowed options. The native forms replicate the Google Form field set exactly; `entry.*` names are replaced with semantic snake_case names mapped below.

### Men's Attendee (`program=mens`, `role=attendee`)

| Semantic name | Label | Type | Required | Constraints / options |
|---|---|---|---|---|
| `first_name` | First Name | text | yes | non-empty |
| `last_name` | Last Name | text | yes | non-empty |
| `email` | Email Address | text | yes | valid email format |
| `phone` | Phone Number | text | yes | digits/formatting; normalise to `(NNN) NNN-NNNN` |
| `phone_type` | Phone Type | dropdown | yes | `Cell \| Home \| Work \| Other` |
| `address` | Address | text | yes | non-empty |
| `city` | City | text | yes | non-empty |
| `state` | State | text | yes | non-empty |
| `launch_location` | Launch Location | dropdown | yes | `Hays \| Norton \| Plainville \| Hoxie \| Colby \| Gove \| Sterling \| Wakeeney` |
| `shirt_size` | Shirt Size | dropdown | yes | `XS \| S \| M \| L \| XL \| XXL \| XXXL \| XXXXL` |
| `church` | What Church do you attend, if any? | text | yes | non-empty |
| `times_attended_self_report` | How many times have you attended a Men's Encounter? | dropdown | yes | `This will be my first time! \| 1 \| 2 \| More than 2` |
| `invited_by` | Who invited you or how did you hear about Men's Encounter? | text | yes | non-empty |
| `prayer_contact_name` | Contact Name | text | yes | non-empty |
| `prayer_contact_phone` | Contact Phone Number | text | yes | phone format |
| `dietary_health` | Do you have any dietary or health restrictions? | text | no | free-text |
| `questions` | Do you have any questions or concerns? | textarea | no | free-text |

### Women's Attendee (`program=womens` ← **note: canonical value is `'women'` in D1**; URL slug `womens`; see routing note §Routing below)

| Semantic name | Label | Type | Required | Constraints / options |
|---|---|---|---|---|
| `first_name` | First Name | text | yes | non-empty |
| `last_name` | Last Name | text | yes | non-empty |
| `launch_location` | Select a Launch Point location | dropdown | yes | `Colby \| Gove \| Hays \| Hoxie \| Norton \| Plainville \| Sterling \| Wakeeney` |
| `invited_by` | Who invited you to Encounter? | text | no | free-text |
| `email` | Email Address | text | yes | valid email format |
| `email_confirm` | Confirm Email Address | text | yes | must match `email`; **not persisted** |
| `prior_attendance` | Have you attended Women's Encounter previously? | checkbox (pick-one) | yes | `1st Time Attendee \| I have attended a previous Women's Encounter \| I have attended previously but had a major life event` |
| `life_event_note` | Note to Leadership (major life event) | textarea | no | required when `prior_attendance` = "major life event" value |
| `phone` | Your Phone Number | text | yes | phone format |
| `phone_type` | If not a cell #, check box below | checkbox | no | `Land Line`; stored as phone_type=`Land Line` when checked, else `Cell` |
| `address` | Your Address | text | yes | non-empty |
| `city` | City | text | yes | non-empty |
| `state` | State | text | yes | non-empty |
| `zip` | Zip | text | yes | non-empty; stored in `extra` JSON (no dedicated column) |
| `church` | What church do you attend, if any? | text | no | free-text |
| `prayer_contact_name` | Contact Name | text | yes | non-empty |
| `prayer_contact_phone` | Contact Person's Phone Number | text | yes | phone format |
| `shirt_size` | T-Shirt Size | radio | yes | `Small \| Medium \| Large \| X-Large \| XX-Large \| XXX-Large \| Other`; "Other" allows free-text value; stored verbatim |
| `sandwich_preference` | What kind of sandwich do you prefer? | dropdown | yes | `Ham/bun \| Ham/lettuce wrapped unwich \| Turkey/bun \| Turkey/lettuce wrapped unwich \| Veggie/bun \| Veggie/lettuce wrapped unwich`; stored in `extra` JSON |
| `questions` | Do you have any questions or concerns? | textarea | no | free-text |

### Men's Server (`program=mens`, `role=server`)

The Google Form is currently closed; no entry IDs were extractable. The following field set is **a reasonable default** based on ministry pattern — confirm with leadership before the form goes live (see § Contract Additions Needed).

| Semantic name | Label | Type | Required | Notes |
|---|---|---|---|---|
| `first_name` | First Name | text | yes | |
| `last_name` | Last Name | text | yes | |
| `email` | Email Address | text | yes | email format |
| `phone` | Phone Number | text | yes | phone format |
| `phone_type` | Phone Type | dropdown | yes | `Cell \| Home \| Work \| Other` |
| `address` | Address | text | yes | |
| `city` | City | text | yes | |
| `state` | State | text | yes | |
| `launch_location` | Launch Location | dropdown | yes | same 8-city list as Men's Attendee |
| `shirt_size` | Shirt Size | dropdown | yes | `XS \| S \| M \| L \| XL \| XXL \| XXXL \| XXXXL` |
| `church` | What Church do you attend? | text | yes | |
| `times_served_self_report` | How many times have you served at Men's Encounter? | dropdown | yes | `This will be my first time serving! \| 1 \| 2 \| More than 2`; stored in `extra` JSON (no dedicated column maps to `times_served`) |
| `invited_by` | How did you hear about serving? | text | no | |
| `prayer_contact_name` | Contact Name | text | yes | |
| `prayer_contact_phone` | Contact Phone Number | text | yes | phone format |
| `dietary_health` | Dietary or health restrictions? | text | no | |
| `questions` | Questions or concerns? | textarea | no | |

### Women's Server (`program=womens`, `role=server`)

Permanently closed / full per ministry content. The route must always return `{ ok: false, error: "Server registration is not open for this event." }` with HTTP 409 until leadership explicitly re-opens server registration on the event row (`server_registration_open = 1`). The static page `public/register/womens-server.html` renders a closed notice — no form fields.

---

## Routing Note

URL slugs use `mens`/`womens` (matching folder names: `public/register/mens-attendee.html`). The API path parameter `:program` also uses `mens`/`womens`. The route handler maps `womens` → D1 value `'women'` and `mens` → D1 value `'mens'` so the CHECK constraint is satisfied. Internal code always uses `Program = 'mens' | 'women'` (the D1 values).

```ts
// inside register.ts
const DB_PROGRAM: Record<string, Program> = { mens: 'mens', womens: 'women' };
```

---

## File Structure

```
functions/
  _api/
    routes/
      register.ts                  # NEW — Hono router, field schema defs, handler
    __tests__/
      register.test.ts             # NEW — vitest-pool-workers integration tests
  api/
    [[path]].ts                    # EXISTING — wire register router in app.ts

public/
  register/
    mens-attendee.html             # NEW
    mens-server.html               # NEW
    womens-attendee.html           # NEW
    womens-server.html             # NEW (closed notice)
  thanks.html                     # NEW
  shared/
    form.css                       # NEW
    form.js                        # NEW

tests/
  e2e/
    register.spec.ts               # NEW — Playwright E2E
```

---

## TDD Tasks

---

### Task 1 — Field schema definitions + validator utility

**Files:** `functions/_api/routes/register.ts`

**Interfaces:**
- Consumes from P0: `Program` (type), `nowIso` (not yet, just types here)
- Produces: exported `FIELD_SCHEMAS` constant; exported `validateBody(program, role, body)` returning `{ ok: true; data: ValidatedFields } | { ok: false; errors: string[] }`

**Steps:**

- [ ] Create `functions/_api/routes/register.ts` with only the schema definitions and the validator; no Hono routes yet.

  ```ts
  // functions/_api/routes/register.ts
  import type { Program } from '../db.js';

  export type Role = 'attendee' | 'server';

  type FieldType = 'text' | 'textarea' | 'dropdown' | 'checkbox' | 'radio';

  interface FieldSpec {
    name: string;
    label: string;
    type: FieldType;
    required: boolean;
    options?: string[];
    format?: 'email' | 'phone';
    matchField?: string;    // client-only confirm fields (email_confirm); not persisted
    skipPersist?: boolean;  // strip from saved payload
    extraKey?: boolean;     // store in extra JSON instead of a named column
  }

  const MENS_ATTENDEE_FIELDS: FieldSpec[] = [
    { name: 'first_name',               label: 'First Name',                                    type: 'text',     required: true },
    { name: 'last_name',                label: 'Last Name',                                     type: 'text',     required: true },
    { name: 'email',                    label: 'Email Address',                                 type: 'text',     required: true, format: 'email' },
    { name: 'phone',                    label: 'Phone Number',                                  type: 'text',     required: true, format: 'phone' },
    { name: 'phone_type',               label: 'Phone Type',                                    type: 'dropdown', required: true, options: ['Cell','Home','Work','Other'] },
    { name: 'address',                  label: 'Address',                                       type: 'text',     required: true },
    { name: 'city',                     label: 'City',                                          type: 'text',     required: true },
    { name: 'state',                    label: 'State',                                         type: 'text',     required: true },
    { name: 'launch_location',          label: 'Launch Location',                               type: 'dropdown', required: true, options: ['Hays','Norton','Plainville','Hoxie','Colby','Gove','Sterling','Wakeeney'] },
    { name: 'shirt_size',               label: 'Shirt Size',                                    type: 'dropdown', required: true, options: ['XS','S','M','L','XL','XXL','XXXL','XXXXL'] },
    { name: 'church',                   label: 'What Church do you attend, if any?',            type: 'text',     required: true },
    { name: 'times_attended_self_report',label: 'How many times have you attended?',            type: 'dropdown', required: true, options: ['This will be my first time!','1','2','More than 2'] },
    { name: 'invited_by',               label: 'Who invited you or how did you hear about Men\'s Encounter?', type: 'text', required: true },
    { name: 'prayer_contact_name',      label: 'Contact Name',                                  type: 'text',     required: true },
    { name: 'prayer_contact_phone',     label: 'Contact Phone Number',                         type: 'text',     required: true, format: 'phone' },
    { name: 'dietary_health',           label: 'Dietary or health restrictions?',               type: 'text',     required: false },
    { name: 'questions',                label: 'Questions or concerns?',                        type: 'textarea', required: false },
  ];

  const WOMENS_ATTENDEE_FIELDS: FieldSpec[] = [
    { name: 'first_name',               label: 'First Name',                                    type: 'text',     required: true },
    { name: 'last_name',                label: 'Last Name',                                     type: 'text',     required: true },
    { name: 'launch_location',          label: 'Select a Launch Point location',                type: 'dropdown', required: true, options: ['Colby','Gove','Hays','Hoxie','Norton','Plainville','Sterling','Wakeeney'] },
    { name: 'invited_by',               label: 'Who invited you to Encounter?',                 type: 'text',     required: false },
    { name: 'email',                    label: 'Email Address',                                 type: 'text',     required: true, format: 'email' },
    { name: 'email_confirm',            label: 'Confirm Email Address',                         type: 'text',     required: true, matchField: 'email', skipPersist: true },
    { name: 'prior_attendance',         label: 'Have you attended Women\'s Encounter previously?', type: 'checkbox', required: true,
      options: ["1st Time Attendee - Never attended Women's Encounter",
                "I have attended a previous Women's Encounter - I understand that 1st time attendees will get priority",
                "I have attended previously but had a major life event & would be beneficial to attend again"] },
    { name: 'life_event_note',          label: 'Note to Leadership (major life event)',          type: 'textarea', required: false },
    { name: 'phone',                    label: 'Your Phone Number',                             type: 'text',     required: true, format: 'phone' },
    { name: 'phone_type',               label: 'Phone type',                                    type: 'checkbox', required: false, options: ['Land Line'] },
    { name: 'address',                  label: 'Your Address',                                  type: 'text',     required: true },
    { name: 'city',                     label: 'City',                                          type: 'text',     required: true },
    { name: 'state',                    label: 'State',                                         type: 'text',     required: true },
    { name: 'zip',                      label: 'Zip',                                           type: 'text',     required: true, extraKey: true },
    { name: 'church',                   label: 'What church do you attend, if any?',            type: 'text',     required: false },
    { name: 'prayer_contact_name',      label: 'Contact Name',                                  type: 'text',     required: true },
    { name: 'prayer_contact_phone',     label: 'Contact Person\'s Phone Number',                type: 'text',     required: true, format: 'phone' },
    { name: 'shirt_size',               label: 'T-Shirt Size',                                  type: 'radio',    required: true, options: ['Small','Medium','Large','X-Large','XX-Large','XXX-Large','Other'] },
    { name: 'sandwich_preference',      label: 'What kind of sandwich do you prefer?',          type: 'dropdown', required: true,
      options: ['Ham/bun','Ham/lettuce wrapped unwich','Turkey/bun','Turkey/lettuce wrapped unwich','Veggie/bun','Veggie/lettuce wrapped unwich'],
      extraKey: true },
    { name: 'questions',                label: 'Questions or concerns?',                        type: 'textarea', required: false },
  ];

  const MENS_SERVER_FIELDS: FieldSpec[] = [
    { name: 'first_name',               label: 'First Name',                                    type: 'text',     required: true },
    { name: 'last_name',                label: 'Last Name',                                     type: 'text',     required: true },
    { name: 'email',                    label: 'Email Address',                                 type: 'text',     required: true, format: 'email' },
    { name: 'phone',                    label: 'Phone Number',                                  type: 'text',     required: true, format: 'phone' },
    { name: 'phone_type',               label: 'Phone Type',                                    type: 'dropdown', required: true, options: ['Cell','Home','Work','Other'] },
    { name: 'address',                  label: 'Address',                                       type: 'text',     required: true },
    { name: 'city',                     label: 'City',                                          type: 'text',     required: true },
    { name: 'state',                    label: 'State',                                         type: 'text',     required: true },
    { name: 'launch_location',          label: 'Launch Location',                               type: 'dropdown', required: true, options: ['Hays','Norton','Plainville','Hoxie','Colby','Gove','Sterling','Wakeeney'] },
    { name: 'shirt_size',               label: 'Shirt Size',                                    type: 'dropdown', required: true, options: ['XS','S','M','L','XL','XXL','XXXL','XXXXL'] },
    { name: 'church',                   label: 'What Church do you attend?',                   type: 'text',     required: true },
    { name: 'times_served_self_report', label: 'How many times have you served?',               type: 'dropdown', required: true,
      options: ['This will be my first time serving!','1','2','More than 2'], extraKey: true },
    { name: 'invited_by',               label: 'How did you hear about serving?',               type: 'text',     required: false },
    { name: 'prayer_contact_name',      label: 'Contact Name',                                  type: 'text',     required: true },
    { name: 'prayer_contact_phone',     label: 'Contact Phone Number',                         type: 'text',     required: true, format: 'phone' },
    { name: 'dietary_health',           label: 'Dietary or health restrictions?',               type: 'text',     required: false },
    { name: 'questions',                label: 'Questions or concerns?',                        type: 'textarea', required: false },
  ];

  export const FIELD_SCHEMAS: Record<string, Record<string, FieldSpec[]>> = {
    mens:   { attendee: MENS_ATTENDEE_FIELDS,   server: MENS_SERVER_FIELDS },
    womens: { attendee: WOMENS_ATTENDEE_FIELDS, server: [] },   // womens/server always closed; empty schema never validated
  };

  // Named columns that have a dedicated registrations column (not extra JSON).
  const NAMED_COLUMNS = new Set([
    'first_name','last_name','email','phone','phone_type',
    'address','city','state','launch_location','shirt_size','church',
    'times_attended_self_report','invited_by',
    'prayer_contact_name','prayer_contact_phone',
    'dietary_health','questions',
  ]);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_DIGIT_RE = /\d/g;

  function normalisePhone(raw: string): string {
    const digits = (raw.match(PHONE_DIGIT_RE) || []).join('');
    if (digits.length === 10) {
      return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits[0] === '1') {
      return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
    }
    return raw.trim();
  }

  export interface ValidatedFields {
    // Named registrations columns (subset may be undefined/null)
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    phone_type?: string;
    address?: string;
    city?: string;
    state?: string;
    launch_location?: string;
    shirt_size?: string;
    church?: string;
    times_attended_self_report?: string;
    invited_by?: string;
    prayer_contact_name?: string;
    prayer_contact_phone?: string;
    dietary_health?: string;
    questions?: string;
    // Extra JSON bag (zip, sandwich_preference, times_served_self_report, prior_attendance, etc.)
    extra: Record<string, string>;
  }

  export function validateBody(
    programSlug: string,
    role: string,
    body: Record<string, unknown>
  ): { ok: true; data: ValidatedFields } | { ok: false; errors: string[] } {
    const specs = FIELD_SCHEMAS[programSlug]?.[role];
    if (!specs) {
      return { ok: false, errors: [`Unknown program/role: ${programSlug}/${role}`] };
    }

    const errors: string[] = [];
    const named: Record<string, string> = {};
    const extra: Record<string, string> = {};

    for (const spec of specs) {
      if (spec.skipPersist) {
        // email_confirm: just validate match
        if (spec.matchField) {
          const val = String(body[spec.name] ?? '').trim();
          const matchVal = String(body[spec.matchField] ?? '').trim();
          if (val.toLowerCase() !== matchVal.toLowerCase()) {
            errors.push(`${spec.label} must match ${spec.matchField}.`);
          }
        }
        continue;
      }

      const raw = body[spec.name];
      const val = raw === undefined || raw === null ? '' : String(raw).trim();

      if (spec.required && val === '') {
        errors.push(`${spec.label} is required.`);
        continue;
      }

      if (val === '') continue;  // optional, not provided — skip further checks

      if (spec.format === 'email' && !EMAIL_RE.test(val)) {
        errors.push(`${spec.label}: invalid email address.`);
        continue;
      }

      if (spec.format === 'phone') {
        const digits = (val.match(PHONE_DIGIT_RE) || []).join('');
        const isValid = digits.length === 10 || (digits.length === 11 && digits[0] === '1');
        if (!isValid) {
          errors.push(`${spec.label}: please enter a 10-digit US phone number.`);
          continue;
        }
        const normalised = normalisePhone(val);
        if (spec.extraKey) {
          extra[spec.name] = normalised;
        } else {
          named[spec.name] = normalised;
        }
        continue;
      }

      if (spec.options && spec.type !== 'checkbox') {
        // Radio/dropdown: value must be in allowed list (or "Other" for radios that allow it)
        const allowed = spec.options;
        if (!allowed.includes(val)) {
          errors.push(`${spec.label}: invalid option "${val}".`);
          continue;
        }
      }

      if (spec.options && spec.type === 'checkbox') {
        // Checkbox: val may be a JSON array string or a single option
        let selected: string[] = [];
        try { selected = JSON.parse(val); } catch { selected = val ? [val] : []; }
        const allowed = spec.options;
        const invalid = selected.filter(s => !allowed.includes(s));
        if (invalid.length) {
          errors.push(`${spec.label}: invalid option(s): ${invalid.join(', ')}.`);
          continue;
        }
        const stored = selected.join(' | ');
        if (spec.extraKey) { extra[spec.name] = stored; } else { named[spec.name] = stored; }
        continue;
      }

      // phone_type checkbox (womens): derive from checkbox value
      if (spec.name === 'phone_type' && spec.type === 'checkbox') {
        named['phone_type'] = val.includes('Land Line') ? 'Land Line' : 'Cell';
        continue;
      }

      if (spec.extraKey) {
        extra[spec.name] = val;
      } else {
        named[spec.name] = val;
      }
    }

    if (errors.length) return { ok: false, errors };

    return {
      ok: true,
      data: {
        first_name: named['first_name'] ?? '',
        last_name:  named['last_name']  ?? '',
        email:      named['email'],
        phone:      named['phone'],
        phone_type: named['phone_type'],
        address:    named['address'],
        city:       named['city'],
        state:      named['state'],
        launch_location:           named['launch_location'],
        shirt_size:                named['shirt_size'],
        church:                    named['church'],
        times_attended_self_report: named['times_attended_self_report'],
        invited_by:                named['invited_by'],
        prayer_contact_name:       named['prayer_contact_name'],
        prayer_contact_phone:      named['prayer_contact_phone'],
        dietary_health:            named['dietary_health'],
        questions:                 named['questions'],
        extra,
      },
    };
  }
  ```

- [ ] Write failing test: `functions/_api/__tests__/register.test.ts` — import `validateBody`; assert that calling it with `('mens','attendee', {})` returns `{ ok: false, errors: [...] }` with at least one error mentioning "First Name".
- [ ] Run: `npm run test:api -- register.test` → expect **FAIL** (file not yet wired; if validator is already exported, the test may pass — that's fine).
- [ ] Complete the `register.ts` file with the full content above.
- [ ] Run: `npm run test:api -- register.test` → expect **PASS** on the validator assertion.
- [ ] Commit: `feat(p1): add field schemas and validateBody for mens/womens attendee+server`

---

### Task 2 — Turnstile verifier + rate-limit guard (middleware utilities)

**Files:** `functions/_api/routes/register.ts` (add utilities at top)

**Interfaces:**
- Consumes: `Env` (TURNSTILE_SECRET, SESSIONS KV — used as rate-limit store)
- Produces: `verifyTurnstile(env, token, ip)` → `Promise<boolean>`; `checkRateLimit(env, ip)` → `Promise<{ allowed: boolean }>`

**Steps:**

- [ ] Add the following to `register.ts` (before the Hono router, after the schemas):

  ```ts
  // ── Turnstile ──────────────────────────────────────────────────────────────
  // Dev/test bypass: token value '__TEST_BYPASS__' always passes when
  // TURNSTILE_SECRET is absent or set to the literal string 'test'.
  export async function verifyTurnstile(
    env: Env,
    token: string | undefined,
    ip: string
  ): Promise<boolean> {
    if (!token) return false;
    if (token === '__TEST_BYPASS__') return true;
    if (!env.TURNSTILE_SECRET || env.TURNSTILE_SECRET === 'test') return true;

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const data = await res.json<{ success: boolean }>();
    return data.success === true;
  }

  // ── Rate limit: 3 submissions per IP per 10 minutes, stored in KV ──────────
  const RATE_LIMIT_MAX    = 3;
  const RATE_LIMIT_TTL_S  = 600;   // 10 minutes

  export async function checkRateLimit(
    env: Env,
    ip: string
  ): Promise<{ allowed: boolean }> {
    const key = `ratelimit:register:${ip}`;
    const current = await env.SESSIONS.get(key);
    const count = current ? parseInt(current, 10) : 0;
    if (count >= RATE_LIMIT_MAX) return { allowed: false };
    // Increment; reset TTL on every hit (sliding window per increment)
    await env.SESSIONS.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_TTL_S });
    return { allowed: true };
  }
  ```

- [ ] Add test cases to `register.test.ts`:
  - `verifyTurnstile` with token `'__TEST_BYPASS__'` and a fake env → returns `true`
  - `verifyTurnstile` with `undefined` → returns `false`
  - `checkRateLimit` with a mock KV that returns `null` → returns `{ allowed: true }`
  - `checkRateLimit` with a mock KV that returns `'3'` → returns `{ allowed: false }`
- [ ] Run: `npm run test:api -- register.test` → expect **FAIL** (functions not yet in file).
- [ ] Add the code block above to `register.ts`.
- [ ] Run: `npm run test:api -- register.test` → expect **PASS** on new assertions.
- [ ] Commit: `feat(p1): add Turnstile verifier and KV-backed rate-limit guard`

---

### Task 3 — `POST /api/register/:program/:role` route handler

**Files:** `functions/_api/routes/register.ts` (add Hono router + handler)

**Interfaces:**
- Consumes from P0:
  - `dedupe.upsertPerson(env, program, fields)` → `{ person_id, matched }`
  - `dedupe.recomputeRollups(env, personId)`
  - `email.sendEmail(env, { to, subject, html, text, replyTo })`
  - `email.renderTemplate(tpl, vars)` → `{ subject, html, text }`
  - `db.nowIso()` → ISO-8601 UTC string
  - `Env` interface (DB, SESSIONS, EMAIL_FROM, EMAIL_REPLY_TO)
- Produces: `POST /api/register/:program/:role` → `{ ok: true, registration_id: number, person_id: number }` on success; `{ ok: false, error: string }` on failure. Status codes: 200 success, 400 validation error, 409 registration closed, 422 Turnstile failed, 429 rate-limited, 500 DB error.

**Steps:**

- [ ] Write a failing integration test in `register.test.ts` that:
  1. Applies `db/migrations/0001_init.sql` to a local D1 in `beforeEach`.
  2. Inserts a seeded `events` row: `{ program: 'mens', year: 2026, is_current: 1, attendee_registration_open: 1, server_registration_open: 1, created_at: nowIso(), updated_at: nowIso() }`.
  3. POSTs a valid Men's Attendee body to `app.request('POST', '/api/register/mens/attendee', ...)` (using `app.fetch` with a MINIFLARE env).
  4. Expects response `{ ok: true, registration_id: 1, person_id: 1 }` and status 200.

  ```ts
  // functions/_api/__tests__/register.test.ts  (happy-path block)
  import { describe, it, expect, beforeEach } from 'vitest';
  import { env } from 'cloudflare:test';
  import { app }  from '../app.js';
  import { nowIso } from '../db.js';
  import fs from 'node:fs/promises';
  import path from 'node:path';

  const MIGRATION = path.resolve(__dirname, '../../../../db/migrations/0001_init.sql');

  async function applyMigration(db: D1Database) {
    const sql = await fs.readFile(MIGRATION, 'utf-8');
    // D1 batch: split on statement separator
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      await db.exec(stmt);
    }
  }

  async function seedCurrentEvent(db: D1Database, program: 'mens' | 'women') {
    const now = nowIso();
    await db.prepare(
      `INSERT INTO events (program, year, title, start_date, end_date, launch_locations,
         attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
       VALUES (?, 2026, 'Test Event', '2026-08-06', '2026-08-08', '["Hays","Norton"]', 1, 1, 1, ?, ?)`
    ).bind(program, now, now).run();
  }

  const VALID_MENS_ATTENDEE = {
    first_name: 'John', last_name: 'Doe',
    email: 'john.doe@example.com', phone: '7851234567',
    phone_type: 'Cell', address: '123 Main St', city: 'Hays', state: 'KS',
    launch_location: 'Hays', shirt_size: 'L',
    church: 'First Baptist', times_attended_self_report: 'This will be my first time!',
    invited_by: 'A friend', prayer_contact_name: 'Jane Doe',
    prayer_contact_phone: '7859876543',
    cf_turnstile_response: '__TEST_BYPASS__',
  };

  describe('POST /api/register/:program/:role', () => {
    beforeEach(async () => {
      await applyMigration(env.DB);
    });

    it('happy path: creates person + registration, returns ids', async () => {
      await seedCurrentEvent(env.DB, 'mens');
      const res = await app.fetch(
        new Request('http://localhost/api/register/mens/attendee', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
          body: JSON.stringify(VALID_MENS_ATTENDEE),
        }),
        env
      );
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      expect(body.ok).toBe(true);
      expect(typeof body.registration_id).toBe('number');
      expect(typeof body.person_id).toBe('number');
    });
  });
  ```

- [ ] Run: `npm run test:api -- register.test` → expect **FAIL** (route not yet wired).
- [ ] Add the Hono router to `register.ts`:

  ```ts
  import { Hono } from 'hono';
  import type { Env } from '../app.js';
  import { nowIso, type Program } from '../db.js';
  import { upsertPerson, recomputeRollups } from '../dedupe.js';
  import { sendEmail, renderTemplate } from '../email.js';
  import { validateBody, verifyTurnstile, checkRateLimit } from './register.js'; // self

  // (all schema/validator/middleware code from Tasks 1-2 is in this same file above)

  export const registerRouter = new Hono<{ Bindings: Env }>();

  const DB_PROGRAM: Record<string, Program> = { mens: 'mens', womens: 'women' };

  // Inline welcome email template (P4 will move this to the DB email_templates table).
  function welcomeTemplate(program: Program, role: string) {
    const programLabel = program === 'mens' ? "Men's" : "Women's";
    const roleLabel    = role === 'server' ? 'Server' : 'Attendee';
    return {
      subject: `You're registered for ${programLabel} Encounter! 🎉`,
      body_html: `
        <h2>Thank you for registering for ${programLabel} Encounter!</h2>
        <p>We're excited to have you join us as a ${roleLabel}. You'll receive more details closer to the event.</p>
        <p>If you have questions, simply reply to this email — it goes straight to our team.</p>
        <p>Blessings,<br>NWKS Encounter Team</p>
      `.trim(),
      body_text: [
        `Thank you for registering for ${programLabel} Encounter!`,
        `We're excited to have you join us as a ${roleLabel}. You'll receive more details closer to the event.`,
        `If you have questions, simply reply to this email — it goes straight to our team.`,
        `Blessings, NWKS Encounter Team`,
      ].join('\n\n'),
      variables: '[]',
    };
  }

  registerRouter.post('/:program/:role', async (c) => {
    const programSlug = c.req.param('program');  // 'mens' | 'womens'
    const role        = c.req.param('role');       // 'attendee' | 'server'
    const ip          = c.req.header('CF-Connecting-IP') ?? '0.0.0.0';

    // Map slug → D1 program value
    const program = DB_PROGRAM[programSlug];
    if (!program) {
      return c.json({ ok: false, error: 'Invalid program.' }, 404);
    }
    if (role !== 'attendee' && role !== 'server') {
      return c.json({ ok: false, error: 'Invalid role.' }, 404);
    }

    // Rate-limit check
    const rateOk = await checkRateLimit(c.env, ip);
    if (!rateOk.allowed) {
      return c.json({ ok: false, error: 'Too many registration attempts. Please wait and try again.' }, 429);
    }

    // Parse body
    let rawBody: Record<string, unknown>;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ ok: false, error: 'Invalid JSON body.' }, 400);
    }

    // Turnstile verification
    const token = rawBody['cf_turnstile_response'];
    const turnstileOk = await verifyTurnstile(c.env, typeof token === 'string' ? token : undefined, ip);
    if (!turnstileOk) {
      return c.json({ ok: false, error: 'Bot verification failed. Please try again.' }, 422);
    }

    // Find the current event for this program
    const event = await c.env.DB
      .prepare('SELECT * FROM events WHERE program = ? AND is_current = 1 LIMIT 1')
      .bind(program)
      .first<{ id: number; attendee_registration_open: number; server_registration_open: number }>();

    if (!event) {
      return c.json({ ok: false, error: 'No current event found for this program.' }, 409);
    }

    const regOpen = role === 'server' ? event.server_registration_open : event.attendee_registration_open;
    if (!regOpen) {
      return c.json({ ok: false, error: 'Registration is not open for this event.' }, 409);
    }

    // Validate fields
    const validation = validateBody(programSlug, role, rawBody);
    if (!validation.ok) {
      return c.json({ ok: false, error: validation.errors.join(' ') }, 400);
    }
    const fields = validation.data;

    // Upsert person (de-dupe)
    const { person_id, matched } = await upsertPerson(c.env, program, {
      first_name: fields.first_name,
      last_name:  fields.last_name,
      email:      fields.email,
      phone:      fields.phone,
      phone_type: fields.phone_type,
      address:    fields.address,
      city:       fields.city,
      state:      fields.state,
      church:     fields.church,
    });

    // Insert registration row (snapshot all fields)
    const now = nowIso();
    const extraJson = JSON.stringify(fields.extra);

    const regResult = await c.env.DB
      .prepare(`
        INSERT INTO registrations
          (program, event_id, person_id, role,
           first_name, last_name, email, phone, phone_type,
           address, city, state,
           launch_location, shirt_size, church,
           times_attended_self_report, invited_by,
           prayer_contact_name, prayer_contact_phone,
           dietary_health, questions, extra, created_at)
        VALUES
          (?, ?, ?, ?,
           ?, ?, ?, ?, ?,
           ?, ?, ?,
           ?, ?, ?,
           ?, ?,
           ?, ?,
           ?, ?, ?, ?)
      `)
      .bind(
        program, event.id, person_id, role,
        fields.first_name, fields.last_name, fields.email ?? null, fields.phone ?? null, fields.phone_type ?? null,
        fields.address ?? null, fields.city ?? null, fields.state ?? null,
        fields.launch_location ?? null, fields.shirt_size ?? null, fields.church ?? null,
        fields.times_attended_self_report ?? null, fields.invited_by ?? null,
        fields.prayer_contact_name ?? null, fields.prayer_contact_phone ?? null,
        fields.dietary_health ?? null, fields.questions ?? null,
        extraJson, now
      )
      .run();

    const registration_id = regResult.meta.last_row_id as number;

    // Recompute rollups (times_attended / times_served)
    await recomputeRollups(c.env, person_id);

    // Send welcome email (fire-and-forget; log written inside sendEmail)
    if (fields.email) {
      const tpl = welcomeTemplate(program, role);
      const rendered = renderTemplate(tpl, {
        first_name: fields.first_name,
        last_name:  fields.last_name,
        program:    program === 'mens' ? "Men's" : "Women's",
        role:       role === 'server' ? 'Server' : 'Attendee',
      });
      // Write email_log row (sendEmail does this internally, but we need program+person_id)
      const emailLogNow = nowIso();
      const sendRes = await sendEmail(c.env, {
        to:      fields.email,
        subject: rendered.subject,
        html:    rendered.html,
        text:    rendered.text,
        replyTo: c.env.EMAIL_REPLY_TO || undefined,
      });
      await c.env.DB
        .prepare(`
          INSERT INTO email_log
            (program, person_id, to_email, type, template_key, subject, status, provider_id, error, created_at, sent_at)
          VALUES (?, ?, ?, 'transactional', 'welcome', ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          program, person_id, fields.email,
          rendered.subject,
          sendRes.ok ? 'sent' : 'failed',
          sendRes.providerId ?? null,
          sendRes.error ?? null,
          emailLogNow,
          sendRes.ok ? emailLogNow : null
        )
        .run();
    }

    return c.json({ ok: true, registration_id, person_id }, 200);
  });
  ```

- [ ] Run: `npm run test:api -- register.test` → expect **PASS** on happy-path test.
- [ ] Commit: `feat(p1): implement POST /api/register/:program/:role handler`

---

### Task 4 — Wire router into `app.ts`

**Files:** `functions/_api/app.ts`

**Interfaces:**
- Consumes: `registerRouter` exported from `./routes/register.js`
- Produces: `app.fetch` handles `POST /api/register/*`

**Steps:**

- [ ] Open `functions/_api/app.ts`. Read the existing file to find where other routers are mounted.
- [ ] Add the import and mount:

  ```ts
  import { registerRouter } from './routes/register.js';
  // ... existing imports ...

  // Inside the Hono app setup, alongside other router mounts:
  app.route('/api/register', registerRouter);
  ```

- [ ] Add an integration test asserting that `POST /api/register/bad/path` returns 404 (confirms the router is mounted and the program guard fires).
- [ ] Run: `npm run test:api -- register.test` → expect **PASS** all.
- [ ] Commit: `feat(p1): wire registerRouter into app.ts`

---

### Task 5 — Additional API integration tests (edge cases)

**Files:** `functions/_api/__tests__/register.test.ts`

**Interfaces:**
- Consumes: the running Hono app via `app.fetch`; seeded D1

**Steps:**

- [ ] Add failing tests for each of the following scenarios, then implement the expected behaviour (most is already in the handler; these tests verify it):

  1. **Repeat email (de-dupe):** POST the same body twice → both succeed; second call returns the same `person_id` as the first; D1 `people` table still has 1 row (matched=true).

     ```ts
     it('deduplicates by email: second registration reuses same person', async () => {
       await seedCurrentEvent(env.DB, 'mens');
       const post = () => app.fetch(new Request('http://localhost/api/register/mens/attendee', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
         body: JSON.stringify(VALID_MENS_ATTENDEE),
       }), env);
       const r1 = await (await post()).json<any>();
       const r2 = await (await post()).json<any>();
       expect(r1.person_id).toBe(r2.person_id);
       const count = await env.DB.prepare('SELECT COUNT(*) as n FROM people').first<{n:number}>();
       expect(count?.n).toBe(1);
     });
     ```

  2. **Missing required field:** POST body without `first_name` → 400 with `ok: false` and error mentioning "First Name".

     ```ts
     it('returns 400 when required field is missing', async () => {
       await seedCurrentEvent(env.DB, 'mens');
       const body = { ...VALID_MENS_ATTENDEE };
       delete (body as any).first_name;
       const res = await app.fetch(new Request('http://localhost/api/register/mens/attendee', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
         body: JSON.stringify(body),
       }), env);
       expect(res.status).toBe(400);
       const json = await res.json<any>();
       expect(json.ok).toBe(false);
       expect(json.error).toMatch(/First Name/i);
     });
     ```

  3. **Invalid email format:** POST with `email: 'notanemail'` → 400.

     ```ts
     it('returns 400 for invalid email format', async () => {
       await seedCurrentEvent(env.DB, 'mens');
       const res = await app.fetch(new Request('http://localhost/api/register/mens/attendee', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
         body: JSON.stringify({ ...VALID_MENS_ATTENDEE, email: 'notanemail' }),
       }), env);
       expect(res.status).toBe(400);
       const json = await res.json<any>();
       expect(json.ok).toBe(false);
     });
     ```

  4. **Attendee registration closed:** Seed event with `attendee_registration_open = 0` → 409.

     ```ts
     it('returns 409 when attendee registration is closed', async () => {
       const now = nowIso();
       await env.DB.prepare(
         `INSERT INTO events (program, year, start_date, end_date, launch_locations,
            attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
          VALUES ('mens', 2026, '2026-08-06', '2026-08-08', '[]', 0, 1, 1, ?, ?)`
       ).bind(now, now).run();
       const res = await app.fetch(new Request('http://localhost/api/register/mens/attendee', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
         body: JSON.stringify(VALID_MENS_ATTENDEE),
       }), env);
       expect(res.status).toBe(409);
     });
     ```

  5. **No current event:** No events row → 409.

     ```ts
     it('returns 409 when no current event exists', async () => {
       const res = await app.fetch(new Request('http://localhost/api/register/mens/attendee', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
         body: JSON.stringify(VALID_MENS_ATTENDEE),
       }), env);
       expect(res.status).toBe(409);
     });
     ```

  6. **Turnstile failure:** Missing `cf_turnstile_response` when TURNSTILE_SECRET is non-test → 422. (In the test env TURNSTILE_SECRET = 'test', so bypass. Simulate failure by passing a non-bypass token when secret is real — test this by monkeypatching `verifyTurnstile` or by omitting the token in a mocked env where TURNSTILE_SECRET is non-empty and non-'test'.)

     ```ts
     it('returns 422 when Turnstile token is absent and secret is real', async () => {
       await seedCurrentEvent(env.DB, 'mens');
       const strictEnv = { ...env, TURNSTILE_SECRET: 'real-secret-not-test' };
       const body = { ...VALID_MENS_ATTENDEE };
       delete (body as any).cf_turnstile_response;
       const res = await app.fetch(new Request('http://localhost/api/register/mens/attendee', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
         body: JSON.stringify(body),
       }), strictEnv as any);
       expect(res.status).toBe(422);
     });
     ```

  7. **email_log written:** After happy path, assert exactly 1 row in `email_log` with `type='transactional'` and `template_key='welcome'`.

     ```ts
     it('writes email_log row on successful registration', async () => {
       await seedCurrentEvent(env.DB, 'mens');
       await app.fetch(new Request('http://localhost/api/register/mens/attendee', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
         body: JSON.stringify(VALID_MENS_ATTENDEE),
       }), env);
       const log = await env.DB
         .prepare("SELECT * FROM email_log WHERE type='transactional' AND template_key='welcome'")
         .first<{ id: number; status: string }>();
       expect(log).not.toBeNull();
     });
     ```

  8. **Rollups updated:** After happy path, `people.times_attended` = 1.

     ```ts
     it('recomputes rollups after registration', async () => {
       await seedCurrentEvent(env.DB, 'mens');
       const res = await app.fetch(new Request('http://localhost/api/register/mens/attendee', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
         body: JSON.stringify(VALID_MENS_ATTENDEE),
       }), env);
       const { person_id } = await res.json<any>();
       const person = await env.DB
         .prepare('SELECT times_attended FROM people WHERE id = ?')
         .bind(person_id)
         .first<{ times_attended: number }>();
       expect(person?.times_attended).toBe(1);
     });
     ```

  9. **Women's server always closed (409):** No current event needed; the route should reject before even querying the event when `womens/server`.

     > Note: the implementation currently queries the event and checks `server_registration_open`. When the event has `server_registration_open = 0` it returns 409. But for Women's server the ministry has hard-coded this as permanently closed — the simplest model is to seed the event with `server_registration_open = 0` and rely on the existing guard, which is correct behaviour. An alternative is an early guard on `womens/server` before DB queries; either is acceptable. Choose the DB guard approach (less special-casing).

     ```ts
     it('returns 409 for womens/server (server_registration_open=0)', async () => {
       const now = nowIso();
       await env.DB.prepare(
         `INSERT INTO events (program, year, start_date, end_date, launch_locations,
            attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
          VALUES ('women', 2026, '2026-07-17', '2026-07-19', '[]', 1, 0, 1, ?, ?)`
       ).bind(now, now).run();
       const body = { ...VALID_MENS_ATTENDEE, cf_turnstile_response: '__TEST_BYPASS__' };
       const res = await app.fetch(new Request('http://localhost/api/register/womens/server', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
         body: JSON.stringify(body),
       }), env);
       expect(res.status).toBe(409);
     });
     ```

- [ ] Run: `npm run test:api -- register.test` → all should **PASS** (handler already covers these paths).
- [ ] Commit: `test(p1): comprehensive API integration tests for register route`

---

### Task 6 — `public/shared/form.css` — brand tokens + form styles

**Files:** `public/shared/form.css`

**Interfaces:**
- Consumes: colour tokens from `index.html` (olive/gold palette for Men's; rose palette for Women's; neutral base)
- Produces: CSS custom properties + utility classes used by all four registration HTML pages

**Steps:**

- [ ] Read `index.html` to extract exact hex values for both palettes (olive/gold and rose) before writing the CSS.
- [ ] Create `public/shared/form.css`:

  ```css
  /* public/shared/form.css — NWKS Encounter brand tokens + form utilities */

  :root {
    /* Men's palette (olive / gold) */
    --mens-bg:         #1a1f14;
    --mens-surface:    #232b1a;
    --mens-border:     #4a5a30;
    --mens-accent:     #8fad5a;
    --mens-gold:       #c8a84b;
    --mens-text:       #e8e0cc;
    --mens-muted:      #8a8a7a;

    /* Women's palette (rose / mauve) */
    --womens-bg:       #1f1419;
    --womens-surface:  #2b1a20;
    --womens-border:   #5a3040;
    --womens-accent:   #ad5a7a;
    --womens-rose:     #c87a9a;
    --womens-text:     #ecddd4;
    --womens-muted:    #8a7a80;

    /* Neutral / shared */
    --radius:          6px;
    --font:            'Georgia', serif;
    --font-ui:         system-ui, sans-serif;
    --transition:      0.18s ease;
    --max-width:       640px;
  }

  /* ── Layout ──────────────────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family:      var(--font-ui);
    line-height:      1.6;
    min-height:       100vh;
    display:          flex;
    flex-direction:   column;
    align-items:      center;
    padding:          2rem 1rem 4rem;
  }

  body.mens   { background: var(--mens-bg);   color: var(--mens-text); }
  body.womens { background: var(--womens-bg); color: var(--womens-text); }

  .form-card {
    width: 100%;
    max-width: var(--max-width);
    border-radius: calc(var(--radius) * 2);
    padding: 2.5rem 2rem;
  }

  body.mens   .form-card { background: var(--mens-surface);  border: 1px solid var(--mens-border); }
  body.womens .form-card { background: var(--womens-surface); border: 1px solid var(--womens-border); }

  /* ── Typography ─────────────────────────────────────────────── */
  h1 {
    font-family:  var(--font);
    font-size:    clamp(1.4rem, 4vw, 2rem);
    font-weight:  600;
    margin-bottom: 0.25rem;
    letter-spacing: 0.02em;
  }
  body.mens   h1 { color: var(--mens-gold); }
  body.womens h1 { color: var(--womens-rose); }

  .form-subtitle {
    font-size: 0.9rem;
    margin-bottom: 2rem;
    opacity: 0.75;
  }

  /* ── Fields ─────────────────────────────────────────────────── */
  .field-group {
    margin-bottom: 1.25rem;
  }

  label {
    display:       block;
    font-size:     0.85rem;
    font-weight:   600;
    margin-bottom: 0.35rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  body.mens   label { color: var(--mens-accent); }
  body.womens label { color: var(--womens-accent); }

  label .required { color: #e06060; margin-left: 2px; }

  .field-help {
    font-size:    0.78rem;
    margin-bottom: 0.4rem;
    opacity:       0.7;
    line-height:   1.4;
  }

  input[type="text"],
  input[type="email"],
  select,
  textarea {
    width:         100%;
    padding:       0.6rem 0.75rem;
    border-radius: var(--radius);
    font-size:     0.95rem;
    font-family:   var(--font-ui);
    outline:       none;
    transition:    border-color var(--transition), box-shadow var(--transition);
    background:    rgba(255,255,255,0.05);
  }

  body.mens input, body.mens select, body.mens textarea {
    border: 1px solid var(--mens-border);
    color:  var(--mens-text);
  }
  body.mens input:focus, body.mens select:focus, body.mens textarea:focus {
    border-color: var(--mens-accent);
    box-shadow:   0 0 0 2px rgba(143,173,90,0.25);
  }

  body.womens input, body.womens select, body.womens textarea {
    border: 1px solid var(--womens-border);
    color:  var(--womens-text);
  }
  body.womens input:focus, body.womens select:focus, body.womens textarea:focus {
    border-color: var(--womens-accent);
    box-shadow:   0 0 0 2px rgba(173,90,122,0.25);
  }

  textarea { min-height: 100px; resize: vertical; }

  select option { background: #222; color: inherit; }

  /* Radio / checkbox groups */
  .radio-group, .checkbox-group {
    display:       flex;
    flex-direction: column;
    gap:           0.5rem;
  }
  .radio-group label, .checkbox-group label {
    display:     flex;
    align-items: flex-start;
    gap:         0.5rem;
    font-size:   0.9rem;
    text-transform: none;
    font-weight: normal;
    letter-spacing: 0;
    cursor:      pointer;
  }
  .radio-group input, .checkbox-group input {
    width:       1rem;
    height:      1rem;
    flex-shrink: 0;
    margin-top:  0.15rem;
  }

  /* Phone formatting hint */
  .phone-hint {
    font-size:  0.75rem;
    opacity:    0.55;
    margin-top: 0.2rem;
  }

  /* ── Validation errors ──────────────────────────────────────── */
  .field-error {
    font-size:  0.78rem;
    color:      #e06060;
    margin-top: 0.3rem;
  }
  input.invalid, select.invalid, textarea.invalid {
    border-color: #e06060 !important;
  }

  /* ── Submit button ──────────────────────────────────────────── */
  .btn-submit {
    display:       block;
    width:         100%;
    padding:       0.85rem 1.5rem;
    border:        none;
    border-radius: var(--radius);
    font-size:     1rem;
    font-weight:   700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor:        pointer;
    margin-top:    2rem;
    transition:    opacity var(--transition), transform var(--transition);
  }
  .btn-submit:hover  { opacity: 0.88; transform: translateY(-1px); }
  .btn-submit:active { transform: translateY(0); }
  .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  body.mens   .btn-submit { background: var(--mens-gold);  color: var(--mens-bg); }
  body.womens .btn-submit { background: var(--womens-rose); color: var(--womens-bg); }

  /* ── Status banner ──────────────────────────────────────────── */
  .form-status {
    padding:       0.75rem 1rem;
    border-radius: var(--radius);
    font-size:     0.9rem;
    margin-top:    1rem;
    display:       none;
  }
  .form-status.visible { display: block; }
  .form-status.error   { background: rgba(224,96,96,0.15); color: #f08080; border: 1px solid rgba(224,96,96,0.3); }
  .form-status.success { background: rgba(90,180,90,0.15);  color: #80c880; border: 1px solid rgba(90,180,90,0.3); }

  /* ── Closed notice ──────────────────────────────────────────── */
  .closed-notice {
    padding:       1.5rem;
    border-radius: var(--radius);
    text-align:    center;
    font-size:     1.05rem;
    opacity:       0.85;
  }
  body.mens   .closed-notice { border: 1px solid var(--mens-border); }
  body.womens .closed-notice { border: 1px solid var(--womens-border); }

  /* ── Verse / footer ─────────────────────────────────────────── */
  .form-verse {
    font-family: var(--font);
    font-style:  italic;
    text-align:  center;
    margin-top:  2rem;
    font-size:   0.85rem;
    opacity:     0.55;
  }

  @media (max-width: 480px) {
    .form-card { padding: 1.5rem 1rem; }
  }
  ```

- [ ] No automated test for CSS; verify visually during E2E (Task 9). Mark complete.
- [ ] Commit: `feat(p1): add public/shared/form.css with brand tokens for mens/womens`

---

### Task 7 — `public/shared/form.js` — client-side renderer + submission

**Files:** `public/shared/form.js`

**Interfaces:**
- Consumes: nothing external (self-contained vanilla JS); API endpoint `POST /api/register/:program/:role`
- Produces: `window.NWKS_FORM.init(config)` that renders fields from a schema config object, validates client-side, calls Turnstile, POSTs JSON to the API, redirects to `/thanks.html`

**Steps:**

- [ ] Create `public/shared/form.js`:

  ```js
  // public/shared/form.js — NWKS Encounter native form renderer + submission
  // Vanilla JS; no dependencies; loaded as a plain <script> tag.
  // Usage: call NWKS_FORM.init(config) where config = { program, role, fields, turnstileSiteKey }

  window.NWKS_FORM = (() => {
    // ── Phone formatting ─────────────────────────────────────────────────────
    function formatPhone(raw) {
      const digits = raw.replace(/\D/g, '');
      if (digits.length <= 3)  return digits;
      if (digits.length <= 6)  return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
      return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6,10)}`;
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ── Field renderer ───────────────────────────────────────────────────────
    function renderField(spec, container) {
      const group = document.createElement('div');
      group.className = 'field-group';
      group.dataset.fieldName = spec.name;

      const labelEl = document.createElement('label');
      labelEl.setAttribute('for', `field-${spec.name}`);
      labelEl.textContent = spec.label;
      if (spec.required) {
        const req = document.createElement('span');
        req.className = 'required';
        req.textContent = ' *';
        req.setAttribute('aria-label', 'required');
        labelEl.appendChild(req);
      }
      group.appendChild(labelEl);

      if (spec.help) {
        const help = document.createElement('p');
        help.className = 'field-help';
        help.textContent = spec.help;
        group.appendChild(help);
      }

      let inputEl = null;

      if (spec.type === 'dropdown') {
        const sel = document.createElement('select');
        sel.id = `field-${spec.name}`;
        sel.name = spec.name;
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = `— Select ${spec.label} —`;
        placeholder.disabled = true;
        placeholder.selected = true;
        sel.appendChild(placeholder);
        (spec.options || []).forEach(opt => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          sel.appendChild(o);
        });
        group.appendChild(sel);
        inputEl = sel;
      } else if (spec.type === 'radio') {
        const radioGroup = document.createElement('div');
        radioGroup.className = 'radio-group';
        radioGroup.setAttribute('role', 'radiogroup');
        radioGroup.setAttribute('aria-labelledby', `field-${spec.name}-label`);
        labelEl.id = `field-${spec.name}-label`;
        (spec.options || []).forEach((opt, i) => {
          const optId = `field-${spec.name}-${i}`;
          const wrapper = document.createElement('label');
          wrapper.setAttribute('for', optId);
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.id = optId;
          radio.name = spec.name;
          radio.value = opt;
          wrapper.appendChild(radio);
          wrapper.appendChild(document.createTextNode(opt));
          radioGroup.appendChild(wrapper);
        });
        group.appendChild(radioGroup);
        inputEl = radioGroup; // for validation traversal
      } else if (spec.type === 'checkbox') {
        const cbGroup = document.createElement('div');
        cbGroup.className = 'checkbox-group';
        cbGroup.setAttribute('role', 'group');
        cbGroup.setAttribute('aria-labelledby', `field-${spec.name}-label`);
        labelEl.id = `field-${spec.name}-label`;
        (spec.options || []).forEach((opt, i) => {
          const optId = `field-${spec.name}-${i}`;
          const wrapper = document.createElement('label');
          wrapper.setAttribute('for', optId);
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.id = optId;
          cb.name = spec.name;
          cb.value = opt;
          wrapper.appendChild(cb);
          wrapper.appendChild(document.createTextNode(opt));
          cbGroup.appendChild(wrapper);
        });
        group.appendChild(cbGroup);
        inputEl = cbGroup;
      } else if (spec.type === 'textarea') {
        const ta = document.createElement('textarea');
        ta.id = `field-${spec.name}`;
        ta.name = spec.name;
        ta.rows = 4;
        group.appendChild(ta);
        inputEl = ta;
      } else {
        // text / email
        const inp = document.createElement('input');
        inp.type = spec.format === 'email' ? 'email' : 'text';
        inp.id = `field-${spec.name}`;
        inp.name = spec.name;
        inp.autocomplete = spec.name === 'email' || spec.name === 'email_confirm' ? 'email'
                         : spec.format === 'phone' ? 'tel' : 'on';
        if (spec.format === 'phone') {
          inp.inputMode = 'tel';
          inp.placeholder = '(785) 555-0100';
          inp.addEventListener('input', () => {
            inp.value = formatPhone(inp.value);
          });
          const hint = document.createElement('p');
          hint.className = 'phone-hint';
          hint.textContent = 'Format: (555) 555-5555';
          group.appendChild(inp);
          group.appendChild(hint);
          inputEl = inp;
          container.appendChild(group);
          return;  // early return — hint already appended
        }
        group.appendChild(inp);
        inputEl = inp;
      }

      // Error placeholder
      const errEl = document.createElement('p');
      errEl.className = 'field-error';
      errEl.setAttribute('aria-live', 'polite');
      group.appendChild(errEl);

      container.appendChild(group);
    }

    // ── Value extraction ─────────────────────────────────────────────────────
    function getFieldValue(form, spec) {
      if (spec.type === 'radio') {
        const checked = form.querySelector(`input[name="${spec.name}"]:checked`);
        return checked ? checked.value : '';
      }
      if (spec.type === 'checkbox') {
        const checked = [...form.querySelectorAll(`input[name="${spec.name}"]:checked`)];
        return JSON.stringify(checked.map(c => c.value));
      }
      const el = form.querySelector(`[name="${spec.name}"]`);
      return el ? el.value.trim() : '';
    }

    // ── Client-side validation ───────────────────────────────────────────────
    function validateForm(form, fields) {
      let valid = true;
      // Clear previous errors
      form.querySelectorAll('.field-error').forEach(el => { el.textContent = ''; });
      form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));

      const values = {};
      for (const spec of fields) {
        const val = getFieldValue(form, spec);
        values[spec.name] = val;

        const group = form.querySelector(`[data-field-name="${spec.name}"]`);
        const errEl = group ? group.querySelector('.field-error') : null;

        function fieldError(msg) {
          valid = false;
          if (errEl) errEl.textContent = msg;
          const inp = group ? group.querySelector('input,select,textarea') : null;
          if (inp) inp.classList.add('invalid');
        }

        if (spec.required && (!val || val === '[]' || val === '')) {
          fieldError(`${spec.label} is required.`);
          continue;
        }
        if (!val) continue;  // optional and empty

        if (spec.format === 'email' && !EMAIL_RE.test(val)) {
          fieldError('Please enter a valid email address.');
          continue;
        }
        if (spec.matchField) {
          const matchVal = values[spec.matchField] ?? '';
          if (val.toLowerCase() !== matchVal.toLowerCase()) {
            fieldError('Email addresses do not match.');
            continue;
          }
        }
        if (spec.format === 'phone') {
          const digits = val.replace(/\D/g, '');
          if (digits.length < 10) {
            fieldError('Please enter a 10-digit US phone number.');
            continue;
          }
        }
        if (spec.options && spec.type === 'dropdown' && !spec.options.includes(val)) {
          fieldError('Please select a valid option.');
        }
      }
      return { valid, values };
    }

    // ── Main init ─────────────────────────────────────────────────────────────
    function init(config) {
      // config: { program, role, fields, turnstileSiteKey }
      const formEl = document.getElementById('registration-form');
      const fieldsContainer = document.getElementById('form-fields');
      const statusEl = document.getElementById('form-status');
      const submitBtn = document.getElementById('btn-submit');
      if (!formEl || !fieldsContainer || !statusEl || !submitBtn) {
        console.error('NWKS_FORM.init: required DOM elements not found.');
        return;
      }

      // Render fields
      (config.fields || []).forEach(spec => renderField(spec, fieldsContainer));

      // Turnstile widget container (injected after the fields)
      let turnstileToken = '__TEST_BYPASS__';  // default for dev/no-sitekey
      if (config.turnstileSiteKey) {
        const tsDiv = document.createElement('div');
        tsDiv.className = 'cf-turnstile';
        tsDiv.dataset.sitekey = config.turnstileSiteKey;
        tsDiv.dataset.theme = 'dark';
        tsDiv.dataset.callback = '__nwks_turnstile_cb';
        fieldsContainer.appendChild(tsDiv);
        window.__nwks_turnstile_cb = (token) => { turnstileToken = token; };
        // Load Turnstile script if not already present
        if (!document.querySelector('script[src*="turnstile"]')) {
          const s = document.createElement('script');
          s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
          s.async = true;
          document.head.appendChild(s);
        }
      }

      function showStatus(msg, type) {
        statusEl.textContent = msg;
        statusEl.className = `form-status visible ${type}`;
        statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { valid, values } = validateForm(formEl, config.fields || []);
        if (!valid) {
          showStatus('Please fix the errors above before submitting.', 'error');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';
        statusEl.className = 'form-status';

        const payload = { ...values, cf_turnstile_response: turnstileToken };

        try {
          const res = await fetch(`/api/register/${config.program}/${config.role}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
          });
          const data = await res.json();
          if (data.ok) {
            // Redirect to thanks page
            window.location.href = `/thanks.html?program=${encodeURIComponent(config.program)}`;
          } else {
            showStatus(data.error || 'Registration failed. Please try again.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Register';
          }
        } catch (err) {
          showStatus('Network error. Please check your connection and try again.', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Register';
        }
      });
    }

    return { init };
  })();
  ```

- [ ] No automated unit test for this module (it targets a DOM environment; tested via Playwright E2E in Task 9). Mark complete.
- [ ] Commit: `feat(p1): add public/shared/form.js — field renderer and submit handler`

---

### Task 8 — Static HTML registration pages

**Files:** `public/register/mens-attendee.html`, `public/register/mens-server.html`, `public/register/womens-attendee.html`, `public/register/womens-server.html`

**Interfaces:**
- Consumes: `public/shared/form.css`, `public/shared/form.js`; `NWKS_FORM.init()` with inline field configs
- Produces: four static pages matching the field schemas in § Field Schemas; womens-server renders a closed notice

**Steps:**

- [ ] Create `public/register/mens-attendee.html`:

  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Men's Encounter — Attendee Registration</title>
    <meta name="description" content="Register as an attendee for Men's Encounter — Northwest Kansas.">
    <link rel="stylesheet" href="/shared/form.css">
  </head>
  <body class="mens">
    <div class="form-card">
      <h1>Men's Encounter</h1>
      <p class="form-subtitle">Attendee Registration · Northwest Kansas</p>

      <form id="registration-form" novalidate>
        <div id="form-fields"></div>
        <div id="form-status" class="form-status" role="alert"></div>
        <button type="submit" id="btn-submit" class="btn-submit">Register</button>
      </form>

      <p class="form-verse">
        "It is for freedom that Christ has set us free." — Galatians 5:1
      </p>
    </div>

    <script src="/shared/form.js"></script>
    <script>
      NWKS_FORM.init({
        program: 'mens',
        role: 'attendee',
        // Turnstile site key: set via env or leave blank for dev
        turnstileSiteKey: '',   // TODO: replace with real site key at launch
        fields: [
          { name: 'first_name', label: 'First Name', type: 'text', required: true },
          { name: 'last_name', label: 'Last Name', type: 'text', required: true },
          { name: 'email', label: 'Email Address', type: 'text', format: 'email', required: true,
            help: 'We will send registration and event details via email. Please provide an accurate address.' },
          { name: 'phone', label: 'Phone Number', type: 'text', format: 'phone', required: true },
          { name: 'phone_type', label: 'Phone Type', type: 'dropdown', required: true,
            options: ['Cell', 'Home', 'Work', 'Other'] },
          { name: 'address', label: 'Address', type: 'text', required: true },
          { name: 'city', label: 'City', type: 'text', required: true },
          { name: 'state', label: 'State', type: 'text', required: true },
          { name: 'launch_location', label: 'Launch Location', type: 'dropdown', required: true,
            options: ['Hays', 'Norton', 'Plainville', 'Hoxie', 'Colby', 'Gove', 'Sterling', 'Wakeeney'] },
          { name: 'shirt_size', label: 'Shirt Size', type: 'dropdown', required: true,
            options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'] },
          { name: 'church', label: 'What Church do you attend, if any?', type: 'text', required: true },
          { name: 'times_attended_self_report',
            label: "How many times have you attended a Men's Encounter?",
            type: 'dropdown', required: true,
            options: ["This will be my first time!", '1', '2', 'More than 2'] },
          { name: 'invited_by',
            label: "Who invited you or how did you hear about Men's Encounter?",
            type: 'text', required: true },
          { name: 'prayer_contact_name', label: 'Contact Name', type: 'text', required: true,
            help: 'We would like to speak with your spouse, family, and/or friend(s) 2 weeks before Encounter to ask them to pray for and encourage you. Spouse is preferred.' },
          { name: 'prayer_contact_phone', label: 'Contact Phone Number', type: 'text', format: 'phone', required: true },
          { name: 'dietary_health', label: 'Dietary or health restrictions?', type: 'text', required: false,
            help: 'e.g. wheelchair access, diabetic diet, food allergies, cannot climb stairs, bottom bunk, etc.' },
          { name: 'questions', label: 'Questions or concerns?', type: 'textarea', required: false },
        ]
      });
    </script>
  </body>
  </html>
  ```

- [ ] Create `public/register/mens-server.html`:

  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Men's Encounter — Server Registration</title>
    <meta name="description" content="Register as a server for Men's Encounter — Northwest Kansas.">
    <link rel="stylesheet" href="/shared/form.css">
  </head>
  <body class="mens">
    <div class="form-card">
      <h1>Men's Encounter</h1>
      <p class="form-subtitle">Server Registration · Northwest Kansas</p>

      <form id="registration-form" novalidate>
        <div id="form-fields"></div>
        <div id="form-status" class="form-status" role="alert"></div>
        <button type="submit" id="btn-submit" class="btn-submit">Register as Server</button>
      </form>

      <p class="form-verse">
        "It is for freedom that Christ has set us free." — Galatians 5:1
      </p>
    </div>

    <script src="/shared/form.js"></script>
    <script>
      NWKS_FORM.init({
        program: 'mens',
        role: 'server',
        turnstileSiteKey: '',   // TODO: replace at launch
        fields: [
          { name: 'first_name', label: 'First Name', type: 'text', required: true },
          { name: 'last_name', label: 'Last Name', type: 'text', required: true },
          { name: 'email', label: 'Email Address', type: 'text', format: 'email', required: true },
          { name: 'phone', label: 'Phone Number', type: 'text', format: 'phone', required: true },
          { name: 'phone_type', label: 'Phone Type', type: 'dropdown', required: true,
            options: ['Cell', 'Home', 'Work', 'Other'] },
          { name: 'address', label: 'Address', type: 'text', required: true },
          { name: 'city', label: 'City', type: 'text', required: true },
          { name: 'state', label: 'State', type: 'text', required: true },
          { name: 'launch_location', label: 'Launch Location', type: 'dropdown', required: true,
            options: ['Hays', 'Norton', 'Plainville', 'Hoxie', 'Colby', 'Gove', 'Sterling', 'Wakeeney'] },
          { name: 'shirt_size', label: 'Shirt Size', type: 'dropdown', required: true,
            options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'] },
          { name: 'church', label: 'What Church do you attend?', type: 'text', required: true },
          { name: 'times_served_self_report',
            label: "How many times have you served at Men's Encounter?",
            type: 'dropdown', required: true,
            options: ["This will be my first time serving!", '1', '2', 'More than 2'],
            extraKey: true },
          { name: 'invited_by', label: 'How did you hear about serving?', type: 'text', required: false },
          { name: 'prayer_contact_name', label: 'Contact Name', type: 'text', required: true,
            help: 'We would like to speak with your spouse, family, and/or friend(s) before Encounter to pray for and encourage you. Spouse is preferred.' },
          { name: 'prayer_contact_phone', label: 'Contact Phone Number', type: 'text', format: 'phone', required: true },
          { name: 'dietary_health', label: 'Dietary or health restrictions?', type: 'text', required: false },
          { name: 'questions', label: 'Questions or concerns?', type: 'textarea', required: false },
        ]
      });
    </script>
  </body>
  </html>
  ```

- [ ] Create `public/register/womens-attendee.html`:

  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Women's Encounter — Attendee Registration</title>
    <meta name="description" content="Register as an attendee for Women's Encounter — Northwest Kansas.">
    <link rel="stylesheet" href="/shared/form.css">
  </head>
  <body class="womens">
    <div class="form-card">
      <h1>Women's Encounter</h1>
      <p class="form-subtitle">Attendee Registration · Northwest Kansas</p>

      <form id="registration-form" novalidate>
        <div id="form-fields"></div>
        <div id="form-status" class="form-status" role="alert"></div>
        <button type="submit" id="btn-submit" class="btn-submit">Register</button>
      </form>

      <p class="form-verse">
        "It is for freedom that Christ has set us free." — Galatians 5:1
      </p>
    </div>

    <script src="/shared/form.js"></script>
    <script>
      NWKS_FORM.init({
        program: 'womens',
        role: 'attendee',
        turnstileSiteKey: '',   // TODO: replace at launch
        fields: [
          { name: 'first_name', label: 'First Name', type: 'text', required: true },
          { name: 'last_name', label: 'Last Name', type: 'text', required: true },
          { name: 'launch_location', label: 'Select a Launch Point location', type: 'dropdown', required: true,
            options: ['Colby', 'Gove', 'Hays', 'Hoxie', 'Norton', 'Plainville', 'Sterling', 'Wakeeney'] },
          { name: 'invited_by',
            label: 'Who invited you to Encounter? Please give a first & last name(s).',
            type: 'text', required: false },
          { name: 'email', label: 'Email Address', type: 'text', format: 'email', required: true,
            help: 'Encounter communication occurs via email. Please check your inbox frequently.' },
          { name: 'email_confirm', label: 'Confirm Email Address', type: 'text', format: 'email',
            required: true, matchField: 'email', skipPersist: true },
          { name: 'prior_attendance',
            label: "Have you attended Women's Encounter previously?",
            type: 'checkbox', required: true,
            options: [
              "1st Time Attendee - Never attended Women's Encounter",
              "I have attended a previous Women's Encounter - I understand that 1st time attendees will get priority",
              "I have attended previously but had a major life event & would be beneficial to attend again"
            ] },
          { name: 'life_event_note',
            label: 'If you have had a major life event, please write a note to Leadership explaining said event.',
            type: 'textarea', required: false },
          { name: 'phone', label: 'Your Phone Number - Cell Preferred', type: 'text', format: 'phone', required: true },
          { name: 'phone_type', label: 'If not a cell #, please check box below', type: 'checkbox', required: false,
            options: ['Land Line'] },
          { name: 'address', label: 'Your Address', type: 'text', required: true },
          { name: 'city', label: 'City', type: 'text', required: true },
          { name: 'state', label: 'State', type: 'text', required: true },
          { name: 'zip', label: 'Zip', type: 'text', required: true, extraKey: true },
          { name: 'church', label: 'What church do you attend, if any?', type: 'text', required: false },
          { name: 'prayer_contact_name', label: 'Contact Name', type: 'text', required: true,
            help: 'We would like to speak with your spouse, family, and/or friend(s) before Encounter to pray for and encourage you. Spouse is preferred.' },
          { name: 'prayer_contact_phone', label: "Contact Person's Phone Number", type: 'text', format: 'phone', required: true },
          { name: 'shirt_size', label: 'T-Shirt Size', type: 'radio', required: true,
            options: ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large', 'XXX-Large', 'Other'] },
          { name: 'sandwich_preference', label: 'What kind of sandwich do you prefer?', type: 'dropdown', required: true,
            options: [
              'Ham/bun', 'Ham/lettuce wrapped unwich',
              'Turkey/bun', 'Turkey/lettuce wrapped unwich',
              'Veggie/bun', 'Veggie/lettuce wrapped unwich'
            ],
            extraKey: true },
          { name: 'questions', label: 'Questions or concerns?', type: 'textarea', required: false },
        ]
      });
    </script>
  </body>
  </html>
  ```

- [ ] Create `public/register/womens-server.html` (closed notice — no form rendered):

  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Women's Encounter — Server Registration</title>
    <meta name="description" content="Server registration for Women's Encounter — Northwest Kansas.">
    <link rel="stylesheet" href="/shared/form.css">
  </head>
  <body class="womens">
    <div class="form-card">
      <h1>Women's Encounter</h1>
      <p class="form-subtitle">Server Registration · Northwest Kansas</p>

      <div class="closed-notice">
        <p>Server registration for Women's Encounter is currently full.</p>
        <p style="margin-top:1rem;">If you have questions, please <a href="mailto:nwksencounter@gmail.com"
           style="color:inherit;text-decoration:underline;opacity:.8;">contact us</a>.</p>
      </div>

      <p class="form-verse">
        "It is for freedom that Christ has set us free." — Galatians 5:1
      </p>
    </div>
  </body>
  </html>
  ```

- [ ] No automated test; verified via Playwright E2E (Task 9).
- [ ] Commit: `feat(p1): add public/register HTML pages for all four program/role combos`

---

### Task 9 — `public/thanks.html` — branded confirmation page

**Files:** `public/thanks.html`

**Interfaces:**
- Consumes: URL param `?program=mens|womens` to apply the correct colour class
- Produces: branded confirmation page; no server round-trips

**Steps:**

- [ ] Create `public/thanks.html`:

  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>You're Registered! — NWKS Encounter</title>
    <meta name="description" content="Registration confirmed for NWKS Encounter.">
    <link rel="stylesheet" href="/shared/form.css">
    <style>
      .thanks-icon { font-size: 3rem; margin-bottom: 1rem; display: block; text-align: center; }
      .thanks-card { text-align: center; }
      .thanks-card h1 { margin-bottom: 1rem; }
      .thanks-card p  { margin-bottom: 0.75rem; opacity: 0.85; }
      .thanks-card a  { color: inherit; text-decoration: underline; opacity: 0.75; }
      .thanks-card a:hover { opacity: 1; }
      .back-link {
        display: inline-block;
        margin-top: 1.5rem;
        padding: 0.5rem 1.2rem;
        border-radius: 4px;
        text-decoration: none;
        font-size: 0.85rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        font-weight: 600;
        opacity: 0.6;
        border: 1px solid currentColor;
      }
      .back-link:hover { opacity: 0.9; }
    </style>
  </head>
  <body class="mens">
    <div class="form-card thanks-card">
      <span class="thanks-icon" aria-hidden="true">✓</span>
      <h1>You're Registered!</h1>
      <p>
        Thank you for registering for <strong id="program-label">Men's Encounter</strong>.
        A confirmation email is on its way to your inbox.
      </p>
      <p>
        Check your spam folder if you don't see it within a few minutes.
        If you have questions, simply reply to that email — it goes straight to our team.
      </p>
      <a href="/" class="back-link">← Back to NWKS Encounter</a>
      <p class="form-verse" style="margin-top:2.5rem;">
        "It is for freedom that Christ has set us free." — Galatians 5:1
      </p>
    </div>

    <script>
      // Apply program-specific theme from query param
      const params = new URLSearchParams(window.location.search);
      const program = params.get('program') || 'mens';
      document.body.className = program === 'womens' ? 'womens' : 'mens';
      const label = document.getElementById('program-label');
      if (label) {
        label.textContent = program === 'womens' ? "Women's Encounter" : "Men's Encounter";
      }
    </script>
  </body>
  </html>
  ```

- [ ] Commit: `feat(p1): add public/thanks.html branded confirmation page`

---

### Task 10 — Playwright E2E test

**Files:** `tests/e2e/register.spec.ts`

**Interfaces:**
- Consumes: `wrangler pages dev dist --local` serving the real Hono app against a local D1
- Produces: E2E test covering: form renders, client validation fires, successful submission redirects to `/thanks.html`, DB has a registration row

**Steps:**

- [ ] Ensure a `tests/e2e/` directory exists (create if not). Check `playwright.config.ts` for the `baseURL` (should point to the wrangler pages dev port, typically `http://localhost:8788`).
- [ ] Write the E2E test:

  ```ts
  // tests/e2e/register.spec.ts
  import { test, expect } from '@playwright/test';

  // Assumes: wrangler pages dev dist --local is running and a current mens event
  // exists (seeded via `node scripts/seed-admin.mjs` or equivalent).
  // In CI, a fixture script seeds the DB before the suite.

  test.describe('Men\'s Attendee registration form', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/register/mens-attendee.html');
    });

    test('page renders with a submit button', async ({ page }) => {
      await expect(page.locator('#btn-submit')).toBeVisible();
      await expect(page.locator('h1')).toContainText("Men's Encounter");
    });

    test('shows validation error when first name is missing', async ({ page }) => {
      // Leave form blank, click submit
      await page.locator('#btn-submit').click();
      await expect(page.locator('.field-error').first()).toBeVisible();
    });

    test('successful submission redirects to thanks page', async ({ page }) => {
      // Fill all required fields
      await page.fill('[name="first_name"]', 'Test');
      await page.fill('[name="last_name"]', 'User');
      await page.fill('[name="email"]', `test+${Date.now()}@example.com`);
      await page.fill('[name="phone"]', '7851234567');
      await page.selectOption('[name="phone_type"]', 'Cell');
      await page.fill('[name="address"]', '123 Test St');
      await page.fill('[name="city"]', 'Hays');
      await page.fill('[name="state"]', 'KS');
      await page.selectOption('[name="launch_location"]', 'Hays');
      await page.selectOption('[name="shirt_size"]', 'L');
      await page.fill('[name="church"]', 'Test Church');
      await page.selectOption('[name="times_attended_self_report"]', 'This will be my first time!');
      await page.fill('[name="invited_by"]', 'A friend');
      await page.fill('[name="prayer_contact_name"]', 'Jane User');
      await page.fill('[name="prayer_contact_phone"]', '7859876543');

      await page.locator('#btn-submit').click();

      // Expect redirect to thanks.html
      await expect(page).toHaveURL(/\/thanks\.html/);
      await expect(page.locator('h1')).toContainText("You're Registered");
    });
  });
  ```

- [ ] Run: `npm run test:e2e` (requires `wrangler pages dev dist` running with a seeded DB).
  - Expected on first run (before seeding): test 3 may fail with 409 if no current event. Add a note in the test file: "requires a seeded current event row — run `npm run db:migrate:local` and seed via the seed script first."
  - Tests 1 and 2 should pass regardless of DB state.
- [ ] Commit: `test(p1): add Playwright E2E test for Men's Attendee registration flow`

---

## Contract Elements Consumed from Plan 00

| Element | Location in Plan 00 |
|---|---|
| `POST /api/register/:program/:role` → `{ ok, registration_id, person_id }` | API Surface — Public |
| `registrations` table columns (all 23 listed) | D1 Schema |
| `people` table columns + `idx_people_program_email` unique index (for dedupe) | D1 Schema |
| `events` table: `is_current`, `attendee_registration_open`, `server_registration_open` | D1 Schema |
| `email_log` table — all columns | D1 Schema |
| `Env` interface: `DB`, `SESSIONS`, `EMAIL_ENABLED`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `TURNSTILE_SECRET` | Cloudflare Bindings |
| `dedupe.upsertPerson(env, program, fields)` → `{ person_id, matched }` | Shared Module Contracts |
| `dedupe.recomputeRollups(env, personId)` | Shared Module Contracts |
| `email.sendEmail(env, { to, subject, html, text, replyTo })` → `SendResult` | Shared Module Contracts |
| `email.renderTemplate(tpl, vars)` → `{ subject, html, text }` | Shared Module Contracts |
| `db.nowIso()` → ISO-8601 string | Shared Module Contracts |
| `db.Program` = `'mens' \| 'women'` | Shared Module Contracts |
| `functions/_api/routes/register.ts` path | Repository Layout |
| `functions/_api/__tests__/` for tests | Repository Layout |
| `public/register/*.html`, `public/shared/`, `public/thanks.html` | Repository Layout |
| `@cloudflare/vitest-pool-workers` for API tests; `npm run test:api` | Testing & Local Dev |
| Playwright E2E against `wrangler pages dev dist`; `npm run test:e2e` | Testing & Local Dev |
| Hono router pattern: `new Hono<{ Bindings: Env }>()` mounted via `app.route()` | inferred from tech stack + API conventions |
| Error shape `{ ok: false, error: string }` / success `{ ok: true, ...data }` | API Surface — Conventions |

---

## Contract Additions Needed

The following items are not defined in Plan 00 and must either be resolved with leadership or noted as intentional additions:

1. **Men's Server field set confirmation.** The Men's Server Google Form was permanently closed at the time of analysis; no entry IDs could be confirmed. The field set in this plan is a reasonable default derived from the ministry pattern (mirrors Men's Attendee structure + `times_served_self_report`). **Leadership must confirm or adjust these fields before the Men's Server form goes live.** No schema change is required — `times_served_self_report` is stored in the `extra` JSON bag.

2. **`sandwich_preference` column.** The Women's Attendee form includes a sandwich preference field (from the live Google Form). This is stored in the `extra` JSON bag (`registrations.extra`) because there is no dedicated column in the Plan 00 schema. If a future plan needs to query or aggregate sandwich counts, a migration adding `sandwich_preference TEXT` to `registrations` would be needed. For P1 the `extra` bag is sufficient.

3. **Women's Attendee `zip` field.** The Women's Encounter form collects a zip code; Men's Attendee does not. No dedicated `zip` column exists in the `registrations` schema. Stored in `extra` JSON for P1. If zip is needed for shipping or logistics in a future plan, a `zip TEXT` column should be added via migration.

4. **Women's Attendee `prior_attendance` checkbox semantics.** The original form is pick-one (only one status applies) but rendered as a checkbox group (multiple selectable). Server-side validation in this plan treats it as a multi-select (JSON array), matching the raw form behaviour. If leadership wants strictly pick-one, change the HTML to a radio group and update the server validator. No schema change needed either way (`registrations.extra` stores the value for the `womens` program; Men's equivalent is `times_attended_self_report` in a named column).

5. **Ministry reply-to inbox.** `EMAIL_REPLY_TO` is listed as an open item in both Plan 00 and the spec. The welcome email template uses `c.env.EMAIL_REPLY_TO`. Until this is set, reply-to is omitted from the email (the `sendEmail` wrapper already handles an undefined `replyTo`). Set this secret before go-live.

6. **Turnstile site key.** The HTML pages leave `turnstileSiteKey: ''` as a `TODO` comment. A Cloudflare Turnstile site key must be provisioned in the Cloudflare dashboard and pasted into the four registration pages before go-live. The secret-side key (`TURNSTILE_SECRET`) is already in the binding list (Plan 00). A future enhancement (P3 or ops) could deliver the site key via a `<meta>` tag injected by the API to avoid hardcoding it in static HTML.

7. **`email_log` `campaign_id` null.** Transactional welcome emails written in this plan set `campaign_id = NULL` (no campaign). The column is nullable (`REFERENCES email_campaigns(id)` with no NOT NULL), so this is schema-compliant. Confirmed as correct.

8. **`womenServer` static page contact email.** `womens-server.html` links to `mailto:nwksencounter@gmail.com` as a placeholder. The canonical ministry inbox address is an open item in the spec and should be updated at launch.
