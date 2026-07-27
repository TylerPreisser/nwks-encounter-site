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

  // ---- ambient background canvases (Task 1: men = warm embers/sparks drifting up,
  // women = baby-pink "pixie dust" drifting up). One <canvas> per door, position:fixed,
  // painted behind the world content (see .world-ambient in worlds.css — the canvas gets
  // a negative z-index inside the .world stacking context created via isolation:isolate,
  // so it sits above the flat world background but below all text/UI). Lifecycle is
  // independent of the idempotent content build: destroyed in close(), and (re)started at
  // the top of every render(door) call so it always matches the world that's open. ----
  var ambient = {};

  function rand(min, max) { return min + Math.random() * (max - min); }

  function ambientPalette(door) {
    return door === 'women'
      ? { fill: '255,190,212', glow: '255,170,200' }   // baby pink pixie dust
      : { fill: '255,189,92', glow: '255,140,40' };    // warm ember/spark
  }

  function makeAmbientParticle(door, w, h, seedAnywhere) {
    var women = door === 'women';
    return {
      x: rand(0, w),
      y: seedAnywhere ? rand(-0.05 * h, h) : (h + rand(4, 40)),
      r: women ? rand(1.6, 4.4) : rand(1.1, 3.4),
      speed: women ? rand(16, 40) : rand(30, 72),   // px/sec upward (embers faster)
      swayA: rand(6, 26),
      swayF: rand(0.4, 1.1),
      ph: rand(0, Math.PI * 2),
      flickF: women ? rand(2, 5) : rand(7, 15),      // flicker speed (embers flicker fast)
      flickPh: rand(0, Math.PI * 2),
      maxA: rand(0.55, 1.0),
      bright: Math.random() < (women ? 0.28 : 0.4)   // some burn brighter
    };
  }

  function startAmbient(worldEl, door) {
    stopAmbient(door);
    var probe = document.createElement('canvas');
    if (!probe.getContext) return; // no canvas support — skip silently, never block content

    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var canvas = el('canvas', { className: 'world-ambient' });
    canvas.setAttribute('aria-hidden', 'true');
    worldEl.insertBefore(canvas, worldEl.firstChild || null);

    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var palette = ambientPalette(door);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, particles = [], raf = null, lastT = null, lastPaintAt = null, watchdog = null, frameTime = 0;
    var alive = true;

    function targetCount() {
      var n = Math.round((w * h) / 11000);
      var cap = door === 'women' ? 74 : 56;
      return Math.max(30, Math.min(cap, n));
    }

    function seed() {
      var n = targetCount();
      particles = [];
      for (var i = 0; i < n; i++) particles.push(makeAmbientParticle(door, w, h, true));
    }

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function paint(staticFrame) {
      ctx.clearRect(0, 0, w, h);
      var men = door === 'men';
      ctx.globalCompositeOperation = men ? 'lighter' : 'source-over'; // embers glow additively on olive
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var flick = staticFrame ? 0.85 : (0.5 + 0.5 * Math.sin(frameTime * p.flickF + p.flickPh));
        var lifeTop = p.y < h * 0.16 ? Math.max(0, p.y / (h * 0.16)) : 1; // cool/fade near the top
        var a = p.maxA * flick * lifeTop * (p.bright ? 1 : 0.7);
        if (a <= 0.02) continue;
        var x = p.x + (staticFrame ? 0 : Math.sin(frameTime * p.swayF + p.ph) * p.swayA);
        var rad = p.r * (p.bright ? 3.4 : 2.7);
        var g = ctx.createRadialGradient(x, p.y, 0, x, p.y, rad);
        if (men) {
          g.addColorStop(0, 'rgba(255,246,214,' + a + ')');            // hot white-gold core
          g.addColorStop(0.3, 'rgba(255,150,48,' + (a * 0.8) + ')');   // orange
          g.addColorStop(1, 'rgba(255,88,18,0)');                      // red, transparent
        } else {
          g.addColorStop(0, 'rgba(255,255,255,' + a + ')');            // bright sparkle core
          g.addColorStop(0.32, 'rgba(244,140,192,' + (a * 0.85) + ')');// pink
          g.addColorStop(1, 'rgba(240,128,182,0)');
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, p.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function frame(t) {
      if (lastT == null) lastT = t;
      var dt = Math.min((t - lastT) / 1000, 0.05);
      lastT = t;
      frameTime += dt;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.y -= p.speed * dt;
        if (p.y < -p.r * 4) particles[i] = makeAmbientParticle(door, w, h, false);
      }
      paint(false);
      lastPaintAt = (window.performance && performance.now) ? performance.now() : Date.now();
      raf = requestAnimationFrame(frame);
    }

    var onResize = function () { resize(); if (reduced) paint(true); };
    resize();

    if (reduced) {
      paint(true); // one static, non-animated frame — no rAF loop, no watchdog needed
    } else {
      raf = requestAnimationFrame(frame);
      lastPaintAt = (window.performance && performance.now) ? performance.now() : Date.now();
      // Watchdog: the site's masked-swap transition harness (transition-core.js)
      // globally monkey-patches requestAnimationFrame/cancelAnimationFrame for the
      // duration of the enter/exit cover animation and cancels whatever frame is
      // still in flight when it settles — including this loop's pending frame, since
      // it's chained via the same global rAF. That silently kills the self-chaining
      // loop with no way for it to notice and restart itself. This interval checks
      // for a stall and re-arms the chain — cheap, and inert once the loop is healthy.
      watchdog = setInterval(function () {
        if (!alive) return;
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        if (lastPaintAt != null && (now - lastPaintAt) > 500) {
          lastT = null; // avoid a large dt jump on the resumed frame
          raf = requestAnimationFrame(frame);
        }
      }, 400);
    }
    window.addEventListener('resize', onResize);

    ambient[door] = {
      destroy: function () {
        alive = false;
        if (raf) cancelAnimationFrame(raf);
        if (watchdog) clearInterval(watchdog);
        window.removeEventListener('resize', onResize);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  function stopAmbient(door) {
    if (ambient[door]) {
      ambient[door].destroy();
      delete ambient[door];
    }
  }

  function registerNav(content, extraClass) {
    var nav = el('nav', { className: 'world-register' + (extraClass ? ' ' + extraClass : '') });
    (content.register || []).forEach(function (r) {
      nav.appendChild(externalLink(r.label, r.href));
      nav.lastChild.className = 'world-register__btn';
    });
    return nav;
  }

  // Full-screen register form page (Task: Register is its own page, not inline in
  // the world). Plain show/hide via [hidden] — never touches history; app.js owns
  // history/back for the gateway. Builds all native-form specs for this door up
  // front (idempotent, cheap) so opening any of them is instant.
  function buildFormPage(worldEl, door, specKeys) {
    var page = el('div', { className: 'world-formpage' });
    page.hidden = true;

    var header = el('div', { className: 'world-formpage__header' });
    var backLabel = door === 'men' ? "Men's Encounter" : "Women's Encounter";
    var back = el('button', { className: 'world-formpage__back', text: '← Back to ' + backLabel });
    back.type = 'button';
    back.addEventListener('click', function () { page.hidden = true; });
    header.appendChild(back);
    page.appendChild(header);

    var scroll = el('div', { className: 'world-formpage__scroll' });
    page.appendChild(scroll);

    var panels = {};
    specKeys.forEach(function (key) {
      var spec = NWKS.forms.specs && NWKS.forms.specs[key];
      if (!spec) return;
      var panel = el('div', { className: 'world-formpage__panel' });
      panel.hidden = true;
      panel.appendChild(el('h2', { className: 'world-formpage__title', text: spec.title || '' }));
      var mount = el('div', { className: 'world-register__form' });
      panel.appendChild(mount);
      NWKS.forms.render(key, mount);
      scroll.appendChild(panel);
      panels[key] = panel;
    });

    worldEl.appendChild(page);

    return {
      open: function (key) {
        if (!panels[key]) return;
        Object.keys(panels).forEach(function (k) { panels[k].hidden = (k !== key); });
        page.hidden = false;
        scroll.scrollTop = 0;
      }
    };
  }

  NWKS.worlds = {
    render: function (door) {
      var worldEl = document.getElementById('world-' + door);
      if (!worldEl) return;
      var content = (NWKS.content && NWKS.content[door]) || {};

      // Idempotent: already built for this content — nothing to rebuild. Visibility
      // is owned by the masked-swap harness (transition-core doSwap), NEVER here —
      // revealing the world in render() is what caused the "instant jump then a
      // pointless overlay" bug (render runs before the transition covers the screen).
      // Ambient background is the one exception: it's restarted on every door-entry
      // (its own lifecycle, torn down in close()) even when content is already built.
      if (worldEl.dataset.builtFor === door) {
        /* ambient background removed per operator */
        return;
      }

      worldEl.innerHTML = '';
      worldEl.className = 'world world--' + door;
      /* ambient background removed per operator */

      // ---- sticky header: event name + back control ----
      var header = el('header', { className: 'world-header' });
      var back = el('button', { className: 'world-back', text: '← Back to main page' });
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
      // Uniform registration (both doors): the hero shows TWO CTAs — Attendee opens the
      // real native form, Server opens a panel (a real form when one exists, or a
      // "currently closed" notice — see src/content/forms.js + src/js/forms.js).
      var formSpecKeys = door === 'men' ? { attendee: 'menAttendee', server: 'menServer' }
        : (door === 'women' ? { attendee: 'women', server: 'womenServer' } : null);
      var hasNativeForm = !!(formSpecKeys && NWKS.forms && NWKS.forms.specs &&
        NWKS.forms.specs[formSpecKeys.attendee]);
      // Assigned below (after the world body is built) — both hero CTAs open panels
      // inside this same full-screen form page.
      var formPage = null;

      if (hasNativeForm) {
        var ctaGroup = el('div', { className: 'world-hero__cta-group' });
        var reg = content.register || [];

        var attLabel = (reg[0] && reg[0].label) || 'Register as an Attendee';
        var attendeeCta = el('button', { className: 'world-cta', text: attLabel });
        attendeeCta.type = 'button';
        attendeeCta.addEventListener('click', function () { if (formPage) formPage.open(formSpecKeys.attendee); });
        ctaGroup.appendChild(attendeeCta);

        // Server registration — its own button opening the native Server form
        // (a real form for men; a "currently full" notice for women).
        if (formSpecKeys.server && NWKS.forms && NWKS.forms.specs && NWKS.forms.specs[formSpecKeys.server]) {
          var srvLabel = (reg[1] && reg[1].label) || 'Register as a Server';
          var serverCta = el('button', { className: 'world-cta world-cta--secondary', text: srvLabel });
          serverCta.type = 'button';
          serverCta.addEventListener('click', function () { if (formPage) formPage.open(formSpecKeys.server); });
          ctaGroup.appendChild(serverCta);
        }

        hero.appendChild(ctaGroup);
      } else if (content.register && content.register.length) {
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

      // ---- Register: native-form doors (men/women) use ONLY the hero CTAs to open the
      // full-screen form page — no redundant bottom register section (operator: "the
      // register button's already at the top"). Any external-link door would keep a
      // small register link list here instead. ----
      if (content.register && content.register.length && !hasNativeForm) {
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

      if (hasNativeForm) {
        var formPageKeys = [formSpecKeys.attendee];
        if (formSpecKeys.server && NWKS.forms && NWKS.forms.specs && NWKS.forms.specs[formSpecKeys.server]) {
          formPageKeys.push(formSpecKeys.server);
        }
        formPage = buildFormPage(worldEl, door, formPageKeys);
      }

      worldEl.dataset.builtFor = door;
      // Do NOT reveal here — the masked-swap harness (transition-core doSwap) un-hides
      // the world at the covered midpoint so the swap is never visible.
    },

    close: function (door) {
      var worldEl = document.getElementById('world-' + door);
      if (worldEl) worldEl.hidden = true;
      stopAmbient(door);
      var stage = document.getElementById('stage');
      if (stage) stage.classList.remove('world-open');
    }
  };
})();
