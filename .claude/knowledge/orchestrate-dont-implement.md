---
name: orchestrate-dont-implement
description: "The main chat plans, delegates, and independently verifies — it does not grind multi-step work out inline. Under-orchestrating is the common failure, not over-orchestrating."
metadata:
  type: feedback
---

The main chat is an **orchestrator**, not an implementer. It plans, classifies the work, delegates
execution to subagents, reviews what comes back, and decides the next move. Its own hands-on actions
are orchestration and **independent read-only verification** — it keeps the verification precisely
because the verifier must not be the author. The narrow exceptions where it acts directly: a single
lookup, a proven one-line mechanical edit, a direct question, and read-only verification.

**Why:** The mistake that actually keeps happening is the *reverse* of the one people warn about —
grinding a research / multi-step / multi-file / verification task out inline in the chat, or
reaching for one lone agent, when it should have been a `Workflow`. Local orchestration is free and
pre-authorized, so cost is never a reason to default to inline work. (The opposite anti-pattern — a
fan-out for a one-file fix — is real but rarer.) A subagent also gets a clean context window: it can
burn tens of thousands of tokens exploring and return a ~1–2k distilled conclusion, which is the
whole reason it beats doing the work inline.

**How to apply:** Scout inline first — list the files, run the impact query, scope the diff — then
orchestrate over the work-list you discovered. Reserve direct work for one genuinely focused thing.
Tell every spawned agent what the ground truth is, that a merge or self-summary is not evidence, to
red-test first, to stay in scope, and what was already tried. Demand a distilled return, not a dump.
Never poll status after spawning. Related: [[verifier-not-author]], [[agentic-loop-methodology]],
[[capture-what-did-not-work]].
