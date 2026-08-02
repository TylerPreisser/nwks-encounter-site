// functions/_api/__tests__/people.testimonies.test.ts
// GET /api/admin/people/:id must surface the person's own emailed testimonies.
//
// Inbound email is already parsed, stored and person-matched by
// functions/_api/testimonies/ingest.ts. These tests cover the read side: the
// profile endpoint exposing those rows, and — critically — NOT exposing rows
// that belong to someone else or to nobody at all.

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin, markEnrolled } from './setup';
import { issueTrustedDevice } from '../security';
import { nowIso } from '../db';
import { storeTestimony } from '../testimonies/ingest';
import type { Env } from '../app';

const testEnv = env as unknown as Env;
const db = () => (env as unknown as { DB: D1Database }).DB;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedPerson(opts: {
  program: 'mens' | 'women';
  firstName?: string;
  lastName?: string;
  email?: string;
}): Promise<number> {
  const now = nowIso();
  const email = opts.email ?? `person_${Math.random().toString(36).slice(2)}@example.com`;
  const { meta } = await db()
    .prepare(
      `INSERT INTO people
         (program, first_name, last_name, email, times_attended, times_served, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?)`
    )
    .bind(opts.program, opts.firstName ?? 'First', opts.lastName ?? 'Last', email, now, now)
    .run();
  return meta.last_row_id as number;
}

/** Inserts a testimony row directly, bypassing ingest's matching rules. */
async function seedTestimony(opts: {
  personId: number | null;
  program: 'mens' | 'women' | null;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string | null;
  status?: string;
  receivedAt?: string | null;
  type?: 'testimony' | 'teaching';
}): Promise<number> {
  const now = nowIso();
  const { meta } = await db()
    .prepare(
      `INSERT INTO testimonies
         (type, person_id, program, from_email, from_name, subject,
          body_text, body_html, match_confidence, status, received_at, created_at)
       VALUES (?, ?, ?, 'sender@example.com', 'Sender Name', ?, ?, ?, 'email', ?, ?, ?)`
    )
    .bind(
      opts.type ?? 'testimony',
      opts.personId,
      opts.program,
      opts.subject ?? 'My testimony',
      opts.bodyText ?? 'Here is what God did.',
      opts.bodyHtml ?? null,
      opts.status ?? 'draft_1_review',
      opts.receivedAt === undefined ? now : opts.receivedAt,
      now
    )
    .run();
  return meta.last_row_id as number;
}

async function seedAttachment(opts: {
  testimonyId: number;
  filename?: string | null;
  contentType?: string | null;
  size?: number | null;
  r2Key?: string | null;
  linkUrl?: string | null;
}): Promise<number> {
  const { meta } = await db()
    .prepare(
      `INSERT INTO testimony_attachments
         (testimony_id, filename, content_type, size, r2_key, link_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      opts.testimonyId,
      opts.filename ?? null,
      opts.contentType ?? null,
      opts.size ?? null,
      opts.r2Key ?? null,
      opts.linkUrl ?? null,
      nowIso()
    )
    .run();
  return meta.last_row_id as number;
}

async function getAuthCookie(): Promise<string> {
  const rows = await db().prepare(`SELECT id FROM admin_users`).all<{ id: number }>();
  for (const r of rows.results) await markEnrolled(r.id);
  const first = rows.results[0];
  let trusted = '';
  if (first) {
    const t = await issueTrustedDevice(
      env as never,
      first.id,
      new Request('http://localhost/', { headers: { 'CF-Connecting-IP': '127.0.0.1' } })
    );
    trusted = `nwks_trusted=${t}`;
  }
  const loginRes = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(trusted ? { Cookie: trusted } : {}) },
      body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
    }),
    testEnv,
  );
  const token = (loginRes.headers.get('Set-Cookie') ?? '').match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

interface ProfileTestimony {
  id: number;
  type: string;
  subject: string | null;
  title: string | null;
  status: string;
  body_text: string | null;
  body_html: string | null;
  received_at: string | null;
  created_at: string;
  attachments: Array<{
    id: number;
    filename: string | null;
    content_type: string | null;
    size: number | null;
    link_url: string | null;
    /** true only when the bytes are actually retrievable */
    available: boolean;
  }>;
}

async function fetchProfile(personId: number, program: 'mens' | 'women', cookie: string) {
  const res = await app.fetch(
    new Request(`http://localhost/api/admin/people/${personId}?program=${program}`, {
      headers: { Cookie: cookie },
    }),
    testEnv,
  );
  const json = await res.json() as { ok: boolean; testimonies: ProfileTestimony[] };
  return { res, json };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/admin/people/:id — testimonies on the profile', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
    await seedAdmin();
  });

  it('always returns a testimonies array, even when the person has none', async () => {
    const personId = await seedPerson({ program: 'mens' });
    const cookie = await getAuthCookie();
    const { res, json } = await fetchProfile(personId, 'mens', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(json.testimonies)).toBe(true);
    expect(json.testimonies).toHaveLength(0);
  });

  it('returns the subject, body and arrival date of a testimony linked to that person', async () => {
    const personId = await seedPerson({ program: 'mens' });
    await seedTestimony({
      personId,
      program: 'mens',
      subject: 'What God did at the lake',
      bodyText: 'I was set free on Saturday morning.',
      receivedAt: '2026-07-04T15:00:00.000Z',
    });
    const cookie = await getAuthCookie();
    const { json } = await fetchProfile(personId, 'mens', cookie);

    expect(json.testimonies).toHaveLength(1);
    const t = json.testimonies[0];
    expect(t.subject).toBe('What God did at the lake');
    expect(t.body_text).toBe('I was set free on Saturday morning.');
    expect(t.received_at).toBe('2026-07-04T15:00:00.000Z');
    expect(t.status).toBe('draft_1_review');
    expect(t.type).toBe('testimony');
  });

  it('does not leak an unassigned (person_id NULL) testimony onto a profile', async () => {
    const personId = await seedPerson({ program: 'mens' });
    await seedTestimony({
      personId: null,
      program: null,
      subject: 'Unmatched sender submission',
    });
    const cookie = await getAuthCookie();
    const { json } = await fetchProfile(personId, 'mens', cookie);
    expect(json.testimonies).toHaveLength(0);
  });

  it("does not leak another person's testimony", async () => {
    const mine = await seedPerson({ program: 'mens', firstName: 'Mine' });
    const theirs = await seedPerson({ program: 'mens', firstName: 'Theirs' });
    await seedTestimony({ personId: theirs, program: 'mens', subject: 'Their story' });
    const cookie = await getAuthCookie();
    const { json } = await fetchProfile(mine, 'mens', cookie);
    expect(json.testimonies).toHaveLength(0);
  });

  it('returns testimonies newest-arrival-first', async () => {
    const personId = await seedPerson({ program: 'mens' });
    await seedTestimony({
      personId, program: 'mens', subject: 'Older', receivedAt: '2026-01-01T00:00:00.000Z',
    });
    await seedTestimony({
      personId, program: 'mens', subject: 'Newer', receivedAt: '2026-06-01T00:00:00.000Z',
    });
    const cookie = await getAuthCookie();
    const { json } = await fetchProfile(personId, 'mens', cookie);
    expect(json.testimonies.map((t) => t.subject)).toEqual(['Newer', 'Older']);
  });

  it('includes teachings alongside testimonies, tagged by type', async () => {
    const personId = await seedPerson({ program: 'mens' });
    await seedTestimony({ personId, program: 'mens', type: 'teaching', subject: 'On forgiveness' });
    const cookie = await getAuthCookie();
    const { json } = await fetchProfile(personId, 'mens', cookie);
    expect(json.testimonies).toHaveLength(1);
    expect(json.testimonies[0].type).toBe('teaching');
  });

  // -- attachments ----------------------------------------------------------

  it('marks a file attachment unavailable when its bytes were never stored (r2_key NULL)', async () => {
    const personId = await seedPerson({ program: 'mens' });
    const tId = await seedTestimony({ personId, program: 'mens' });
    // This is exactly what the email worker writes today: metadata, no bytes.
    await seedAttachment({
      testimonyId: tId,
      filename: 'my-testimony.pdf',
      contentType: 'application/pdf',
      size: 84210,
      r2Key: null,
      linkUrl: null,
    });
    const cookie = await getAuthCookie();
    const { json } = await fetchProfile(personId, 'mens', cookie);

    const atts = json.testimonies[0].attachments;
    expect(atts).toHaveLength(1);
    expect(atts[0].filename).toBe('my-testimony.pdf');
    expect(atts[0].size).toBe(84210);
    expect(atts[0].available).toBe(false);
    expect(atts[0].link_url).toBeNull();
  });

  it('marks a link attachment available and keeps its URL', async () => {
    const personId = await seedPerson({ program: 'mens' });
    const tId = await seedTestimony({ personId, program: 'mens' });
    await seedAttachment({
      testimonyId: tId,
      filename: 'https://docs.example.com/my-story',
      linkUrl: 'https://docs.example.com/my-story',
    });
    const cookie = await getAuthCookie();
    const { json } = await fetchProfile(personId, 'mens', cookie);

    const atts = json.testimonies[0].attachments;
    expect(atts).toHaveLength(1);
    expect(atts[0].available).toBe(true);
    expect(atts[0].link_url).toBe('https://docs.example.com/my-story');
  });

  it("does not attach one testimony's files to another testimony", async () => {
    const personId = await seedPerson({ program: 'mens' });
    const a = await seedTestimony({ personId, program: 'mens', subject: 'A', receivedAt: '2026-02-01T00:00:00.000Z' });
    const b = await seedTestimony({ personId, program: 'mens', subject: 'B', receivedAt: '2026-03-01T00:00:00.000Z' });
    await seedAttachment({ testimonyId: a, filename: 'a.docx' });
    await seedAttachment({ testimonyId: b, filename: 'b.docx' });
    const cookie = await getAuthCookie();
    const { json } = await fetchProfile(personId, 'mens', cookie);

    const bySubject = Object.fromEntries(json.testimonies.map((t) => [t.subject, t]));
    expect(bySubject['A'].attachments.map((x) => x.filename)).toEqual(['a.docx']);
    expect(bySubject['B'].attachments.map((x) => x.filename)).toEqual(['b.docx']);
  });

  // -- end-to-end against the real ingest path ------------------------------

  it('shows a testimony that arrived by email and was matched by sender address', async () => {
    const personId = await seedPerson({
      program: 'mens', firstName: 'Caleb', lastName: 'Ward', email: 'caleb@example.com',
    });
    await storeTestimony(testEnv, {
      from_email: 'caleb@example.com',
      from_name: 'Caleb Ward',
      subject: 'My testimony',
      body_text: 'Typed straight into the email body. See https://example.com/photo.jpg',
      received_at: '2026-07-20T12:00:00.000Z',
      attachments: [{ filename: 'testimony.docx', content_type:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1234 }],
    });
    const cookie = await getAuthCookie();
    const { json } = await fetchProfile(personId, 'mens', cookie);

    expect(json.testimonies).toHaveLength(1);
    const t = json.testimonies[0];
    expect(t.body_text).toContain('Typed straight into the email body');
    // The .docx row exists but its bytes were never stored; the body link is usable.
    const docx = t.attachments.find((a) => a.filename === 'testimony.docx');
    expect(docx?.available).toBe(false);
    const link = t.attachments.find((a) => a.link_url === 'https://example.com/photo.jpg');
    expect(link?.available).toBe(true);
  });

  it('requires auth', async () => {
    const personId = await seedPerson({ program: 'mens' });
    const res = await app.fetch(
      new Request(`http://localhost/api/admin/people/${personId}?program=mens`),
      testEnv,
    );
    expect(res.status).toBe(401);
  });
});
