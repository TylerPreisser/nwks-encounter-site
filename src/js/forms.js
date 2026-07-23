window.NWKS = window.NWKS || {};
NWKS.forms = NWKS.forms || {};

/* Owned by [forms builder].
   Contract: NWKS.forms.render(specKey, mountEl) — builds a themed native <form>
   from NWKS.forms.specs[specKey] (see src/content/forms.js) into mountEl, wires
   client-side required validation, and on submit POSTs JSON to the backend API:
     POST (NWKS_API_BASE) + '/api/register/' + spec.program + '/' + spec.role
   On {ok:true} shows a success message and resets the form.
   On {ok:false} shows the returned error inline (real validation feedback).
   Idempotent per mountEl: re-render calls after the first are no-ops. */
(function () {
  'use strict';

  function el(tag, opts) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.className) node.className = opts.className;
    if (opts.text) node.textContent = opts.text;
    return node;
  }

  function fieldBaseId(specKey, idx) {
    return 'nf-' + specKey + '-' + idx;
  }

  function buildHelp(id, text) {
    var p = el('p', { className: 'nwks-field__help', text: text });
    p.id = id;
    return p;
  }

  function appendRequiredMark(labelEl) {
    labelEl.appendChild(el('span', { className: 'nwks-field__required', text: ' *' }));
  }

  function buildLabel(forId, text, required) {
    var label = el('label', { className: 'nwks-field__label' });
    label.appendChild(document.createTextNode(text));
    if (required) appendRequiredMark(label);
    label.setAttribute('for', forId);
    return label;
  }

  // Format raw input into a pretty US phone number as the user types: (785) 123-4567.
  function formatPhone(v) {
    var d = (v || '').replace(/\D/g, '').slice(0, 10);
    if (d.length > 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
    if (d.length > 3) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    if (d.length > 0) return '(' + d;
    return '';
  }

  function buildTextField(container, specKey, field, idx) {
    var id = fieldBaseId(specKey, idx);
    var wrap = el('div', { className: 'nwks-field' });
    wrap.appendChild(buildLabel(id, field.label, field.required));
    var input = field.type === 'textarea' ? el('textarea', { className: 'nwks-field__input nwks-field__input--area' })
      : el('input', { className: 'nwks-field__input' });
    if (field.type === 'textarea') { input.rows = 4; }
    else { input.type = field.type === 'date' ? 'date' : 'text'; }
    input.id = id;
    input.name = field.name;
    if (field.required) input.required = true;
    // Cross-field "must match another field" (e.g. Confirm Email) — validated on submit.
    if (field.matchField) {
      input.dataset.matchField = field.matchField;
      if (field.matchLabel) input.dataset.matchLabel = field.matchLabel;
    }
    // Backward-compat: also honour legacy matchName attribute written by older spec versions.
    if (field.matchName && !field.matchField) {
      input.dataset.matchField = field.matchName;
      if (field.matchLabel) input.dataset.matchLabel = field.matchLabel;
    }
    // Phone: tel keypad + live (785) 123-4567 formatting; 10-digit check on submit.
    if (field.format === 'phone') {
      input.type = 'tel';
      input.setAttribute('inputmode', 'tel');
      input.setAttribute('autocomplete', 'tel');
      input.setAttribute('maxlength', '14');
      input.placeholder = '(785) 123-4567';
      input.dataset.phone = '1';
      input.addEventListener('input', function () { input.value = formatPhone(input.value); });
    }
    if (field.help) {
      var helpId = id + '-help';
      input.setAttribute('aria-describedby', helpId);
      wrap.appendChild(input);
      wrap.appendChild(buildHelp(helpId, field.help));
    } else {
      wrap.appendChild(input);
    }
    container.appendChild(wrap);
  }

  function buildSelectField(container, specKey, field, idx) {
    var id = fieldBaseId(specKey, idx);
    var wrap = el('div', { className: 'nwks-field' });
    wrap.appendChild(buildLabel(id, field.label, field.required));
    var select = el('select', { className: 'nwks-field__input nwks-field__input--select' });
    select.id = id;
    select.name = field.name;
    if (field.required) select.required = true;
    var blank = el('option', { text: 'Select…' });
    blank.value = '';
    select.appendChild(blank);
    (field.options || []).forEach(function (optLabel) {
      var opt = el('option', { text: optLabel });
      opt.value = optLabel;
      select.appendChild(opt);
    });
    wrap.appendChild(select);
    if (field.help) wrap.appendChild(buildHelp(id + '-help', field.help));
    container.appendChild(wrap);
  }

  function buildChoiceField(container, specKey, field, idx) {
    var isCheckbox = field.type === 'checkbox';
    var fs = el('fieldset', { className: 'nwks-field nwks-field--choice' });
    var legend = el('legend', { className: 'nwks-field__label' });
    legend.appendChild(document.createTextNode(field.label));
    if (field.required) appendRequiredMark(legend);
    fs.appendChild(legend);
    if (field.help) fs.appendChild(buildHelp(fieldBaseId(specKey, idx) + '-help', field.help));
    var optsWrap = el('div', { className: 'nwks-field__options' });
    var otherInput = null;
    (field.options || []).forEach(function (optLabel, optIdx) {
      var optId = fieldBaseId(specKey, idx) + '-o' + optIdx;
      var row = el('div', { className: 'nwks-option' });
      var input = el('input', { className: 'nwks-option__input' });
      input.type = isCheckbox ? 'checkbox' : 'radio';
      input.id = optId;
      input.name = field.name;
      var isOtherOpt = !!field.otherEntry && optLabel === 'Other';
      input.value = optLabel;  // always send the real label; backend reads it as-is
      if (field.required) input.required = true;
      row.appendChild(input);
      var lab = el('label', { className: 'nwks-option__label', text: optLabel });
      lab.setAttribute('for', optId);
      row.appendChild(lab);
      if (isOtherOpt) {
        otherInput = el('input', { className: 'nwks-option__other-input' });
        otherInput.type = 'text';
        otherInput.name = field.otherEntry;
        otherInput.disabled = true;
        otherInput.setAttribute('aria-label', field.label + ' — please specify');
        row.appendChild(otherInput);
      }
      input.addEventListener('change', function () {
        if (!otherInput) return;
        otherInput.disabled = !isOtherOpt;
        if (isOtherOpt) otherInput.focus();
      });
      optsWrap.appendChild(row);
    });
    fs.appendChild(optsWrap);
    container.appendChild(fs);
  }

  function buildClosedNotice(mountEl, spec) {
    var notice = el('div', { className: 'nwks-form nwks-form--closed' });
    notice.appendChild(el('p', { className: 'nwks-form__closed-msg',
      text: spec.closedMessage || 'This registration form is currently closed.' }));
    mountEl.appendChild(notice);
  }

  // Collect all field values from the form as a plain JS object { name: value }.
  // checkbox fields: collect all checked values as a JSON-stringified array.
  // radio fields: the checked value string.
  // text/textarea/dropdown: trimmed string value.
  // Fields with matchField (e.g. email_confirm) are included but backend ignores them
  // (skipPersist on the server); we still send them so the backend can echo errors if needed.
  function collectPayload(form, fields) {
    var payload = {};
    fields.forEach(function (field) {
      if (field.type === 'radio') {
        var checked = form.querySelector('input[name="' + field.name + '"]:checked');
        // When the user selected "Other" and typed a free-text override, use that text.
        if (checked && checked.value === 'Other' && field.otherEntry) {
          var otherEl = form.querySelector('[name="' + field.otherEntry + '"]');
          payload[field.name] = (otherEl && otherEl.value.trim()) ? otherEl.value.trim() : 'Other';
        } else {
          payload[field.name] = checked ? checked.value : '';
        }
      } else if (field.type === 'checkbox') {
        var checkeds = Array.prototype.slice.call(
          form.querySelectorAll('input[name="' + field.name + '"]:checked'));
        payload[field.name] = JSON.stringify(checkeds.map(function (c) { return c.value; }));
      } else {
        var inputEl = form.querySelector('[name="' + field.name + '"]');
        payload[field.name] = inputEl ? inputEl.value.trim() : '';
      }
    });
    return payload;
  }

  NWKS.forms.render = function (specKey, mountEl) {
    if (!mountEl) return;
    var spec = NWKS.forms.specs && NWKS.forms.specs[specKey];
    if (!spec) return;

    // Idempotent: don't rebuild an already-built mount for this spec.
    if (mountEl.dataset.builtFor === specKey) return;

    mountEl.innerHTML = '';
    mountEl.className = 'nwks-form-mount';

    if (spec.closed || !spec.fields || !spec.fields.length) {
      buildClosedNotice(mountEl, spec);
      mountEl.dataset.builtFor = specKey;
      return;
    }

    var form = el('form', { className: 'nwks-form' });

    spec.fields.forEach(function (field, idx) {
      if (field.type === 'radio' || field.type === 'checkbox') buildChoiceField(form, specKey, field, idx);
      else if (field.type === 'dropdown') buildSelectField(form, specKey, field, idx);
      else buildTextField(form, specKey, field, idx);
    });

    // Turnstile widget — rendered when NWKS_TURNSTILE_SITEKEY is set.
    var turnstileToken = '__TEST_BYPASS__';
    var sitekey = (typeof window !== 'undefined' && window.NWKS_TURNSTILE_SITEKEY) || '';
    if (sitekey) {
      var tsDiv = el('div', { className: 'cf-turnstile' });
      tsDiv.dataset.sitekey = sitekey;
      tsDiv.dataset.theme = 'dark';
      tsDiv.dataset.callback = '__nwks_turnstile_cb_' + specKey;
      window['__nwks_turnstile_cb_' + specKey] = function (token) { turnstileToken = token; };
      // Load Turnstile script once
      if (!document.querySelector('script[src*="turnstile"]')) {
        var ts = document.createElement('script');
        ts.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        ts.async = true;
        document.head.appendChild(ts);
      }
      form.appendChild(tsDiv);
    }

    var statusEl = el('p', { className: 'nwks-form__status' });
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');

    var submitBtn = el('button', { className: 'nwks-form__submit', text: 'Submit Registration' });
    submitBtn.type = 'submit';

    form.appendChild(submitBtn);
    form.appendChild(statusEl);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        statusEl.textContent = 'Please fill in all required fields.';
        statusEl.className = 'nwks-form__status nwks-form__status--error';
        return;
      }
      // Cross-field match check (e.g. Confirm Email must equal Email).
      var mismatch = null;
      Array.prototype.forEach.call(form.querySelectorAll('[data-match-field]'), function (inp) {
        if (mismatch) return;
        var target = form.querySelector('[name="' + inp.dataset.matchField + '"]');
        if (target && inp.value !== target.value) mismatch = inp;
      });
      if (mismatch) {
        var what = mismatch.dataset.matchLabel || 'those entries';
        statusEl.textContent = 'The ' + what + ' fields don’t match — please check and try again.';
        statusEl.className = 'nwks-form__status nwks-form__status--error';
        mismatch.focus();
        return;
      }
      // Phone fields must be a full 10-digit number (submitted as the pretty format).
      var badPhone = null;
      Array.prototype.forEach.call(form.querySelectorAll('[data-phone]'), function (inp) {
        if (badPhone) return;
        if (inp.value.replace(/\D/g, '').length !== 10) badPhone = inp;
      });
      if (badPhone) {
        statusEl.textContent = 'Please enter a valid 10-digit phone number.';
        statusEl.className = 'nwks-form__status nwks-form__status--error';
        badPhone.focus();
        return;
      }

      submitBtn.disabled = true;
      statusEl.textContent = 'Submitting…';
      statusEl.className = 'nwks-form__status';

      var apiBase = (typeof window !== 'undefined' && window.NWKS_API_BASE) || '';
      var url = apiBase + '/api/register/' + spec.program + '/' + spec.role;
      var payload = collectPayload(form, spec.fields);
      payload.cf_turnstile_response = turnstileToken;

      fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.ok) {
            statusEl.textContent = "You're registered! We'll be in touch with details. Thank you!";
            statusEl.className = 'nwks-form__status nwks-form__status--success';
            form.reset();
            submitBtn.disabled = false;
          } else {
            var errMsg = (data.errors && data.errors.join(' ')) || data.error || 'Registration failed. Please try again.';
            statusEl.textContent = errMsg;
            statusEl.className = 'nwks-form__status nwks-form__status--error';
            submitBtn.disabled = false;
          }
        })
        .catch(function () {
          statusEl.textContent = 'Something went wrong sending your registration — check your connection and try again.';
          statusEl.className = 'nwks-form__status nwks-form__status--error';
          submitBtn.disabled = false;
        });
    });

    mountEl.appendChild(form);
    mountEl.dataset.builtFor = specKey;
  };
})();
