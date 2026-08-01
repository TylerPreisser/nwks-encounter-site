---
name: stay-in-scope-one-issue
description: "Resolve exactly the one assigned issue with a minimal scoped diff; if a correct fix needs another work-stream's code, STOP and report it as a dependency — never silently expand"
metadata:
  type: feedback
---

Each fix stays strictly in scope: resolve exactly the one issue named and nothing else; keep diffs
minimal and scoped. But also **fully** satisfy that one issue here and now, then ship it — don't
stop at a partial fix and defer. The tension resolves with one rule: **if a correct fix appears to
require changing code owned by another issue/work-stream, STOP and report it as a dependency** —
don't silently expand.

**Why:** Parallel work-streams collide when agents free-range or edit another issue's files; silent
cross-issue edits duplicate effort and break others' work. But under-delivering a half-fix and
deferring the rest is equally frustrating.

**How to apply:** Scope the diff to the single issue; complete it fully; if a dependency on another
issue's code is unavoidable, surface it explicitly rather than editing across the boundary. No
scope creep, no free-ranging agents. Related: [[agentic-loop-methodology]].
