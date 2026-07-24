// functions/_api/__tests__/testimonies.test.ts
// TDD integration tests for Testimonies & Teachings backend (draft workflow lifecycle)

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import { nowIso } from '../db';
import type { Env } from '../app';
import { matchTestimonyToPerson, extractLinks, storeTestimony } from '../testimonies/ingest';

const testEnv = env as unknown as Env;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthCookie(opts: { email?: string; password?: string } = {}): Promise<string> {
  const email = opts.email ?? 'admin@nwksencounter.com';
  const password = opts.password ?? 'TestPass1!';
  const loginRes = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
    testEnv
  );
  const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
  const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

function makeReq(
  method: string,
  path: string,
  cookie: string,
  program: string,
  body?: unknown
): Request {
  const url = `http://localhost${path}?program=${program}`;
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function seedPerson(opts: {
  program: 'mens' | 'women';
  firstName?: string;
  lastName?: string;
  email?: string;
}): Promise<number> {
  const now = nowIso();
  const db = (env as unknown as { DB: D1Database }).DB;
  const email = opts.email ?? `person_${Math.random().toString(36).slice(2)}@example.com`;
  const { meta } = await db
    .prepare(
      `INSERT INTO people
         (program, first_name, last_name, email, times_attended, times_served, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?)`
    )
    .bind(
      opts.program,
      opts.firstName ?? 'First',
      opts.lastName ?? 'Last',
      email,
      now,
      now
    )
    .run();
  return meta.last_row_id as number;
}

// 3-draft sub-state workflow (9 statuses)
type BoardStatus =
  | 'not_received'
  | 'draft_1_awaiting'
  | 'draft_1_review'
  | 'draft_2_awaiting'
  | 'draft_2_review'
  | 'draft_3_awaiting'
  | 'draft_3_review'
  | 'approved'
  | 'archived';

async function seedTestimony(opts: {
  program?: string | null;
  person_id?: number | null;
  status?: BoardStatus;
  type?: string;
  from_email?: string;
  from_name?: string;
  title?: string | null;
}): Promise<number> {
  const now = nowIso();
  const db = (env as unknown as { DB: D1Database }).DB;
  const { meta } = await db
    .prepare(
      `INSERT INTO testimonies
         (type, person_id, program, title, from_email, from_name, subject, body_text,
          match_confidence, status, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Test Subject', 'Test body', 'email', ?, ?, ?)`
    )
    .bind(
      opts.type ?? 'testimony',
      opts.person_id ?? null,
      opts.program ?? null,
      opts.title ?? null,
      opts.from_email ?? 'sender@example.com',
      opts.from_name ?? 'Sender Name',
      opts.status ?? 'not_received',
      now,
      now
    )
    .run();
  return meta.last_row_id as number;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('testimonies migration', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  it('creates testimonies table', async () => {
    const row = await testEnv.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='testimonies'`
    ).first<{ name: string }>();
    expect(row?.name).toBe('testimonies');
  });

  it('creates testimony_attachments table', async () => {
    const row = await testEnv.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='testimony_attachments'`
    ).first<{ name: string }>();
    expect(row?.name).toBe('testimony_attachments');
  });

  it('creates testimony_comments table', async () => {
    const row = await testEnv.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='testimony_comments'`
    ).first<{ name: string }>();
    expect(row?.name).toBe('testimony_comments');
  });

  it('has title column in testimonies table', async () => {
    const info = await testEnv.DB.prepare(
      `PRAGMA table_info(testimonies)`
    ).all<{ name: string }>();
    const cols = info.results.map(r => r.name);
    expect(cols).toContain('title');
  });

  it('has assigned_at column in testimonies table', async () => {
    const info = await testEnv.DB.prepare(
      `PRAGMA table_info(testimonies)`
    ).all<{ name: string }>();
    const cols = info.results.map(r => r.name);
    expect(cols).toContain('assigned_at');
  });

  it('allows all 9 sub-state status values', async () => {
    const now = nowIso();
    for (const status of [
      'not_received',
      'draft_1_awaiting', 'draft_1_review',
      'draft_2_awaiting', 'draft_2_review',
      'draft_3_awaiting', 'draft_3_review',
      'approved', 'archived',
    ]) {
      const { meta } = await testEnv.DB.prepare(
        `INSERT INTO testimonies (type, from_email, from_name, status, created_at)
         VALUES ('testimony', 'x@x.com', 'X', ?, ?)`
      ).bind(status, now).run();
      expect(meta.last_row_id).toBeGreaterThan(0);
    }
  });

  it('rejects old status values no longer in the CHECK', async () => {
    const now = nowIso();
    for (const badStatus of [
      'unfulfilled', 'waiting', 'draft_1', 'draft_2', 'awaiting', 'in_progress',
      'awaiting_draft_1', 'awaiting_draft_2', // old 0008 statuses removed in 0009
    ]) {
      let threw = false;
      try {
        await testEnv.DB.prepare(
          `INSERT INTO testimonies (type, from_email, from_name, status, created_at)
           VALUES ('testimony', 'x@x.com', 'X', ?, ?)`
        ).bind(badStatus, now).run();
      } catch {
        threw = true;
      }
      expect(threw, `expected ${badStatus} to be rejected`).toBe(true);
    }
  });

  it('migration 0009 maps old awaiting_draft_1->draft_1_awaiting (old status no longer valid)', async () => {
    // After 0009, awaiting_draft_1 is not a valid status
    const now = nowIso();
    let threw = false;
    try {
      await testEnv.DB.prepare(
        `INSERT INTO testimonies (type, from_email, from_name, status, created_at)
         VALUES ('testimony', 'x@x.com', 'X', 'awaiting_draft_1', ?)`
      ).bind(now).run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('matchTestimonyToPerson', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  it('matches by exact email (case-insensitive)', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'John.Doe@example.com', firstName: 'John', lastName: 'Doe' });
    const result = await matchTestimonyToPerson(testEnv, 'john.doe@example.com', 'John Doe');
    expect(result.person_id).toBe(personId);
    expect(result.program).toBe('mens');
    expect(result.confidence).toBe('email');
  });

  it('matches by last name fuzzy (single word = last name)', async () => {
    const personId = await seedPerson({ program: 'women', firstName: 'Jane', lastName: 'Smith', email: 'other@example.com' });
    const result = await matchTestimonyToPerson(testEnv, 'unknown@noemail.com', 'Smith');
    expect(result.person_id).toBe(personId);
    expect(result.program).toBe('women');
    expect(result.confidence).toBe('name');
  });

  it('matches by first + last name when both present', async () => {
    const personId = await seedPerson({ program: 'mens', firstName: 'Robert', lastName: 'Johnson' });
    const result = await matchTestimonyToPerson(testEnv, 'noemail@noemail.com', 'Robert Johnson');
    expect(result.person_id).toBe(personId);
    expect(result.confidence).toBe('name');
  });

  it('returns none when no match found', async () => {
    const result = await matchTestimonyToPerson(testEnv, 'nobody@nowhere.com', 'Nobody Exists');
    expect(result.person_id).toBeNull();
    expect(result.program).toBeNull();
    expect(result.confidence).toBe('none');
  });

  it('prefers email match over name match', async () => {
    const personByEmail = await seedPerson({ program: 'mens', email: 'exact@example.com', firstName: 'First', lastName: 'Person' });
    await seedPerson({ program: 'women', firstName: 'First', lastName: 'Person', email: 'other2@example.com' });
    const result = await matchTestimonyToPerson(testEnv, 'exact@example.com', 'First Person');
    expect(result.person_id).toBe(personByEmail);
    expect(result.confidence).toBe('email');
  });

  it('skips merged people on email match', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'merged@example.com' });
    const survivorId = await seedPerson({ program: 'mens', email: 'survivor@example.com' });
    await testEnv.DB.prepare(`UPDATE people SET merged_into_id = ? WHERE id = ?`)
      .bind(survivorId, personId).run();
    const result = await matchTestimonyToPerson(testEnv, 'merged@example.com', 'Merged Person');
    expect(result.person_id).toBeNull();
    expect(result.confidence).toBe('none');
  });
});

describe('extractLinks', () => {
  it('extracts http and https URLs', () => {
    const text = 'See my doc at https://docs.google.com/document/d/abc123 and also http://example.com/foo';
    const links = extractLinks(text);
    expect(links).toContain('https://docs.google.com/document/d/abc123');
    expect(links).toContain('http://example.com/foo');
  });

  it('returns empty array when no URLs', () => {
    expect(extractLinks('No links here, just text.')).toEqual([]);
  });

  it('handles empty string', () => {
    expect(extractLinks('')).toEqual([]);
  });

  it('deduplicates repeated URLs', () => {
    const text = 'https://example.com https://example.com';
    const links = extractLinks(text);
    expect(links.filter((u) => u === 'https://example.com')).toHaveLength(1);
  });
});

describe('storeTestimony', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  it('stores a matched testimony with person_id and program, status=draft_1_review', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'testify@example.com', firstName: 'Test', lastName: 'Person' });
    const result = await storeTestimony(testEnv, {
      from_email: 'testify@example.com',
      from_name: 'Test Person',
      subject: 'My testimony',
      body_text: 'God moved mightily in my life.',
      received_at: nowIso(),
    });
    expect(result.matched).toBe(true);
    expect(result.testimony_id).toBeGreaterThan(0);
    expect(result.attached_to_existing).toBe(false);
    const row = await testEnv.DB.prepare(`SELECT * FROM testimonies WHERE id = ?`)
      .bind(result.testimony_id).first<{ person_id: number; program: string; status: string; match_confidence: string }>();
    expect(row?.person_id).toBe(personId);
    expect(row?.program).toBe('mens');
    expect(row?.status).toBe('draft_1_review');
    expect(row?.match_confidence).toBe('email');
  });

  it('stores an unmatched testimony with null person_id, status=draft_1_review', async () => {
    const result = await storeTestimony(testEnv, {
      from_email: 'unknown@ghost.com',
      from_name: 'Ghost Sender',
      subject: 'No match',
      body_text: 'Plain body',
    });
    expect(result.matched).toBe(false);
    expect(result.attached_to_existing).toBe(false);
    const row = await testEnv.DB.prepare(`SELECT * FROM testimonies WHERE id = ?`)
      .bind(result.testimony_id).first<{ person_id: null; program: null; match_confidence: string; status: string }>();
    expect(row?.person_id).toBeNull();
    expect(row?.program).toBeNull();
    expect(row?.match_confidence).toBe('none');
    expect(row?.status).toBe('draft_1_review');
  });

  it('stores explicit attachments with r2_key null', async () => {
    const result = await storeTestimony(testEnv, {
      from_email: 'attach@example.com',
      from_name: 'Attach Person',
      body_text: 'See attached',
      attachments: [
        { filename: 'testimony.pdf', content_type: 'application/pdf', size: 12345 },
      ],
    });
    const atts = await testEnv.DB.prepare(
      `SELECT * FROM testimony_attachments WHERE testimony_id = ?`
    ).bind(result.testimony_id).all<{ filename: string; r2_key: null; link_url: null }>();
    expect(atts.results).toHaveLength(1);
    expect(atts.results[0].filename).toBe('testimony.pdf');
    expect(atts.results[0].r2_key).toBeNull();
  });

  it('extracts body links and stores as attachment rows', async () => {
    const result = await storeTestimony(testEnv, {
      from_email: 'linker@example.com',
      from_name: 'Link Person',
      body_text: 'My testimony is here: https://docs.google.com/document/d/XYZ and also https://example.com/foo',
    });
    const atts = await testEnv.DB.prepare(
      `SELECT * FROM testimony_attachments WHERE testimony_id = ? ORDER BY id`
    ).bind(result.testimony_id).all<{ link_url: string; filename: string }>();
    expect(atts.results.length).toBeGreaterThanOrEqual(2);
    const urls = atts.results.map((a) => a.link_url);
    expect(urls).toContain('https://docs.google.com/document/d/XYZ');
    expect(urls).toContain('https://example.com/foo');
  });

  it('stores teaching type when specified', async () => {
    const result = await storeTestimony(testEnv, {
      from_email: 'teacher@example.com',
      from_name: 'Teacher Name',
      body_text: 'Here is my teaching',
      type: 'teaching',
    });
    const row = await testEnv.DB.prepare(`SELECT type FROM testimonies WHERE id = ?`)
      .bind(result.testimony_id).first<{ type: string }>();
    expect(row?.type).toBe('teaching');
  });

  it('auto-advance: not_received + email -> draft_1_review', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'needed@example.com', firstName: 'Needed', lastName: 'Person' });
    const neededId = await seedTestimony({
      person_id: personId,
      program: 'mens',
      status: 'not_received',
      type: 'testimony',
    });

    const result = await storeTestimony(testEnv, {
      from_email: 'needed@example.com',
      from_name: 'Needed Person',
      subject: 'Here is my testimony',
      body_text: 'God did great things.',
    });

    expect(result.matched).toBe(true);
    expect(result.attached_to_existing).toBe(true);
    expect(result.testimony_id).toBe(neededId);

    const row = await testEnv.DB.prepare(`SELECT status, body_text FROM testimonies WHERE id = ?`)
      .bind(neededId).first<{ status: string; body_text: string }>();
    expect(row?.status).toBe('draft_1_review');
    expect(row?.body_text).toBe('God did great things.');
  });

  it('auto-advance: draft_1_awaiting + email -> draft_1_review', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'waiting@example.com', firstName: 'Wait', lastName: 'Person' });
    const neededId = await seedTestimony({
      person_id: personId,
      program: 'mens',
      status: 'draft_1_awaiting',
      type: 'testimony',
    });

    const result = await storeTestimony(testEnv, {
      from_email: 'waiting@example.com',
      from_name: 'Wait Person',
      body_text: 'My first draft.',
    });

    expect(result.attached_to_existing).toBe(true);
    expect(result.testimony_id).toBe(neededId);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(neededId).first<{ status: string }>();
    expect(row?.status).toBe('draft_1_review');
  });

  it('auto-advance: draft_2_awaiting + email -> draft_2_review', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'awaiting2@example.com', firstName: 'A2', lastName: 'Person' });
    const neededId = await seedTestimony({
      person_id: personId,
      program: 'mens',
      status: 'draft_2_awaiting',
      type: 'testimony',
    });

    const result = await storeTestimony(testEnv, {
      from_email: 'awaiting2@example.com',
      from_name: 'A2 Person',
      body_text: 'My second draft.',
    });

    expect(result.attached_to_existing).toBe(true);
    expect(result.testimony_id).toBe(neededId);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(neededId).first<{ status: string }>();
    expect(row?.status).toBe('draft_2_review');
  });

  it('auto-advance: draft_1_review + email (re-send) -> stays draft_1_review (never backwards)', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'resend@example.com', firstName: 'Resend', lastName: 'Person' });
    const neededId = await seedTestimony({
      person_id: personId,
      program: 'mens',
      status: 'draft_1_review',
      type: 'testimony',
    });

    const result = await storeTestimony(testEnv, {
      from_email: 'resend@example.com',
      from_name: 'Resend Person',
      body_text: 'Resending my draft.',
    });

    expect(result.attached_to_existing).toBe(true);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(neededId).first<{ status: string }>();
    // Re-send while already in review keeps it in review (does not go backwards)
    expect(row?.status).toBe('draft_1_review');
  });

  it('creates new item when person has no open needed item (all approved)', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'done@example.com', firstName: 'Done', lastName: 'Person' });
    await seedTestimony({
      person_id: personId,
      program: 'mens',
      status: 'approved',
      type: 'testimony',
    });

    const result = await storeTestimony(testEnv, {
      from_email: 'done@example.com',
      from_name: 'Done Person',
      body_text: 'Another submission',
    });

    expect(result.attached_to_existing).toBe(false);
    expect(result.testimony_id).not.toBe(0);
    const newRow = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(result.testimony_id).first<{ status: string }>();
    expect(newRow?.status).toBe('draft_1_review');
  });
});

describe('testimonies topic column', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('has topic column in testimonies table after migration', async () => {
    const info = await testEnv.DB.prepare(
      `PRAGMA table_info(testimonies)`
    ).all<{ name: string }>();
    const cols = info.results.map(r => r.name);
    expect(cols).toContain('topic');
  });

  it('POST /api/admin/testimonies accepts and stores topic', async () => {
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('POST', '/api/admin/testimonies', cookie, 'mens', {
        type: 'testimony',
        topic: 'Purity',
      }),
      testEnv
    );
    expect(res.status).toBe(201);
    const json = await res.json<{ ok: boolean; testimony: { id: number } }>();
    expect(json.ok).toBe(true);
    const row = await testEnv.DB.prepare(`SELECT topic FROM testimonies WHERE id = ?`)
      .bind(json.testimony.id).first<{ topic: string | null }>();
    expect(row?.topic).toBe('Purity');
  });

  it('PATCH /api/admin/testimonies/:id accepts and stores topic', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'not_received' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { topic: 'Freedom' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT topic FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ topic: string | null }>();
    expect(row?.topic).toBe('Freedom');
  });

  it('GET /api/admin/testimonies includes topic in list response', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'not_received' });
    await testEnv.DB.prepare(`UPDATE testimonies SET topic = 'Healing' WHERE id = ?`).bind(tid).run();
    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', '/api/admin/testimonies', cookie, 'mens'), testEnv);
    const json = await res.json<{ testimonies: Array<{ id: number; topic: string | null }> }>();
    const found = json.testimonies.find((t) => t.id === tid);
    expect(found?.topic).toBe('Healing');
  });

  it('topic is null by default (no topic supplied)', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'not_received' });
    const row = await testEnv.DB.prepare(`SELECT topic FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ topic: string | null }>();
    expect(row?.topic).toBeNull();
  });
});

describe('GET /api/admin/testimonies', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('lists testimonies for the active program', async () => {
    const personId = await seedPerson({ program: 'mens' });
    await seedTestimony({ program: 'mens', person_id: personId, status: 'draft_1_review' });
    await seedTestimony({ program: 'women', status: 'not_received' }); // should not appear alone
    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', '/api/admin/testimonies', cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const json = await res.json<{ ok: boolean; testimonies: unknown[] }>();
    expect(json.ok).toBe(true);
    const programs = (json.testimonies as Array<{ program: string | null }>).map((t) => t.program);
    expect(programs.every((p) => p === 'mens' || p === null)).toBe(true);
  });

  it('supports status filter for all new sub-state statuses', async () => {
    await seedTestimony({ program: 'mens', status: 'not_received' });
    await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    await seedTestimony({ program: 'mens', status: 'approved' });
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies?program=mens&status=draft_1_review`;
    const res = await app.fetch(new Request(url, {
      headers: { Cookie: cookie },
    }), testEnv);
    const json = await res.json<{ testimonies: Array<{ status: string }> }>();
    expect(json.testimonies.every((t) => t.status === 'draft_1_review')).toBe(true);
  });

  it('supports status filter for draft_1_awaiting', async () => {
    await seedTestimony({ program: 'mens', status: 'draft_1_awaiting' });
    await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies?program=mens&status=draft_1_awaiting`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: cookie } }), testEnv);
    const json = await res.json<{ testimonies: Array<{ status: string }> }>();
    expect(json.testimonies.every((t) => t.status === 'draft_1_awaiting')).toBe(true);
  });

  it('supports status filter for draft_2_review', async () => {
    await seedTestimony({ program: 'mens', status: 'draft_2_review' });
    await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies?program=mens&status=draft_2_review`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: cookie } }), testEnv);
    const json = await res.json<{ testimonies: Array<{ status: string }> }>();
    expect(json.testimonies.every((t) => t.status === 'draft_2_review')).toBe(true);
  });

  it('supports status filter for draft_2_awaiting', async () => {
    await seedTestimony({ program: 'mens', status: 'draft_2_awaiting' });
    await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies?program=mens&status=draft_2_awaiting`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: cookie } }), testEnv);
    const json = await res.json<{ testimonies: Array<{ status: string }> }>();
    expect(json.testimonies.every((t) => t.status === 'draft_2_awaiting')).toBe(true);
  });

  it('supports status filter for draft_3_awaiting', async () => {
    await seedTestimony({ program: 'mens', status: 'draft_3_awaiting' });
    await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies?program=mens&status=draft_3_awaiting`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: cookie } }), testEnv);
    const json = await res.json<{ testimonies: Array<{ status: string }> }>();
    expect(json.testimonies.every((t) => t.status === 'draft_3_awaiting')).toBe(true);
  });

  it('supports status filter for draft_3_review', async () => {
    await seedTestimony({ program: 'mens', status: 'draft_3_review' });
    await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies?program=mens&status=draft_3_review`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: cookie } }), testEnv);
    const json = await res.json<{ testimonies: Array<{ status: string }> }>();
    expect(json.testimonies.every((t) => t.status === 'draft_3_review')).toBe(true);
  });

  it('supports fulfilled=true filter (approved only)', async () => {
    await seedTestimony({ program: 'mens', status: 'not_received' });
    await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    await seedTestimony({ program: 'mens', status: 'approved' });
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies?program=mens&fulfilled=true`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: cookie } }), testEnv);
    const json = await res.json<{ testimonies: Array<{ status: string }> }>();
    expect(json.testimonies.every((t) => t.status === 'approved')).toBe(true);
  });

  it('supports fulfilled=false filter (not approved/archived)', async () => {
    await seedTestimony({ program: 'mens', status: 'not_received' });
    await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    await seedTestimony({ program: 'mens', status: 'approved' });
    await seedTestimony({ program: 'mens', status: 'archived' });
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies?program=mens&fulfilled=false`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: cookie } }), testEnv);
    const json = await res.json<{ testimonies: Array<{ status: string }> }>();
    const statuses = json.testimonies.map((t) => t.status);
    expect(statuses).not.toContain('approved');
    expect(statuses).not.toContain('archived');
  });

  it('supports assigned=unassigned filter', async () => {
    await seedTestimony({ program: null, status: 'draft_1_review' }); // unassigned
    await seedTestimony({ program: 'mens', status: 'draft_1_review' }); // assigned
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies?program=mens&assigned=unassigned`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: cookie } }), testEnv);
    const json = await res.json<{ testimonies: Array<{ program: string | null }> }>();
    expect(json.testimonies.every((t) => t.program === null)).toBe(true);
  });

  it('includes attachment count and comment count', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    const now = nowIso();
    await testEnv.DB.prepare(
      `INSERT INTO testimony_attachments (testimony_id, filename, created_at) VALUES (?, 'file.pdf', ?)`
    ).bind(tid, now).run();
    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', '/api/admin/testimonies', cookie, 'mens'), testEnv);
    const json = await res.json<{ testimonies: Array<{ attachment_count: number; comment_count: number }> }>();
    const found = json.testimonies.find((t: any) => t.id === tid);
    expect(found?.attachment_count).toBe(1);
    expect(found?.comment_count).toBe(0);
  });

  it('includes title in list results', async () => {
    await seedTestimony({ program: 'mens', status: 'not_received', title: 'Saturday night testimony' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', '/api/admin/testimonies', cookie, 'mens'), testEnv);
    const json = await res.json<{ testimonies: Array<{ title: string | null }> }>();
    const found = json.testimonies.find((t: any) => t.title === 'Saturday night testimony');
    expect(found).toBeDefined();
  });

  it('returns items in status display order (not_received -> draft_1_awaiting -> draft_1_review -> ... -> approved -> archived)', async () => {
    await seedTestimony({ program: 'mens', status: 'approved' });
    await seedTestimony({ program: 'mens', status: 'draft_2_review' });
    await seedTestimony({ program: 'mens', status: 'not_received' });
    await seedTestimony({ program: 'mens', status: 'draft_1_awaiting' });
    await seedTestimony({ program: 'mens', status: 'draft_2_awaiting' });
    await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    await seedTestimony({ program: 'mens', status: 'draft_3_awaiting' });
    await seedTestimony({ program: 'mens', status: 'draft_3_review' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', '/api/admin/testimonies', cookie, 'mens'), testEnv);
    const json = await res.json<{ testimonies: Array<{ status: string }> }>();
    const statuses = json.testimonies.map((t) => t.status);
    const ORDER = [
      'not_received',
      'draft_1_awaiting', 'draft_1_review',
      'draft_2_awaiting', 'draft_2_review',
      'draft_3_awaiting', 'draft_3_review',
      'approved', 'archived',
    ];
    const sorted = [...statuses].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    expect(statuses).toEqual(sorted);
  });
});

describe('POST /api/admin/testimonies (create needed item)', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('creates a new not_received testimony item for a person', async () => {
    const personId = await seedPerson({ program: 'mens', firstName: 'Alex', lastName: 'Smith' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('POST', '/api/admin/testimonies', cookie, 'mens', {
        type: 'testimony',
        person_id: personId,
        title: 'Sunday closing testimony',
      }),
      testEnv
    );
    expect(res.status).toBe(201);
    const json = await res.json<{ ok: boolean; testimony: { type: string; status: string; person_id: number; title: string | null } }>();
    expect(json.ok).toBe(true);
    expect(json.testimony.type).toBe('testimony');
    expect(json.testimony.status).toBe('not_received');
    expect(json.testimony.person_id).toBe(personId);
    expect(json.testimony.title).toBe('Sunday closing testimony');
  });

  it('creates a teaching item without a person assigned', async () => {
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('POST', '/api/admin/testimonies', cookie, 'mens', {
        type: 'teaching',
        title: 'Opening teaching',
      }),
      testEnv
    );
    expect(res.status).toBe(201);
    const json = await res.json<{ ok: boolean; testimony: { type: string; status: string; person_id: null } }>();
    expect(json.ok).toBe(true);
    expect(json.testimony.type).toBe('teaching');
    expect(json.testimony.status).toBe('not_received');
  });

  it('returns 404 when person_id does not exist', async () => {
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('POST', '/api/admin/testimonies', cookie, 'mens', {
        type: 'testimony',
        person_id: 99999,
      }),
      testEnv
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid type', async () => {
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('POST', '/api/admin/testimonies', cookie, 'mens', {
        type: 'sermon',
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it('sets program from assigned person', async () => {
    const personId = await seedPerson({ program: 'women' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('POST', '/api/admin/testimonies', cookie, 'womens', {
        type: 'testimony',
        person_id: personId,
      }),
      testEnv
    );
    const json = await res.json<{ ok: boolean; testimony: { program: string } }>();
    expect(json.testimony.program).toBe('women');
  });
});

describe('GET /api/admin/testimonies/new-count', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('returns program_new and unassigned_new counts (needs-attention items)', async () => {
    await seedTestimony({ program: 'mens', status: 'not_received' });
    await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    await seedTestimony({ program: 'mens', status: 'approved' }); // not needing attention
    await seedTestimony({ program: null, status: 'draft_1_review' }); // unassigned
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies/new-count?program=mens`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: cookie } }), testEnv);
    expect(res.status).toBe(200);
    const json = await res.json<{ ok: boolean; program_new: number; unassigned_new: number }>();
    expect(json.ok).toBe(true);
    expect(json.program_new).toBe(2);
    expect(json.unassigned_new).toBe(1);
  });

  it('counts all 7 non-approved non-archived statuses as needs attention', async () => {
    for (const s of [
      'not_received',
      'draft_1_awaiting', 'draft_1_review',
      'draft_2_awaiting', 'draft_2_review',
      'draft_3_awaiting', 'draft_3_review',
    ] as BoardStatus[]) {
      await seedTestimony({ program: 'mens', status: s });
    }
    await seedTestimony({ program: 'mens', status: 'approved' });
    await seedTestimony({ program: 'mens', status: 'archived' });
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies/new-count?program=mens`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: cookie } }), testEnv);
    const json = await res.json<{ ok: boolean; program_new: number }>();
    expect(json.program_new).toBe(7);
  });
});

describe('GET /api/admin/testimonies/:id/view', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('returns HTML page for a testimony with body content', async () => {
    const personId = await seedPerson({ program: 'mens', firstName: 'John', lastName: 'Doe' });
    const now = nowIso();
    const db = (env as unknown as { DB: D1Database }).DB;
    const { meta } = await db.prepare(
      `INSERT INTO testimonies (type, person_id, program, title, from_email, from_name, subject,
       body_text, body_html, match_confidence, status, received_at, created_at)
       VALUES ('testimony', ?, 'mens', 'Sunday Night', 'john@test.com', 'John Doe', 'My testimony',
       'God moved.', '<p>God moved.</p>', 'email', 'draft_1_review', ?, ?)`
    ).bind(personId, now, now).run();
    const tid = meta.last_row_id as number;

    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', `/api/admin/testimonies/${tid}/view`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('John Doe');
    expect(html).toContain('God moved.');
    expect(html).toContain('Sunday Night');
  });

  it('returns HTML page with attachment links', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    const now = nowIso();
    await testEnv.DB.prepare(
      `INSERT INTO testimony_attachments (testimony_id, filename, content_type, r2_key, link_url, created_at)
       VALUES (?, 'testimony.pdf', 'application/pdf', NULL, 'https://docs.google.com/d/abc', ?)`
    ).bind(tid, now).run();

    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', `/api/admin/testimonies/${tid}/view`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('https://docs.google.com/d/abc');
  });

  it('shows awaiting message when no content yet', async () => {
    const now = nowIso();
    const { meta } = await testEnv.DB.prepare(
      `INSERT INTO testimonies (type, program, from_email, from_name, subject,
       body_text, body_html, match_confidence, status, created_at)
       VALUES ('testimony', 'mens', '', 'Empty Person', NULL, NULL, NULL, NULL, 'not_received', ?)`
    ).bind(now).run();
    const tid = meta.last_row_id as number;

    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', `/api/admin/testimonies/${tid}/view`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('awaiting');
  });

  it('returns 404 for wrong program', async () => {
    const tid = await seedTestimony({ program: 'women', status: 'draft_1_review' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', `/api/admin/testimonies/${tid}/view`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/testimonies/:id', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('returns full record with attachments and comments', async () => {
    const personId = await seedPerson({ program: 'mens', firstName: 'John', lastName: 'Doe' });
    const tid = await seedTestimony({ program: 'mens', person_id: personId, status: 'draft_1_review' });
    const now = nowIso();
    await testEnv.DB.prepare(
      `INSERT INTO testimony_attachments (testimony_id, filename, link_url, created_at) VALUES (?, 'doc.pdf', 'https://docs.google.com/d/abc', ?)`
    ).bind(tid, now).run();
    const admin = await testEnv.DB.prepare(`SELECT id FROM admin_users LIMIT 1`).first<{ id: number }>();
    await testEnv.DB.prepare(
      `INSERT INTO testimony_comments (testimony_id, admin_user_id, body, created_at) VALUES (?, ?, 'Great testimony!', ?)`
    ).bind(tid, admin!.id, now).run();

    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', `/api/admin/testimonies/${tid}`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const json = await res.json<{
      ok: boolean;
      testimony: { id: number; subject: string };
      attachments: Array<{ link_url: string }>;
      comments: Array<{ body: string }>;
      person: { first_name: string } | null;
    }>();
    expect(json.ok).toBe(true);
    expect(json.testimony.id).toBe(tid);
    expect(json.attachments).toHaveLength(1);
    expect(json.attachments[0].link_url).toBe('https://docs.google.com/d/abc');
    expect(json.comments).toHaveLength(1);
    expect(json.comments[0].body).toBe('Great testimony!');
    expect(json.person?.first_name).toBe('John');
  });

  it('returns 404 for a testimony of the wrong program', async () => {
    const tid = await seedTestimony({ program: 'women', status: 'not_received' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', `/api/admin/testimonies/${tid}`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(404);
  });

  it('returns unassigned testimony to any program admin', async () => {
    const tid = await seedTestimony({ program: null, status: 'draft_1_review' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', `/api/admin/testimonies/${tid}`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/testimonies/:id/comment', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('adds a comment to a testimony', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('POST', `/api/admin/testimonies/${tid}/comment`, cookie, 'mens', { body: 'Wonderful sharing!' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const json = await res.json<{ ok: boolean; comment: { id: number; body: string } }>();
    expect(json.ok).toBe(true);
    expect(json.comment.body).toBe('Wonderful sharing!');
    const dbComment = await testEnv.DB.prepare(
      `SELECT body FROM testimony_comments WHERE testimony_id = ?`
    ).bind(tid).first<{ body: string }>();
    expect(dbComment?.body).toBe('Wonderful sharing!');
  });

  it('returns 400 when body is missing', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('POST', `/api/admin/testimonies/${tid}/comment`, cookie, 'mens', { body: '' }),
      testEnv
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/testimonies/:id/reply', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('writes email_log row and sets status=awaiting_draft_2 when EMAIL_ENABLED=false', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'draft_1_review', from_email: 'sender@test.com' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('POST', `/api/admin/testimonies/${tid}/reply`, cookie, 'mens', {
        subject: 'Re: Your testimony',
        body_html: '<p>Thank you!</p>',
        body_text: 'Thank you!',
      }),
      { ...testEnv, EMAIL_ENABLED: 'false' }
    );
    expect(res.status).toBe(200);
    const json = await res.json<{ ok: boolean }>();
    expect(json.ok).toBe(true);

    // Status moves to draft_2_awaiting after replying to draft_1_review
    const testimony = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ status: string }>();
    expect(testimony?.status).toBe('draft_2_awaiting');

    const logRow = await testEnv.DB.prepare(
      `SELECT to_email, subject FROM email_log WHERE to_email = ? ORDER BY id DESC LIMIT 1`
    ).bind('sender@test.com').first<{ to_email: string; subject: string }>();
    expect(logRow?.to_email).toBe('sender@test.com');
    expect(logRow?.subject).toBe('Re: Your testimony');
  });
});

describe('PATCH /api/admin/testimonies/:id', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('updates status to draft_1_awaiting', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'not_received' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'draft_1_awaiting' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ status: string }>();
    expect(row?.status).toBe('draft_1_awaiting');
  });

  it('updates status to draft_1_review', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'not_received' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'draft_1_review' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ status: string }>();
    expect(row?.status).toBe('draft_1_review');
  });

  it('updates status to draft_2_awaiting', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'draft_2_awaiting' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ status: string }>();
    expect(row?.status).toBe('draft_2_awaiting');
  });

  it('updates status to draft_3_awaiting', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'draft_2_review' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'draft_3_awaiting' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ status: string }>();
    expect(row?.status).toBe('draft_3_awaiting');
  });

  it('updates status to draft_3_review', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'draft_3_awaiting' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'draft_3_review' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ status: string }>();
    expect(row?.status).toBe('draft_3_review');
  });

  it('updates status to draft_2_review', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'draft_2_awaiting' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'draft_2_review' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ status: string }>();
    expect(row?.status).toBe('draft_2_review');
  });

  it('updates status to approved (marks fulfilled)', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'draft_1_review' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'approved' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ status: string }>();
    expect(row?.status).toBe('approved');
  });

  it('rejects old status values (in_progress)', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'not_received' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'in_progress' }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it('rejects old status values (awaiting_next)', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'not_received' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'awaiting_next' }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it('rejects old status values (unfulfilled)', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'not_received' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'unfulfilled' }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it('rejects unknown status', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'not_received' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'new' }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it('updates type', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'not_received' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { type: 'teaching' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT type FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ type: string }>();
    expect(row?.type).toBe('teaching');
  });

  it('updates title', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'not_received' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { title: 'Opening night testimony' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT title FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ title: string }>();
    expect(row?.title).toBe('Opening night testimony');
  });

  it('reassigns to a different person and updates program', async () => {
    const womensPersonId = await seedPerson({ program: 'women', firstName: 'Jane', lastName: 'Doe' });
    const tid = await seedTestimony({ program: null, status: 'not_received' }); // unassigned
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'women', { person_id: womensPersonId }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT person_id, program FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ person_id: number; program: string }>();
    expect(row?.person_id).toBe(womensPersonId);
    expect(row?.program).toBe('women');
  });

  it('unassigns when person_id=null', async () => {
    const personId = await seedPerson({ program: 'mens' });
    const tid = await seedTestimony({ program: 'mens', person_id: personId, status: 'not_received' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { person_id: null }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT person_id, program FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ person_id: null; program: null }>();
    expect(row?.person_id).toBeNull();
    expect(row?.program).toBeNull();
  });

  it('denies mens admin from patching a women-program testimony', async () => {
    const tid = await seedTestimony({ program: 'women', status: 'not_received' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'draft_1_review' }),
      testEnv
    );
    expect(res.status).toBe(404);
  });
});

describe('ingest: auto-advance rules', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
  });

  it('draft_2_awaiting + email -> draft_2_review', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'awaiting2b@example.com', firstName: 'Wait2', lastName: 'Person' });
    const neededId = await seedTestimony({
      person_id: personId,
      program: 'mens',
      status: 'draft_2_awaiting',
      type: 'testimony',
    });

    const result = await storeTestimony(testEnv, {
      from_email: 'awaiting2b@example.com',
      from_name: 'Wait2 Person',
      body_text: 'My next draft is here.',
    });

    expect(result.attached_to_existing).toBe(true);
    expect(result.testimony_id).toBe(neededId);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(neededId).first<{ status: string }>();
    expect(row?.status).toBe('draft_2_review');
  });

  it('draft_3_awaiting + email -> draft_3_review', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'awaiting3@example.com', firstName: 'Wait3', lastName: 'Person' });
    const neededId = await seedTestimony({
      person_id: personId,
      program: 'mens',
      status: 'draft_3_awaiting',
      type: 'testimony',
    });

    const result = await storeTestimony(testEnv, {
      from_email: 'awaiting3@example.com',
      from_name: 'Wait3 Person',
      body_text: 'My third draft is here.',
    });

    expect(result.attached_to_existing).toBe(true);
    expect(result.testimony_id).toBe(neededId);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(neededId).first<{ status: string }>();
    expect(row?.status).toBe('draft_3_review');
  });

  it('draft_2_review + email (re-send) -> stays draft_2_review (never backwards)', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'resend2@example.com', firstName: 'Resend2', lastName: 'Person' });
    const neededId = await seedTestimony({
      person_id: personId,
      program: 'mens',
      status: 'draft_2_review',
      type: 'testimony',
    });

    const result = await storeTestimony(testEnv, {
      from_email: 'resend2@example.com',
      from_name: 'Resend2 Person',
      body_text: 'Revised draft 2.',
    });

    expect(result.attached_to_existing).toBe(true);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(neededId).first<{ status: string }>();
    expect(row?.status).toBe('draft_2_review');
  });

  it('draft_3_review + email (re-send) -> stays draft_3_review (never backwards)', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'resend3@example.com', firstName: 'Resend3', lastName: 'Person' });
    const neededId = await seedTestimony({
      person_id: personId,
      program: 'mens',
      status: 'draft_3_review',
      type: 'testimony',
    });

    const result = await storeTestimony(testEnv, {
      from_email: 'resend3@example.com',
      from_name: 'Resend3 Person',
      body_text: 'Revised draft 3.',
    });

    expect(result.attached_to_existing).toBe(true);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(neededId).first<{ status: string }>();
    expect(row?.status).toBe('draft_3_review');
  });

  it('does not attach to approved or archived items', async () => {
    const personId = await seedPerson({ program: 'mens', email: 'fullfilled@example.com', firstName: 'Full', lastName: 'Filled' });
    await seedTestimony({ person_id: personId, program: 'mens', status: 'approved', type: 'testimony' });

    const result = await storeTestimony(testEnv, {
      from_email: 'fullfilled@example.com',
      from_name: 'Full Filled',
      body_text: 'An extra submission',
    });

    expect(result.attached_to_existing).toBe(false);
    const count = await testEnv.DB.prepare(
      `SELECT COUNT(*) AS n FROM testimonies WHERE person_id = ?`
    ).bind(personId).first<{ n: number }>();
    expect(count?.n).toBe(2);
  });
});
