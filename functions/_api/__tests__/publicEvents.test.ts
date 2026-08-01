import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../app';
import { applyMigrations } from './setup';

async function seedEvent(
  program: 'mens' | 'women',
  year: number,
  isCurrent: 0 | 1,
  startDate = '2026-08-06',
  endDate = '2026-08-08'
): Promise<void> {
  // INSERT OR REPLACE so this is safe when 0003_seed_events.sql already inserted the row.
  await env.DB.prepare(
    `INSERT OR REPLACE INTO events
       (program, year, title, start_date, end_date, launch_locations,
        attendee_registration_open, server_registration_open, is_current, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '["Colby"]', 1, 1, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
  ).bind(program, year, `${program} ${year}`, startDate, endDate, isCurrent).run();
}

describe('Public events/current endpoint', () => {
  beforeEach(async () => {
    await applyMigrations(env as any);
  });

  it('returns 400 for missing program param', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current'),
      env
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid program value', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current?program=other'),
      env
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when no current event exists', async () => {
    await seedEvent('mens', 2026, 0);
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current?program=mens'),
      env
    );
    expect(res.status).toBe(404);
  });

  it('returns the current mens event with parsed launch_locations', async () => {
    await seedEvent('mens', 2026, 1, '2026-08-06', '2026-08-08');
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current?program=mens'),
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      ok: boolean;
      event: {
        program: string;
        year: number;
        start_date: string;
        end_date: string;
        launch_locations: string[];
        attendee_registration_open: boolean;
        server_registration_open: boolean;
      };
    }>();
    expect(body.ok).toBe(true);
    expect(body.event.program).toBe('mens');
    expect(body.event.start_date).toBe('2026-08-06');
    expect(body.event.end_date).toBe('2026-08-08');
    expect(Array.isArray(body.event.launch_locations)).toBe(true);
    expect(typeof body.event.attendee_registration_open).toBe('boolean');
  });

  it('returns the correct program — mens current does not bleed into womens', async () => {
    await seedEvent('mens', 2026, 1, '2026-08-06', '2026-08-08');
    await seedEvent('women', 2026, 0, '2026-07-17', '2026-07-19');

    const wRes = await app.fetch(
      new Request('http://localhost/api/public/events/current?program=women'),
      env
    );
    expect(wRes.status).toBe(404);
  });

  it('caches only briefly, so closing enrollment takes effect promptly', async () => {
    await seedEvent('mens', 2026, 1);
    const res = await app.fetch(
      new Request('http://localhost/api/public/events/current?program=mens'),
      env
    );
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
  });
});
