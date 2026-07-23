/**
 * jsdom unit test for date-sync.js
 *
 * Strategy: load the script source via fs.readFileSync and eval it inside a
 * jsdom environment. This avoids ESM/CJS module boundary issues since the
 * script is a plain IIFE. Vitest's jsdom environment is used.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCRIPT_SRC = readFileSync(
  resolve(process.cwd(), 'public/date-sync.js'),
  'utf8'
);

function buildFixtureDom() {
  document.body.innerHTML = `
    <section class="half half--men">
      <div class="half__inner">
        <div class="dates" data-nwks-date="mens">August 6 – 8, 2026</div>
      </div>
    </section>
    <section class="half half--women">
      <div class="half__inner">
        <div class="dates" data-nwks-date="women">July 17 – 19, 2026</div>
      </div>
    </section>
  `;
}

function evalScript() {
  // eslint-disable-next-line no-eval
  eval(SCRIPT_SRC);
  // Fire DOMContentLoaded manually (jsdom doesn't auto-fire after eval)
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

describe('date-sync.js', () => {
  beforeEach(() => {
    buildFixtureDom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces mens date text when API returns valid event', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('program=mens')) {
        return new Response(
          JSON.stringify({
            ok: true,
            event: { start_date: '2026-08-06', end_date: '2026-08-08', year: 2026 },
          }),
          { status: 200 }
        );
      }
      if (u.includes('program=women')) {
        return new Response(
          JSON.stringify({
            ok: true,
            event: { start_date: '2026-07-17', end_date: '2026-07-19', year: 2026 },
          }),
          { status: 200 }
        );
      }
      throw new Error('Unexpected fetch: ' + url);
    });

    evalScript();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-nwks-date="mens"]').textContent).toBe('August 6 – 8, 2026');
    });
  });

  it('replaces women date text when API returns valid event', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('program=mens')) {
        return new Response(JSON.stringify({ ok: true, event: { start_date: '2026-08-06', end_date: '2026-08-08', year: 2026 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, event: { start_date: '2026-07-17', end_date: '2026-07-19', year: 2026 } }), { status: 200 });
    });

    evalScript();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-nwks-date="women"]').textContent).toBe('July 17 – 19, 2026');
    });
  });

  it('leaves existing hard-coded text unchanged when fetch throws', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
    evalScript();

    // Give fetch time to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(document.querySelector('[data-nwks-date="mens"]').textContent).toBe('August 6 – 8, 2026');
    expect(document.querySelector('[data-nwks-date="women"]').textContent).toBe('July 17 – 19, 2026');
  });

  it('leaves text unchanged when API returns ok: false', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'no current event' }), { status: 404 })
    );
    evalScript();

    await new Promise((r) => setTimeout(r, 50));

    expect(document.querySelector('[data-nwks-date="mens"]').textContent).toBe('August 6 – 8, 2026');
  });

  it('leaves text unchanged when event has no start_date', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, event: { start_date: null, end_date: null, year: 2026 } }),
        { status: 200 }
      )
    );
    evalScript();

    await new Promise((r) => setTimeout(r, 50));

    expect(document.querySelector('[data-nwks-date="mens"]').textContent).toBe('August 6 – 8, 2026');
  });

  it('handles different-month ranges', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('program=mens')) {
        return new Response(
          JSON.stringify({ ok: true, event: { start_date: '2026-07-31', end_date: '2026-08-02', year: 2026 } }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: false, error: 'no current event' }), { status: 404 });
    });

    evalScript();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-nwks-date="mens"]').textContent).toBe('July 31 – August 2, 2026');
    });
  });
});
