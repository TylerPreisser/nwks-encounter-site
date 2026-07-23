import { describe, it, expect } from 'vitest';
import { app } from '../app';

describe('GET /api/health', () => {
  it('returns 200 with {ok:true}', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
