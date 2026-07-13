window.NWKS = window.NWKS || {};

/* Owned by worlds-coder.
   Contract: NWKS.worlds = { render(door), close(door) }
   - render(door): builds DOM into #world-<door> from NWKS.content[door], includes a back control.
   - close(door): tears down / hides the world (called on browser Back / popstate).

   Content block shapes accepted inside section.blocks[] (see src/content/*.js):
     - a plain string           -> paragraph
     - { list: [...] }          -> bullet list
     - { link: { label, href } } -> inline call-to-action link (opens in a new tab) */
(function () {
  'use strict';

  function el(tag, opts) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.className) node.className = opts.className;
    if (opts.text) node.textContent = opts.text;
    return node;
  }

  function externalLink(text, href) {
    var a = el('a', { text: text });
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  function renderBlock(container, block) {
    if (typeof block === 'string') {
      container.appendChild(el('p', { className: 'world-p', text: block }));
      return;
    }
    if (block && block.list) {
      var ul = el('ul', { className: 'world-list' });
      block.list.forEach(function (item) {
        ul.appendChild(el('li', { text: item }));
      });
      container.appendChild(ul);
      return;
    }
    if (block && block.link) {
      var p = el('p', { className: 'world-p world-p--link' });
      p.appendChild(externalLink(block.link.label, block.link.href));
      container.appendChild(p);
    }
  }

  function renderContact(list, contact) {
    var row = el('li', { className: 'world-contact' });
    row.appendChild(el('span', { className: 'world-contact__name', text: contact.name || '' }));
    if (contact.phone) {
      var tel = el('a', { className: 'world-contact__link', text: contact.phone });
      tel.href = 'tel:' + contact.phone.replace(/[^0-9+]/g, '');
      row.appendChild(tel);
    }
    if (contact.email) {
      var mail = el('a', { className: 'world-contact__link', text: contact.email });
      mail.href = 'mailto:' + contact.email;
      row.appendChild(mail);
    }
    list.appendChild(row);
  }

  function registerNav(content, extraClass) {
    var nav = el('nav', { className: 'world-register' + (extraClass ? ' ' + extraClass : '') });
    (content.register || []).forEach(function (r) {
      nav.appendChild(externalLink(r.label, r.href));
      nav.lastChild.className = 'world-register__btn';
    });
    return nav;
  }

  NWKS.worlds = {
    render: function (door) {
      var worldEl = document.getElementById('world-' + door);
      if (!worldEl) return;
      var content = (NWKS.content && NWKS.content[door]) || {};

      // Idempotent: this door's world was already built for this content — just show it.
      if (worldEl.dataset.builtFor === door) {
        worldEl.hidden = false;
        return;
      }

      worldEl.innerHTML = '';
      worldEl.className = 'world world--' + door;

      // ---- sticky header: event name + back control ----
      var header = el('header', { className: 'world-header' });
      var back = el('button', { className: 'world-back', text: '← Back to gateway' });
      back.type = 'button';
      back.setAttribute('data-back', door);
      header.appendChild(back);
      header.appendChild(el('div', { className: 'world-header__name', text: content.eventName || door }));
      worldEl.appendChild(header);

      // ---- hero: logo, title, tagline, dates, primary Register CTA ----
      var hero = el('section', { className: 'world-hero' });
      var logo = el('div', { className: 'world-hero__logo world-hero__logo--' + door });
      logo.setAttribute('role', 'img');
      logo.setAttribute('aria-label', content.eventName || door);
      hero.appendChild(logo);
      hero.appendChild(el('h1', { className: 'world-hero__title', text: content.eventName || '' }));
      if (content.tagline) {
        hero.appendChild(el('p', { className: 'world-hero__tagline', text: content.tagline }));
      }
      if (content.dates) {
        hero.appendChild(el('p', { className: 'world-hero__dates', text: content.dates }));
      }
      if (content.register && content.register.length) {
        var cta = externalLink(content.register[0].label, content.register[0].href);
        cta.className = 'world-cta';
        hero.appendChild(cta);
      }
      worldEl.appendChild(hero);

      // ---- body: What is… / Pre-Encounter / Weekend, then Cost, What to Bring, Contacts ----
      var body = el('div', { className: 'world-body' });

      (content.sections || []).forEach(function (section) {
        var sec = el('section', { className: 'world-section' });
        if (section.id) sec.id = section.id;
        sec.appendChild(el('h2', { className: 'world-section__title', text: section.title || '' }));
        (section.blocks || []).forEach(function (block) { renderBlock(sec, block); });
        body.appendChild(sec);
      });

      if (content.cost) {
        var costSec = el('section', { className: 'world-section world-section--cost' });
        costSec.id = 'cost';
        costSec.appendChild(el('h2', { className: 'world-section__title', text: 'Cost' }));
        costSec.appendChild(el('p', { className: 'world-p', text: content.cost }));
        body.appendChild(costSec);
      }

      if (content.bring && content.bring.length) {
        var bringSec = el('section', { className: 'world-section world-section--bring' });
        bringSec.id = 'bring';
        bringSec.appendChild(el('h2', { className: 'world-section__title', text: 'What to Bring' }));
        var bringList = el('ul', { className: 'world-list world-list--bring' });
        content.bring.forEach(function (item) { bringList.appendChild(el('li', { text: item })); });
        bringSec.appendChild(bringList);
        body.appendChild(bringSec);
      }

      if (content.contacts && content.contacts.length) {
        var contactSec = el('section', { className: 'world-section world-section--contacts' });
        contactSec.id = 'contacts';
        contactSec.appendChild(el('h2', { className: 'world-section__title', text: 'Contacts' }));
        var contactList = el('ul', { className: 'world-contacts' });
        content.contacts.forEach(function (c) { renderContact(contactList, c); });
        contactSec.appendChild(contactList);
        body.appendChild(contactSec);
      }

      worldEl.appendChild(body);

      // ---- Register block (full list, in case the hero CTA is missed) ----
      if (content.register && content.register.length) {
        var registerSec = el('section', { className: 'world-section world-section--register' });
        registerSec.id = 'register';
        registerSec.appendChild(el('h2', { className: 'world-section__title', text: 'Register' }));
        registerSec.appendChild(registerNav(content));
        worldEl.appendChild(registerSec);
      }

      if (content.verse) {
        var verseFooter = el('footer', { className: 'world-verse' });
        verseFooter.appendChild(el('p', { text: content.verse }));
        worldEl.appendChild(verseFooter);
      }

      worldEl.dataset.builtFor = door;
      worldEl.hidden = false;
    },

    close: function (door) {
      var worldEl = document.getElementById('world-' + door);
      if (worldEl) worldEl.hidden = true;
      var stage = document.getElementById('stage');
      if (stage) stage.classList.remove('world-open');
    }
  };
})();
