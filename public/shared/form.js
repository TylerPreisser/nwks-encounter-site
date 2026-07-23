// public/shared/form.js — NWKS Encounter native form renderer + submission
// Vanilla JS; no dependencies; loaded as a plain <script> tag.
// Usage: call NWKS_FORM.init(config) where config = { program, role, fields, turnstileSiteKey }

window.NWKS_FORM = (() => {
  // ── Phone formatting ─────────────────────────────────────────────────────
  function formatPhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length <= 3)  return digits;
    if (digits.length <= 6)  return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6,10)}`;
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ── Field renderer ───────────────────────────────────────────────────────
  function renderField(spec, container) {
    const group = document.createElement('div');
    group.className = 'field-group';
    group.dataset.fieldName = spec.name;

    const labelEl = document.createElement('label');
    labelEl.setAttribute('for', `field-${spec.name}`);
    labelEl.textContent = spec.label;
    if (spec.required) {
      const req = document.createElement('span');
      req.className = 'required';
      req.textContent = ' *';
      req.setAttribute('aria-label', 'required');
      labelEl.appendChild(req);
    }
    group.appendChild(labelEl);

    if (spec.help) {
      const help = document.createElement('p');
      help.className = 'field-help';
      help.textContent = spec.help;
      group.appendChild(help);
    }

    let inputEl = null;

    if (spec.type === 'dropdown') {
      const sel = document.createElement('select');
      sel.id = `field-${spec.name}`;
      sel.name = spec.name;
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = `— Select ${spec.label} —`;
      placeholder.disabled = true;
      placeholder.selected = true;
      sel.appendChild(placeholder);
      (spec.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      });
      group.appendChild(sel);
      inputEl = sel;
    } else if (spec.type === 'radio') {
      const radioGroup = document.createElement('div');
      radioGroup.className = 'radio-group';
      radioGroup.setAttribute('role', 'radiogroup');
      radioGroup.setAttribute('aria-labelledby', `field-${spec.name}-label`);
      labelEl.id = `field-${spec.name}-label`;
      (spec.options || []).forEach((opt, i) => {
        const optId = `field-${spec.name}-${i}`;
        const wrapper = document.createElement('label');
        wrapper.setAttribute('for', optId);
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.id = optId;
        radio.name = spec.name;
        radio.value = opt;
        wrapper.appendChild(radio);
        wrapper.appendChild(document.createTextNode(opt));
        radioGroup.appendChild(wrapper);
      });
      group.appendChild(radioGroup);
      inputEl = radioGroup; // for validation traversal
    } else if (spec.type === 'checkbox') {
      const cbGroup = document.createElement('div');
      cbGroup.className = 'checkbox-group';
      cbGroup.setAttribute('role', 'group');
      cbGroup.setAttribute('aria-labelledby', `field-${spec.name}-label`);
      labelEl.id = `field-${spec.name}-label`;
      (spec.options || []).forEach((opt, i) => {
        const optId = `field-${spec.name}-${i}`;
        const wrapper = document.createElement('label');
        wrapper.setAttribute('for', optId);
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = optId;
        cb.name = spec.name;
        cb.value = opt;
        wrapper.appendChild(cb);
        wrapper.appendChild(document.createTextNode(opt));
        cbGroup.appendChild(wrapper);
      });
      group.appendChild(cbGroup);
      inputEl = cbGroup;
    } else if (spec.type === 'textarea') {
      const ta = document.createElement('textarea');
      ta.id = `field-${spec.name}`;
      ta.name = spec.name;
      ta.rows = 4;
      group.appendChild(ta);
      inputEl = ta;
    } else {
      // text / email
      const inp = document.createElement('input');
      inp.type = spec.format === 'email' ? 'email' : 'text';
      inp.id = `field-${spec.name}`;
      inp.name = spec.name;
      inp.autocomplete = spec.name === 'email' || spec.name === 'email_confirm' ? 'email'
                       : spec.format === 'phone' ? 'tel' : 'on';
      if (spec.format === 'phone') {
        inp.inputMode = 'tel';
        inp.placeholder = '(785) 555-0100';
        inp.addEventListener('input', () => {
          inp.value = formatPhone(inp.value);
        });
        const hint = document.createElement('p');
        hint.className = 'phone-hint';
        hint.textContent = 'Format: (555) 555-5555';
        const phoneErr = document.createElement('p');
        phoneErr.className = 'field-error';
        phoneErr.setAttribute('aria-live', 'polite');
        group.appendChild(inp);
        group.appendChild(hint);
        group.appendChild(phoneErr);
        inputEl = inp;
        container.appendChild(group);
        return;  // early return — hint already appended
      }
      group.appendChild(inp);
      inputEl = inp;
    }

    // Error placeholder
    const errEl = document.createElement('p');
    errEl.className = 'field-error';
    errEl.setAttribute('aria-live', 'polite');
    group.appendChild(errEl);

    container.appendChild(group);
  }

  // ── Value extraction ─────────────────────────────────────────────────────
  function getFieldValue(form, spec) {
    if (spec.type === 'radio') {
      const checked = form.querySelector(`input[name="${spec.name}"]:checked`);
      return checked ? checked.value : '';
    }
    if (spec.type === 'checkbox') {
      const checked = [...form.querySelectorAll(`input[name="${spec.name}"]:checked`)];
      return JSON.stringify(checked.map(c => c.value));
    }
    const el = form.querySelector(`[name="${spec.name}"]`);
    return el ? el.value.trim() : '';
  }

  // ── Client-side validation ───────────────────────────────────────────────
  function validateForm(form, fields) {
    let valid = true;
    // Clear previous errors
    form.querySelectorAll('.field-error').forEach(el => { el.textContent = ''; });
    form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));

    const values = {};
    for (const spec of fields) {
      const val = getFieldValue(form, spec);
      values[spec.name] = val;

      const group = form.querySelector(`[data-field-name="${spec.name}"]`);
      const errEl = group ? group.querySelector('.field-error') : null;

      function fieldError(msg) {
        valid = false;
        if (errEl) errEl.textContent = msg;
        const inp = group ? group.querySelector('input,select,textarea') : null;
        if (inp) inp.classList.add('invalid');
      }

      if (spec.required && (!val || val === '[]' || val === '')) {
        fieldError(`${spec.label} is required.`);
        continue;
      }
      if (!val) continue;  // optional and empty

      if (spec.format === 'email' && !EMAIL_RE.test(val)) {
        fieldError('Please enter a valid email address.');
        continue;
      }
      if (spec.matchField) {
        const matchVal = values[spec.matchField] ?? '';
        if (val.toLowerCase() !== matchVal.toLowerCase()) {
          fieldError('Email addresses do not match.');
          continue;
        }
      }
      if (spec.format === 'phone') {
        const digits = val.replace(/\D/g, '');
        if (digits.length < 10) {
          fieldError('Please enter a 10-digit US phone number.');
          continue;
        }
      }
      if (spec.options && spec.type === 'dropdown' && !spec.options.includes(val)) {
        fieldError('Please select a valid option.');
      }
    }
    return { valid, values };
  }

  // ── Main init ─────────────────────────────────────────────────────────────
  function init(config) {
    // config: { program, role, fields, turnstileSiteKey }
    const formEl = document.getElementById('registration-form');
    const fieldsContainer = document.getElementById('form-fields');
    const statusEl = document.getElementById('form-status');
    const submitBtn = document.getElementById('btn-submit');
    if (!formEl || !fieldsContainer || !statusEl || !submitBtn) {
      console.error('NWKS_FORM.init: required DOM elements not found.');
      return;
    }

    // Render fields
    (config.fields || []).forEach(spec => renderField(spec, fieldsContainer));

    // Turnstile widget container (injected after the fields)
    let turnstileToken = '__TEST_BYPASS__';  // default for dev/no-sitekey
    if (config.turnstileSiteKey) {
      const tsDiv = document.createElement('div');
      tsDiv.className = 'cf-turnstile';
      tsDiv.dataset.sitekey = config.turnstileSiteKey;
      tsDiv.dataset.theme = 'dark';
      tsDiv.dataset.callback = '__nwks_turnstile_cb';
      fieldsContainer.appendChild(tsDiv);
      window.__nwks_turnstile_cb = (token) => { turnstileToken = token; };
      // Load Turnstile script if not already present
      if (!document.querySelector('script[src*="turnstile"]')) {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        s.async = true;
        document.head.appendChild(s);
      }
    }

    function showStatus(msg, type) {
      statusEl.textContent = msg;
      statusEl.className = `form-status visible ${type}`;
      statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { valid, values } = validateForm(formEl, config.fields || []);
      if (!valid) {
        showStatus('Please fix the errors above before submitting.', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      statusEl.className = 'form-status';

      const payload = { ...values, cf_turnstile_response: turnstileToken };

      try {
        const res = await fetch(`/api/register/${config.program}/${config.role}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.ok) {
          // Redirect to thanks page
          window.location.href = `/thanks.html?program=${encodeURIComponent(config.program)}`;
        } else {
          showStatus(data.error || 'Registration failed. Please try again.', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Register';
        }
      } catch (err) {
        showStatus('Network error. Please check your connection and try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register';
      }
    });
  }

  return { init };
})();
