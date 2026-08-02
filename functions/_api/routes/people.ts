// functions/_api/routes/people.ts — Admin people profile and merge routes

import { Hono } from 'hono';
import type { Env } from '../app';
import { requireAuth, requireProgram } from '../auth';
import { findPossibleDuplicates, recomputeRollups } from '../dedupe';
import type { Person, Program } from '../db';
import { nowIso } from '../db';
import { withDisplayName } from '../seasons';

export const peopleRouter = new Hono<{ Bindings: Env }>();

peopleRouter.use('*', requireAuth(), requireProgram());

// ---------------------------------------------------------------------------
// Testimonies on the profile
// ---------------------------------------------------------------------------

/** An attachment row as the profile exposes it (no r2_key — see below). */
export interface ProfileAttachment {
  id: number;
  filename: string | null;
  content_type: string | null;
  size: number | null;
  link_url: string | null;
  /**
   * Whether an admin can actually open this attachment.
   *
   * Only link_url makes something openable. Emailed FILE attachments are stored
   * as metadata only: the email worker never writes bytes anywhere (r2_key is
   * NULL on every insert in testimonies/ingest.ts) because the R2 binding is
   * commented out in wrangler.toml, and no route serves attachment bytes. So
   * r2_key is deliberately not consulted here — treating it as "available"
   * would render a link that 404s. The UI says so instead.
   */
  available: boolean;
}

interface AttachmentRow {
  id: number;
  testimony_id: number;
  filename: string | null;
  content_type: string | null;
  size: number | null;
  link_url: string | null;
}

interface TestimonyRow {
  id: number;
  type: string;
  title: string | null;
  topic: string | null;
  subject: string | null;
  status: string;
  body_text: string | null;
  body_html: string | null;
  from_email: string;
  from_name: string;
  match_confidence: string | null;
  received_at: string | null;
  created_at: string;
}

/**
 * Loads the testimonies/teachings belonging to one person, each with its own
 * attachments.
 *
 * Scoped by person_id alone on purpose: the caller has already verified this
 * person belongs to the active program, and person_id NULL (unmatched inbound
 * mail) can never equal a real id — so unassigned submissions cannot leak onto
 * anybody's profile.
 */
async function loadPersonTestimonies(
  env: Env,
  personId: number
): Promise<Array<TestimonyRow & { attachments: ProfileAttachment[] }>> {
  const testimonies = await env.DB.prepare(
    `SELECT id, type, title, topic, subject, status, body_text, body_html,
            from_email, from_name, match_confidence, received_at, created_at
     FROM testimonies
     WHERE person_id = ?
     ORDER BY COALESCE(received_at, created_at) DESC, id DESC`
  ).bind(personId).all<TestimonyRow>();

  if (testimonies.results.length === 0) return [];

  // One extra round-trip for every attachment of every testimony, joined back
  // through testimonies so the person scoping is enforced in SQL rather than
  // by trusting the id list.
  const attachments = await env.DB.prepare(
    `SELECT a.id, a.testimony_id, a.filename, a.content_type, a.size, a.link_url
     FROM testimony_attachments a
     JOIN testimonies t ON t.id = a.testimony_id
     WHERE t.person_id = ?
     ORDER BY a.id`
  ).bind(personId).all<AttachmentRow>();

  const byTestimony = new Map<number, ProfileAttachment[]>();
  for (const a of attachments.results) {
    const list = byTestimony.get(a.testimony_id) ?? [];
    list.push({
      id: a.id,
      filename: a.filename,
      content_type: a.content_type,
      size: a.size,
      link_url: a.link_url,
      available: a.link_url !== null && a.link_url !== '',
    });
    byTestimony.set(a.testimony_id, list);
  }

  return testimonies.results.map((t) => ({
    ...t,
    attachments: byTestimony.get(t.id) ?? [],
  }));
}

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
    `SELECT r.*, e.year, e.season, e.title, e.start_date, e.end_date
     FROM registrations r
     JOIN events e ON e.id = r.event_id
     WHERE r.person_id = ? AND r.program = ?
     ORDER BY e.year DESC, CASE e.season WHEN 'fall' THEN 1 ELSE 0 END DESC`
  ).bind(personId, program).all<{ year: number; season: string }>();

  const possibleDuplicates = await findPossibleDuplicates(c.env, personId);

  // Emailed-in testimonies/teachings, so a server's own submission shows up
  // under their profile instead of only on the Testimonies board.
  const testimonies = await loadPersonTestimonies(c.env, personId);

  return c.json({
    ok: true,
    person,
    badges,
    history: historyResult.results.map(withDisplayName),
    possible_duplicates: possibleDuplicates,
    testimonies,
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

  // Move all registrations from source to target, scoped to this program for defense-in-depth
  await c.env.DB.prepare(
    `UPDATE registrations SET person_id = ? WHERE person_id = ? AND program = ?`
  ).bind(targetId, sourceId, program).run();

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
