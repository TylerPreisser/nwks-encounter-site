// functions/_api/routes/photos.ts — admin photo CRUD + public gallery endpoints

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

/**
 * Parse image dimensions from raw bytes.
 * Returns { width, height } or { width: 0, height: 0 } on parse failure.
 */
function parseDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } {
  try {
    if (mime === 'image/png') {
      // PNG IHDR: signature (8) + chunk length (4) + "IHDR" (4) + width (4) + height (4)
      if (
        bytes.length >= 24 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
      ) {
        const view = new DataView(bytes.buffer, bytes.byteOffset);
        return { width: view.getUint32(16), height: view.getUint32(20) };
      }
    }

    if (mime === 'image/jpeg') {
      // Scan for SOF0 (0xC0) or SOF2 (0xC2) markers
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
      if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38) {
        const tag = bytes[15];
        const view = new DataView(bytes.buffer, bytes.byteOffset);
        if (tag === 0x20) {
          // Lossy VP8
          const w = (view.getUint16(26, true) & 0x3fff) + 1;
          const h = (view.getUint16(28, true) & 0x3fff) + 1;
          return { width: w, height: h };
        }
        if (tag === 0x4c) {
          // Lossless VP8L
          const bits = view.getUint32(21, true);
          return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
        }
      }
    }
  } catch {
    // Swallow parse errors and fall through to default
  }
  return { width: 0, height: 0 };
}

// ── Admin routes ─────────────────────────────────────────────────────────────

export const photosAdminRouter = new Hono<{ Bindings: Env }>();

photosAdminRouter.use('*', requireAuth(), requireProgram());

// GET /api/admin/photos?year=<year>
photosAdminRouter.get('/', async (c) => {
  const program = c.get('program') as Program;
  const yearStr = c.req.query('year');
  const year = yearStr ? parseInt(yearStr, 10) : NaN;

  let stmt;
  if (!isNaN(year)) {
    stmt = c.env.DB.prepare(
      'SELECT * FROM photos WHERE program=? AND year=? ORDER BY sort ASC, id ASC',
    ).bind(program, year);
  } else {
    stmt = c.env.DB.prepare(
      'SELECT * FROM photos WHERE program=? ORDER BY year DESC, sort ASC, id ASC',
    ).bind(program);
  }

  const { results } = await stmt.all();
  return c.json({ ok: true, photos: results });
});

// POST /api/admin/photos  (multipart/form-data: file, year, caption)
photosAdminRouter.post('/', async (c) => {
  const program = c.get('program') as Program;
  const form = await c.req.formData();

  const file = form.get('file');
  if (!(file instanceof File)) {
    return c.json({ ok: false, error: 'Missing file' }, 400);
  }

  const yearRaw = form.get('year');
  if (!yearRaw) {
    return c.json({ ok: false, error: 'Missing or invalid year' }, 400);
  }
  const year = parseInt(String(yearRaw), 10);
  if (isNaN(year)) {
    return c.json({ ok: false, error: 'Missing or invalid year' }, 400);
  }

  const caption = String(form.get('caption') ?? '').trim();

  // Content-type validation (use file.type; strip any params like charset)
  const mime = (file.type ?? '').split(';')[0].trim().toLowerCase();
  if (!(ALLOWED_TYPES as readonly string[]).includes(mime)) {
    return c.json(
      { ok: false, error: `Invalid content type. Only image files are accepted (${ALLOWED_TYPES.join(', ')}).` },
      400,
    );
  }

  // Read bytes for size check + dimension parsing
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_SIZE_BYTES) {
    return c.json(
      { ok: false, error: `File too large. Maximum size is 10 MB (got ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB).` },
      400,
    );
  }

  const ext = EXT_MAP[mime] ?? 'bin';
  const uuid = crypto.randomUUID();
  const r2Key = `photos/${program}/${year}/${uuid}.${ext}`;

  const { width, height } = parseDimensions(bytes, mime);

  // Store object in R2
  await c.env.PHOTOS.put(r2Key, bytes, {
    httpMetadata: { contentType: mime },
    customMetadata: { program, year: String(year) },
  });

  // Determine next sort value (append after existing photos for this program+year)
  const maxRow = await c.env.DB.prepare(
    'SELECT MAX(sort) AS ms FROM photos WHERE program=? AND year=?',
  )
    .bind(program, year)
    .first<{ ms: number | null }>();
  const sort = (maxRow?.ms ?? -1) + 1;

  // Insert D1 row
  const { meta } = await c.env.DB.prepare(
    `INSERT INTO photos (program, year, r2_key, caption, sort, width, height, content_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(program, year, r2Key, caption, sort, width, height, mime, nowIso())
    .run();

  const photo = await c.env.DB.prepare('SELECT * FROM photos WHERE id=?')
    .bind(meta.last_row_id)
    .first();

  return c.json({ ok: true, photo });
});

// PATCH /api/admin/photos/:id
photosAdminRouter.patch('/:id', async (c) => {
  const program = c.get('program') as Program;
  const id = parseInt(c.req.param('id'), 10);

  // Ownership check (program isolation)
  const existing = await c.env.DB.prepare(
    'SELECT id FROM photos WHERE id=? AND program=?',
  )
    .bind(id, program)
    .first();
  if (!existing) {
    return c.json({ ok: false, error: 'Photo not found' }, 404);
  }

  const body = await c.req.json<{ caption?: string; sort?: number }>();
  const fields: string[] = [];
  const vals: unknown[] = [];

  if (typeof body.caption === 'string') {
    fields.push('caption=?');
    vals.push(body.caption.trim());
  }
  if (typeof body.sort === 'number' && Number.isFinite(body.sort)) {
    fields.push('sort=?');
    vals.push(body.sort);
  }

  if (fields.length === 0) {
    return c.json({ ok: false, error: 'Nothing to update' }, 400);
  }

  vals.push(id, program);
  await c.env.DB.prepare(
    `UPDATE photos SET ${fields.join(', ')} WHERE id=? AND program=?`,
  )
    .bind(...vals)
    .run();

  const photo = await c.env.DB.prepare('SELECT * FROM photos WHERE id=?')
    .bind(id)
    .first();
  return c.json({ ok: true, photo });
});

// DELETE /api/admin/photos/:id
photosAdminRouter.delete('/:id', async (c) => {
  const program = c.get('program') as Program;
  const id = parseInt(c.req.param('id'), 10);

  const row = await c.env.DB.prepare(
    'SELECT r2_key FROM photos WHERE id=? AND program=?',
  )
    .bind(id, program)
    .first<{ r2_key: string }>();

  if (!row) {
    return c.json({ ok: false, error: 'Photo not found' }, 404);
  }

  // Best-effort R2 delete (swallow errors if object already gone)
  try {
    await c.env.PHOTOS.delete(row.r2_key);
  } catch {
    // intentionally swallow
  }

  await c.env.DB.prepare('DELETE FROM photos WHERE id=? AND program=?')
    .bind(id, program)
    .run();

  return c.json({ ok: true });
});

// ── Public routes ─────────────────────────────────────────────────────────────

export const photosPublicRouter = new Hono<{ Bindings: Env }>();

// GET /api/public/gallery/years?program=
photosPublicRouter.get('/gallery/years', async (c) => {
  const program = c.req.query('program');
  if (program !== 'mens' && program !== 'women') {
    return c.json({ ok: false, error: 'program must be "mens" or "women"' }, 400);
  }

  const { results } = await c.env.DB.prepare(
    'SELECT DISTINCT year FROM photos WHERE program=? ORDER BY year DESC',
  )
    .bind(program)
    .all<{ year: number }>();

  return c.json({ ok: true, years: results.map((r) => r.year) });
});

// GET /api/public/gallery?program=&year=
photosPublicRouter.get('/gallery', async (c) => {
  const program = c.req.query('program');
  if (program !== 'mens' && program !== 'women') {
    return c.json({ ok: false, error: 'program must be "mens" or "women"' }, 400);
  }

  const yearStr = c.req.query('year');
  if (!yearStr) {
    return c.json({ ok: false, error: 'year is required' }, 400);
  }
  const year = parseInt(yearStr, 10);
  if (isNaN(year)) {
    return c.json({ ok: false, error: 'year must be a valid integer' }, 400);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, caption, sort, width, height, content_type
     FROM photos WHERE program=? AND year=? ORDER BY sort ASC, id ASC`,
  )
    .bind(program, year)
    .all<{ id: number; caption: string; sort: number; width: number; height: number; content_type: string }>();

  const photos = results.map((row) => ({
    ...row,
    url: `/api/public/photo/${row.id}`,
  }));

  return c.json({ ok: true, photos });
});

// GET /api/public/photo/:id  — stream the R2 object
photosPublicRouter.get('/photo/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);

  const row = await c.env.DB.prepare(
    'SELECT r2_key, content_type FROM photos WHERE id=?',
  )
    .bind(id)
    .first<{ r2_key: string; content_type: string }>();

  if (!row) {
    return c.json({ ok: false, error: 'Photo not found' }, 404);
  }

  const obj = await c.env.PHOTOS.get(row.r2_key);
  if (!obj) {
    return c.json({ ok: false, error: 'Photo object not found in storage' }, 404);
  }

  const contentType = obj.httpMetadata?.contentType ?? row.content_type ?? 'application/octet-stream';
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});
