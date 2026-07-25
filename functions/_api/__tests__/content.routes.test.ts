// functions/_api/__tests__/content.routes.test.ts
// TDD integration tests for CMS content endpoints:
//   Admin: /api/admin/form-fields, /api/admin/page-content
//   Public: /api/public/form-config, /api/public/page-content

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';

const testEnv = env as unknown as Env;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getAuthCookie(opts: { email?: string; password?: string } = {}): Promise<string> {
  const email = opts.email ?? 'admin@nwksencounter.com';
  const password = opts.password ?? 'TestPass1!';
  const res = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
    testEnv
  );
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  const token = setCookie.match(/nwks_session=([^;]+)/)?.[1] ?? '';
  return `nwks_session=${token}`;
}

function adminReq(
  method: string,
  path: string,
  cookie: string,
  program: string,
  body?: unknown
): Request {
  // Properly append program param whether or not the path already has a query string
  const sep = path.includes('?') ? '&' : '?';
  const url = `http://localhost${path}${sep}program=${program}`;
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function publicReq(path: string): Request {
  return new Request(`http://localhost${path}`);
}

// ── Setup ────────────────────────────────────────────────────────────────────

let cookie: string;

beforeEach(async () => {
  await applyMigrations(env as any);
  await seedAdmin();
  cookie = await getAuthCookie();
});

// ─────────────────────────────────────────────────────────────────────────────
// Seed verification
// ─────────────────────────────────────────────────────────────────────────────

describe('Seed verification', () => {
  it('mens/attendee has 17 seeded form fields', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/form-fields', cookie, 'mens', undefined), testEnv);
    const body = await res.json<{ ok: boolean; fields: { attendee: unknown[]; server: unknown[] } }>();
    expect(body.ok).toBe(true);
    expect(body.fields.attendee).toHaveLength(17);
  });

  it('mens/attendee first field is first_name', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/form-fields?role=attendee', cookie, 'mens', undefined), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; fields: Array<{ name: string; label: string }> }>();
    expect(body.fields[0].name).toBe('first_name');
    expect(body.fields[0].label).toBe('First Name');
  });

  it('mens/server has 17 seeded form fields', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/form-fields?role=server', cookie, 'mens', undefined), testEnv);
    const body = await res.json<{ ok: boolean; fields: unknown[] }>();
    expect(body.ok).toBe(true);
    expect(body.fields).toHaveLength(17);
  });

  it('women/attendee has 20 seeded form fields', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/form-fields?role=attendee', cookie, 'women', undefined), testEnv);
    const body = await res.json<{ ok: boolean; fields: unknown[] }>();
    expect(body.ok).toBe(true);
    expect(body.fields).toHaveLength(20);
  });

  it('mens page_content has 4 seeded blocks', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/page-content', cookie, 'mens', undefined), testEnv);
    const body = await res.json<{ ok: boolean; blocks: unknown[] }>();
    expect(body.ok).toBe(true);
    expect(body.blocks).toHaveLength(4);
  });

  it('women page_content has 4 seeded blocks', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/page-content', cookie, 'women', undefined), testEnv);
    const body = await res.json<{ ok: boolean; blocks: unknown[] }>();
    expect(body.ok).toBe(true);
    expect(body.blocks).toHaveLength(4);
  });

  it('mens page_content contains hero_tagline key', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/page-content', cookie, 'mens', undefined), testEnv);
    const body = await res.json<{ ok: boolean; blocks: Array<{ key: string }> }>();
    expect(body.blocks.map((b) => b.key)).toContain('hero_tagline');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin form-fields — GET
// ─────────────────────────────────────────────────────────────────────────────

describe('Admin form-fields GET', () => {
  it('returns 401 without auth', async () => {
    const res = await app.fetch(new Request('http://localhost/api/admin/form-fields?program=mens'), testEnv);
    expect(res.status).toBe(401);
  });

  it('returns 400 without program', async () => {
    const res = await app.fetch(new Request('http://localhost/api/admin/form-fields', {
      headers: { Cookie: cookie },
    }), testEnv);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/form-fields?role=foo', cookie, 'mens', undefined), testEnv);
    expect(res.status).toBe(400);
  });

  it('returns grouped result when no role param', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/form-fields', cookie, 'mens', undefined), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; fields: { attendee: unknown[]; server: unknown[] } }>();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.fields.attendee)).toBe(true);
    expect(Array.isArray(body.fields.server)).toBe(true);
  });

  it('program isolation: mens/server does not return womens fields', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/form-fields?role=server', cookie, 'mens', undefined), testEnv);
    const body = await res.json<{ ok: boolean; fields: Array<{ program: string }> }>();
    expect(body.fields.every((f) => f.program === 'mens')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin form-fields — POST (create)
// ─────────────────────────────────────────────────────────────────────────────

describe('Admin form-fields POST', () => {
  it('creates a new field', async () => {
    const res = await app.fetch(adminReq('POST', '/api/admin/form-fields', cookie, 'mens', {
      role: 'attendee',
      name: 'custom_field',
      label: 'Custom Field',
      type: 'text',
      required: false,
      sort: 99,
    }), testEnv);
    expect(res.status).toBe(201);
    const body = await res.json<{ ok: boolean; field: { name: string; program: string; active: number } }>();
    expect(body.ok).toBe(true);
    expect(body.field.name).toBe('custom_field');
    expect(body.field.program).toBe('mens');
    expect(body.field.active).toBe(1);
  });

  it('returns 400 for missing name', async () => {
    const res = await app.fetch(adminReq('POST', '/api/admin/form-fields', cookie, 'mens', {
      role: 'attendee', label: 'X', type: 'text',
    }), testEnv);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid type', async () => {
    const res = await app.fetch(adminReq('POST', '/api/admin/form-fields', cookie, 'mens', {
      role: 'attendee', name: 'x', label: 'X', type: 'color',
    }), testEnv);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const res = await app.fetch(adminReq('POST', '/api/admin/form-fields', cookie, 'mens', {
      role: 'volunteer', name: 'x', label: 'X', type: 'text',
    }), testEnv);
    expect(res.status).toBe(400);
  });

  it('stores options as JSON string', async () => {
    const res = await app.fetch(adminReq('POST', '/api/admin/form-fields', cookie, 'mens', {
      role: 'server', name: 'fav_color', label: 'Fav Color', type: 'dropdown',
      options: ['Red', 'Blue', 'Green'],
    }), testEnv);
    expect(res.status).toBe(201);
    const body = await res.json<{ ok: boolean; field: { options: string } }>();
    expect(JSON.parse(body.field.options)).toEqual(['Red', 'Blue', 'Green']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin form-fields — PATCH (edit)
// ─────────────────────────────────────────────────────────────────────────────

describe('Admin form-fields PATCH', () => {
  async function createField(program = 'mens'): Promise<number> {
    const res = await app.fetch(adminReq('POST', '/api/admin/form-fields', cookie, program, {
      role: 'attendee', name: 'edit_me', label: 'Edit Me', type: 'text',
    }), testEnv);
    const body = await res.json<{ field: { id: number } }>();
    return body.field.id;
  }

  it('edits label and sort', async () => {
    const id = await createField();
    const res = await app.fetch(adminReq('PATCH', `/api/admin/form-fields/${id}`, cookie, 'mens', {
      label: 'Updated Label', sort: 5,
    }), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; field: { label: string; sort: number } }>();
    expect(body.field.label).toBe('Updated Label');
    expect(body.field.sort).toBe(5);
  });

  it('can set active=0 to deactivate', async () => {
    const id = await createField();
    const res = await app.fetch(adminReq('PATCH', `/api/admin/form-fields/${id}`, cookie, 'mens', {
      active: 0,
    }), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; field: { active: number } }>();
    expect(body.field.active).toBe(0);
  });

  it('returns 404 for wrong program', async () => {
    const id = await createField('mens');
    const res = await app.fetch(adminReq('PATCH', `/api/admin/form-fields/${id}`, cookie, 'women', {
      label: 'X',
    }), testEnv);
    expect(res.status).toBe(404);
  });

  it('returns 400 when no fields to update', async () => {
    const id = await createField();
    const res = await app.fetch(adminReq('PATCH', `/api/admin/form-fields/${id}`, cookie, 'mens', {}), testEnv);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin form-fields — DELETE
// ─────────────────────────────────────────────────────────────────────────────

describe('Admin form-fields DELETE', () => {
  async function createField(): Promise<number> {
    const res = await app.fetch(adminReq('POST', '/api/admin/form-fields', cookie, 'mens', {
      role: 'attendee', name: 'delete_me', label: 'Delete Me', type: 'text',
    }), testEnv);
    const body = await res.json<{ field: { id: number } }>();
    return body.field.id;
  }

  it('deletes a field', async () => {
    const id = await createField();
    const res = await app.fetch(adminReq('DELETE', `/api/admin/form-fields/${id}`, cookie, 'mens', undefined), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);

    // Verify it is gone
    const row = await testEnv.DB.prepare(`SELECT id FROM form_fields WHERE id = ?`).bind(id).first();
    expect(row).toBeNull();
  });

  it('returns 404 for non-existent id', async () => {
    const res = await app.fetch(adminReq('DELETE', `/api/admin/form-fields/999999`, cookie, 'mens', undefined), testEnv);
    expect(res.status).toBe(404);
  });

  it('returns 404 when deleting across programs', async () => {
    const id = await createField(); // created under mens
    const res = await app.fetch(adminReq('DELETE', `/api/admin/form-fields/${id}`, cookie, 'women', undefined), testEnv);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin form-fields — reorder
// ─────────────────────────────────────────────────────────────────────────────

describe('Admin form-fields reorder', () => {
  it('reorders fields by setting sort to array position', async () => {
    // Get existing mens/attendee fields
    const listRes = await app.fetch(adminReq('GET', '/api/admin/form-fields?role=attendee', cookie, 'mens', undefined), testEnv);
    const { fields } = await listRes.json<{ fields: Array<{ id: number }> }>();
    const ids = fields.map((f) => f.id);

    // Reverse the order
    const reversed = [...ids].reverse();
    const reorderRes = await app.fetch(adminReq('POST', '/api/admin/form-fields/reorder', cookie, 'mens', {
      role: 'attendee', ordered_ids: reversed,
    }), testEnv);
    expect(reorderRes.status).toBe(200);

    // Verify new order
    const listRes2 = await app.fetch(adminReq('GET', '/api/admin/form-fields?role=attendee', cookie, 'mens', undefined), testEnv);
    const { fields: reordered } = await listRes2.json<{ fields: Array<{ id: number; sort: number }> }>();
    expect(reordered[0].id).toBe(reversed[0]);
    expect(reordered[reordered.length - 1].id).toBe(reversed[reversed.length - 1]);
  });

  it('returns 400 for empty ordered_ids', async () => {
    const res = await app.fetch(adminReq('POST', '/api/admin/form-fields/reorder', cookie, 'mens', {
      role: 'attendee', ordered_ids: [],
    }), testEnv);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing role', async () => {
    const res = await app.fetch(adminReq('POST', '/api/admin/form-fields/reorder', cookie, 'mens', {
      ordered_ids: [1, 2, 3],
    }), testEnv);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin page-content
// ─────────────────────────────────────────────────────────────────────────────

describe('Admin page-content GET', () => {
  it('returns ordered blocks for the program', async () => {
    const res = await app.fetch(adminReq('GET', '/api/admin/page-content', cookie, 'mens', undefined), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; blocks: Array<{ program: string; key: string }> }>();
    expect(body.ok).toBe(true);
    expect(body.blocks.every((b) => b.program === 'mens')).toBe(true);
  });

  it('program isolation: womens blocks do not appear in mens', async () => {
    const mens = await app.fetch(adminReq('GET', '/api/admin/page-content', cookie, 'mens', undefined), testEnv);
    const women = await app.fetch(adminReq('GET', '/api/admin/page-content', cookie, 'women', undefined), testEnv);
    const mensBody = await mens.json<{ blocks: Array<{ program: string }> }>();
    const womenBody = await women.json<{ blocks: Array<{ program: string }> }>();
    expect(mensBody.blocks.every((b) => b.program === 'mens')).toBe(true);
    expect(womenBody.blocks.every((b) => b.program === 'women')).toBe(true);
  });
});

describe('Admin page-content POST', () => {
  it('creates a new block', async () => {
    const res = await app.fetch(adminReq('POST', '/api/admin/page-content', cookie, 'mens', {
      key: 'footer_note', label: 'Footer Note', value: 'See you there!', sort: 99,
    }), testEnv);
    expect(res.status).toBe(201);
    const body = await res.json<{ ok: boolean; block: { key: string; value: string } }>();
    expect(body.ok).toBe(true);
    expect(body.block.key).toBe('footer_note');
    expect(body.block.value).toBe('See you there!');
  });

  it('returns 409 on duplicate key within program', async () => {
    await app.fetch(adminReq('POST', '/api/admin/page-content', cookie, 'mens', {
      key: 'dupe_key', label: 'Dupe', value: 'v1',
    }), testEnv);
    const res = await app.fetch(adminReq('POST', '/api/admin/page-content', cookie, 'mens', {
      key: 'dupe_key', label: 'Dupe2', value: 'v2',
    }), testEnv);
    expect(res.status).toBe(409);
  });

  it('allows same key in different programs', async () => {
    await app.fetch(adminReq('POST', '/api/admin/page-content', cookie, 'mens', {
      key: 'shared_key', label: 'Shared', value: 'mens val',
    }), testEnv);
    const res = await app.fetch(adminReq('POST', '/api/admin/page-content', cookie, 'women', {
      key: 'shared_key', label: 'Shared', value: 'women val',
    }), testEnv);
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing key', async () => {
    const res = await app.fetch(adminReq('POST', '/api/admin/page-content', cookie, 'mens', {
      label: 'No Key', value: 'x',
    }), testEnv);
    expect(res.status).toBe(400);
  });
});

describe('Admin page-content PATCH', () => {
  async function createBlock(): Promise<number> {
    const res = await app.fetch(adminReq('POST', '/api/admin/page-content', cookie, 'mens', {
      key: 'patch_me', label: 'Patch Me', value: 'original', sort: 1,
    }), testEnv);
    const body = await res.json<{ block: { id: number } }>();
    return body.block.id;
  }

  it('edits the value of a block', async () => {
    const id = await createBlock();
    const res = await app.fetch(adminReq('PATCH', `/api/admin/page-content/${id}`, cookie, 'mens', {
      value: 'updated text',
    }), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; block: { value: string } }>();
    expect(body.block.value).toBe('updated text');
  });

  it('edits label of a block', async () => {
    const id = await createBlock();
    const res = await app.fetch(adminReq('PATCH', `/api/admin/page-content/${id}`, cookie, 'mens', {
      label: 'New Label',
    }), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; block: { label: string } }>();
    expect(body.block.label).toBe('New Label');
  });

  it('returns 404 for wrong program', async () => {
    const id = await createBlock();
    const res = await app.fetch(adminReq('PATCH', `/api/admin/page-content/${id}`, cookie, 'women', {
      value: 'x',
    }), testEnv);
    expect(res.status).toBe(404);
  });

  it('returns 400 when no fields to update', async () => {
    const id = await createBlock();
    const res = await app.fetch(adminReq('PATCH', `/api/admin/page-content/${id}`, cookie, 'mens', {}), testEnv);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Public endpoints
// ─────────────────────────────────────────────────────────────────────────────

describe('Public form-config', () => {
  it('returns active ordered fields for mens/attendee', async () => {
    const res = await app.fetch(publicReq('/api/public/form-config?program=mens&role=attendee'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; fields: Array<{ name: string; sort: number }> }>();
    expect(body.ok).toBe(true);
    expect(body.fields.length).toBeGreaterThan(0);
    // Ordered by sort
    const sorts = body.fields.map((f) => f.sort);
    expect(sorts).toEqual([...sorts].sort((a, b) => a - b));
    // Contains first_name
    expect(body.fields.some((f) => f.name === 'first_name')).toBe(true);
  });

  it('returns active ordered fields for women/attendee', async () => {
    const res = await app.fetch(publicReq('/api/public/form-config?program=women&role=attendee'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; fields: unknown[] }>();
    expect(body.fields.length).toBeGreaterThan(0);
  });

  it('accepts program=womens alias', async () => {
    const res = await app.fetch(publicReq('/api/public/form-config?program=womens&role=attendee'), testEnv);
    expect(res.status).toBe(200);
  });

  it('only returns active=1 fields', async () => {
    // Deactivate a field via admin PATCH
    const listRes = await app.fetch(adminReq('GET', '/api/admin/form-fields?role=attendee', cookie, 'mens', undefined), testEnv);
    const { fields } = await listRes.json<{ fields: Array<{ id: number }> }>();
    const firstId = fields[0].id;
    await app.fetch(adminReq('PATCH', `/api/admin/form-fields/${firstId}`, cookie, 'mens', { active: 0 }), testEnv);

    const res = await app.fetch(publicReq('/api/public/form-config?program=mens&role=attendee'), testEnv);
    const body = await res.json<{ ok: boolean; fields: Array<{ id: number }> }>();
    expect(body.fields.some((f) => f.id === firstId)).toBe(false);
  });

  it('returns 400 for missing role', async () => {
    const res = await app.fetch(publicReq('/api/public/form-config?program=mens'), testEnv);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid program', async () => {
    const res = await app.fetch(publicReq('/api/public/form-config?program=other&role=attendee'), testEnv);
    expect(res.status).toBe(400);
  });

  it('does not expose created_at/updated_at in public response', async () => {
    const res = await app.fetch(publicReq('/api/public/form-config?program=mens&role=attendee'), testEnv);
    const body = await res.json<{ fields: Record<string, unknown>[] }>();
    for (const f of body.fields) {
      expect('created_at' in f).toBe(false);
      expect('updated_at' in f).toBe(false);
      expect('active' in f).toBe(false);
    }
  });
});

describe('Public page-content', () => {
  it('returns key->value map for mens', async () => {
    const res = await app.fetch(publicReq('/api/public/page-content?program=mens'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; content: Record<string, string> }>();
    expect(body.ok).toBe(true);
    expect(typeof body.content).toBe('object');
    expect(typeof body.content['hero_tagline']).toBe('string');
  });

  it('returns key->value map for women', async () => {
    const res = await app.fetch(publicReq('/api/public/page-content?program=women'), testEnv);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; content: Record<string, string> }>();
    expect(typeof body.content['hero_tagline']).toBe('string');
  });

  it('accepts program=womens alias', async () => {
    const res = await app.fetch(publicReq('/api/public/page-content?program=womens'), testEnv);
    expect(res.status).toBe(200);
  });

  it('reflects updated value after PATCH', async () => {
    // Get block id for hero_tagline
    const listRes = await app.fetch(adminReq('GET', '/api/admin/page-content', cookie, 'mens', undefined), testEnv);
    const { blocks } = await listRes.json<{ blocks: Array<{ id: number; key: string }> }>();
    const block = blocks.find((b) => b.key === 'hero_tagline')!;
    await app.fetch(adminReq('PATCH', `/api/admin/page-content/${block.id}`, cookie, 'mens', {
      value: 'Changed tagline text',
    }), testEnv);

    const pubRes = await app.fetch(publicReq('/api/public/page-content?program=mens'), testEnv);
    const pubBody = await pubRes.json<{ content: Record<string, string> }>();
    expect(pubBody.content['hero_tagline']).toBe('Changed tagline text');
  });

  it('returns 400 for missing program', async () => {
    const res = await app.fetch(publicReq('/api/public/page-content'), testEnv);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid program', async () => {
    const res = await app.fetch(publicReq('/api/public/page-content?program=other'), testEnv);
    expect(res.status).toBe(400);
  });
});
