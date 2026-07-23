// functions/_api/db.ts — typed D1 helpers + shared types

export type Program = 'mens' | 'women';

export function nowIso(): string {
  return new Date().toISOString();
}

export function currentYear(): number {
  return new Date().getUTCFullYear();
}

export interface Person {
  id: number;
  program: Program;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  phone_type: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  church: string | null;
  times_attended: number;
  times_served: number;
  first_seen_year: number | null;
  last_activity_year: number | null;
  notes: string | null;
  merged_into_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PersonInput {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  phone_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  church?: string | null;
}

/** Parsed EventRow — launch_locations is a JS array, booleans are real booleans. */
export interface EventRow {
  id: number;
  program: Program;
  year: number;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  launch_locations: string[];
  attendee_registration_open: boolean;
  server_registration_open: boolean;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

/** Raw row shape as stored in D1 (integers for booleans, JSON string). */
interface EventRowRaw {
  id: number;
  program: Program;
  year: number;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  launch_locations: string;
  attendee_registration_open: number;
  server_registration_open: number;
  is_current: number;
  created_at: string;
  updated_at: string;
}

function parseEventRow(raw: EventRowRaw): EventRow {
  let launch_locations: string[] = [];
  try {
    const parsed = JSON.parse(raw.launch_locations ?? '[]');
    launch_locations = Array.isArray(parsed) ? parsed : [];
  } catch {
    launch_locations = [];
  }
  return {
    id: raw.id,
    program: raw.program,
    year: raw.year,
    title: raw.title,
    start_date: raw.start_date,
    end_date: raw.end_date,
    launch_locations,
    attendee_registration_open: raw.attendee_registration_open === 1,
    server_registration_open: raw.server_registration_open === 1,
    is_current: raw.is_current === 1,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

/** Returns a single person by id, or null if not found. */
export async function getPerson(db: D1Database, id: number): Promise<Person | null> {
  return db.prepare('SELECT * FROM people WHERE id = ?').bind(id).first<Person>();
}

/**
 * Returns all non-merged people for a program, ordered by last_name, first_name.
 */
export async function getActivePeople(db: D1Database, program: Program): Promise<Person[]> {
  const result = await db
    .prepare(
      'SELECT * FROM people WHERE program = ? AND merged_into_id IS NULL ORDER BY last_name, first_name'
    )
    .bind(program)
    .all<Person>();
  return result.results;
}

/**
 * Returns the current event for a program (is_current = 1), or null if none set.
 * Parses launch_locations JSON and coerces integer booleans to boolean.
 */
export async function getCurrentEvent(db: D1Database, program: Program): Promise<EventRow | null> {
  const raw = await db
    .prepare('SELECT * FROM events WHERE program = ? AND is_current = 1 LIMIT 1')
    .bind(program)
    .first<EventRowRaw>();
  if (!raw) return null;
  return parseEventRow(raw);
}
