---
name: protocol-debugging
description: Use when chasing a bug, a failing test, an error, or any unexpected behavior — before proposing a fix. Enforces reproduce-first (a red test that captures the failure), root-cause before patch, deploy-gap-vs-code-bug diagnosis, the smallest surgical fix, and real-artifact verification by someone other than the author. Testing is built in: you reproduce with a test and you verify with a test.
---

# Protocol: Debugging

## Overview

How to chase a bug without guessing. The shape is the same loop as every protocol —
**trigger → the loop → verify → hard stop** — specialized for "something is wrong and I don't yet
know why." The iron rule: **reproduce before you diagnose, diagnose before you patch, verify
before you claim done.** Testing is woven in — you reproduce the bug *with a red test* and you
prove the fix *with that same test going green* (see `protocol-testing`).

## When to use
- A reported defect, a failing test, an exception, a wrong output, flaky behavior.
- "Why is this happening?" questions before any fix is written.

## The debugging loop

### 1. Reproduce — capture the failure as a red test
Don't reason about a bug you can't trigger. Encode the failing scenario as a test (the layer the
code runs in) with realistic data, and confirm it **fails the way reported**. If you can't make it
fail, you haven't understood it yet — keep gathering facts. Manual reproduction is a starting
point, not the finish line; convert it to something repeatable.

> If the test passes on the current code, the bug isn't where you think — or it's a **deploy gap**
> (the running environment lags the code). Check that next, before touching logic.

### 2. Understand — one root cause, proven, before any patch
- **Read the actual code path**, don't pattern-match. Use GitNexus `trace` ("how does A reach B?"),
  `context` (360° on the symbol), and `explain`/`pdg_query` ("what gates X / where does this value
  flow") instead of grepping blind.
- **Form one hypothesis at a time** and test it against the evidence. State it as a falsifiable
  claim with a `file:line`. Resist "it's probably X" — prove X.
- **Diagnose deploy-gap vs. code-bug vs. input-gap** (see `protocol-testing`): run the real code
  path on the real input locally. If the current deployed-branch code already behaves correctly
  locally, the bug is an ops/deploy gap — stop and report it; don't rewrite working logic.
- **Diagnose against the deployed branch + live system**, never a stale branch or the ticket text
  (precedence-of-truth ladder in `protocol-testing`).

### 3. Fix — the smallest surgical change
The minimal diff that makes the red test go green. Scoped to this one bug, **generalizable** (works
for any valid input, not just the repro sample), no opportunistic refactoring riding along. If a
correct fix requires another work-stream's code, **STOP and report it as a dependency**.

### 4. Verify — fresh, on the real artifact, not by the author
- Rerun the red test → green. Then run the blast-radius regression (`detect_changes`/`impact`
  scope only — not a blanket retest).
- Confirm on the **real artifact**: a fresh read of the running system / output / record — not a
  re-read of your own diff or summary. **The verifier is never the author.**
- **Don't re-verify what you already verified in-session.**

### Hard stop
Criterion passes, OR no progress for 2 iterations, OR the iteration cap (~6) is hit. If stuck at
the cap: write up the state (hypotheses tried, evidence, what's ruled out) and escalate rather than
thrashing. For high-stakes root causes, add an adversarial **challenger** agent to try to refute
the diagnosis before it's accepted (`orchestration` §4).

## Systematic tactics (in rough order)
1. **Read the error precisely** — the message, the stack, the exact line. Don't skim.
2. **Bisect the surface** — narrow *where* it breaks (binary-search the pipeline, git-bisect the
   history, comment out halves) before asking *why*.
3. **Check the boundaries** — inputs at system edges, null/empty/malformed, off-by-one, timezone,
   encoding, async ordering. Most bugs live at a boundary.
4. **Instrument, don't guess** — if a value isn't observable, add it to the logs/output so the
   behavior becomes verifiable at all (some values simply aren't persisted).
5. **Trust the live system over your mental model** — read what actually ran, not what you think
   ran.

## Red flags — stop
- Proposing a fix before reproducing the failure.
- "It's probably…" with no `file:line` proof.
- Editing logic when the code is actually correct and the environment is stale (deploy gap).
- Changing several things at once so you can't tell what fixed it.
- Declaring it fixed off your own summary instead of a fresh real-artifact read.
- Hardcoding the fix to the one repro sample.

## Common mistakes
- Debugging against a stale branch / the ticket text instead of the deployed branch + live system.
- Grepping for what `trace`/`context`/`explain` answers directly.
- Widening scope mid-fix instead of reporting a dependency.
- Uncapped thrashing with no state log; re-verifying already-verified work.
