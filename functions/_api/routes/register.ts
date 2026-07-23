// functions/_api/routes/register.ts — field schema definitions + validateBody + Hono router
import { Hono } from 'hono';
import type { Program } from '../db.js';
import type { Env } from '../app.js';
import { nowIso } from '../db.js';
import { upsertPerson, recomputeRollups } from '../dedupe.js';
import { sendEmail, renderTemplate } from '../email.js';

// ── Turnstile ──────────────────────────────────────────────────────────────
// Dev/test bypass: token value '__TEST_BYPASS__' always passes when
// TURNSTILE_SECRET is absent or set to the literal string 'test'.
export async function verifyTurnstile(
  env: Pick<Env, 'TURNSTILE_SECRET'>,
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
const RATE_LIMIT_MAX   = 3;
const RATE_LIMIT_TTL_S = 600; // 10 minutes

export async function checkRateLimit(
  env: Pick<Env, 'SESSIONS'>,
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

export type Role = 'attendee' | 'server';

type FieldType = 'text' | 'textarea' | 'dropdown' | 'checkbox' | 'radio';

export interface FieldSpec {
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
  { name: 'first_name',                label: 'First Name',                                    type: 'text',     required: true },
  { name: 'last_name',                 label: 'Last Name',                                     type: 'text',     required: true },
  { name: 'email',                     label: 'Email Address',                                 type: 'text',     required: true, format: 'email' },
  { name: 'phone',                     label: 'Phone Number',                                  type: 'text',     required: true, format: 'phone' },
  { name: 'phone_type',                label: 'Phone Type',                                    type: 'dropdown', required: true, options: ['Cell','Home','Work','Other'] },
  { name: 'address',                   label: 'Address',                                       type: 'text',     required: true },
  { name: 'city',                      label: 'City',                                          type: 'text',     required: true },
  { name: 'state',                     label: 'State',                                         type: 'text',     required: true },
  { name: 'launch_location',           label: 'Launch Location',                               type: 'dropdown', required: true, options: ['Hays','Norton','Plainville','Hoxie','Colby','Gove','Sterling','Wakeeney'] },
  { name: 'shirt_size',                label: 'Shirt Size',                                    type: 'dropdown', required: true, options: ['XS','S','M','L','XL','XXL','XXXL','XXXXL'] },
  { name: 'church',                    label: 'What Church do you attend, if any?',            type: 'text',     required: true },
  { name: 'times_attended_self_report',label: 'How many times have you attended?',             type: 'dropdown', required: true, options: ['This will be my first time!','1','2','More than 2'] },
  { name: 'invited_by',                label: "Who invited you or how did you hear about Men's Encounter?", type: 'text', required: true },
  { name: 'prayer_contact_name',       label: 'Contact Name',                                  type: 'text',     required: true },
  { name: 'prayer_contact_phone',      label: 'Contact Phone Number',                          type: 'text',     required: true, format: 'phone' },
  { name: 'dietary_health',            label: 'Dietary or health restrictions?',               type: 'text',     required: false },
  { name: 'questions',                 label: 'Questions or concerns?',                        type: 'textarea', required: false },
];

const WOMENS_ATTENDEE_FIELDS: FieldSpec[] = [
  { name: 'first_name',           label: 'First Name',                                         type: 'text',     required: true },
  { name: 'last_name',            label: 'Last Name',                                          type: 'text',     required: true },
  { name: 'launch_location',      label: 'Select a Launch Point location',                     type: 'dropdown', required: true, options: ['Colby','Gove','Hays','Hoxie','Norton','Plainville','Sterling','Wakeeney'] },
  { name: 'invited_by',           label: 'Who invited you to Encounter?',                      type: 'text',     required: false },
  { name: 'email',                label: 'Email Address',                                      type: 'text',     required: true, format: 'email' },
  { name: 'email_confirm',        label: 'Confirm Email Address',                              type: 'text',     required: true, matchField: 'email', skipPersist: true },
  { name: 'prior_attendance',     label: "Have you attended Women's Encounter previously?",    type: 'checkbox', required: true,
    options: [
      "1st Time Attendee - Never attended Women's Encounter",
      "I have attended a previous Women's Encounter - I understand that 1st time attendees will get priority",
      "I have attended previously but had a major life event & would be beneficial to attend again",
    ],
    extraKey: true,
  },
  { name: 'life_event_note',      label: 'Note to Leadership (major life event)',              type: 'textarea', required: false },
  { name: 'phone',                label: 'Your Phone Number',                                  type: 'text',     required: true, format: 'phone' },
  { name: 'phone_type',           label: 'Phone type',                                         type: 'checkbox', required: false, options: ['Land Line'] },
  { name: 'address',              label: 'Your Address',                                       type: 'text',     required: true },
  { name: 'city',                 label: 'City',                                               type: 'text',     required: true },
  { name: 'state',                label: 'State',                                              type: 'text',     required: true },
  { name: 'zip',                  label: 'Zip',                                                type: 'text',     required: true, extraKey: true },
  { name: 'church',               label: 'What church do you attend, if any?',                 type: 'text',     required: false },
  { name: 'prayer_contact_name',  label: 'Contact Name',                                       type: 'text',     required: true },
  { name: 'prayer_contact_phone', label: "Contact Person's Phone Number",                      type: 'text',     required: true, format: 'phone' },
  { name: 'shirt_size',           label: 'T-Shirt Size',                                       type: 'radio',    required: true, options: ['Small','Medium','Large','X-Large','XX-Large','XXX-Large','Other'] },
  { name: 'sandwich_preference',  label: 'What kind of sandwich do you prefer?',               type: 'dropdown', required: true,
    options: ['Ham/bun','Ham/lettuce wrapped unwich','Turkey/bun','Turkey/lettuce wrapped unwich','Veggie/bun','Veggie/lettuce wrapped unwich'],
    extraKey: true,
  },
  { name: 'questions',            label: 'Questions or concerns?',                             type: 'textarea', required: false },
];

const MENS_SERVER_FIELDS: FieldSpec[] = [
  { name: 'first_name',               label: 'First Name',                                    type: 'text',     required: true },
  { name: 'last_name',                label: 'Last Name',                                     type: 'text',     required: true },
  { name: 'email',                    label: 'Email Address',                                  type: 'text',     required: true, format: 'email' },
  { name: 'phone',                    label: 'Phone Number',                                   type: 'text',     required: true, format: 'phone' },
  { name: 'phone_type',               label: 'Phone Type',                                    type: 'dropdown', required: true, options: ['Cell','Home','Work','Other'] },
  { name: 'address',                  label: 'Address',                                        type: 'text',     required: true },
  { name: 'city',                     label: 'City',                                           type: 'text',     required: true },
  { name: 'state',                    label: 'State',                                          type: 'text',     required: true },
  { name: 'launch_location',          label: 'Launch Location',                                type: 'dropdown', required: true, options: ['Hays','Norton','Plainville','Hoxie','Colby','Gove','Sterling','Wakeeney'] },
  { name: 'shirt_size',               label: 'Shirt Size',                                    type: 'dropdown', required: true, options: ['XS','S','M','L','XL','XXL','XXXL','XXXXL'] },
  { name: 'church',                   label: 'What Church do you attend?',                    type: 'text',     required: true },
  { name: 'times_served_self_report', label: 'How many times have you served?',               type: 'dropdown', required: true,
    options: ['This will be my first time serving!','1','2','More than 2'], extraKey: true },
  { name: 'invited_by',               label: 'How did you hear about serving?',               type: 'text',     required: false },
  { name: 'prayer_contact_name',      label: 'Contact Name',                                   type: 'text',     required: true },
  { name: 'prayer_contact_phone',     label: 'Contact Phone Number',                           type: 'text',     required: true, format: 'phone' },
  { name: 'dietary_health',           label: 'Dietary or health restrictions?',               type: 'text',     required: false },
  { name: 'questions',                label: 'Questions or concerns?',                         type: 'textarea', required: false },
];

export const FIELD_SCHEMAS: Record<string, Record<string, FieldSpec[]>> = {
  mens:   { attendee: MENS_ATTENDEE_FIELDS,   server: MENS_SERVER_FIELDS },
  womens: { attendee: WOMENS_ATTENDEE_FIELDS, server: [] }, // womens/server always closed; empty schema never validated
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

    if (val === '') continue; // optional, not provided — skip further checks

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
      // Radio/dropdown: value must be in allowed list
      if (!spec.options.includes(val)) {
        errors.push(`${spec.label}: invalid option "${val}".`);
        continue;
      }
    }

    if (spec.options && spec.type === 'checkbox') {
      // Checkbox: val may be a JSON array string or a single option
      let selected: string[] = [];
      try { selected = JSON.parse(val); } catch { selected = val ? [val] : []; }
      const invalid = selected.filter((s) => !spec.options!.includes(s));
      if (invalid.length) {
        errors.push(`${spec.label}: invalid option(s): ${invalid.join(', ')}.`);
        continue;
      }
      const stored = selected.join(' | ');
      if (spec.extraKey) { extra[spec.name] = stored; } else { named[spec.name] = stored; }
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
      launch_location:            named['launch_location'],
      shirt_size:                 named['shirt_size'],
      church:                     named['church'],
      times_attended_self_report: named['times_attended_self_report'],
      invited_by:                 named['invited_by'],
      prayer_contact_name:        named['prayer_contact_name'],
      prayer_contact_phone:       named['prayer_contact_phone'],
      dietary_health:             named['dietary_health'],
      questions:                  named['questions'],
      extra,
    },
  };
}

// ── Inline welcome template (P4 moves this to email_templates table) ────────
function welcomeTemplate(program: Program, role: string): {
  subject: string;
  body_html: string;
  body_text: string;
} {
  const programLabel = program === 'mens' ? "Men's" : "Women's";
  const roleLabel    = role === 'server' ? 'Server' : 'Attendee';
  return {
    subject:   `You're registered for ${programLabel} Encounter!`,
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
  };
}

// ── Hono router ─────────────────────────────────────────────────────────────

export const registerRouter = new Hono<{ Bindings: Env }>();

// Valid slug → DB program mapping (URL uses 'mens'/'womens'; DB stores 'mens'/'women')
const SLUG_TO_PROGRAM: Record<string, Program> = { mens: 'mens', womens: 'women' };

registerRouter.post('/:program/:role', async (c) => {
  const programSlug = c.req.param('program');
  const role        = c.req.param('role');
  const ip          = c.req.header('CF-Connecting-IP') ?? '0.0.0.0';

  // Validate :program
  const program = SLUG_TO_PROGRAM[programSlug];
  if (!program) {
    return c.json({ ok: false, error: 'Invalid program.' }, 400);
  }

  // Validate :role
  if (role !== 'attendee' && role !== 'server') {
    return c.json({ ok: false, error: 'Invalid role.' }, 400);
  }

  // Rate-limit check
  const rateResult = await checkRateLimit(c.env, ip);
  if (!rateResult.allowed) {
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
  const turnstileOk = await verifyTurnstile(
    c.env,
    typeof token === 'string' ? token : undefined,
    ip
  );
  if (!turnstileOk) {
    return c.json({ ok: false, error: 'Bot verification failed. Please try again.' }, 422);
  }

  // Validate body fields
  const validation = validateBody(programSlug, role, rawBody);
  if (!validation.ok) {
    return c.json({ ok: false, error: validation.errors.join(' ') }, 400);
  }
  const fields = validation.data;

  // Look up current event
  const event = await c.env.DB
    .prepare('SELECT * FROM events WHERE program = ? AND is_current = 1 LIMIT 1')
    .bind(program)
    .first<{
      id: number;
      year: number;
      attendee_registration_open: number;
      server_registration_open: number;
    }>();

  if (!event) {
    return c.json({ ok: false, error: 'No current event found for this program.' }, 400);
  }

  const regOpen = role === 'server'
    ? event.server_registration_open
    : event.attendee_registration_open;

  if (!regOpen) {
    return c.json({ ok: false, error: 'Registration is not open for this event.' }, 409);
  }

  // Upsert person (de-dupe by email / fuzzy match)
  const { person_id } = await upsertPerson(
    c.env,
    program,
    {
      first_name: fields.first_name,
      last_name:  fields.last_name,
      email:      fields.email,
      phone:      fields.phone,
      phone_type: fields.phone_type,
      address:    fields.address,
      city:       fields.city,
      state:      fields.state,
      church:     fields.church,
    },
    event.year
  );

  // Insert registration row (full snapshot of all submitted fields)
  const now      = nowIso();
  const extraJson = JSON.stringify(fields.extra ?? {});

  const regResult = await c.env.DB
    .prepare(`
      INSERT INTO registrations
        (program, event_id, person_id, role,
         first_name, last_name, email, phone, phone_type,
         address, city, state,
         launch_location, shirt_size, church,
         times_attended_self_report, invited_by,
         prayer_contact_name, prayer_contact_phone,
         dietary_health, questions, extra, status, created_at)
      VALUES
        (?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?,
         ?, ?, ?,
         ?, ?,
         ?, ?,
         ?, ?, ?, 'registered', ?)
    `)
    .bind(
      program, event.id, person_id, role,
      fields.first_name,
      fields.last_name,
      fields.email      ?? null,
      fields.phone      ?? null,
      fields.phone_type ?? null,
      fields.address    ?? null,
      fields.city       ?? null,
      fields.state      ?? null,
      fields.launch_location            ?? null,
      fields.shirt_size                 ?? null,
      fields.church                     ?? null,
      fields.times_attended_self_report ?? null,
      fields.invited_by                 ?? null,
      fields.prayer_contact_name        ?? null,
      fields.prayer_contact_phone       ?? null,
      fields.dietary_health             ?? null,
      fields.questions                  ?? null,
      extraJson,
      now
    )
    .run();

  const registration_id = regResult.meta.last_row_id as number;

  // Recompute rollup counts (times_attended / times_served)
  await recomputeRollups(c.env, person_id);

  // Send welcome email (EMAIL_ENABLED='false' in test → writes log row, no network call)
  if (fields.email) {
    const tpl      = welcomeTemplate(program, role);
    const rendered = renderTemplate(tpl, {
      first_name: fields.first_name,
      last_name:  fields.last_name ?? '',
      program:    program === 'mens' ? "Men's" : "Women's",
      role:       role === 'server' ? 'Server' : 'Attendee',
    });

    await sendEmail(c.env, {
      to:          fields.email,
      subject:     rendered.subject,
      html:        rendered.html,
      text:        rendered.text,
      replyTo:     c.env.EMAIL_REPLY_TO || undefined,
      type:        'transactional',
      templateKey: 'welcome',
      personId:    person_id,
      program,
    });
  }

  return c.json({ ok: true, registration_id, person_id }, 200);
});
