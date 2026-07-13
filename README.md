# NWKS Encounter — website redesign concept

Recovered redesign concept for **nwksencounter.com** (Northwest Kansas Encounter —
Men's Encounter / Women's Encounter). This is the "Animated Gateway" concept we built
as a Claude Artifact and iterated on.

## What this is / where it came from

- Built in a Claude Code session on **2026-06-25** (session `6c7c2de2-4d94-4708-b46c-9688deed6258`).
- It was produced as a **published Artifact**, not a local project — the working file
  (`gateway_concept.html`) lived in that session's scratchpad, which has since been cleared.
- Recovered by replaying the session transcript's `Write`/`Edit` operations, plus a
  self-contained snapshot from Claude Code's `file-history`.
- Published artifact URL (v4): https://claude.ai/code/artifact/300c1ae8-f64c-4426-92b6-1ff76700e19c

The concept was designed against a scraped copy of the live WordPress site kept at
`~/Downloads/nwksencounter.com/` (reference only — that folder is the *old* real site).

## The version we settled on

**`index.html` = Gateway v4** — the newest/last version. Open it directly in a browser.

What v4 changed over v3:
- Men's mark cleaned up (treatment A — re-extracted from the larger original, brightened,
  keeps the signature yellow "FREEDOM" banner).
- New banner scheme + font: top/bottom bands are light warm-stone with charcoal
  refined-serif type and an antique-gold accent (instead of the dark military ink) — reads
  elegant and shared, not "men's-only".
- Simplified labels: "Men's Encounter" / "Women's Encounter" (dropped the "Northwest Kansas ·").

### A note on the logos
The v4 source used `__MEN_MARK__` / `__WOMEN_MARK__` placeholders that were filled with
base64 images at publish time. `index.html` here has those filled from the closest
self-contained snapshot (`versions/v3-standalone-embedded.html`). If a mark looks a hair
off from the exact published v4, the original high-res source logos are in `assets/`
(pulled from the live-site clone) to redraw/replace.

## Layout

```
index.html                              ← v4, standalone, newest — start here
versions/
  v1-source-fragment.html               ← the 4 published iterations, in order
  v2-source-fragment.html                 (raw Artifact body fragments, image placeholders)
  v3-source-fragment.html
  v4-source-fragment.html               ← exact v4 source as written in-session
  v3-standalone-embedded.html           ← fully self-contained snapshot w/ embedded logos
assets/                                 ← original high-res source logos from the live site
```

## Continuing the work

Open `index.html` in a browser to see it render. Edit it directly — it's a single
self-contained HTML file (inline CSS + JS, embedded images), so it works from any
machine or Claude account with no build step and no external dependencies.
