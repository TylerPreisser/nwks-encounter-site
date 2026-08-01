---
name: capture-what-did-not-work
description: "Sessions circle because only successes get written down. Persist root causes, what worked, and especially the dead ends — that last part is what breaks the loop."
metadata:
  type: feedback
---

When a loop or a fan-out establishes a root cause, a fix that worked, or a **dead end**, write it to
a durable doc in the repo (a `LOOP_STATE` note, a design STATE doc, or a capture corpus). Then feed
it back in: brief every new agent with it before they start, so they walk in knowing what was
already tried.

**Why:** Sessions went in circles because the write side was missing. Long work outlives a context
window, and an in-memory coordination store that silently holds zero entries is worse than no store
at all — every new run re-derives from scratch and re-treads the same failed approaches. **Capturing
what did NOT work is the part that actually breaks the circle**; successes alone don't prevent
repetition.

**How to apply:** Treat the state log as a deliverable, not a byproduct — hypothesis → diff → result
for each pass, plus the explicit dead ends. Before any fan-out, paste the accumulated brief verbatim
into every spawned agent's prompt under "What we already know." Don't route handoff state through a
memory layer you haven't verified actually persists — check that it reads back before you rely on
it. Related: [[agentic-loop-methodology]], [[orchestrate-dont-implement]], [[verifier-not-author]].
