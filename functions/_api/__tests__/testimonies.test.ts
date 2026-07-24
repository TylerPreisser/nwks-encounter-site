// functions/_api/__tests__/testimonies.test.ts
// TDD integration tests for Testimonies & Teachings backend

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

async function seedTestimony(opts: {
  program?: string | null;
  person_id?: number | null;
  status?: string;
  type?: string;
  from_email?: string;
  from_name?: string;
}): Promise<number> {
  const now = nowIso();
  const db = (env as unknown as { DB: D1Database }).DB;
  const { meta } = await db
    .prepare(
      `INSERT INTO testimonies
         (type, person_id, program, from_email, from_name, subject, body_text,
          match_confidence, status, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'Test Subject', 'Test body', 'email', ?, ?, ?)`
    )
    .bind(
      opts.type ?? 'testimony',
      opts.person_id ?? null,
      opts.program ?? null,
      opts.from_email ?? 'sender@example.com',
      opts.from_name ?? 'Sender Name',
      opts.status ?? 'new',
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
    // fromName has no email match; match by last name
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
    // Seed another with same last name but different email
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

  it('stores a matched testimony with person_id and program', async () => {
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
    const row = await testEnv.DB.prepare(`SELECT * FROM testimonies WHERE id = ?`)
      .bind(result.testimony_id).first<{ person_id: number; program: string; status: string; match_confidence: string }>();
    expect(row?.person_id).toBe(personId);
    expect(row?.program).toBe('mens');
    expect(row?.status).toBe('new');
    expect(row?.match_confidence).toBe('email');
  });

  it('stores an unmatched testimony with null person_id and program', async () => {
    const result = await storeTestimony(testEnv, {
      from_email: 'unknown@ghost.com',
      from_name: 'Ghost Sender',
      subject: 'No match',
      body_text: 'Plain body',
    });
    expect(result.matched).toBe(false);
    const row = await testEnv.DB.prepare(`SELECT * FROM testimonies WHERE id = ?`)
      .bind(result.testimony_id).first<{ person_id: null; program: null; match_confidence: string; status: string }>();
    expect(row?.person_id).toBeNull();
    expect(row?.program).toBeNull();
    expect(row?.match_confidence).toBe('none');
    expect(row?.status).toBe('new');
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
});

describe('GET /api/admin/testimonies', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('lists testimonies for the active program', async () => {
    const personId = await seedPerson({ program: 'mens' });
    await seedTestimony({ program: 'mens', person_id: personId, status: 'new' });
    await seedTestimony({ program: 'women', status: 'new' }); // should not appear
    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', '/api/admin/testimonies', cookie, 'mens'), testEnv);
    expect(res.status).toBe(200);
    const json = await res.json<{ ok: boolean; testimonies: unknown[] }>();
    expect(json.ok).toBe(true);
    // Only mens + unassigned visible to mens admin
    const programs = (json.testimonies as Array<{ program: string | null }>).map((t) => t.program);
    expect(programs.every((p) => p === 'mens' || p === null)).toBe(true);
  });

  it('supports status filter', async () => {
    await seedTestimony({ program: 'mens', status: 'new' });
    await seedTestimony({ program: 'mens', status: 'read' });
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies?program=mens&status=read`;
    const res = await app.fetch(new Request(url, {
      headers: { Cookie: cookie },
    }), testEnv);
    const json = await res.json<{ testimonies: Array<{ status: string }> }>();
    expect(json.testimonies.every((t) => t.status === 'read')).toBe(true);
  });

  it('supports assigned=unassigned filter', async () => {
    await seedTestimony({ program: null, status: 'new' }); // unassigned
    await seedTestimony({ program: 'mens', status: 'new' }); // assigned
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies?program=mens&assigned=unassigned`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: cookie } }), testEnv);
    const json = await res.json<{ testimonies: Array<{ program: string | null }> }>();
    expect(json.testimonies.every((t) => t.program === null)).toBe(true);
  });

  it('includes attachment count and comment count', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'new' });
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
});

describe('GET /api/admin/testimonies/new-count', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('returns program_new and unassigned_new counts', async () => {
    await seedTestimony({ program: 'mens', status: 'new' });
    await seedTestimony({ program: 'mens', status: 'new' });
    await seedTestimony({ program: 'mens', status: 'read' }); // not new
    await seedTestimony({ program: null, status: 'new' }); // unassigned
    const cookie = await getAuthCookie();
    const url = `http://localhost/api/admin/testimonies/new-count?program=mens`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: cookie } }), testEnv);
    expect(res.status).toBe(200);
    const json = await res.json<{ ok: boolean; program_new: number; unassigned_new: number }>();
    expect(json.ok).toBe(true);
    expect(json.program_new).toBe(2);
    expect(json.unassigned_new).toBe(1);
  });
});

describe('GET /api/admin/testimonies/:id', () => {
  beforeEach(async () => {
    await applyMigrations(env as unknown as { DB: D1Database });
    await seedAdmin();
  });

  it('returns full record with attachments and comments', async () => {
    const personId = await seedPerson({ program: 'mens', firstName: 'John', lastName: 'Doe' });
    const tid = await seedTestimony({ program: 'mens', person_id: personId, status: 'new' });
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
    const tid = await seedTestimony({ program: 'women', status: 'new' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(makeReq('GET', `/api/admin/testimonies/${tid}`, cookie, 'mens'), testEnv);
    expect(res.status).toBe(404);
  });

  it('returns unassigned testimony to any program admin', async () => {
    const tid = await seedTestimony({ program: null, status: 'new' });
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
    const tid = await seedTestimony({ program: 'mens', status: 'new' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('POST', `/api/admin/testimonies/${tid}/comment`, cookie, 'mens', { body: 'Wonderful sharing!' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const json = await res.json<{ ok: boolean; comment: { id: number; body: string } }>();
    expect(json.ok).toBe(true);
    expect(json.comment.body).toBe('Wonderful sharing!');
    // Verify in DB
    const dbComment = await testEnv.DB.prepare(
      `SELECT body FROM testimony_comments WHERE testimony_id = ?`
    ).bind(tid).first<{ body: string }>();
    expect(dbComment?.body).toBe('Wonderful sharing!');
  });

  it('returns 400 when body is missing', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'new' });
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

  it('writes email_log row and sets status=replied when EMAIL_ENABLED=false', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'new', from_email: 'sender@test.com' });
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

    // Testimony status set to replied
    const testimony = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ status: string }>();
    expect(testimony?.status).toBe('replied');

    // Email log row written
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

  it('updates status', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'new' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'read' }),
      testEnv
    );
    expect(res.status).toBe(200);
    const row = await testEnv.DB.prepare(`SELECT status FROM testimonies WHERE id = ?`)
      .bind(tid).first<{ status: string }>();
    expect(row?.status).toBe('read');
  });

  it('updates type', async () => {
    const tid = await seedTestimony({ program: 'mens', status: 'new' });
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

  it('reassigns to a different person and updates program', async () => {
    const womensPersonId = await seedPerson({ program: 'women', firstName: 'Jane', lastName: 'Doe' });
    const tid = await seedTestimony({ program: null, status: 'new' }); // unassigned
    // Women's admin reassigns to women's person
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
    const tid = await seedTestimony({ program: 'mens', person_id: personId, status: 'new' });
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
    const tid = await seedTestimony({ program: 'women', status: 'new' });
    const cookie = await getAuthCookie();
    const res = await app.fetch(
      makeReq('PATCH', `/api/admin/testimonies/${tid}`, cookie, 'mens', { status: 'read' }),
      testEnv
    );
    expect(res.status).toBe(404);
  });
});
