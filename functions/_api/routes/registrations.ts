// functions/_api/routes/registrations.ts — Admin registrations list + CSV export

import { Hono } from 'hono';
import type { Env } from '../app';
import { requireAuth, requireProgram } from '../auth';
import type { Program } from '../db';

export const registrationsRouter = new Hono<{ Bindings: Env }>();

registrationsRouter.use('*', requireAuth(), requireProgram());

// Named columns exported (in order)
const NAMED_CSV_COLUMNS = [
  'id', 'role', 'first_name', 'last_name', 'email', 'phone', 'city', 'state', 'church',
  'launch_location', 'shirt_size', 'times_attended_self_report', 'invited_by',
  'prayer_contact_name', 'prayer_contact_phone', 'dietary_health', 'questions', 'status', 'created_at',
] as const;

/**
 * Escapes a single value per RFC 4180:
 * - Null/undefined → empty string
 * - Wrap in double-quotes if the value contains comma, double-quote, newline, or CR
 * - Escape embedded double-quotes by doubling them
 * - Neutralize CSV injection prefixes (=, +, -, @) by prepending a tab
 */
function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return '';
  let s = String(val);
  // Neutralize formula injection (leading =, +, -, @)
  if (s.length > 0 && '=+-@'.includes(s[0])) {
    s = `\t${s}`;
  }
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Parse the `extra` JSON column into a flat key/value map.
 * Returns an empty object if the value is missing, null, or invalid JSON.
 */
function parseExtra(extra: unknown): Record<string, string> {
  if (!extra || typeof extra !== 'string') return {};
  try {
    const obj = JSON.parse(extra);
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== null && v !== undefined) {
        result[k] = String(v);
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Builds the WHERE clause and bind parameters for the registrations queries.
 * Always scopes to a specific program; optionally filters by event_id, role, and text search q.
 */
function buildWhere(
  program: Program,
  eventId?: string,
  role?: string,
  q?: string,
): { where: string; binds: unknown[] } {
  const clauses: string[] = ['r.program = ?'];
  const binds: unknown[] = [program];
  if (eventId) {
    clauses.push('r.event_id = ?');
    binds.push(Number(eventId));
  }
  if (role === 'attendee' || role === 'server') {
    clauses.push('r.role = ?');
    binds.push(role);
  }
  if (q) {
    const like = `%${q}%`;
    clauses.push('(r.first_name LIKE ? OR r.last_name LIKE ? OR r.email LIKE ?)');
    binds.push(like, like, like);
  }
  return { where: clauses.join(' AND '), binds };
}

// ---------------------------------------------------------------------------
// GET /api/admin/registrations
// ---------------------------------------------------------------------------
registrationsRouter.get('/', async (c) => {
  const program = c.get('program') as Program;
  const { event_id, role, q, page } = c.req.query();
  const pageNum = Math.max(1, parseInt(page ?? '1', 10));
  const perPage = 50;
  const offset = (pageNum - 1) * perPage;

  const { where, binds } = buildWhere(program, event_id, role, q);

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM registrations r WHERE ${where}`,
  )
    .bind(...binds)
    .first<{ n: number }>();

  const rows = await c.env.DB.prepare(
    `SELECT r.* FROM registrations r WHERE ${where}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, perPage, offset)
    .all();

  return c.json({
    ok: true,
    rows: rows.results,
    total: countRow?.n ?? 0,
    page: pageNum,
    per_page: perPage,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/registrations/export.csv
// Exports all named columns plus every key found in the `extra` JSON bag,
// flattened into individual columns prefixed with `extra_`.
// ---------------------------------------------------------------------------
registrationsRouter.get('/export.csv', async (c) => {
  const program = c.get('program') as Program;
  const { event_id, role } = c.req.query();

  const { where, binds } = buildWhere(program, event_id, role);

  // Fetch named columns + extra
  const rows = await c.env.DB.prepare(
    `SELECT ${[...NAMED_CSV_COLUMNS, 'extra'].join(',')} FROM registrations r WHERE ${where} ORDER BY r.created_at ASC`,
  )
    .bind(...binds)
    .all<Record<string, unknown>>();

  // Collect the union of all extra keys across all rows (deterministic order)
  const extraKeySet = new Set<string>();
  for (const row of rows.results) {
    const extra = parseExtra(row['extra']);
    for (const k of Object.keys(extra)) {
      extraKeySet.add(k);
    }
  }
  const extraKeys = Array.from(extraKeySet).sort();

  // Build header: named columns + extra_* columns
  const header = [
    ...NAMED_CSV_COLUMNS,
    ...extraKeys.map((k) => `extra_${k}`),
  ].join(',');

  const dataLines = rows.results.map((row) => {
    const extra = parseExtra(row['extra']);
    const namedPart = NAMED_CSV_COLUMNS.map((col) => csvEscape(row[col])).join(',');
    const extraPart = extraKeys.map((k) => csvEscape(extra[k] ?? '')).join(',');
    return extraKeys.length > 0 ? `${namedPart},${extraPart}` : namedPart;
  });

  const csv = [header, ...dataLines].join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="registrations.csv"',
    },
  });
});
