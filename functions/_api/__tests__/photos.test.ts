// functions/_api/__tests__/photos.test.ts
// TDD integration tests for admin Photo API (P6 Task 1) and public gallery API.
// Note: isolatedStorage is disabled in vitest.config.ts to work around a miniflare
// R2/SQLite WAL cleanup bug. Tests use targeted cleanup (DELETE FROM) instead of
// applyMigrations to reset relevant state between runs.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 1×1 transparent PNG (base64-encoded). */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function tinyPngBytes(): Uint8Array {
  return Uint8Array.from(atob(TINY_PNG_B64), (c) => c.charCodeAt(0));
}

/** Login with seeded admin and return a Cookie header value. */
async function getAuthCookie(): Promise<string> {
  const loginRes = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@nwksencounter.com', password: 'TestPass1!' }),
    }),
    testEnv,
  );
  const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
  const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

/** Build a multipart FormData for upload tests. */
function makePhotoForm(overrides: Record<string, string | Blob> = {}): FormData {
  const fd = new FormData();
  fd.append('file', new Blob([tinyPngBytes()], { type: 'image/png' }), 'test.png');
  fd.append('year', '2026');
  fd.append('caption', 'Test photo');
  for (const [k, v] of Object.entries(overrides)) {
    if (v instanceof Blob) {
      fd.set(k, v, 'override.bin');
    } else {
      fd.set(k, v);
    }
  }
  return fd;
}

/** POST a photo upload and return the Response. */
async function uploadPhoto(
  cookie: string,
  program: string,
  overrides: Record<string, string | Blob> = {},
): Promise<Response> {
  const fd = makePhotoForm(overrides);
  return app.fetch(
    new Request(`http://localhost/api/admin/photos?program=${program}`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: fd,
    }),
    testEnv,
  );
}

/** Clear photos table between tests. */
async function clearPhotos(): Promise<void> {
  await testEnv.DB.exec('DELETE FROM photos');
}

// ---------------------------------------------------------------------------
// One-time setup: migrations run once for the shared (isolatedStorage=false)
// worker instance. Admin user seeded once; cookie refreshed each beforeEach.
// ---------------------------------------------------------------------------

let cookie: string;

beforeAll(async () => {
  await applyMigrations(env as any);
  await seedAdmin();
  cookie = await getAuthCookie();
});

// ---------------------------------------------------------------------------
// Admin Photo API
// ---------------------------------------------------------------------------

describe('Admin Photo API', () => {
  beforeEach(async () => {
    await clearPhotos();
    // Refresh auth cookie (KV sessions persist so this is mostly a no-op re-login)
    cookie = await getAuthCookie();
  });

  // ── POST /api/admin/photos ──────────────────────────────────────────────
  describe('POST /api/admin/photos', () => {
    it('uploads a valid PNG and returns photo row with namespaced R2 key', async () => {
      const res = await uploadPhoto(cookie, 'mens');
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean; photo: { id: number; r2_key: string; width: number; height: number; program: string; year: number; content_type: string } }>();
      expect(body.ok).toBe(true);
      expect(body.photo.r2_key).toMatch(/^photos\/mens\/2026\/.+\.png$/);
      expect(body.photo.program).toBe('mens');
      expect(body.photo.year).toBe(2026);
      expect(body.photo.content_type).toBe('image/png');
      // PNG dimensions should be parsed (1×1)
      expect(body.photo.width).toBeGreaterThan(0);
      expect(body.photo.height).toBeGreaterThan(0);

      // Verify R2 object exists by streaming through the public endpoint
      const photoId = body.photo.id;
      const streamRes = await app.fetch(
        new Request(`http://localhost/api/public/photo/${photoId}`),
        testEnv,
      );
      expect(streamRes.status).toBe(200);
      expect(streamRes.headers.get('Content-Type')).toMatch(/^image\/png/);
    });

    it('inserts a row in the photos D1 table', async () => {
      await uploadPhoto(cookie, 'mens');
      const row = await testEnv.DB.prepare('SELECT COUNT(*) AS cnt FROM photos WHERE program=?').bind('mens').first<{ cnt: number }>();
      expect(row?.cnt).toBe(1);
    });

    it('rejects a non-image content-type (text/plain) with 400', async () => {
      const res = await uploadPhoto(cookie, 'mens', {
        file: new Blob(['not an image'], { type: 'text/plain' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json<{ ok: boolean; error: string }>();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/image/i);
    });

    it('rejects a file exceeding 10 MB with 400', async () => {
      const res = await uploadPhoto(cookie, 'mens', {
        file: new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'image/png' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json<{ ok: boolean; error: string }>();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/size|large/i);
    });

    it('returns 401 without a session cookie', async () => {
      const fd = makePhotoForm();
      const res = await app.fetch(
        new Request('http://localhost/api/admin/photos?program=mens', {
          method: 'POST',
          body: fd,
        }),
        testEnv,
      );
      expect(res.status).toBe(401);
    });

    it('returns 400 for missing year field', async () => {
      const fd = makePhotoForm();
      fd.delete('year');
      const res = await app.fetch(
        new Request('http://localhost/api/admin/photos?program=mens', {
          method: 'POST',
          headers: { Cookie: cookie },
          body: fd,
        }),
        testEnv,
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 when program param is absent', async () => {
      const fd = makePhotoForm();
      const res = await app.fetch(
        new Request('http://localhost/api/admin/photos', {
          method: 'POST',
          headers: { Cookie: cookie },
          body: fd,
        }),
        testEnv,
      );
      expect(res.status).toBe(400);
    });

    it('accepts image/jpeg content-type and keys with .jpg extension', async () => {
      const res = await uploadPhoto(cookie, 'women', {
        file: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean; photo: { r2_key: string; content_type: string } }>();
      expect(body.photo.r2_key).toMatch(/^photos\/women\/2026\/.+\.jpg$/);
      expect(body.photo.content_type).toBe('image/jpeg');
    });
  });

  // ── GET /api/admin/photos ───────────────────────────────────────────────
  describe('GET /api/admin/photos', () => {
    it('returns empty list when no photos exist for the year', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/admin/photos?program=mens&year=2025', {
          headers: { Cookie: cookie },
        }),
        testEnv,
      );
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean; photos: unknown[] }>();
      expect(body.ok).toBe(true);
      expect(body.photos).toHaveLength(0);
    });

    it('returns only the requested program photos for a year', async () => {
      // Seed photos for both programs
      await testEnv.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES (?, 2026, ?, ?, 0, 100, 100, 'image/png', datetime('now'))`
      ).bind('mens', 'photos/mens/2026/aaa.png', 'Men photo').run();
      await testEnv.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES (?, 2026, ?, ?, 0, 100, 100, 'image/png', datetime('now'))`
      ).bind('women', 'photos/women/2026/bbb.png', 'Women photo').run();

      const res = await app.fetch(
        new Request('http://localhost/api/admin/photos?program=mens&year=2026', {
          headers: { Cookie: cookie },
        }),
        testEnv,
      );
      const body = await res.json<{ ok: boolean; photos: { program: string }[] }>();
      expect(body.photos).toHaveLength(1);
      expect(body.photos[0].program).toBe('mens');
    });

    it('returns photos ordered by sort ASC then id ASC', async () => {
      await testEnv.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES ('mens', 2026, 'photos/mens/2026/z.png', 'Z', 5, 1, 1, 'image/png', datetime('now')),
                ('mens', 2026, 'photos/mens/2026/a.png', 'A', 0, 1, 1, 'image/png', datetime('now')),
                ('mens', 2026, 'photos/mens/2026/m.png', 'M', 2, 1, 1, 'image/png', datetime('now'))`
      ).run();

      const res = await app.fetch(
        new Request('http://localhost/api/admin/photos?program=mens&year=2026', {
          headers: { Cookie: cookie },
        }),
        testEnv,
      );
      const body = await res.json<{ ok: boolean; photos: { caption: string }[] }>();
      expect(body.photos.map((p) => p.caption)).toEqual(['A', 'M', 'Z']);
    });

    it('returns 401 without session', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/admin/photos?program=mens&year=2026'),
        testEnv,
      );
      expect(res.status).toBe(401);
    });
  });

  // ── PATCH /api/admin/photos/:id ─────────────────────────────────────────
  describe('PATCH /api/admin/photos/:id', () => {
    it('updates caption and sort, returns updated photo', async () => {
      const { meta } = await testEnv.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES ('mens', 2026, 'photos/mens/2026/x.png', 'Old caption', 0, 100, 100, 'image/png', datetime('now'))`
      ).run();
      const id = meta.last_row_id;

      const res = await app.fetch(
        new Request(`http://localhost/api/admin/photos/${id}?program=mens`, {
          method: 'PATCH',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ caption: 'New caption', sort: 5 }),
        }),
        testEnv,
      );
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean; photo: { caption: string; sort: number } }>();
      expect(body.ok).toBe(true);
      expect(body.photo.caption).toBe('New caption');
      expect(body.photo.sort).toBe(5);
    });

    it('returns 404 for a photo belonging to another program (program isolation)', async () => {
      const { meta } = await testEnv.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES ('women', 2026, 'photos/women/2026/y.png', 'Women', 0, 100, 100, 'image/png', datetime('now'))`
      ).run();
      const id = meta.last_row_id;

      const res = await app.fetch(
        new Request(`http://localhost/api/admin/photos/${id}?program=mens`, {
          method: 'PATCH',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ caption: 'Hacked' }),
        }),
        testEnv,
      );
      expect(res.status).toBe(404);
    });

    it('returns 401 without session', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/admin/photos/1?program=mens', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caption: 'x' }),
        }),
        testEnv,
      );
      expect(res.status).toBe(401);
    });
  });

  // ── DELETE /api/admin/photos/:id ────────────────────────────────────────
  describe('DELETE /api/admin/photos/:id', () => {
    it('removes the D1 row and the R2 object', async () => {
      // Upload a photo through the API so both R2 + D1 are seeded properly
      const uploadRes = await uploadPhoto(cookie, 'mens');
      expect(uploadRes.status).toBe(200);
      const uploaded = await uploadRes.json<{ ok: boolean; photo: { id: number } }>();
      const id = uploaded.photo.id;

      // Confirm streamable before deletion
      const beforeStream = await app.fetch(
        new Request(`http://localhost/api/public/photo/${id}`),
        testEnv,
      );
      expect(beforeStream.status).toBe(200);

      // Delete it
      const res = await app.fetch(
        new Request(`http://localhost/api/admin/photos/${id}?program=mens`, {
          method: 'DELETE',
          headers: { Cookie: cookie },
        }),
        testEnv,
      );
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean }>();
      expect(body.ok).toBe(true);

      // D1 row gone — verify via photo list
      const listRes = await app.fetch(
        new Request('http://localhost/api/admin/photos?program=mens&year=2026', {
          headers: { Cookie: cookie },
        }),
        testEnv,
      );
      const listBody = await listRes.json<{ ok: boolean; photos: unknown[] }>();
      expect(listBody.photos).toHaveLength(0);

      // R2 object deleted — streaming the id returns 404
      const afterStream = await app.fetch(
        new Request(`http://localhost/api/public/photo/${id}`),
        testEnv,
      );
      expect(afterStream.status).toBe(404);
    });

    it('returns 404 for a photo belonging to another program (isolation)', async () => {
      const { meta } = await testEnv.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES ('women', 2026, 'photos/women/2026/nd.png', 'Women', 0, 100, 100, 'image/png', datetime('now'))`
      ).run();
      const id = meta.last_row_id;

      const res = await app.fetch(
        new Request(`http://localhost/api/admin/photos/${id}?program=mens`, {
          method: 'DELETE',
          headers: { Cookie: cookie },
        }),
        testEnv,
      );
      expect(res.status).toBe(404);
    });

    it('returns 401 without session', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/admin/photos/1?program=mens', {
          method: 'DELETE',
        }),
        testEnv,
      );
      expect(res.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// Public Gallery API
// ---------------------------------------------------------------------------

describe('Public Photo API', () => {
  beforeEach(async () => {
    await clearPhotos();
  });

  // ── GET /api/public/gallery/years ───────────────────────────────────────
  describe('GET /api/public/gallery/years', () => {
    it('returns distinct years in descending order for the program', async () => {
      for (const [prog, year] of [['mens', 2024], ['mens', 2025], ['mens', 2026], ['women', 2026]]) {
        await testEnv.DB.prepare(
          `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
           VALUES (?, ?, ?, '', 0, 1, 1, 'image/png', datetime('now'))`
        ).bind(prog, year, `photos/${prog}/${year}/z.png`).run();
      }

      const res = await app.fetch(
        new Request('http://localhost/api/public/gallery/years?program=mens'),
        testEnv,
      );
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean; years: number[] }>();
      expect(body.ok).toBe(true);
      expect(body.years).toEqual([2026, 2025, 2024]);
    });

    it('returns empty array when no photos exist', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/public/gallery/years?program=mens'),
        testEnv,
      );
      const body = await res.json<{ ok: boolean; years: number[] }>();
      expect(body.ok).toBe(true);
      expect(body.years).toHaveLength(0);
    });

    it('returns 400 when program is missing', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/public/gallery/years'),
        testEnv,
      );
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/public/gallery ─────────────────────────────────────────────
  describe('GET /api/public/gallery', () => {
    it('returns photo objects with url and metadata, ordered by sort ASC', async () => {
      await testEnv.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES ('mens', 2026, 'photos/mens/2026/a.png', 'A', 1, 800, 600, 'image/png', datetime('now')),
                ('mens', 2026, 'photos/mens/2026/b.png', 'B', 0, 400, 300, 'image/jpeg', datetime('now'))`
      ).run();

      const res = await app.fetch(
        new Request('http://localhost/api/public/gallery?program=mens&year=2026'),
        testEnv,
      );
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean; photos: { caption: string; url: string; width: number; height: number }[] }>();
      expect(body.ok).toBe(true);
      expect(body.photos).toHaveLength(2);
      // sort=0 comes first
      expect(body.photos[0].caption).toBe('B');
      expect(body.photos[0].url).toMatch(/^\/api\/public\/photo\/\d+$/);
      expect(body.photos[0].width).toBe(400);
      expect(body.photos[0].height).toBe(300);
    });

    it('returns 400 when year param is missing', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/public/gallery?program=mens'),
        testEnv,
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 when program param is missing', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/public/gallery?year=2026'),
        testEnv,
      );
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/public/photo/:id ───────────────────────────────────────────
  describe('GET /api/public/photo/:id', () => {
    it('streams R2 object with correct content-type', async () => {
      // Seed via upload API to ensure both R2 + D1 rows exist
      const authCookie = await getAuthCookie();
      const uploadRes = await uploadPhoto(authCookie, 'mens');
      expect(uploadRes.status).toBe(200);
      const { photo } = await uploadRes.json<{ ok: boolean; photo: { id: number } }>();

      const res = await app.fetch(
        new Request(`http://localhost/api/public/photo/${photo.id}`),
        testEnv,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toMatch(/^image\/png/);
    });

    it('returns 404 for a non-existent photo id', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/public/photo/99999'),
        testEnv,
      );
      expect(res.status).toBe(404);
    });
  });
});
