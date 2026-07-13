# NWKS Encounter — Worlds & Cinematic Entrances (design)

**Date:** 2026-07-13
**Repo:** `~/Desktop/nwks-encounter-site` → github.com/TylerPreisser/nwks-encounter-site
**Live:** https://nwks-encounter-site.pages.dev (Cloudflare Pages)
**Builds on:** the recovered "Animated Gateway" (`index.html`, Gateway v4)

---

## 1. Goal

Turn the gateway from a splash-with-placeholder into a real, immersive site:

1. **Make "Enter" actually enter** — not the current expand-and-toast preview. Clicking a
   door plays a **cinematic in-place morph** into that event's full, scrollable "world."
   Single URL, no page reload (the content per event is moderate; a second URL isn't needed).
2. **Build out the content** behind each door, faithfully from the real site.
3. **Two distinct entrances** — Men's and Women's are unrelated events, so each gets its own
   signature animation with an opposite motion character.
4. **A concept gallery** — several entrance variations per door, switchable live, so the
   operator can feel each and pick favorites. Women's variations get extra visual polish.
5. **A revolutionary mobile experience** — 90% of traffic. Rebuilt for portrait, not just a
   vertical stack.

## 2. Non-goals (out of scope)

- **No registration backend.** Register buttons link out to the existing Google Forms / email.
- **No CMS / admin.** Content is authored in the source file.
- **No real Unite 2026 dates.** The live site's Unite dates are stale (2022); Unite stays a
  lightweight world until real info exists.
- **R Squared** is only the builder — no portfolio/showcase framing in the product.

## 3. Constraints

- **Single self-contained file, no external dependencies** (inline CSS/JS, embedded images).
  Keeps parity so it works both as a published Claude Artifact and on Cloudflare Pages, with
  no build step and no CDN. (See §9 — the one open architecture question is whether this holds
  as the concept gallery grows.)
- **Native tech only:** the **View Transitions API** (same-document) drives the container
  morph; each signature effect is a bespoke inline **Canvas 2D** / CSS-3D / clip-path layer.
  No GSAP/Three.js/Barba.
- **Graceful degradation:** every animation has a `prefers-reduced-motion` fallback (instant
  cross-fade) and works if `document.startViewTransition` is absent (older browsers → plain
  fade). Content is always reachable without JS-driven motion.
- Preserve the existing design language: shared warm-stone + antique-gold frame; Men's =
  olive/gunmetal + yellow FREEDOM accent; Women's = pearl/gold; Iowan Old Style serif;
  Galatians 5:1 as the spine verse.

## 4. Architecture (units & interfaces)

Four isolated units, each with one purpose:

1. **Gateway** — the two-door landing (plus the concept switcher and a small Unite link).
   Owns intro sequence and door hover/focus states. Emits `enter(door)` on click/keydboard.
2. **Transition registry** — a map of `conceptId → transition module`. Each module implements
   a single interface:
   ```
   { id, label, door: 'men'|'women',
     run(fromPanelEl, toWorldEl, {reduced}) → Promise<void> }
   ```
   `run` performs the signature animation and resolves when the world is presented. Modules
   are independent and individually testable — adding/removing a concept touches only its
   module and the registry. This is where the "several variations" live.
3. **Worlds** — one scrollable themed page per event (`#world-men`, `#world-women`,
   `#world-unite`), hidden until entered. Each is a static content component built from §7.
   Owns its own "← back to gateway" control, which reverses the transition.
4. **Mobile shell** — a swipeable full-screen door carousel that reuses the same registry and
   worlds; adds portrait-tuned transitions and device-tilt/scroll parallax (§8).

Data flow: Gateway → picks active `conceptId` for the chosen door from the switcher →
Transition registry `.run()` → World shown → Back control → reverse → Gateway.

State is trivial and in-memory: `activeConcept.men`, `activeConcept.women`, and which view is
open. No router; a single URL. (Back button: we push a history state on enter so the hardware
/ browser back returns to the gateway, without exposing a separate shareable URL.)

## 5. Men's entrances (hard / fracturing / "breaking free")

Theme: Galatians 5:1 "it is for freedom that Christ has set us free," olive/gunmetal, yellow
FREEDOM banner. Three variations to choose among:

- **M1 · Shatter / blast-apart** *(recommended)* — the olive panel fractures into shards
  (Canvas 2D Voronoi/triangulated pieces) that blast toward the viewer while a yellow
  light-crack rips through; shards clear to reveal the Men's world. Forceful, downward→outward.
- **M2 · Blast doors** — the panel splits center and two heavy halves slide apart with depth
  and cast shadow, revealing the world behind. Controlled, architectural, militaristic.
- **M3 · Chains break + FREEDOM banner** — chains across the panel snap (SVG + physics-lite)
  and the yellow FREEDOM banner sweeps across as the wipe into content. Most literal to "set free."

## 6. Women's entrances (soft / blooming / beautiful — extra polish)

Theme: encountering Christ "in ways new or long since felt," pearl/gold, intimate. Three:

- **W1 · Veil lift** *(recommended)* — a gossamer veil (layered gradient + clip-path) dissolves
  upward as warm gold light rises behind it; the world fades up. Slow, graceful.
- **W2 · Gold bloom** — a radial gold light/ink blooms outward from center as the reveal mask,
  with fine gold motes (Canvas particles) swirling and settling.
- **W3 · Dawn petals** — soft light rays sweep and delicate petals drift down and settle as the
  content resolves. The most decorative.

## 7. World content (faithful to the real site)

Shared section spine, themed per event. Content is taken from the scrape at
`~/Downloads/nwksencounter.com/`.

### Men's Encounter — August 6–8, 2026
- **Hero:** Freedom Encounter mark · "Northwest Men's Encounter" · Aug 6–8, 2026 · Register CTA.
- **What is Men's Encounter?** Connect with other guys and self-examine your walk with God;
  over the weekend look at **14 areas of our lives**; worship, testimonies, teaching, ministry.
- **What is Pre-Encounter?** Teachings/testimonies to prepare; held at the church before leaving.
- **The Weekend:** Leave **Thursday evening** from launch-point churches — **Norton, Hays, Colby,
  Gove, Hoxie, Plainville** (arrive 4:00–6:30 pm, each departs at its own time; park at church).
  Return **Saturday 4:00–5:00 pm**. Destination: **Lakeview Christian Camp, Stockton, KS**
  (Webster Lake) — ride together, don't take your own vehicle. (camp: lakeviewchristiancamp.org)
- **Cost:** **$125** — transportation, lodging, materials, meals. Scholarships available on
  request. Checks payable to **Norton Christian Church, 208 N. Kansas Ave, Norton, KS 67654**.
- **What to bring:** sleeping bag, pillow(s), toiletries, towel, flashlight, a Bible (don't pack
  it — need it Thursday), clothing for Fri & Sat.
- **Contacts (launch-point leaders):** Norton — Lucas Melvin 785-202-0302 · Hays — Len Melvin
  785-650-3366 · Colby — Jake Haines 785-443-2438 · Hoxie — Seth Slaughbaugh 785-627-6092 ·
  Gove — Von Tuttle 785-673-9534 · Sterling — Nick Sowers 620-680-0166.
- **Register:** Attendee → Google Form
  `https://docs.google.com/forms/d/e/1FAIpQLSdZoPlopEZyHpBLl4EnXZuiB8X6vCDAR5v7Nw726rgtFQiNQw/viewform` ·
  Server → `https://docs.google.com/forms/d/e/1FAIpQLSfumN5SAwGVA32X0D9k2r45hZCcd6zlAkZGv3AgWOFa_3_y6A/viewform`.

### Women's Encounter — July 17–19, 2026
- **Hero:** Women's Encounter logo · "Northwest Kansas Women's Encounter" · Jul 17–19, 2026 · Register CTA.
- **Registration timeline:** **Attendee** opens **May 17, 2026 @ 9 am**, $125 due Jul 17.
  **Server** opens May 17 @ 9 am — **FULL**; $125 due at mandatory Server Training **June 14 @ 4 pm,
  Hays Celebration Community Church**.
- **What is Women's Encounter?** (full warm narrative) — a weekend to encounter Christ in ways new
  or long since felt; teaching, testimonies, worship; be as social or quiet as you wish, no comfort
  zones forced; not a typical retreat; an individual, personal experience between you and God.
- **The Weekend:** Leave **Friday evening** from **Colby, Gove, Hays, Hoxie, Norton, Plainville,
  Sterling, WaKeeney** (registration & launch 4:00–5:30 pm; Sterling meets earlier). Return
  **Sunday 4:00–5:00 pm**. Destination: **Lakeview Christian Camp, Stockton, KS**.
- **Cost:** **$125** (write "Women's Encounter" in the memo) — transport, lodging, materials, meals.
  Checks payable to **Norton Christian Church**.
- **What to bring:** bedding for a twin bed / sleeping bag, pillow(s), toiletries, bath towel &
  washcloth, flashlight, casual clothes for Sat & Sun + a jacket, a Bible and journal/notebook
  (don't pack — need Friday evening).
- **Contacts:** Registration questions → **nwkswomensencounter@gmail.com**. Angela Melvin
  785-871-0848 (angelarmelvin@gmail.com) · Danielle Markley 785-639-2896 (danielle@haysacademy.com).
- **Register:** `https://forms.gle/KMz3phZ3fNg2nNx57`.

### Unite (lightweight world)
- **What is Unite?** Beyond the weekend — ongoing fellowship, worship, learning, praying together;
  a meal provided; free-will offering (extra goes to the Encounter account).
- **Dates:** TBA (do **not** copy the stale "2022" line — show "Dates coming soon").
- **Contact / register:** nwksencounter@gmail.com · nwkswomensencounter@gmail.com.

## 8. Mobile experience (portrait-first, the 90%)

- **Swipeable door carousel:** Men's fills the screen; swipe horizontally to Women's; a small Unite
  affordance. Page dots / edge peek so the second door is discoverable.
- **Enter:** tap the door's Enter → the *same* selected transition module runs, tuned for portrait
  (effects respect the vertical viewport).
- **Alive in the hand:** subtle **device-tilt (deviceorientation) + scroll parallax** on the logo
  mark and background layers; disabled under reduced-motion and when permission is denied.
- **Worlds** scroll naturally with a sticky slim header (event name + back). Register CTA is a
  reachable sticky/among-thumb button.
- Replaces today's plain 92vh vertical stack.

## 9. Open architecture decision (for review)

The single-file, no-deps constraint (§3) is what makes Artifact-parity possible, but a concept
gallery with ~6 canvas/3D animations + three content worlds + the mobile shell will make one file
large (well past the usual 500-line guideline). Options:

- **A · One self-contained file, internally modular** *(recommended, matches current model)* —
  keep `index.html` single-file; structure the script as isolated module-objects (one per
  transition) behind the registry. Accept the larger file as the nature of a self-contained
  deliverable. Still publishes as an Artifact and deploys to Pages unchanged.
- **B · Split modules on Pages** — `index.html` + `/css` + `/js/transitions/*.js`. Cleaner, each
  file focused/under 500 lines, deploys fine to Pages — but it's no longer a single Artifact
  (publishing an Artifact would require an inline step).
- **C · Modular source + tiny inline build** — author modular, a small script concatenates+inlines
  to `dist/index.html` for Artifact + Pages. Best separation, but reintroduces a build step
  (contradicts "no build step").

**Decision (2026-07-13): Option C.** Because the build runs as a **Ruflo swarm** (parallel agents),
single-file (A) would make agents collide on one giant file — the known swarm-sprawl failure mode.
So: **modular source** (each transition module / world / content its own file, one agent each) **+ a
tiny dependency-free inline-bundle step** (`build/bundle.mjs`, Node only) that emits a single
self-contained `dist/index.html`. This preserves Artifact parity AND gives the swarm clean,
non-colliding units. `dist/index.html` is what deploys to Pages and can publish as an Artifact.

## 10. Accessibility & quality

- `prefers-reduced-motion`: skip all signature effects → instant cross-fade; keep intro off.
- Keyboard: doors are focusable, Enter/Space activate; back control is a real button; focus moves
  into the world on enter and back to the door on exit.
- Each door has an `aria-label`; worlds have headings and landmark structure.
- Perf budget: transitions target 60fps on a mid iPhone; canvas particle counts capped and scaled
  to viewport; effects `will-change`-hinted and torn down after they run.

## 11. Success criteria

1. Clicking Enter plays the selected cinematic transition and lands in the correct, fully-populated
   world; the back control reverses it to the gateway.
2. The concept switcher offers ≥3 Men's and ≥3 Women's variations, switchable live, each distinct.
3. Women's variations are visibly more refined/beautiful than Men's (per direction).
4. All real content from §7 is present and accurate; register buttons open the correct forms/email.
5. Mobile: swipe between doors, tap to enter with a portrait-tuned transition, parallax feels alive;
   verified on iPhone Safari against the live URL.
6. Reduced-motion and no-View-Transitions fallbacks work; content reachable without motion.
7. Modular source (Option C) builds via `build/bundle.mjs` to a single self-contained
   `dist/index.html` (no external deps) — deploys to Pages and can publish as an Artifact.

## 12. Execution model — looped Ruflo swarm

Per operator standing instruction, build work runs as a **hierarchical, queen-led Ruflo swarm in
the agentic LOOP** (lead = me). Minimal roster, file-partitioned so agents don't collide:
`architect` (scaffold + module interfaces + bundle) → `transitions-coder` + `worlds-coder`
(parallel, independent files) → `reviewer/tester` (bundle + verify). **Coders do NOT touch git —
the lead owns commit/push/deploy/live-verify every iteration** (swarms here commit-but-don't-push,
handoffs are flaky, they sprawl). Loop cap ~6/phase; pause after each phase for operator reaction.
