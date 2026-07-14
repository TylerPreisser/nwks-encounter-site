window.NWKS = window.NWKS || {};
NWKS.forms = NWKS.forms || {};

/* Owned by [forms builder].
   Contract: NWKS.forms.render(specKey, mountEl) — builds a themed native <form>
   from NWKS.forms.specs[specKey] (see src/content/forms.js) into mountEl, wires
   client-side required validation, and on submit POSTs directly to the Google
   Form's real formResponse endpoint with mode:'no-cors' (the response is opaque
   by design — Google Forms doesn't allow reading the result cross-origin, so we
   show an optimistic success message once the request is sent).
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

  function buildLabel(forId, text, required) {
    var label = el('label', { className: 'nwks-field__label', text: text + (required ? ' *' : '') });
    label.setAttribute('for', forId);
    return label;
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
    fs.appendChild(el('legend', { className: 'nwks-field__label', text: field.label + (field.required ? ' *' : '') }));
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
      input.value = isOtherOpt ? '__other_option__' : optLabel;
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
    if (spec.officialUrl) {
      var link = el('a', { className: 'nwks-form__fallback-link', text: 'Check the official Google form ↗' });
      link.href = spec.officialUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      notice.appendChild(link);
    }
    mountEl.appendChild(notice);
  }

  function buildFallbackLink(spec) {
    var p = el('p', { className: 'nwks-form__fallback' });
    p.appendChild(document.createTextNode('Prefer the official Google form? '));
    var link = el('a', { className: 'nwks-form__fallback-link', text: 'Open it here ↗' });
    link.href = spec.officialUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    p.appendChild(link);
    return p;
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
      submitBtn.disabled = true;
      statusEl.textContent = 'Submitting…';
      statusEl.className = 'nwks-form__status';
      fetch(spec.action, { method: 'POST', mode: 'no-cors', body: new FormData(form) })
        .then(function () {
          // no-cors -> opaque response; a resolved fetch is the best signal we get.
          statusEl.textContent = "Thanks — you're registered! (Google Forms doesn't let us confirm receipt directly, but your submission was sent.)";
          statusEl.className = 'nwks-form__status nwks-form__status--success';
          form.reset();
          submitBtn.disabled = false;
        })
        .catch(function () {
          statusEl.textContent = 'Something went wrong sending your registration — check your connection and try again, or use the official Google form link below.';
          statusEl.className = 'nwks-form__status nwks-form__status--error';
          submitBtn.disabled = false;
        });
    });

    mountEl.appendChild(form);
    mountEl.appendChild(buildFallbackLink(spec));
    mountEl.dataset.builtFor = specKey;
  };
})();
