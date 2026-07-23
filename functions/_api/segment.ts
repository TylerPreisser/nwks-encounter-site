// functions/_api/segment.ts — pure segment resolver util
// Takes a campaign segment descriptor, queries D1, returns distinct recipients.

import type { Env } from './app';
import type { Program } from './db';

export interface Segment {
  event_id?: number;
  role?: 'attendee' | 'server';
  launch_location?: string;
  first_timers_only?: boolean;
  status?: string;
}

export interface Recipient {
  person_id: number;
  first_name: string;
  last_name: string;
  email: string;
  launch_location: string | null;
  times_attended: number;
}

export async function resolveSegment(
  env: Env,
  program: Program,
  segment: Segment,
): Promise<Recipient[]> {
  const clauses: string[] = [
    `r.program = ?`,
    `p.email IS NOT NULL`,
    `TRIM(p.email) != ''`,
    `p.merged_into_id IS NULL`,
  ];
  const bindings: unknown[] = [program];

  if (segment.event_id != null) {
    clauses.push(`r.event_id = ?`);
    bindings.push(segment.event_id);
  } else {
    clauses.push(`e.is_current = 1`);
  }

  if (segment.role) {
    clauses.push(`r.role = ?`);
    bindings.push(segment.role);
  }

  if (segment.launch_location) {
    clauses.push(`r.launch_location = ?`);
    bindings.push(segment.launch_location);
  }

  const regStatus = segment.status ?? 'registered';
  clauses.push(`r.status = ?`);
  bindings.push(regStatus);

  if (segment.first_timers_only) {
    clauses.push(`p.times_attended = 1`);
  }

  const sql = `
    SELECT DISTINCT
      p.id        AS person_id,
      p.first_name,
      p.last_name,
      p.email,
      r.launch_location,
      p.times_attended
    FROM registrations r
    JOIN people p ON p.id = r.person_id
    JOIN events e ON e.id = r.event_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY p.last_name, p.first_name
  `;

  const result = await env.DB.prepare(sql).bind(...bindings).all<Recipient>();
  return result.results;
}
