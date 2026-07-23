# NWKS Encounter — Public Photo Gallery (R2) (Plan P6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. This plan is ADDITIVE — the Foundation Contract (Plan 00) is authoritative for all repo layout, naming, bindings, schema, and shared-module signatures. Do NOT redefine anything from Plan 00. Depends on Plan 00 (scaffold/bindings/schema) and Plan P2 (admin SPA shell, `requireAuth`, `requireProgram`, admin nav structure).

**Goal:** Add a public photo gallery to the NWKS Encounter site. Ministry admins upload per-year event photos to Cloudflare R2; visitors see a program-aware, year-filtered responsive grid with a lightbox. No public bucket access is required — images are streamed through a signed internal route.

**Architecture:** Four layers built TDD-first, committed after each passing test:
1. **Admin API** (`functions/_api/routes/photos.ts`) — multipart upload, list, patch, delete; auth-gated.
2. **Public API** (`functions/_api/routes/publicRoutes.ts` additions) — gallery years, photo list, photo stream.
3. **Public gallery page** (`public/gallery/index.html` + `public/gallery/gallery.js`) — year picker, responsive grid, lightbox.
4. **Admin SPA Gallery page** (`admin/src/pages/Gallery.tsx`) — drag-to-upload, caption/sort edit, delete.

**Tech Stack:** TypeScript 5, Hono 4, `@cloudflare/vitest-pool-workers` (API tests), Vitest + RTL + jsdom (admin + gallery.js tests). R2 binding `PHOTOS`, D1 binding `DB`, KV `SESSIONS`. All from Plan 00.

**Global Constraints:** See Foundation Contract. Key points for P6:
- `index.html` (gateway) is UNTOUCHED. The gallery link appears only in `public/` pages (thanks page + gallery itself).
- `PHOTOS` R2 binding is already declared in `wrangler.toml` — do NOT re-add it.
- `photos` table is already in `db/migrations/0001_init.sql` — do NOT re-migrate.
- `program` filter is ALWAYS applied; no admin endpoint ever returns cross-program rows.
- Image content-type validation and size cap enforced server-side (not just client-side).
- Public photo URL = `/api/public/photo/:id` (Worker streams from R2 — no bucket public access needed).
- No `Co-Authored-By` trailer in commits.

---

## File Structure

Files created or modified by this plan:

```
functions/_api/routes/photos.ts           NEW  admin photo CRUD + upload
functions/_api/routes/publicRoutes.ts     MOD  add gallery/years, gallery, photo/:id routes
functions/_api/__tests__/photos.test.ts   NEW  API tests (admin + public)
public/gallery/index.html                 NEW  public gallery page (year picker + grid)
public/gallery/gallery.js                 NEW  gallery logic (fetch, render, lightbox)
public/gallery/gallery.css                NEW  gallery styles (grid, lightbox, theming)
admin/src/pages/Gallery.tsx               NEW  admin gallery management page
admin/src/__tests__/Gallery.test.tsx      NEW  RTL tests for admin Gallery page
```

Files touched by linking only:
```
public/thanks.html                        MOD  add "View Photos" link (non-intrusive)
admin/src/App.tsx                         MOD  add /gallery route + nav link
```

---

## Task 1 — Admin Photo API (`functions/_api/routes/photos.ts`)

**Files:** `functions/_api/routes/photos.ts`, `functions/_api/__tests__/photos.test.ts`

**Interfaces consumed from Plan 00:**
- `Env.DB`, `Env.PHOTOS`
- `requireAuth()`, `requireProgram()` from `functions/_api/auth.ts`
- `nowIso()`, `Program` from `functions/_api/db.ts`
- `photos` table columns: `id, program, year, r2_key, caption, sort, width, height, content_type, created_at`
- Admin API endpoints: `GET /api/admin/photos?year=`, `POST /api/admin/photos` (multipart), `PATCH /api/admin/photos/:id`, `DELETE /api/admin/photos/:id`

**Constants:**
- Max upload size: `10 * 1024 * 1024` bytes (10 MB)
- Allowed MIME types: `['image/jpeg', 'image/png', 'image/webp', 'image/gif']`
- R2 key template: `photos/<program>/<year>/<uuid>.<ext>`

### Steps

- [ ] **1.1** Write the test file first — create `functions/_api/__tests__/photos.test.ts` with the full test suite for admin routes:

```typescript
// functions/_api/__tests__/photos.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../app';

// Helper: create a minimal multipart FormData for upload tests
function makePhotoForm(overrides: Record<string, string | Blob> = {}): FormData {
  const fd = new FormData();
  // 1x1 transparent PNG (base64)
  const pngBytes = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
    c => c.charCodeAt(0)
  );
  fd.append('file', new Blob([pngBytes], { type: 'image/png' }), 'test.png');
  fd.append('year', '2026');
  fd.append('caption', 'Test photo');
  Object.entries(overrides).forEach(([k, v]) => fd.set(k, v as string));
  return fd;
}

// Helper: seed a session cookie for an authenticated request
async function seedAdminAndSession(): Promise<string> {
  // Insert admin user directly into D1
  await env.DB.exec(`
    INSERT OR IGNORE INTO admin_users (email, name, password_hash, role, created_at)
    VALUES ('admin@test.com', 'Test Admin',
            'scrypt$746573747365616c74$' || hex(randomblob(32)),
            'admin', datetime('now'))
  `);
  // Create session directly in KV (bypass password check)
  const token = crypto.randomUUID();
  const user = await env.DB.prepare('SELECT id FROM admin_users WHERE email=?')
    .bind('admin@test.com').first<{ id: number }>();
  await env.SESSIONS.put(`session:${token}`, JSON.stringify({ userId: user!.id, expires: Date.now() + 3_600_000 }));
  return token;
}

describe('Admin Photo API', () => {
  let sessionToken: string;

  beforeEach(async () => {
    // Apply migrations to isolated local D1
    await env.DB.exec(await (await import('node:fs/promises')).readFile(
      new URL('../../../../db/migrations/0001_init.sql', import.meta.url), 'utf-8'
    ));
    sessionToken = await seedAdminAndSession();
  });

  const authHeaders = (token: string) => ({
    Cookie: `nwks_session=${token}`,
  });

  // ── POST /api/admin/photos ──────────────────────────────────────────────
  describe('POST /api/admin/photos', () => {
    it('uploads a valid image and returns photo row', async () => {
      const fd = makePhotoForm();
      const res = await app.request('/api/admin/photos?program=mens', {
        method: 'POST',
        headers: authHeaders(sessionToken),
        body: fd,
      }, env);
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean; photo: { id: number; r2_key: string; width: number; height: number } }>();
      expect(body.ok).toBe(true);
      expect(body.photo.r2_key).toMatch(/^photos\/mens\/2026\/.+\.png$/);
      expect(body.photo.width).toBeGreaterThan(0);
      expect(body.photo.height).toBeGreaterThan(0);
    });

    it('rejects a non-image file (text/plain)', async () => {
      const fd = makePhotoForm({ file: new Blob(['not an image'], { type: 'text/plain' }) });
      const res = await app.request('/api/admin/photos?program=mens', {
        method: 'POST',
        headers: authHeaders(sessionToken),
        body: fd,
      }, env);
      expect(res.status).toBe(400);
      const body = await res.json<{ ok: boolean; error: string }>();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/image/i);
    });

    it('rejects a file exceeding 10 MB', async () => {
      const bigBlob = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'image/png' });
      const fd = makePhotoForm({ file: bigBlob });
      const res = await app.request('/api/admin/photos?program=mens', {
        method: 'POST',
        headers: authHeaders(sessionToken),
        body: fd,
      }, env);
      expect(res.status).toBe(400);
      const body = await res.json<{ ok: boolean; error: string }>();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/size|large/i);
    });

    it('returns 401 without session', async () => {
      const fd = makePhotoForm();
      const res = await app.request('/api/admin/photos?program=mens', {
        method: 'POST',
        body: fd,
      }, env);
      expect(res.status).toBe(401);
    });

    it('returns 400 for missing year', async () => {
      const fd = makePhotoForm();
      fd.delete('year');
      const res = await app.request('/api/admin/photos?program=mens', {
        method: 'POST',
        headers: authHeaders(sessionToken),
        body: fd,
      }, env);
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/admin/photos ───────────────────────────────────────────────
  describe('GET /api/admin/photos', () => {
    it('returns empty list for a year with no photos', async () => {
      const res = await app.request('/api/admin/photos?program=mens&year=2025', {
        headers: authHeaders(sessionToken),
      }, env);
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean; photos: unknown[] }>();
      expect(body.ok).toBe(true);
      expect(body.photos).toHaveLength(0);
    });

    it('returns only the requested program\'s photos', async () => {
      // Seed photos for mens and women
      await env.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES (?, 2026, ?, ?, 0, 100, 100, 'image/png', datetime('now'))`
      ).bind('mens', 'photos/mens/2026/aaa.png', 'Men photo').run();
      await env.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES (?, 2026, ?, ?, 0, 100, 100, 'image/png', datetime('now'))`
      ).bind('women', 'photos/women/2026/bbb.png', 'Women photo').run();

      const res = await app.request('/api/admin/photos?program=mens&year=2026', {
        headers: authHeaders(sessionToken),
      }, env);
      const body = await res.json<{ ok: boolean; photos: { program: string }[] }>();
      expect(body.photos).toHaveLength(1);
      expect(body.photos[0].program).toBe('mens');
    });
  });

  // ── PATCH /api/admin/photos/:id ─────────────────────────────────────────
  describe('PATCH /api/admin/photos/:id', () => {
    it('updates caption and sort', async () => {
      const { meta } = await env.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES ('mens', 2026, 'photos/mens/2026/x.png', 'Old caption', 0, 100, 100, 'image/png', datetime('now'))`
      ).run();
      const id = meta.last_row_id;

      const res = await app.request(`/api/admin/photos/${id}?program=mens`, {
        method: 'PATCH',
        headers: { ...authHeaders(sessionToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: 'New caption', sort: 5 }),
      }, env);
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean; photo: { caption: string; sort: number } }>();
      expect(body.photo.caption).toBe('New caption');
      expect(body.photo.sort).toBe(5);
    });

    it('returns 404 for a photo belonging to another program', async () => {
      const { meta } = await env.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES ('women', 2026, 'photos/women/2026/y.png', 'Women', 0, 100, 100, 'image/png', datetime('now'))`
      ).run();
      const id = meta.last_row_id;
      const res = await app.request(`/api/admin/photos/${id}?program=mens`, {
        method: 'PATCH',
        headers: { ...authHeaders(sessionToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: 'Hacked' }),
      }, env);
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/admin/photos/:id ────────────────────────────────────────
  describe('DELETE /api/admin/photos/:id', () => {
    it('removes D1 row and R2 object', async () => {
      const r2Key = 'photos/mens/2026/del.png';
      // Pre-seed R2 object
      await env.PHOTOS.put(r2Key, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
      const { meta } = await env.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES ('mens', 2026, ?, 'To delete', 0, 100, 100, 'image/png', datetime('now'))`
      ).bind(r2Key).run();
      const id = meta.last_row_id;

      const res = await app.request(`/api/admin/photos/${id}?program=mens`, {
        method: 'DELETE',
        headers: authHeaders(sessionToken),
      }, env);
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean }>();
      expect(body.ok).toBe(true);

      // Verify row gone from D1
      const row = await env.DB.prepare('SELECT id FROM photos WHERE id=?').bind(id).first();
      expect(row).toBeNull();

      // Verify R2 object deleted
      const obj = await env.PHOTOS.get(r2Key);
      expect(obj).toBeNull();
    });

    it('returns 404 for a photo belonging to another program', async () => {
      const { meta } = await env.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES ('women', 2026, 'photos/women/2026/nd.png', 'Women', 0, 100, 100, 'image/png', datetime('now'))`
      ).run();
      const id = meta.last_row_id;
      const res = await app.request(`/api/admin/photos/${id}?program=mens`, {
        method: 'DELETE',
        headers: authHeaders(sessionToken),
      }, env);
      expect(res.status).toBe(404);
    });
  });
});

describe('Public Photo API', () => {
  beforeEach(async () => {
    await env.DB.exec(await (await import('node:fs/promises')).readFile(
      new URL('../../../../db/migrations/0001_init.sql', import.meta.url), 'utf-8'
    ));
  });

  // ── GET /api/public/gallery/years ───────────────────────────────────────
  describe('GET /api/public/gallery/years', () => {
    it('returns distinct years desc for the program', async () => {
      for (const [prog, year] of [['mens', 2024], ['mens', 2025], ['mens', 2026], ['women', 2026]]) {
        await env.DB.prepare(
          `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
           VALUES (?, ?, ?, '', 0, 1, 1, 'image/png', datetime('now'))`
        ).bind(prog, year, `photos/${prog}/${year}/z.png`).run();
      }
      const res = await app.request('/api/public/gallery/years?program=mens', {}, env);
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean; years: number[] }>();
      expect(body.years).toEqual([2026, 2025, 2024]);
    });

    it('returns empty array when no photos exist', async () => {
      const res = await app.request('/api/public/gallery/years?program=mens', {}, env);
      const body = await res.json<{ ok: boolean; years: number[] }>();
      expect(body.years).toHaveLength(0);
    });

    it('returns 400 when program is missing', async () => {
      const res = await app.request('/api/public/gallery/years', {}, env);
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/public/gallery ─────────────────────────────────────────────
  describe('GET /api/public/gallery', () => {
    it('returns photo objects with url and metadata, ordered by sort', async () => {
      await env.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES ('mens', 2026, 'photos/mens/2026/a.png', 'A', 1, 800, 600, 'image/png', datetime('now')),
                ('mens', 2026, 'photos/mens/2026/b.png', 'B', 0, 400, 300, 'image/jpeg', datetime('now'))`
      ).run();
      const res = await app.request('/api/public/gallery?program=mens&year=2026', {}, env);
      expect(res.status).toBe(200);
      const body = await res.json<{ ok: boolean; photos: { id: number; url: string; caption: string; width: number; height: number }[] }>();
      expect(body.photos).toHaveLength(2);
      // Sort=0 comes first
      expect(body.photos[0].caption).toBe('B');
      expect(body.photos[0].url).toMatch(/^\/api\/public\/photo\/\d+$/);
      expect(body.photos[0].width).toBe(400);
      expect(body.photos[0].height).toBe(300);
    });

    it('returns 400 when year is missing', async () => {
      const res = await app.request('/api/public/gallery?program=mens', {}, env);
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/public/photo/:id ───────────────────────────────────────────
  describe('GET /api/public/photo/:id', () => {
    it('streams R2 object with correct content-type', async () => {
      const r2Key = 'photos/mens/2026/stream.png';
      const pngBytes = Uint8Array.from(
        atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
        c => c.charCodeAt(0)
      );
      await env.PHOTOS.put(r2Key, pngBytes, { httpMetadata: { contentType: 'image/png' } });
      const { meta } = await env.DB.prepare(
        `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
         VALUES ('mens', 2026, ?, 'Stream test', 0, 1, 1, 'image/png', datetime('now'))`
      ).bind(r2Key).run();
      const id = meta.last_row_id;

      const res = await app.request(`/api/public/photo/${id}`, {}, env);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toMatch(/^image\/png/);
    });

    it('returns 404 for a non-existent photo id', async () => {
      const res = await app.request('/api/public/photo/99999', {}, env);
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **1.2** Run tests — confirm they all fail (red): `npm run test:api -- photos.test.ts`

- [ ] **1.3** Create `functions/_api/routes/photos.ts` implementing admin photo CRUD:

```typescript
// functions/_api/routes/photos.ts
import { Hono } from 'hono';
import type { Env } from '../app';
import { requireAuth, requireProgram } from '../auth';
import { nowIso } from '../db';
import type { Program } from '../db';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Parse image dimensions from raw bytes. Returns {width,height} or {0,0} on failure. */
function parseDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } {
  try {
    if (mime === 'image/png' && bytes[0] === 0x89 && bytes[1] === 0x50) {
      // PNG: IHDR chunk starts at offset 16, width @ 16, height @ 20 (4 bytes each, big-endian)
      const view = new DataView(bytes.buffer, bytes.byteOffset);
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (mime === 'image/jpeg') {
      // Scan for SOF markers (0xFF 0xC0 or 0xFF 0xC2)
      let i = 2;
      while (i < bytes.length - 8) {
        if (bytes[i] !== 0xff) break;
        const marker = bytes[i + 1];
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        if (marker === 0xc0 || marker === 0xc2) {
          const view = new DataView(bytes.buffer, bytes.byteOffset);
          return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
        }
        i += 2 + len;
      }
    }
    if (mime === 'image/webp' && bytes.length > 30) {
      // VP8 / VP8L bitstream width/height heuristic
      if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38) {
        const tag = bytes[15];
        if (tag === 0x20) { // lossy VP8
          const view = new DataView(bytes.buffer, bytes.byteOffset);
          const w = (view.getUint16(26, true) & 0x3fff) + 1;
          const h = (view.getUint16(28, true) & 0x3fff) + 1;
          return { width: w, height: h };
        }
        if (tag === 0x4c) { // lossless VP8L
          const view = new DataView(bytes.buffer, bytes.byteOffset);
          const bits = view.getUint32(21, true);
          return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
        }
      }
    }
  } catch {
    // Swallow parse errors; fall through to 0,0
  }
  return { width: 0, height: 0 };
}

const photos = new Hono<{ Bindings: Env }>();

photos.use('*', requireAuth(), requireProgram());

// GET /api/admin/photos?year=
photos.get('/', async (c) => {
  const program = c.get('program') as Program;
  const yearStr = c.req.query('year');
  const year = yearStr ? parseInt(yearStr, 10) : null;

  let stmt;
  if (year !== null && !isNaN(year)) {
    stmt = c.env.DB.prepare(
      'SELECT * FROM photos WHERE program=? AND year=? ORDER BY sort ASC, id ASC'
    ).bind(program, year);
  } else {
    stmt = c.env.DB.prepare(
      'SELECT * FROM photos WHERE program=? ORDER BY year DESC, sort ASC, id ASC'
    ).bind(program);
  }

  const { results } = await stmt.all();
  return c.json({ ok: true, photos: results });
});

// POST /api/admin/photos (multipart)
photos.post('/', async (c) => {
  const program = c.get('program') as Program;
  const form = await c.req.formData();

  const file = form.get('file');
  if (!(file instanceof File)) {
    return c.json({ ok: false, error: 'Missing file' }, 400);
  }

  const yearStr = form.get('year');
  if (!yearStr || isNaN(parseInt(String(yearStr), 10))) {
    return c.json({ ok: false, error: 'Missing or invalid year' }, 400);
  }
  const year = parseInt(String(yearStr), 10);
  const caption = String(form.get('caption') ?? '').trim();

  // Content-type validation
  const mime = file.type.split(';')[0].trim().toLowerCase();
  if (!(ALLOWED_TYPES as readonly string[]).includes(mime)) {
    return c.json({ ok: false, error: `Invalid content type. Allowed: ${ALLOWED_TYPES.join(', ')}` }, 400);
  }

  // Size validation
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_SIZE_BYTES) {
    return c.json({ ok: false, error: `File too large (max 10 MB). Got ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB` }, 400);
  }

  const ext = EXT_MAP[mime] ?? 'bin';
  const uuid = crypto.randomUUID();
  const r2Key = `photos/${program}/${year}/${uuid}.${ext}`;

  // Dimension detection
  const { width, height } = parseDimensions(bytes, mime);

  // Store in R2
  await c.env.PHOTOS.put(r2Key, bytes, {
    httpMetadata: { contentType: mime },
    customMetadata: { program, year: String(year) },
  });

  // Determine next sort value for this year
  const maxSortRow = await c.env.DB.prepare(
    'SELECT MAX(sort) AS ms FROM photos WHERE program=? AND year=?'
  ).bind(program, year).first<{ ms: number | null }>();
  const sort = (maxSortRow?.ms ?? -1) + 1;

  // Insert D1 row
  const { meta } = await c.env.DB.prepare(
    `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(program, year, r2Key, caption, sort, width, height, mime, nowIso()).run();

  const photo = await c.env.DB.prepare('SELECT * FROM photos WHERE id=?')
    .bind(meta.last_row_id).first();

  return c.json({ ok: true, photo });
});

// PATCH /api/admin/photos/:id
photos.patch('/:id', async (c) => {
  const program = c.get('program') as Program;
  const id = parseInt(c.req.param('id'), 10);

  // Ownership check
  const existing = await c.env.DB.prepare(
    'SELECT id FROM photos WHERE id=? AND program=?'
  ).bind(id, program).first();
  if (!existing) return c.json({ ok: false, error: 'Photo not found' }, 404);

  const body = await c.req.json<{ caption?: string; sort?: number }>();
  const fields: string[] = [];
  const vals: unknown[] = [];

  if (typeof body.caption === 'string') { fields.push('caption=?'); vals.push(body.caption.trim()); }
  if (typeof body.sort === 'number' && Number.isFinite(body.sort)) { fields.push('sort=?'); vals.push(body.sort); }

  if (fields.length === 0) return c.json({ ok: false, error: 'Nothing to update' }, 400);

  vals.push(id, program);
  await c.env.DB.prepare(
    `UPDATE photos SET ${fields.join(', ')} WHERE id=? AND program=?`
  ).bind(...vals).run();

  const photo = await c.env.DB.prepare('SELECT * FROM photos WHERE id=?').bind(id).first();
  return c.json({ ok: true, photo });
});

// DELETE /api/admin/photos/:id
photos.delete('/:id', async (c) => {
  const program = c.get('program') as Program;
  const id = parseInt(c.req.param('id'), 10);

  const row = await c.env.DB.prepare(
    'SELECT r2_key FROM photos WHERE id=? AND program=?'
  ).bind(id, program).first<{ r2_key: string }>();
  if (!row) return c.json({ ok: false, error: 'Photo not found' }, 404);

  // Delete from R2 (best-effort — proceed even if already gone)
  try { await c.env.PHOTOS.delete(row.r2_key); } catch { /* swallow */ }

  await c.env.DB.prepare('DELETE FROM photos WHERE id=? AND program=?')
    .bind(id, program).run();

  return c.json({ ok: true });
});

export default photos;
```

- [ ] **1.4** Mount the router in `functions/_api/app.ts` — add after the existing admin route mounts:

```typescript
import photosRouter from './routes/photos';
// ...inside the admin route group:
adminRoutes.route('/photos', photosRouter);
```

- [ ] **1.5** Run tests: `npm run test:api -- photos.test.ts` — all admin photo tests pass (green).

- [ ] **1.6** Commit: `git add functions/_api/routes/photos.ts functions/_api/__tests__/photos.test.ts functions/_api/app.ts && git commit -m "P6: admin photo API (upload/list/patch/delete) with R2 + D1, TDD"`

---

## Task 2 — Public Gallery API (additions to `publicRoutes.ts`)

**Files:** `functions/_api/routes/publicRoutes.ts`, `functions/_api/__tests__/photos.test.ts` (public section already written in Task 1)

**Interfaces consumed from Plan 00:**
- `GET /api/public/gallery/years?program=` → `{ ok, years: number[] }`
- `GET /api/public/gallery?program=&year=` → `{ ok, photos: [{ id, url, caption, width, height }] }`
- (New, documented below in Contract Additions) `GET /api/public/photo/:id` → streams R2 object

### Steps

- [ ] **2.1** Confirm tests for the public routes are already written and failing (from Task 1.1). Run: `npm run test:api -- photos.test.ts` — look for the `Public Photo API` describe block failures.

- [ ] **2.2** Open `functions/_api/routes/publicRoutes.ts` and add these three routes (preserving all existing routes):

```typescript
// ── Gallery: distinct years ─────────────────────────────────────────────
publicRoutes.get('/gallery/years', async (c) => {
  const program = c.req.query('program');
  if (!program || !['mens', 'women'].includes(program)) {
    return c.json({ ok: false, error: 'Invalid or missing program' }, 400);
  }
  const { results } = await c.env.DB.prepare(
    'SELECT DISTINCT year FROM photos WHERE program=? ORDER BY year DESC'
  ).bind(program).all<{ year: number }>();
  return c.json({ ok: true, years: results.map(r => r.year) });
});

// ── Gallery: photos for a year ──────────────────────────────────────────
publicRoutes.get('/gallery', async (c) => {
  const program = c.req.query('program');
  const yearStr = c.req.query('year');
  if (!program || !['mens', 'women'].includes(program)) {
    return c.json({ ok: false, error: 'Invalid or missing program' }, 400);
  }
  if (!yearStr) return c.json({ ok: false, error: 'Missing year' }, 400);
  const year = parseInt(yearStr, 10);
  if (isNaN(year)) return c.json({ ok: false, error: 'Invalid year' }, 400);

  const { results } = await c.env.DB.prepare(
    `SELECT id, caption, width, height FROM photos
     WHERE program=? AND year=? ORDER BY sort ASC, id ASC`
  ).bind(program, year).all<{ id: number; caption: string | null; width: number; height: number }>();

  const photos = results.map(r => ({
    ...r,
    url: `/api/public/photo/${r.id}`,
  }));

  return c.json({ ok: true, photos });
});

// ── Photo stream (R2 proxy) ─────────────────────────────────────────────
publicRoutes.get('/photo/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ ok: false, error: 'Invalid id' }, 400);

  const row = await c.env.DB.prepare(
    'SELECT r2_key, content_type FROM photos WHERE id=?'
  ).bind(id).first<{ r2_key: string; content_type: string }>();
  if (!row) return c.notFound();

  const obj = await c.env.PHOTOS.get(row.r2_key);
  if (!obj) return c.notFound();

  const headers = new Headers();
  headers.set('Content-Type', row.content_type || 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=86400, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');

  return new Response(obj.body, { headers });
});
```

- [ ] **2.3** Ensure the public router is mounted at the correct base path in `app.ts`. The routes above will be reachable as:
  - `GET /api/public/gallery/years?program=`
  - `GET /api/public/gallery?program=&year=`
  - `GET /api/public/photo/:id`

  Verify `app.ts` mounts `publicRoutes` at `/api/public` (already done per P0 — confirm, do not double-mount).

- [ ] **2.4** Run: `npm run test:api -- photos.test.ts` — all tests (admin + public) pass.

- [ ] **2.5** Commit: `git add functions/_api/routes/publicRoutes.ts && git commit -m "P6: public gallery API routes (years, photo list, photo stream)"`

---

## Task 3 — Public Gallery Page

**Files:** `public/gallery/index.html`, `public/gallery/gallery.js`, `public/gallery/gallery.css`

**Goal:** A static HTML page (no build step) that reads `?program=mens|women` from the URL, fetches years, renders a year-picker, then fetches and displays the photo grid. Clicking a photo opens a lightbox. Theming matches the gateway: olive/gold for Men's, rose for Women's. Lazy-loaded images.

### Steps

- [ ] **3.1** Write the jsdom unit test for `gallery.js` first. Create `public/gallery/gallery.test.js` (Vitest + jsdom):

```javascript
// public/gallery/gallery.test.js
// Run with: npx vitest run --environment jsdom public/gallery/gallery.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// We test the renderYearPicker and renderGrid functions exported from gallery.js
// gallery.js uses ES modules with explicit exports for testability.

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

async function loadGalleryModule() {
  // Re-import fresh module each test
  vi.resetModules();
  return await import('./gallery.js');
}

describe('gallery.js — year picker rendering', () => {
  it('renderYearPicker builds one button per year', async () => {
    const dom = new JSDOM('<!doctype html><div id="year-picker"></div>');
    global.document = dom.window.document;
    const { renderYearPicker } = await loadGalleryModule();
    const container = dom.window.document.getElementById('year-picker');
    renderYearPicker([2026, 2025, 2024], 2025, container, () => {});
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[1].textContent).toBe('2025');
    expect(buttons[1].classList.contains('active')).toBe(true);
    expect(buttons[0].classList.contains('active')).toBe(false);
  });

  it('renderYearPicker calls onSelect with the year on click', async () => {
    const dom = new JSDOM('<!doctype html><div id="year-picker"></div>');
    global.document = dom.window.document;
    const { renderYearPicker } = await loadGalleryModule();
    const container = dom.window.document.getElementById('year-picker');
    const onSelect = vi.fn();
    renderYearPicker([2026, 2025], 2026, container, onSelect);
    container.querySelectorAll('button')[1].click();
    expect(onSelect).toHaveBeenCalledWith(2025);
  });
});

describe('gallery.js — photo grid rendering', () => {
  it('renderGrid creates one figure per photo with correct src and alt', async () => {
    const dom = new JSDOM('<!doctype html><div id="photo-grid"></div>');
    global.document = dom.window.document;
    const { renderGrid } = await loadGalleryModule();
    const container = dom.window.document.getElementById('photo-grid');
    const photos = [
      { id: 1, url: '/api/public/photo/1', caption: 'First', width: 800, height: 600 },
      { id: 2, url: '/api/public/photo/2', caption: null, width: 400, height: 300 },
    ];
    renderGrid(photos, container, () => {});
    const figures = container.querySelectorAll('figure');
    expect(figures).toHaveLength(2);
    const img = figures[0].querySelector('img');
    expect(img.getAttribute('src')).toBe('/api/public/photo/1');
    expect(img.getAttribute('alt')).toBe('First');
    // Null caption → empty alt
    const img2 = figures[1].querySelector('img');
    expect(img2.getAttribute('alt')).toBe('');
  });

  it('renderGrid calls onPhotoClick with the photo object on click', async () => {
    const dom = new JSDOM('<!doctype html><div id="photo-grid"></div>');
    global.document = dom.window.document;
    const { renderGrid } = await loadGalleryModule();
    const container = dom.window.document.getElementById('photo-grid');
    const onPhotoClick = vi.fn();
    const photo = { id: 3, url: '/api/public/photo/3', caption: 'Click me', width: 1, height: 1 };
    renderGrid([photo], container, onPhotoClick);
    container.querySelector('figure').click();
    expect(onPhotoClick).toHaveBeenCalledWith(photo);
  });

  it('renderGrid shows empty-state message when photos array is empty', async () => {
    const dom = new JSDOM('<!doctype html><div id="photo-grid"></div>');
    global.document = dom.window.document;
    const { renderGrid } = await loadGalleryModule();
    const container = dom.window.document.getElementById('photo-grid');
    renderGrid([], container, () => {});
    expect(container.querySelector('figure')).toBeNull();
    expect(container.textContent).toMatch(/no photos/i);
  });
});
```

- [ ] **3.2** Run the gallery tests — confirm red: `npx vitest run --environment jsdom public/gallery/gallery.test.js`

- [ ] **3.3** Create `public/gallery/gallery.js`:

```javascript
// public/gallery/gallery.js
// Vanilla ES module — no build step required.
// Exports renderYearPicker and renderGrid for unit testing.

// ── Render helpers (exported for testing) ──────────────────────────────

/**
 * Render year-picker buttons into `container`.
 * @param {number[]} years
 * @param {number} activeYear
 * @param {HTMLElement} container
 * @param {(year: number) => void} onSelect
 */
export function renderYearPicker(years, activeYear, container, onSelect) {
  container.innerHTML = '';
  years.forEach(year => {
    const btn = document.createElement('button');
    btn.textContent = String(year);
    btn.className = 'year-btn' + (year === activeYear ? ' active' : '');
    btn.addEventListener('click', () => onSelect(year));
    container.appendChild(btn);
  });
}

/**
 * Render photo grid into `container`.
 * @param {{id:number,url:string,caption:string|null,width:number,height:number}[]} photos
 * @param {HTMLElement} container
 * @param {(photo: object) => void} onPhotoClick
 */
export function renderGrid(photos, container, onPhotoClick) {
  container.innerHTML = '';
  if (photos.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'no-photos';
    msg.textContent = 'No photos for this year yet.';
    container.appendChild(msg);
    return;
  }
  photos.forEach(photo => {
    const fig = document.createElement('figure');
    fig.className = 'photo-item';
    fig.addEventListener('click', () => onPhotoClick(photo));

    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = photo.caption ?? '';
    img.loading = 'lazy';
    img.decoding = 'async';
    // Aspect-ratio hint prevents layout shift
    if (photo.width && photo.height) {
      img.style.aspectRatio = `${photo.width}/${photo.height}`;
    }

    if (photo.caption) {
      const cap = document.createElement('figcaption');
      cap.textContent = photo.caption;
      fig.appendChild(img);
      fig.appendChild(cap);
    } else {
      fig.appendChild(img);
    }

    container.appendChild(fig);
  });
}

// ── Lightbox ────────────────────────────────────────────────────────────

/** @param {{url:string,caption:string|null}} photo */
function openLightbox(photo) {
  let overlay = document.getElementById('gallery-lightbox');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'gallery-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Photo viewer');
    overlay.innerHTML = `
      <div class="lb-backdrop"></div>
      <div class="lb-content">
        <button class="lb-close" aria-label="Close">&times;</button>
        <img class="lb-img" src="" alt="" />
        <p class="lb-caption"></p>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.lb-backdrop').addEventListener('click', closeLightbox);
    overlay.querySelector('.lb-close').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
  }
  overlay.querySelector('.lb-img').src = photo.url;
  overlay.querySelector('.lb-img').alt = photo.caption ?? '';
  overlay.querySelector('.lb-caption').textContent = photo.caption ?? '';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const overlay = document.getElementById('gallery-lightbox');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ── App bootstrap ───────────────────────────────────────────────────────

async function init() {
  const params = new URLSearchParams(window.location.search);
  const program = params.get('program');
  if (!program || !['mens', 'women'].includes(program)) {
    document.getElementById('gallery-root').innerHTML =
      '<p class="error">Please specify a program: <a href="?program=mens">Men\'s</a> · <a href="?program=women">Women\'s</a></p>';
    return;
  }

  // Apply program theme class
  document.documentElement.dataset.program = program;
  document.getElementById('gallery-title').textContent =
    program === 'mens' ? "Men's Encounter — Photo Gallery" : "Women's Encounter — Photo Gallery";

  const yearPicker = document.getElementById('year-picker');
  const photoGrid = document.getElementById('photo-grid');
  const loadingEl = document.getElementById('gallery-loading');

  // Fetch available years
  const yearsRes = await fetch(`/api/public/gallery/years?program=${program}`);
  const yearsData = await yearsRes.json();
  const years = yearsData.years ?? [];

  if (years.length === 0) {
    loadingEl.hidden = true;
    photoGrid.innerHTML = '<p class="no-photos">No gallery photos available yet.</p>';
    return;
  }

  // Default to most recent year (or URL param)
  let activeYear = parseInt(params.get('year') ?? '', 10);
  if (!years.includes(activeYear)) activeYear = years[0];

  async function loadYear(year) {
    loadingEl.hidden = false;
    photoGrid.innerHTML = '';
    // Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set('year', String(year));
    window.history.replaceState({}, '', url);

    renderYearPicker(years, year, yearPicker, loadYear);

    const res = await fetch(`/api/public/gallery?program=${program}&year=${year}`);
    const data = await res.json();
    loadingEl.hidden = true;
    renderGrid(data.photos ?? [], photoGrid, openLightbox);
  }

  await loadYear(activeYear);
}

// Only auto-init in a real browser context (not during unit tests)
if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.readyState !== undefined) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
```

- [ ] **3.4** Create `public/gallery/gallery.css`:

```css
/* public/gallery/gallery.css */
/* Program theming via data-program attribute on <html> */
:root {
  --accent: #7a6a3e;       /* olive/gold — default (men's) */
  --accent-light: #bfa96b;
  --bg: #f8f5ef;
  --text: #2c2416;
  --card-bg: #ffffff;
  --card-radius: 8px;
  --grid-gap: 1rem;
}
[data-program="women"] {
  --accent: #b5466b;       /* rose */
  --accent-light: #e799b0;
  --bg: #fdf5f8;
  --text: #2c1018;
}

*,
*::before,
*::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

/* ── Header ─────────────────────────────────────────────────────────── */
.gallery-header {
  background: var(--accent);
  color: #fff;
  padding: 2rem 1.5rem 1.5rem;
  text-align: center;
}
.gallery-header h1 { font-size: clamp(1.4rem, 4vw, 2rem); font-weight: 700; letter-spacing: 0.02em; }
.gallery-header .back-link {
  display: inline-block;
  margin-top: 0.75rem;
  color: rgba(255,255,255,0.8);
  font-size: 0.875rem;
  text-decoration: none;
}
.gallery-header .back-link:hover { color: #fff; text-decoration: underline; }

/* ── Year picker ────────────────────────────────────────────────────── */
#year-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  padding: 1.25rem 1rem;
}
.year-btn {
  border: 2px solid var(--accent);
  background: transparent;
  color: var(--accent);
  border-radius: 999px;
  padding: 0.35rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.year-btn:hover,
.year-btn.active {
  background: var(--accent);
  color: #fff;
}

/* ── Photo grid (responsive masonry-style via CSS columns) ──────────── */
#photo-grid {
  column-count: 2;
  column-gap: var(--grid-gap);
  padding: 1rem 1.5rem 3rem;
  max-width: 1200px;
  margin: 0 auto;
}
@media (min-width: 640px)  { #photo-grid { column-count: 3; } }
@media (min-width: 1024px) { #photo-grid { column-count: 4; } }

.photo-item {
  break-inside: avoid;
  margin-bottom: var(--grid-gap);
  background: var(--card-bg);
  border-radius: var(--card-radius);
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0,0,0,0.10);
  transition: box-shadow 0.15s, transform 0.15s;
}
.photo-item:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  transform: translateY(-2px);
}
.photo-item img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
}
.photo-item figcaption {
  padding: 0.4rem 0.6rem 0.5rem;
  font-size: 0.8rem;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Empty / error states ───────────────────────────────────────────── */
.no-photos,
.error {
  text-align: center;
  padding: 3rem 1rem;
  color: #888;
  font-size: 1rem;
  grid-column: 1 / -1;
}
.error a { color: var(--accent); }

/* ── Loading indicator ──────────────────────────────────────────────── */
#gallery-loading {
  text-align: center;
  padding: 2rem;
  color: var(--accent-light);
  font-style: italic;
}
#gallery-loading[hidden] { display: none; }

/* ── Lightbox ───────────────────────────────────────────────────────── */
#gallery-lightbox {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 1000;
}
#gallery-lightbox.open { display: flex; align-items: center; justify-content: center; }

.lb-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.88);
}
.lb-content {
  position: relative;
  z-index: 1;
  max-width: min(90vw, 1100px);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}
.lb-img {
  max-width: 100%;
  max-height: 80vh;
  object-fit: contain;
  border-radius: 4px;
}
.lb-caption {
  color: rgba(255,255,255,0.9);
  font-size: 0.9rem;
  text-align: center;
  max-width: 40ch;
}
.lb-close {
  position: absolute;
  top: -2.5rem;
  right: 0;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 2rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 0.25rem;
}
.lb-close:hover { color: var(--accent-light); }
```

- [ ] **3.5** Create `public/gallery/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Photo Gallery — NWKS Encounter</title>
  <meta name="description" content="Event photo galleries for NWKS Men's and Women's Encounter retreats." />
  <link rel="stylesheet" href="gallery.css" />
</head>
<body>
  <header class="gallery-header">
    <h1 id="gallery-title">NWKS Encounter — Photo Gallery</h1>
    <a class="back-link" href="/">← Back to Encounter</a>
  </header>

  <main id="gallery-root">
    <nav id="year-picker" aria-label="Filter by year"></nav>
    <p id="gallery-loading" aria-live="polite">Loading photos…</p>
    <div id="photo-grid" aria-label="Photo gallery"></div>
  </main>

  <script type="module" src="gallery.js"></script>
</body>
</html>
```

- [ ] **3.6** Run gallery unit tests: `npx vitest run --environment jsdom public/gallery/gallery.test.js` — all green.

- [ ] **3.7** Commit: `git add public/gallery/ && git commit -m "P6: public gallery page (year picker, photo grid, lightbox) with jsdom tests"`

---

## Task 4 — Add Gallery Link to `public/thanks.html`

**Files:** `public/thanks.html`

**Goal:** Add a non-intrusive "View our past event photos" link to the post-registration thanks page. Do NOT modify `index.html` (gateway).

### Steps

- [ ] **4.1** Read `public/thanks.html` to understand its current structure before editing.

- [ ] **4.2** Add a gallery link after the main thank-you content — the link should include `?program=` derived from the page's own URL param (same pattern the thanks page already uses for `program`). Example addition (adapt to actual DOM):

```html
<!-- Add near the bottom of <main>, before </main> -->
<p class="gallery-cta">
  <a href="/gallery/?program=mens" id="gallery-link">View our past event photos →</a>
</p>
<script>
  // Mirror the program param so the link goes to the right gallery
  (function() {
    const prog = new URLSearchParams(location.search).get('program');
    const link = document.getElementById('gallery-link');
    if (link && prog) link.href = '/gallery/?program=' + encodeURIComponent(prog);
  })();
</script>
```

- [ ] **4.3** Verify `index.html` is unchanged: `git diff index.html` → zero changes.

- [ ] **4.4** Commit: `git add public/thanks.html && git commit -m "P6: add gallery link to thanks page (program-aware)"`

---

## Task 5 — Admin SPA Gallery Page (`admin/src/pages/Gallery.tsx`)

**Files:** `admin/src/pages/Gallery.tsx`, `admin/src/__tests__/Gallery.test.tsx`

**Interfaces consumed from Plan 00 (P2):**
- `useProgram()` hook (or `useSearchParams`) to get current program
- `api.ts` fetch helpers (authenticated fetch with session cookie)
- Admin nav/layout shell from `App.tsx`
- Tailwind classes; olive/gold or rose theme via program context

**Feature set:** year tabs, per-year photo grid with drag-to-reorder (sort update), caption edit inline, delete with confirmation, drag-to-upload drop zone + file picker.

### Steps

- [ ] **5.1** Write RTL tests first — create `admin/src/__tests__/Gallery.test.tsx`:

```typescript
// admin/src/__tests__/Gallery.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Gallery from '../pages/Gallery';

// Mock the api module
vi.mock('../api', () => ({
  apiFetch: vi.fn(),
}));
import { apiFetch } from '../api';
const mockApiFetch = vi.mocked(apiFetch);

// Mock ProgramContext
vi.mock('../theme', () => ({
  useProgram: () => 'mens',
}));

const sampleYears = { ok: true, years: [2026, 2025] };
const samplePhotos = {
  ok: true,
  photos: [
    { id: 1, r2_key: 'photos/mens/2026/a.png', caption: 'Alpha', sort: 0, year: 2026, width: 800, height: 600, content_type: 'image/png', created_at: '2026-01-01T00:00:00Z' },
    { id: 2, r2_key: 'photos/mens/2026/b.png', caption: 'Beta',  sort: 1, year: 2026, width: 400, height: 300, content_type: 'image/png', created_at: '2026-01-02T00:00:00Z' },
  ],
};

function setup() {
  return render(
    <MemoryRouter>
      <Gallery />
    </MemoryRouter>
  );
}

describe('Gallery admin page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: years then photos
    mockApiFetch
      .mockResolvedValueOnce(sampleYears)
      .mockResolvedValueOnce(samplePhotos);
  });

  it('renders year tabs and photo list', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('2026')).toBeInTheDocument();
      expect(screen.getByText('2025')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });
  });

  it('shows upload zone with file input', async () => {
    setup();
    await waitFor(() => screen.getByText('Alpha'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain('image/');
  });

  it('calls DELETE endpoint and removes photo from list on confirm', async () => {
    const user = userEvent.setup();
    // After delete: re-fetch returns one photo
    mockApiFetch
      .mockResolvedValueOnce(sampleYears)
      .mockResolvedValueOnce(samplePhotos)
      .mockResolvedValueOnce({ ok: true })                         // DELETE
      .mockResolvedValueOnce({ ok: true, photos: [samplePhotos.photos[0]] }); // re-fetch

    setup();
    await waitFor(() => screen.getByText('Beta'));

    // Click delete on Beta (second photo)
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[1]);

    // Confirm dialog
    const confirmBtn = await screen.findByRole('button', { name: /confirm/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/photos/2'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    await waitFor(() => {
      expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    });
  });

  it('calls PATCH endpoint on caption save', async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(sampleYears)
      .mockResolvedValueOnce(samplePhotos)
      .mockResolvedValueOnce({ ok: true, photo: { ...samplePhotos.photos[0], caption: 'Updated' } })
      .mockResolvedValueOnce({ ok: true, photos: [{ ...samplePhotos.photos[0], caption: 'Updated' }, samplePhotos.photos[1]] });

    setup();
    await waitFor(() => screen.getByText('Alpha'));

    // Click edit on first photo
    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[0]);

    const input = await screen.findByDisplayValue('Alpha');
    await user.clear(input);
    await user.type(input, 'Updated');

    const saveBtn = screen.getByRole('button', { name: /save/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/photos/1'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ caption: 'Updated' }) })
      );
    });
  });

  it('shows upload error when a non-image file is dropped', async () => {
    setup();
    await waitFor(() => screen.getByText('Alpha'));

    const dropZone = screen.getByTestId('upload-dropzone');
    const nonImageFile = new File(['text'], 'doc.txt', { type: 'text/plain' });
    fireEvent.drop(dropZone, { dataTransfer: { files: [nonImageFile] } });

    await waitFor(() => {
      expect(screen.getByText(/image files only/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **5.2** Run: `npm run test:admin -- Gallery.test.tsx` — confirm red.

- [ ] **5.3** Create `admin/src/pages/Gallery.tsx`:

```typescript
// admin/src/pages/Gallery.tsx
import { useState, useEffect, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import { useProgram } from '../theme';
import { apiFetch } from '../api';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_MB = 10;

interface Photo {
  id: number;
  r2_key: string;
  caption: string | null;
  sort: number;
  year: number;
  width: number;
  height: number;
  content_type: string;
  created_at: string;
}

interface UploadState {
  file: File;
  caption: string;
  progress: 'idle' | 'uploading' | 'done' | 'error';
  error?: string;
}

export default function Gallery() {
  const program = useProgram();
  const [years, setYears] = useState<number[]>([]);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load years ──────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch(`/api/admin/photos/years?program=${program}`)
      // Fall back to year list from gallery/years public endpoint if admin doesn't expose it
      .catch(() => apiFetch(`/api/public/gallery/years?program=${program}`))
      .then((data: { ok: boolean; years: number[] }) => {
        const ys = data.years ?? [];
        setYears(ys);
        setActiveYear(ys[0] ?? null);
      });
  }, [program]);

  // ── Load photos for active year ─────────────────────────────────────
  const loadPhotos = useCallback(async (year: number) => {
    setLoading(true);
    const data = await apiFetch(`/api/admin/photos?program=${program}&year=${year}`);
    setPhotos(data.photos ?? []);
    setLoading(false);
  }, [program]);

  useEffect(() => {
    if (activeYear !== null) loadPhotos(activeYear);
  }, [activeYear, loadPhotos]);

  // ── File validation ─────────────────────────────────────────────────
  function validateFile(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type)) return 'Image files only (JPEG, PNG, WebP, GIF).';
    if (file.size > MAX_SIZE_MB * 1024 * 1024) return `File too large (max ${MAX_SIZE_MB} MB).`;
    return null;
  }

  // ── Upload ──────────────────────────────────────────────────────────
  async function uploadFile(file: File) {
    const err = validateFile(file);
    if (err) { setUploadError(err); return; }
    setUploadError(null);

    const state: UploadState = { file, caption: '', progress: 'uploading' };
    setUploads(prev => [...prev, state]);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('year', String(activeYear ?? new Date().getFullYear()));
    fd.append('caption', state.caption);

    try {
      const data = await apiFetch(`/api/admin/photos?program=${program}`, {
        method: 'POST',
        body: fd,
      });
      if (data.ok) {
        setUploads(prev => prev.filter(u => u.file !== file));
        if (activeYear !== null) await loadPhotos(activeYear);
        // Also refresh years in case this is a new year
        const yearsData = await apiFetch(`/api/public/gallery/years?program=${program}`);
        setYears(yearsData.years ?? []);
      } else {
        setUploads(prev => prev.map(u => u.file === file ? { ...u, progress: 'error', error: data.error } : u));
      }
    } catch (e) {
      setUploads(prev => prev.map(u => u.file === file ? { ...u, progress: 'error', error: 'Upload failed' } : u));
    }
  }

  // ── Drag handlers ───────────────────────────────────────────────────
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(uploadFile);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach(uploadFile);
    e.target.value = '';
  }

  // ── Caption edit ────────────────────────────────────────────────────
  function startEdit(photo: Photo) {
    setEditingId(photo.id);
    setEditCaption(photo.caption ?? '');
  }

  async function saveCaption(id: number) {
    await apiFetch(`/api/admin/photos/${id}?program=${program}`, {
      method: 'PATCH',
      body: JSON.stringify({ caption: editCaption }),
    });
    setEditingId(null);
    if (activeYear !== null) await loadPhotos(activeYear);
  }

  // ── Delete ──────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (deleteTarget === null) return;
    await apiFetch(`/api/admin/photos/${deleteTarget}?program=${program}`, { method: 'DELETE' });
    setDeleteTarget(null);
    if (activeYear !== null) await loadPhotos(activeYear);
  }

  // ── Sort (move up/down) ─────────────────────────────────────────────
  async function movePhoto(photo: Photo, direction: 'up' | 'down') {
    const idx = photos.findIndex(p => p.id === photo.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= photos.length) return;
    const swap = photos[swapIdx];
    await Promise.all([
      apiFetch(`/api/admin/photos/${photo.id}?program=${program}`, { method: 'PATCH', body: JSON.stringify({ sort: swap.sort }) }),
      apiFetch(`/api/admin/photos/${swap.id}?program=${program}`, { method: 'PATCH', body: JSON.stringify({ sort: photo.sort }) }),
    ]);
    if (activeYear !== null) await loadPhotos(activeYear);
  }

  const themeAccent = program === 'mens' ? 'bg-olive-700' : 'bg-rose-600';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Photo Gallery</h1>

      {/* Year tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {years.map(y => (
          <button
            key={y}
            onClick={() => setActiveYear(y)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-colors ${
              y === activeYear
                ? 'bg-accent text-white border-accent'
                : 'border-accent text-accent hover:bg-accent hover:text-white'
            }`}
            style={y === activeYear ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            {y}
          </button>
        ))}
        {years.length === 0 && <span className="text-gray-400 text-sm">No years yet — upload a photo to create one.</span>}
      </div>

      {/* Upload zone */}
      <div
        data-testid="upload-dropzone"
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 mb-6 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-accent bg-accent/10' : 'border-gray-300 hover:border-accent'
        }`}
        style={isDragging ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent-faint)' } : {}}
      >
        <p className="text-gray-500 font-medium">Drag photos here or click to select</p>
        <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP, GIF · max 10 MB each</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {uploadError && (
        <p className="text-red-600 text-sm mb-4">{uploadError}</p>
      )}

      {/* Upload progress */}
      {uploads.map((u, i) => (
        <div key={i} className="flex items-center gap-2 text-sm mb-2">
          <span className="truncate max-w-xs">{u.file.name}</span>
          {u.progress === 'uploading' && <span className="text-gray-500">Uploading…</span>}
          {u.progress === 'error' && <span className="text-red-500">{u.error}</span>}
        </div>
      ))}

      {/* Photo grid */}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : photos.length === 0 ? (
        <p className="text-gray-400 text-sm">No photos for {activeYear} yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((photo, idx) => (
            <div key={photo.id} className="group relative rounded-lg overflow-hidden bg-gray-100 shadow-sm">
              <img
                src={`/api/public/photo/${photo.id}`}
                alt={photo.caption ?? ''}
                className="w-full aspect-square object-cover"
                loading="lazy"
              />
              {/* Caption */}
              <div className="p-2">
                {editingId === photo.id ? (
                  <div className="flex gap-1">
                    <input
                      value={editCaption}
                      onChange={e => setEditCaption(e.target.value)}
                      className="flex-1 text-xs border rounded px-1 py-0.5"
                      autoFocus
                    />
                    <button
                      onClick={() => saveCaption(photo.id)}
                      className="text-xs bg-green-600 text-white px-2 py-0.5 rounded"
                      aria-label="Save caption"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-gray-500"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 truncate">{photo.caption ?? <em className="text-gray-400">No caption</em>}</p>
                )}
              </div>
              {/* Actions overlay */}
              <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEdit(photo)}
                  className="bg-white/90 rounded p-1 text-xs shadow hover:bg-white"
                  aria-label="Edit caption"
                  title="Edit caption"
                >
                  ✏️
                </button>
                <button
                  onClick={() => movePhoto(photo, 'up')}
                  disabled={idx === 0}
                  className="bg-white/90 rounded p-1 text-xs shadow hover:bg-white disabled:opacity-30"
                  aria-label="Move up"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => movePhoto(photo, 'down')}
                  disabled={idx === photos.length - 1}
                  className="bg-white/90 rounded p-1 text-xs shadow hover:bg-white disabled:opacity-30"
                  aria-label="Move down"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  onClick={() => setDeleteTarget(photo.id)}
                  className="bg-red-500/90 text-white rounded p-1 text-xs shadow hover:bg-red-600"
                  aria-label="Delete photo"
                  title="Delete photo"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-lg font-bold mb-2">Delete Photo?</h2>
            <p className="text-gray-600 text-sm mb-4">
              This permanently removes the photo from R2 and the database. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                aria-label="Confirm delete"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **5.4** Register the route in `admin/src/App.tsx`. Read the file first, then add:

```typescript
// In the admin router, add alongside existing page routes:
import Gallery from './pages/Gallery';
// <Route path="/gallery" element={<Gallery />} />
// Also add a nav link: { to: '/gallery', label: 'Gallery' }
```

  The exact edit depends on the App.tsx structure established in P2 — match its pattern exactly.

- [ ] **5.5** Run: `npm run test:admin -- Gallery.test.tsx` — all tests pass (green).

- [ ] **5.6** Run: `npm run test:api` — confirm no regressions in existing API tests.

- [ ] **5.7** Commit: `git add admin/src/pages/Gallery.tsx admin/src/__tests__/Gallery.test.tsx admin/src/App.tsx && git commit -m "P6: admin Gallery page (upload, caption edit, sort, delete) with RTL tests"`

---

## Task 6 — Full Test Run & Local Smoke Test

**Files:** none new

### Steps

- [ ] **6.1** Run the full test suite: `npm run test:api && npm run test:admin`

- [ ] **6.2** Build: `npm run build` — confirm no TypeScript or Vite errors.

- [ ] **6.3** Local smoke test: `npx wrangler pages dev dist --local` — navigate to:
  - `/gallery/?program=mens` — should render the year picker (empty or seeded) and grid.
  - `/admin/gallery` — should render the upload zone and (empty) photo list.
  - Confirm `index.html` gateway renders identically to before (no visual change).

- [ ] **6.4** If any issues found: fix, re-run tests, commit before proceeding.

- [ ] **6.5** Final commit (if any outstanding changes): `git add -p && git commit -m "P6: smoke-test fixes"`

---

## Contract Additions Needed

The following items are used in Plan P6 but are **not explicitly defined** in the Foundation Contract (Plan 00) and should be documented in a future Plan 00 revision:

### 1. `GET /api/public/photo/:id` — Photo Stream Route
The Foundation Contract's API surface omits this route. Plan P6 adds it as:
```
GET /api/public/photo/:id
```
Response: streams the R2 object with `Content-Type` from `photos.content_type`, `Cache-Control: public, max-age=86400, immutable`. Returns 404 if the row or R2 object is missing. No program filter (the ID is globally unique). This route requires no auth.

### 2. `GET /api/admin/photos/years?program=` — Admin Year Listing
The Foundation Contract defines `GET /api/admin/photos?year=` for the photo list but does not define an admin-side year enumeration endpoint. Plan P6's admin Gallery page uses the public `/api/public/gallery/years` endpoint as a workaround. If an admin-scoped years endpoint is ever needed (e.g., to enumerate years with zero-count photos), add:
```
GET /api/admin/photos/years?program=
```

### 3. `photos.width`, `photos.height`, `photos.content_type` columns
The Foundation Contract's `photos` table definition (in `db/migrations/0001_init.sql`) **does** include `width INTEGER, height INTEGER, content_type TEXT` — no gap here. Listed for confirmation only.

### 4. `admin/src/api.ts` — `apiFetch` signature
Plan P6 assumes `apiFetch(url: string, init?: RequestInit): Promise<any>` is exported from `admin/src/api.ts` (established in P2). If P2 uses a different name or signature, Gallery.tsx must be updated to match.

### 5. `useProgram()` hook from `admin/src/theme.ts`
Plan P6 assumes this hook is established in P2 and returns the current `'mens' | 'women'` program string. If P2 exports it from a different module path, update the import in `Gallery.tsx`.
```
