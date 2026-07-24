import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, setApiProgram } from '../api';

describe('apiFetch', () => {
  beforeEach(() => {
    setApiProgram('mens');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('injects ?program= into the URL (default mens)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: 'ok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/dashboard/stats');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/dashboard/stats?program=mens');
  });

  it('injects &program= when path already has a query string', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/registrations?limit=10');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/registrations?limit=10&program=mens');
  });

  it('uses the active program set via setApiProgram', async () => {
    setApiProgram('women');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/dashboard/stats');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('program=women');
  });

  it('includes credentials: include', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/dashboard/stats');

    const [, init] = mockFetch.mock.calls[0];
    expect(init.credentials).toBe('include');
  });

  it('throws Error(body.error) when response is not ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'Not authenticated' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(apiFetch('/dashboard/stats')).rejects.toThrow('Not authenticated');
  });

  it('throws HTTP status text when body has no error field', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ message: 'something went wrong' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(apiFetch('/dashboard/stats')).rejects.toThrow('HTTP 500');
  });

  it('returns parsed JSON on success', async () => {
    const payload = { total: 42, mens: 20, womens: 22 };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await apiFetch('/dashboard/stats');
    expect(result).toEqual(payload);
  });
});
