// functions/_api/routes/people.ts — Admin people profile and merge routes

import { Hono } from 'hono';
import type { Env } from '../app';
import { requireAuth, requireProgram } from '../auth';
import { findPossibleDuplicates, recomputeRollups } from '../dedupe';
import type { Person, Program } from '../db';
import { nowIso } from '../db';

export const peopleRouter = new Hono<{ Bindings: Env }>();

peopleRouter.use('*', requireAuth(), requireProgram());

// ---------------------------------------------------------------------------
// GET /api/admin/people/:id
// Returns person profile, attendance badges, registration history, and
// possible duplicate candidates for the given person.
// ---------------------------------------------------------------------------
peopleRouter.get('/:id', async (c) => {
  const personId = Number(c.req.param('id'));
  const program = c.get('program') as Program;

  const person = await c.env.DB.prepare(
    `SELECT * FROM people WHERE id = ? AND program = ? AND merged_into_id IS NULL`
  ).bind(personId, program).first<Person>();

  if (!person) return c.json({ ok: false, error: 'Not found' }, 404);

  const badges = {
    times_attended: person.times_attended,
    times_served: person.times_served,
    is_first_timer: person.times_attended <= 1,
  };

  const historyResult = await c.env.DB.prepare(
    `SELECT r.*, e.year, e.title, e.start_date, e.end_date
     FROM registrations r
     JOIN events e ON e.id = r.event_id
     WHERE r.person_id = ? AND r.program = ?
     ORDER BY e.start_date DESC`
  ).bind(personId, program).all();

  const possibleDuplicates = await findPossibleDuplicates(c.env, personId);

  return c.json({
    ok: true,
    person,
    badges,
    history: historyResult.results,
    possible_duplicates: possibleDuplicates,
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/people/:id/merge
// Folds person :id into into_id:
//   - moves all :id registrations to into_id
//   - sets :id.merged_into_id = into_id (soft-delete, not destructive)
//   - recomputes rollups on the surviving (into_id) person
// Returns the updated surviving person.
//
// Safety checks: self-merge, cross-program, already-merged target, nonexistent ids.
// ---------------------------------------------------------------------------
peopleRouter.post('/:id/merge', async (c) => {
  const sourceId = Number(c.req.param('id'));
  const program = c.get('program') as Program;

  let body: { into_id?: number } = {};
  try {
    body = await c.req.json<{ into_id?: number }>();
  } catch {
    // malformed JSON treated as empty body
  }
  const targetId = body.into_id;

  if (!targetId) return c.json({ ok: false, error: 'into_id required' }, 400);
  if (sourceId === targetId) return c.json({ ok: false, error: 'Cannot merge a person into themselves' }, 400);

  const [source, target] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id FROM people WHERE id = ? AND program = ? AND merged_into_id IS NULL`
    ).bind(sourceId, program).first<{ id: number }>(),
    c.env.DB.prepare(
      `SELECT id FROM people WHERE id = ? AND program = ? AND merged_into_id IS NULL`
    ).bind(targetId, program).first<{ id: number }>(),
  ]);

  if (!source) return c.json({ ok: false, error: 'Source person not found' }, 404);
  if (!target) return c.json({ ok: false, error: 'Target person not found' }, 404);

  // Move all registrations from source to target
  await c.env.DB.prepare(
    `UPDATE registrations SET person_id = ? WHERE person_id = ?`
  ).bind(targetId, sourceId).run();

  // Soft-delete source by marking merged_into_id
  await c.env.DB.prepare(
    `UPDATE people SET merged_into_id = ?, updated_at = ? WHERE id = ?`
  ).bind(targetId, nowIso(), sourceId).run();

  // Recompute rollups on the surviving person from combined registrations
  await recomputeRollups(c.env, targetId);

  const updatedTarget = await c.env.DB.prepare(
    `SELECT * FROM people WHERE id = ?`
  ).bind(targetId).first<Person>();

  return c.json({ ok: true, person: updatedTarget });
});
