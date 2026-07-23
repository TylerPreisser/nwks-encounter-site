// public/__tests__/worlds-forms.test.js
// jsdom tests for src/content/forms.js (field specs) + src/js/forms.js (renderer + submit).
// Run via: npm run test:admin  (vitest + jsdom)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '../../src');

// jsdom doesn't implement scrollIntoView; stub it globally
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

function loadSrc() {
  // Reset globals
  delete window.NWKS;
  delete window.NWKS_API_BASE;
  delete window.NWKS_TURNSTILE_SITEKEY;

  // config.js — sets NWKS_API_BASE + NWKS_TURNSTILE_SITEKEY
  const configSrc = readFileSync(join(SRC, 'js/config.js'), 'utf8');
  new Function(configSrc)();

  // forms.js content — sets NWKS.forms.specs
  const specsSrc = readFileSync(join(SRC, 'content/forms.js'), 'utf8');
  new Function(specsSrc)();

  // forms.js renderer — sets NWKS.forms.render
  const rendererSrc = readFileSync(join(SRC, 'js/forms.js'), 'utf8');
  new Function(rendererSrc)();
}

function renderSpec(specKey) {
  const mount = document.createElement('div');
  window.NWKS.forms.render(specKey, mount);
  return mount;
}

// ---------------------------------------------------------------------------
// Visual parity: labels and options must exactly match the original Google spec.
// ---------------------------------------------------------------------------
describe('menAttendee spec — labels and options (visual parity)', () => {
  beforeEach(() => { loadSrc(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('renders all 17 fields in spec order', () => {
    const mount = renderSpec('menAttendee');
    const fields = mount.querySelectorAll('.nwks-field');
    expect(fields.length).toBe(17);
  });

  it('renders First Name label', () => {
    const mount = renderSpec('menAttendee');
    const labels = [...mount.querySelectorAll('.nwks-field__label')].map(l => l.textContent.replace(' *', '').trim());
    expect(labels[0]).toBe('First Name');
  });

  it('renders Launch Location dropdown with all 8 options', () => {
    const mount = renderSpec('menAttendee');
    const selects = mount.querySelectorAll('select');
    // find the Launch Location select (3rd dropdown: email, phone type, address, city, state, launch_location)
    const launchSel = [...selects].find(s => s.name === 'launch_location');
    expect(launchSel).toBeTruthy();
    const options = [...launchSel.querySelectorAll('option')].map(o => o.value).filter(Boolean);
    expect(options).toEqual(['Hays', 'Norton', 'Plainville', 'Hoxie', 'Colby', 'Gove', 'Sterling', 'Wakeeney']);
  });

  it('renders Shirt Size dropdown with 8 options', () => {
    const mount = renderSpec('menAttendee');
    const shirtSel = [...mount.querySelectorAll('select')].find(s => s.name === 'shirt_size');
    expect(shirtSel).toBeTruthy();
    const options = [...shirtSel.querySelectorAll('option')].map(o => o.value).filter(Boolean);
    expect(options).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL']);
  });

  it('input names use friendly backend names (not entry.*)', () => {
    const mount = renderSpec('menAttendee');
    const allNames = [...mount.querySelectorAll('[name]')].map(n => n.getAttribute('name'));
    // none should start with 'entry.'
    expect(allNames.some(n => n.startsWith('entry.'))).toBe(false);
    // should contain friendly names
    expect(allNames).toContain('first_name');
    expect(allNames).toContain('last_name');
    expect(allNames).toContain('email');
    expect(allNames).toContain('phone');
    expect(allNames).toContain('launch_location');
    expect(allNames).toContain('shirt_size');
    expect(allNames).toContain('church');
    expect(allNames).toContain('times_attended_self_report');
    expect(allNames).toContain('invited_by');
    expect(allNames).toContain('prayer_contact_name');
    expect(allNames).toContain('prayer_contact_phone');
    expect(allNames).toContain('dietary_health');
    expect(allNames).toContain('questions');
  });
});

describe('women spec — labels and options (visual parity)', () => {
  beforeEach(() => { loadSrc(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('renders all 20 fields', () => {
    const mount = renderSpec('women');
    const fields = mount.querySelectorAll('.nwks-field');
    expect(fields.length).toBe(20);
  });

  it('renders prior_attendance checkbox with 3 options', () => {
    const mount = renderSpec('women');
    const cbs = mount.querySelectorAll('input[name="prior_attendance"]');
    expect(cbs.length).toBe(3);
    const values = [...cbs].map(c => c.value);
    expect(values[0]).toContain('1st Time Attendee');
    expect(values[1]).toContain('I have attended a previous');
    expect(values[2]).toContain('major life event');
  });

  it('renders T-Shirt Size as radio with 7 options including Other', () => {
    const mount = renderSpec('women');
    const radios = mount.querySelectorAll('input[name="shirt_size"]');
    expect(radios.length).toBe(7);
    const values = [...radios].map(r => r.value);
    expect(values).toContain('Other');
    expect(values).toContain('Small');
    expect(values).toContain('XX-Large');
  });

  it('renders sandwich_preference dropdown with 6 options', () => {
    const mount = renderSpec('women');
    const sandwichSel = [...mount.querySelectorAll('select')].find(s => s.name === 'sandwich_preference');
    expect(sandwichSel).toBeTruthy();
    const opts = [...sandwichSel.querySelectorAll('option')].map(o => o.value).filter(Boolean);
    expect(opts.length).toBe(6);
    expect(opts[0]).toBe('Ham/bun');
  });

  it('input names use friendly backend names', () => {
    const mount = renderSpec('women');
    const allNames = [...mount.querySelectorAll('[name]')].map(n => n.getAttribute('name'));
    expect(allNames.some(n => n.startsWith('entry.'))).toBe(false);
    expect(allNames).toContain('email');
    expect(allNames).toContain('email_confirm');
    expect(allNames).toContain('prior_attendance');
    expect(allNames).toContain('zip');
    expect(allNames).toContain('sandwich_preference');
  });
});

describe('closed specs render closed notice (menServer original / womenServer)', () => {
  beforeEach(() => { loadSrc(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('womenServer renders closed notice, not a form', () => {
    const mount = renderSpec('womenServer');
    expect(mount.querySelector('form')).toBeNull();
    expect(mount.querySelector('.nwks-form--closed')).toBeTruthy();
    expect(mount.querySelector('.nwks-form__closed-msg').textContent).toContain('currently full');
  });
});

// ---------------------------------------------------------------------------
// Submit wiring: menAttendee POSTs JSON to /api/register/mens/attendee
// ---------------------------------------------------------------------------
describe('menAttendee submit → POST JSON to /api/register/mens/attendee', () => {
  let mount;

  beforeEach(() => {
    loadSrc();
    mount = renderSpec('menAttendee');
    document.body.appendChild(mount);
    // jsdom native checkValidity blocks on required-but-empty fields; bypass it
    // so we can test submit logic without filling every required field.
    const form = mount.querySelector('form');
    if (form) {
      vi.spyOn(form, 'checkValidity').mockReturnValue(true);
      vi.spyOn(form, 'reportValidity').mockReturnValue(true);
    }
  });

  afterEach(() => {
    document.body.removeChild(mount);
    vi.restoreAllMocks();
  });

  function fillMinimumFields() {
    mount.querySelector('[name="first_name"]').value = 'John';
    mount.querySelector('[name="last_name"]').value = 'Doe';
    mount.querySelector('[name="email"]').value = 'john@example.com';
    mount.querySelector('[name="phone"]').value = '(785) 555-0100';
    const phoneType = mount.querySelector('[name="phone_type"]');
    phoneType.value = 'Cell';
    mount.querySelector('[name="address"]').value = '123 Main St';
    mount.querySelector('[name="city"]').value = 'Hays';
    mount.querySelector('[name="state"]').value = 'KS';
    const launch = mount.querySelector('[name="launch_location"]');
    launch.value = 'Hays';
    const shirt = mount.querySelector('[name="shirt_size"]');
    shirt.value = 'L';
    mount.querySelector('[name="church"]').value = 'First Baptist';
    const times = mount.querySelector('[name="times_attended_self_report"]');
    times.value = 'This will be my first time!';
    mount.querySelector('[name="invited_by"]').value = 'A friend';
    mount.querySelector('[name="prayer_contact_name"]').value = 'Jane Doe';
    mount.querySelector('[name="prayer_contact_phone"]').value = '(785) 555-0101';
  }

  it('calls fetch with POST to /api/register/mens/attendee on valid submit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true })
    });
    global.fetch = fetchMock;

    fillMinimumFields();
    const form = mount.querySelector('form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 20));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/register/mens/attendee');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('sends friendly field names in JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true })
    });
    global.fetch = fetchMock;

    fillMinimumFields();
    mount.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 20));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.first_name).toBe('John');
    expect(body.last_name).toBe('Doe');
    expect(body.email).toBe('john@example.com');
    expect(body.launch_location).toBe('Hays');
    // must NOT have any entry.* keys
    expect(Object.keys(body).some(k => k.startsWith('entry.'))).toBe(false);
  });

  it('sends __TEST_BYPASS__ as cf_turnstile_response when no sitekey', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true })
    });
    global.fetch = fetchMock;

    fillMinimumFields();
    mount.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 20));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.cf_turnstile_response).toBe('__TEST_BYPASS__');
  });

  it('shows success message and resets form on {ok:true}', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true })
    });

    fillMinimumFields();
    mount.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 20));

    const status = mount.querySelector('.nwks-form__status');
    expect(status.className).toContain('success');
    expect(status.textContent).toContain('registered');
  });

  it('shows error message on {ok:false,error}', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: false, error: 'Registration is closed.' })
    });

    fillMinimumFields();
    mount.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 20));

    const status = mount.querySelector('.nwks-form__status');
    expect(status.className).toContain('error');
    expect(status.textContent).toContain('Registration is closed.');
  });

  it('shows network error and re-enables submit on fetch exception', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    fillMinimumFields();
    mount.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 20));

    const status = mount.querySelector('.nwks-form__status');
    expect(status.className).toContain('error');
    expect(status.textContent).toContain('wrong');
    const btn = mount.querySelector('.nwks-form__submit');
    expect(btn.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// women spec submits to /api/register/womens/attendee
// ---------------------------------------------------------------------------
describe('women submit → POST JSON to /api/register/womens/attendee', () => {
  let mount;

  beforeEach(() => {
    loadSrc();
    mount = renderSpec('women');
    document.body.appendChild(mount);
    // bypass native jsdom required-field validation
    const form = mount.querySelector('form');
    if (form) {
      vi.spyOn(form, 'checkValidity').mockReturnValue(true);
      vi.spyOn(form, 'reportValidity').mockReturnValue(true);
    }
  });

  afterEach(() => {
    document.body.removeChild(mount);
    vi.restoreAllMocks();
  });

  it('POSTs to /api/register/womens/attendee', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true })
    });
    global.fetch = fetchMock;

    // Fill phone fields so the 10-digit phone guard doesn't block submit
    const phoneEl = mount.querySelector('[name="phone"]');
    if (phoneEl) phoneEl.value = '(785) 555-0100';
    const prayerPhone = mount.querySelector('[name="prayer_contact_phone"]');
    if (prayerPhone) prayerPhone.value = '(785) 555-0200';

    mount.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 20));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/register/womens/attendee');
  });
});
