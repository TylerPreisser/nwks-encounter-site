// admin/src/components/registrationFields.ts
// Shared vocabulary for turning a registration row into labelled, readable
// fields. Extracted from PersonPage so the roster, the detail page, and
// anything else that shows "what did they tell us" agree on labels and on which
// columns are structural noise.

export interface RegistrationRow {
  id: number;
  event_id: number;
  role: string;
  year: number;
  season?: string;
  display_name?: string;
  title: string | null;
  created_at: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  launch_location?: string | null;
  shirt_size?: string | null;
  church?: string | null;
  times_attended_self_report?: string | null;
  invited_by?: string | null;
  prayer_contact_name?: string | null;
  prayer_contact_phone?: string | null;
  dietary_health?: string | null;
  questions?: string | null;
  status?: string | null;
  /** JSON bag holding every custom question added in the Forms editor. */
  extra?: string | null;
  [key: string]: unknown;
}

/** Human-readable labels for named registration columns. */
export const NAMED_FIELD_LABELS: Record<string, string> = {
  email:                      'Email',
  phone:                      'Phone',
  phone_type:                 'Phone Type',
  address:                    'Address',
  city:                       'City',
  state:                      'State',
  launch_location:            'Launch Location',
  shirt_size:                 'Shirt Size',
  church:                     'Church',
  times_attended_self_report: 'Times Attended (self-reported)',
  invited_by:                 'Invited By',
  prayer_contact_name:        'Prayer Contact Name',
  prayer_contact_phone:       'Prayer Contact Phone',
  dietary_health:             'Dietary / Health Notes',
  questions:                  'Questions / Comments',
  status:                     'Registration Status',
};

/** Human-readable labels for known `extra` bag keys. */
export const EXTRA_FIELD_LABELS: Record<string, string> = {
  zip:                      'ZIP Code',
  sandwich_preference:      'Sandwich Preference',
  prior_attendance:         'Prior Attendance',
  life_event_note:          'Life Event Note',
  times_served_self_report: 'Times Served (self-reported)',
  emergency_contact_name:   'Emergency Contact Name',
  emergency_contact_phone:  'Emergency Contact Phone',
  roommate_request:         'Roommate Request',
  transportation:           'Transportation',
  special_needs:            'Special Needs',
  tshirt_size:              'T-Shirt Size',
  arrival_time:             'Arrival Time',
  departure_time:           'Departure Time',
};

/**
 * Columns shown elsewhere on the page or purely structural. Anything NOT in
 * here and not empty gets rendered, so a column added to registrations later
 * shows up on its own rather than silently going missing.
 */
export const SKIP_NAMED = new Set([
  'id', 'program', 'event_id', 'person_id', 'role',
  'first_name', 'last_name', 'created_at', 'extra',
  'year', 'season', 'display_name', 'title', 'start_date', 'end_date',
  'times_attended', 'times_served', 'is_first_timer',
]);

/** Parses the `extra` JSON bag into a flat key -> value map, dropping empties. */
export function parseExtra(extra: string | null | undefined): Record<string, string> {
  if (!extra) return {};
  try {
    const obj = JSON.parse(extra);
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== null && v !== undefined && v !== '') result[k] = String(v);
    }
    return result;
  } catch {
    return {};
  }
}

/** Label for a field key, falling back to Title Case of the key itself. */
export function labelFor(key: string): string {
  if (NAMED_FIELD_LABELS[key]) return NAMED_FIELD_LABELS[key];
  if (EXTRA_FIELD_LABELS[key]) return EXTRA_FIELD_LABELS[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Every answer this person actually gave, as [label, value] pairs: the named
 * columns first, then every custom Forms-editor question from `extra`.
 */
export function allAnswers(reg: RegistrationRow): [string, string][] {
  const named = Object.keys(NAMED_FIELD_LABELS)
    .filter((key) => !SKIP_NAMED.has(key))
    .map((key) => [key, String(reg[key] ?? '')] as [string, string])
    .filter(([, val]) => val !== '' && val !== 'null' && val !== 'undefined');

  const extra = Object.entries(parseExtra(reg.extra));

  return [...named, ...extra].map(([key, val]) => [labelFor(key), val]);
}

/** The encounter label for a registration: "Fall 2026", falling back gracefully. */
export function encounterLabel(reg: RegistrationRow): string {
  if (reg.display_name) return reg.display_name;
  if (reg.season && reg.year) {
    return `${reg.season === 'fall' ? 'Fall' : 'Spring'} ${reg.year}`;
  }
  return reg.title ?? `Encounter ${reg.event_id}`;
}
