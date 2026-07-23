# Cross-Origin Worlds → Backend Round-Trip Report

Date: 2026-07-23

## Part A — Live Dates into Worlds Build

### What was done

1. **`src/js/date-sync.js`** — Created. Fetches `/api/public/events/current?program=mens|women` using `window.NWKS_API_BASE` (set by config.js; defaults to `''` for same-origin). Updates `[data-nwks-date="mens"]` and `[data-nwks-date="women"]` elements. Gracefully no-ops on fetch error, non-ok response, or null dates — existing hard-coded text is never blanked.

2. **`src/index.html`** — Added `data-nwks-date="mens"` and `data-nwks-date="women"` attributes to the two `.dates` divs, and added `<script src="js/date-sync.js"></script>` after config.js.

3. **`root/index.html`** (gateway served by backend) — Already had `data-nwks-date` attributes and `<script src="/date-sync.js" defer></script>` referencing `public/date-sync.js`.

4. **`public/date-sync.js`** — Already existed; uses same-origin `/api/public/events/current?program=...` (no NWKS_API_BASE needed for same-origin gateway).

### Bundle command

```bash
$ node build/bundle.mjs
Inlined 12 script(s): ['js/config.js', 'js/date-sync.js', 'js/registry.js', ...]
Wrote dist/index.html (550150 bytes)
bundle.mjs: OK — dist/index.html is self-contained.
```

### Date-sync unit test result

```
✓ public/__tests__/date-sync.test.js (6 tests) 222ms
```

Tests cover:
- Replaces mens date text from API
- Replaces women date text from API
- Leaves text unchanged when fetch throws
- Leaves text unchanged when API returns `ok: false`
- Leaves text unchanged when event has no `start_date`
- Handles different-month ranges (e.g. "July 31 – August 2, 2026")

---

## Part B — Cross-Origin Registration Round-Trip E2E

### Architecture

```
Browser (Playwright/Chromium)
  │
  ├─── http://localhost:8080/?door=men   (worlds SPA, served by Node http.Server)
  │      └── window.NWKS_API_BASE = 'http://localhost:8788'
  │
  └─── forms.js: fetch('http://localhost:8788/api/register/mens/attendee', { mode: 'cors' })
         │
         └─── http://localhost:8788  (Cloudflare Pages dev, wrangler)
                ├── CORS header: Access-Control-Allow-Origin: http://localhost:8080
                └── Writes to local D1 nwks-encounter
```

### CORS configuration

`wrangler.toml` CORS_ORIGINS updated to include `http://localhost:8080` and `http://127.0.0.1:8080`.

### Test file

`tests/e2e/worlds-roundtrip.spec.ts`

### Test run output

```
Running 4 tests using 1 worker

  ✓  1 worlds page loads with NWKS_API_BASE pointing at backend (247ms)
  ✓  2 backend health check is reachable cross-origin from worlds page (50ms)
  ✓  3 cross-origin events API returns current mens event (52ms)
  ✓  4 full round-trip: worlds form submit → backend → DB row created (4.4s)

  4 passed (14.0s)
```

### DB rows created by the round-trip test

```bash
$ npx wrangler d1 execute nwks-encounter --local --json \
    --command "SELECT r.id, r.email, r.program, r.role, r.first_name, r.last_name, r.person_id \
               FROM registrations r ORDER BY r.created_at DESC LIMIT 1"
```

```json
[{
  "results": [{
    "id": 8,
    "email": "worlds-roundtrip+1784838846101@example.com",
    "program": "mens",
    "role": "attendee",
    "first_name": "WorldsTest",
    "last_name": "RoundTrip",
    "person_id": 2
  }]
}]
```

```bash
$ npx wrangler d1 execute nwks-encounter --local --json \
    --command "SELECT id, to_email, template_key, status FROM email_log ORDER BY created_at DESC LIMIT 1"
```

```json
[{
  "results": [{
    "id": 8,
    "to_email": "worlds-roundtrip+1784838846101@example.com",
    "template_key": "welcome",
    "status": "queued"
  }]
}]
```

### What the round-trip test proves

1. **Worlds page loads** at cross-origin `http://localhost:8080` with `window.NWKS_API_BASE = 'http://localhost:8788'` injected.
2. **Cross-origin fetch works** — `/api/health` and `/api/public/events/current` respond correctly with CORS headers from the `:8788` backend when called from the `:8080` worlds page.
3. **Form renders and submits** — The men's attendee form is built by `NWKS.worlds.render()` + `NWKS.forms.render()`, user fills all required fields, clicks submit.
4. **CORS preflight + POST succeed** — The browser's cross-origin POST to `http://localhost:8788/api/register/mens/attendee` returns HTTP 200 with `Access-Control-Allow-Origin: http://localhost:8080`.
5. **DB row created** — `registrations` row with `email='worlds-roundtrip+...@example.com'`, `program='mens'`, `role='attendee'`, `first_name='WorldsTest'` exists in local D1.
6. **People row linked** — Registration's `person_id` points to an existing `people` row (dedup/upsert logic matched on last_name + city).
7. **Email log row created** — `email_log` row with `to_email='worlds-roundtrip+...@example.com'`, `template_key='welcome'`, `status='queued'` exists.

---

## Full test suite results

```
npm run test:api   → Test Files: 24 passed (24), Tests: 383 passed (383)
npm run test:admin → Test Files: 15 passed (15), Tests: 146 passed (146)
```

No regressions.
