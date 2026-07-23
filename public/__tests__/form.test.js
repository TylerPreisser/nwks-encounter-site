// public/__tests__/form.test.js
// jsdom tests for public/shared/form.js
// Run via: npm run test:admin  (vitest + jsdom)

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// jsdom doesn't implement scrollIntoView; stub it globally
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

// Load form.js source and evaluate it in the jsdom window context
const formSrc = readFileSync(join(__dirname, '../shared/form.js'), 'utf8');

function loadFormJS() {
  // form.js uses window.NWKS_FORM = ...; eval in global scope makes it available
  // eslint-disable-next-line no-eval
  const fn = new Function(formSrc);
  fn();
}

// Minimal field specs for testing
const TEXT_FIELD = { name: 'first_name', label: 'First Name', type: 'text', required: true };
const EMAIL_FIELD = { name: 'email', label: 'Email Address', type: 'text', required: true, format: 'email' };
const PHONE_FIELD = { name: 'phone', label: 'Phone Number', type: 'text', required: true, format: 'phone' };
const DROPDOWN_FIELD = { name: 'shirt_size', label: 'Shirt Size', type: 'dropdown', required: true, options: ['S', 'M', 'L'] };
const RADIO_FIELD = { name: 'size_radio', label: 'Size', type: 'radio', required: true, options: ['Small', 'Large'] };
const CHECKBOX_FIELD = { name: 'days', label: 'Days', type: 'checkbox', required: false, options: ['Saturday', 'Sunday'] };
const TEXTAREA_FIELD = { name: 'questions', label: 'Questions', type: 'textarea', required: false };
const EMAIL_CONFIRM = { name: 'email_confirm', label: 'Confirm Email', type: 'text', required: true, matchField: 'email', format: 'email' };

const ALL_FIELD_TYPES = [
  TEXT_FIELD,
  EMAIL_FIELD,
  PHONE_FIELD,
  DROPDOWN_FIELD,
  RADIO_FIELD,
  CHECKBOX_FIELD,
  TEXTAREA_FIELD,
];

function buildDOM() {
  document.body.innerHTML = `
    <form id="registration-form">
      <div id="form-fields"></div>
      <p id="form-status"></p>
      <button id="btn-submit" type="submit">Register</button>
    </form>
  `;
}

function initForm(fields = [TEXT_FIELD], extra = {}) {
  loadFormJS();
  window.NWKS_FORM.init({ program: 'mens', role: 'attendee', fields, ...extra });
}

describe('NWKS_FORM — field rendering', () => {
  beforeEach(() => {
    buildDOM();
  });

  afterEach(() => {
    delete window.NWKS_FORM;
    vi.restoreAllMocks();
  });

  it('renders a text field with correct id and label', () => {
    initForm([TEXT_FIELD]);
    expect(document.getElementById('field-first_name')).toBeTruthy();
    expect(document.querySelector('label[for="field-first_name"]')?.textContent).toContain('First Name');
  });

  it('renders required marker (*) for required fields', () => {
    initForm([TEXT_FIELD]);
    const req = document.querySelector('.required');
    expect(req).toBeTruthy();
    expect(req?.textContent?.trim()).toBe('*');
  });

  it('renders a select/dropdown field with placeholder and options', () => {
    initForm([DROPDOWN_FIELD]);
    const sel = document.getElementById('field-shirt_size');
    expect(sel?.tagName).toBe('SELECT');
    const options = [...(sel?.querySelectorAll('option') || [])];
    expect(options.length).toBe(4); // placeholder + 3 options
    expect(options[0].textContent).toContain('Select');
    expect(options[0].disabled).toBe(true);
    expect(options.map(o => o.value)).toContain('M');
  });

  it('renders radio buttons for radio-type fields', () => {
    initForm([RADIO_FIELD]);
    const radios = document.querySelectorAll(`input[type="radio"][name="size_radio"]`);
    expect(radios.length).toBe(2);
    expect([...radios].map(r => r.value)).toEqual(['Small', 'Large']);
  });

  it('renders checkboxes for checkbox-type fields', () => {
    initForm([CHECKBOX_FIELD]);
    const cbs = document.querySelectorAll(`input[type="checkbox"][name="days"]`);
    expect(cbs.length).toBe(2);
    expect([...cbs].map(c => c.value)).toEqual(['Saturday', 'Sunday']);
  });

  it('renders a textarea for textarea-type fields', () => {
    initForm([TEXTAREA_FIELD]);
    const ta = document.getElementById('field-questions');
    expect(ta?.tagName).toBe('TEXTAREA');
  });

  it('renders all fields in the spec (all types)', () => {
    initForm(ALL_FIELD_TYPES);
    const groups = document.querySelectorAll('.field-group');
    expect(groups.length).toBe(ALL_FIELD_TYPES.length);
  });

  it('renders phone hint paragraph for phone fields', () => {
    initForm([PHONE_FIELD]);
    const hint = document.querySelector('.phone-hint');
    expect(hint).toBeTruthy();
    expect(hint?.textContent).toContain('555');
  });

  it('renders help text when spec.help is set', () => {
    const fieldWithHelp = { ...TEXT_FIELD, help: 'Enter your given name.' };
    initForm([fieldWithHelp]);
    const help = document.querySelector('.field-help');
    expect(help?.textContent).toBe('Enter your given name.');
  });

  it('does NOT render required marker for optional fields', () => {
    initForm([TEXTAREA_FIELD]);
    const req = document.querySelector('.required');
    expect(req).toBeNull();
  });
});

describe('NWKS_FORM — phone formatting', () => {
  beforeEach(() => {
    buildDOM();
  });

  afterEach(() => {
    delete window.NWKS_FORM;
  });

  it('formats phone input live as user types digits', () => {
    initForm([PHONE_FIELD]);
    const inp = document.getElementById('field-phone');
    // Simulate typing 10 digits
    inp.value = '7855550100';
    inp.dispatchEvent(new Event('input'));
    expect(inp.value).toBe('(785) 555-0100');
  });

  it('formats partial phone (4 digits) correctly', () => {
    initForm([PHONE_FIELD]);
    const inp = document.getElementById('field-phone');
    inp.value = '7855';
    inp.dispatchEvent(new Event('input'));
    expect(inp.value).toBe('(785) 5');
  });

  it('strips non-digit characters before formatting', () => {
    initForm([PHONE_FIELD]);
    const inp = document.getElementById('field-phone');
    inp.value = '(785) 555-01abc00';
    inp.dispatchEvent(new Event('input'));
    expect(inp.value).toBe('(785) 555-0100');
  });
});

describe('NWKS_FORM — client-side validation', () => {
  beforeEach(() => {
    buildDOM();
  });

  afterEach(() => {
    delete window.NWKS_FORM;
    vi.restoreAllMocks();
  });

  it('blocks submit and shows error when required text field is empty', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    initForm([TEXT_FIELD]);

    const form = document.getElementById('registration-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 0));

    expect(fetchMock).not.toHaveBeenCalled();
    const errEl = document.querySelector('[data-field-name="first_name"] .field-error');
    expect(errEl?.textContent).toContain('required');
  });

  it('shows "invalid email" error for malformed email', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    initForm([EMAIL_FIELD]);

    document.getElementById('field-email').value = 'notanemail';
    document.getElementById('registration-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 0));

    expect(fetchMock).not.toHaveBeenCalled();
    const errEl = document.querySelector('[data-field-name="email"] .field-error');
    expect(errEl?.textContent).toContain('valid email');
  });

  it('shows phone error for fewer than 10 digits', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    initForm([PHONE_FIELD]);

    document.getElementById('field-phone').value = '(785) 555-010';
    document.getElementById('registration-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 0));

    expect(fetchMock).not.toHaveBeenCalled();
    const errEl = document.querySelector('[data-field-name="phone"] .field-error');
    expect(errEl?.textContent).toContain('10-digit');
  });

  it('shows email-match error when confirm does not match', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    initForm([EMAIL_FIELD, EMAIL_CONFIRM]);

    document.getElementById('field-email').value = 'a@b.com';
    document.getElementById('field-email_confirm').value = 'x@b.com';
    document.getElementById('registration-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 0));

    expect(fetchMock).not.toHaveBeenCalled();
    const errEl = document.querySelector('[data-field-name="email_confirm"] .field-error');
    expect(errEl?.textContent).toContain('match');
  });

  it('shows form-level status message on validation failure', async () => {
    global.fetch = vi.fn();
    initForm([TEXT_FIELD]);

    document.getElementById('registration-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 0));

    const status = document.getElementById('form-status');
    expect(status?.textContent).toContain('fix the errors');
    expect(status?.className).toContain('error');
  });
});

describe('NWKS_FORM — form submission', () => {
  let originalLocation;

  beforeEach(() => {
    buildDOM();
    // Save real location descriptor before any test may replace it
    originalLocation = Object.getOwnPropertyDescriptor(window, 'location');
  });

  afterEach(() => {
    delete window.NWKS_FORM;
    // Restore location if it was replaced
    if (originalLocation) {
      Object.defineProperty(window, 'location', originalLocation);
    } else {
      try { delete window.location; } catch (_) { /* noop */ }
    }
    vi.restoreAllMocks();
  });

  it('POSTs JSON to /api/register/:program/:role on valid submission', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
    });
    global.fetch = fetchMock;

    initForm([TEXT_FIELD]);
    document.getElementById('field-first_name').value = 'Jane';

    document.getElementById('registration-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/register/mens/attendee');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body);
    expect(body.first_name).toBe('Jane');
    expect(body.cf_turnstile_response).toBe('__TEST_BYPASS__');
  });

  it('redirects to /thanks.html on {ok:true} response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
    });
    global.fetch = fetchMock;

    // Spy on window.location.href setter
    const locationMock = { href: '' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      get: () => locationMock,
    });

    initForm([TEXT_FIELD]);
    document.getElementById('field-first_name').value = 'Jane';

    document.getElementById('registration-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 10));

    expect(locationMock.href).toContain('/thanks.html');
    expect(locationMock.href).toContain('program=mens');
  });

  it('shows API error message and does NOT redirect on {ok:false}', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: false, error: 'Duplicate registration' }),
    });
    global.fetch = fetchMock;

    // Reset location.href so we can detect redirect attempt
    const locationMock = { href: '' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      get: () => locationMock,
    });

    initForm([TEXT_FIELD]);
    document.getElementById('field-first_name').value = 'Jane';

    document.getElementById('registration-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 10));

    // No redirect
    expect(locationMock.href).toBe('');

    // Error shown in status
    const status = document.getElementById('form-status');
    expect(status?.textContent).toContain('Duplicate registration');
    expect(status?.className).toContain('error');

    // Submit button re-enabled
    const btn = document.getElementById('btn-submit');
    expect(btn?.disabled).toBe(false);
    expect(btn?.textContent).toBe('Register');
  });

  it('shows network error message on fetch exception', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const locationMock = { href: '' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      get: () => locationMock,
    });

    initForm([TEXT_FIELD]);
    document.getElementById('field-first_name').value = 'Jane';

    document.getElementById('registration-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 10));

    expect(locationMock.href).toBe('');
    const status = document.getElementById('form-status');
    expect(status?.textContent).toContain('Network error');

    const btn = document.getElementById('btn-submit');
    expect(btn?.disabled).toBe(false);
  });

  it('disables submit button while submitting', async () => {
    let resolveFetch;
    global.fetch = vi.fn().mockReturnValue(new Promise(r => { resolveFetch = r; }));

    initForm([TEXT_FIELD]);
    document.getElementById('field-first_name').value = 'Jane';

    document.getElementById('registration-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 0));

    const btn = document.getElementById('btn-submit');
    expect(btn?.disabled).toBe(true);
    expect(btn?.textContent).toContain('Submitting');

    // cleanup
    resolveFetch({ json: async () => ({ ok: false, error: 'x' }) });
    await new Promise(r => setTimeout(r, 10));
  });
});

describe('NWKS_FORM — Turnstile integration', () => {
  let originalLocation;

  beforeEach(() => {
    buildDOM();
    originalLocation = Object.getOwnPropertyDescriptor(window, 'location');
  });

  afterEach(() => {
    delete window.NWKS_FORM;
    delete window.__nwks_turnstile_cb;
    if (originalLocation) {
      Object.defineProperty(window, 'location', originalLocation);
    }
    vi.restoreAllMocks();
  });

  it('uses __TEST_BYPASS__ token when no sitekey provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    global.fetch = fetchMock;

    const locationMock = { href: '' };
    Object.defineProperty(window, 'location', { configurable: true, get: () => locationMock });

    initForm([TEXT_FIELD]);
    document.getElementById('field-first_name').value = 'Jane';

    document.getElementById('registration-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 10));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.cf_turnstile_response).toBe('__TEST_BYPASS__');
  });

  it('injects cf-turnstile div when sitekey is provided', () => {
    initForm([TEXT_FIELD], { turnstileSiteKey: 'test-key-123' });
    const tsDiv = document.querySelector('.cf-turnstile');
    expect(tsDiv).toBeTruthy();
    expect(tsDiv?.dataset.sitekey).toBe('test-key-123');
  });

  it('uses Turnstile token from callback when sitekey provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    global.fetch = fetchMock;

    const locationMock = { href: '' };
    Object.defineProperty(window, 'location', { configurable: true, get: () => locationMock });

    initForm([TEXT_FIELD], { turnstileSiteKey: 'test-key-123' });

    // Simulate Turnstile callback
    window.__nwks_turnstile_cb('real-token-abc');

    document.getElementById('field-first_name').value = 'Jane';
    document.getElementById('registration-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 10));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.cf_turnstile_response).toBe('real-token-abc');
  });
});
