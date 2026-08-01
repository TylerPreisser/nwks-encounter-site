---
name: protocol-testing
description: Use when writing, running, or verifying tests for any change, and BEFORE marking any bug fix or feature complete or handing it back to a stakeholder. Covers red-test-first discipline, testing in the layer the code runs in, the precedence-of-truth ladder, deploy-gap-vs-code-bug diagnosis, real-artifact verification (verifier ≠ author), and the PR evidence package. This is the *verify* step of every other protocol.
---

# Protocol: Testing

## Overview

How changes get verified. **Core rule: write the failing ("red") test first** — encode the
expected outcome and prove the *current* code reproduces the bug **before** changing anything. Then
fix, rerun, confirm green. Never report a change as "working" until it has been verified in the
layer — and the environment — it actually runs in. And **the verifier is never the author** (§Verify).

This protocol is the *verify* step that `protocol-architecting` designs in and `protocol-debugging`
reproduces with. Testing isn't a separate phase; it's woven through everything.

## When to use
- Fixing a bug or adding/changing a feature — any code change.
- Before saying a change "works" or handing it back to a stakeholder.
- When a reported defect needs reproducing.

Not for: read-only triage with no code change — but still verify the diagnosis (see the bottom).

## The Iron Law: red test first

Before touching the code:
1. Write a test that encodes the **expected** outcome (the requirement).
2. Run it against the **current** code with realistic data so it **fails — reproducing the reported
   bug** ("red"). If it passes already, you have not reproduced the bug; stop and re-confirm the
   scenario.
3. Only then change the code. Rerun the same test → it must go **green**.

A test written *after* the fix proves nothing about whether you understood the bug. **Skipping the
red step is skipping the test.**

| Rationalization | Reality |
|---|---|
| "The fix is obvious, I'll just make it" | Then the red test takes two minutes and confirms you're right. |
| "I'll add the test after the fix" | A test that's green on first run can't tell you it catches the bug. |
| "I reproduced it manually in the UI" | Manual ≠ repeatable. Encode it so it fails the same way every run. |
| "It's a one-line change" | One-line changes cause regressions; the red test scopes the blast radius. |

**Red flags — stop:** editing code before a failing test exists; a brand-new test that passes on
its first run; "I'll just verify in the UI instead."

## Precedence of truth — READ FIRST

Most "we shipped the fix but it still shows the bug" confusion traces to trusting the wrong source.
When sources disagree, believe them in this order:

1. **A fresh read of the live/running system** — the actual output, record, API response, or
   rendered UI, read *now*. Newest read wins.
2. **Git facts** (`git show <sha>`, `merge-base`) — verified against the *deployed* branch, not
   whatever branch you happen to be on.
3. Cross-validated verdicts (prior verified findings, this skill, a hand-off doc).
4. The ticket / spec **text** — a good starting skeleton, but often stale. Your strongest
   *hypothesis*, not gospel.

> The project-specific truths (which branch each environment deploys from, any pinned images, any
> build that omits an optional dependency) live in the project map — `/onboard` records them there.
> Internalize them before debugging anything.

## Deploy-gap vs. code-bug — diagnose before you "fix"

A reported defect is one of three things; prove which before changing code:
- **Code bug** — the current deployed-branch code genuinely produces the wrong output.
- **Deploy gap** — the fix exists in the branch but isn't in the running environment (stale image,
  wrong field, not promoted).
- **Data/input gap** — the input simply doesn't contain the value (a passthrough can't fill an
  absent field).

**The winning move:** run the *real code path on the real inputs locally* and see what it produces.
If the current code already yields the right answer locally while the environment shows the bug,
the failure is a **deploy gap, not a logic bug** — and the fix is ops (re-deploy / promote /
re-run), not code. Don't write a code fix for a deploy gap.

## Make the fix generalizable, never hardcoded

A fix must be **malleable / input-independent** — it has to work for *any* valid input, not just
the one sample you tested. A fix that only matches one case's structure is worthless for the next
one. Prefer a deterministic guard that holds independent of the specific input. State explicitly
how the fix generalizes, and include a variant/negative scenario in the red test — not just the
happy sample.

## Test in the layer the code runs in

Use the framework and layer where the code actually executes (unit for pure logic, integration for
wiring, e2e/UI for rendered behavior). A single change can require more than one layer. The project
map records which layers and frameworks this project uses.

## Design positive AND negative scenarios

Exercise every path, not just the happy one: (1) happy path succeeds; (2) validation/errors are
handled; (3) the "nothing came back / empty result" case. Each is its own expected-outcome test.

## Verify — and the verifier is never the author

- **Agents over-trust their own output.** Whoever judges success must be *separate* from whoever
  wrote the fix, and must verify against the **real artifact** — a fresh read of the running
  system, the actual record/output, the rendered UI — not a re-read of its own diff or summary.
  The coder does not grade its own work.
- **Don't re-test work you already verified in-session.** Trust the evidence you just gathered;
  re-running wastes time and tokens.
- For high-stakes conclusions, add an adversarial **challenger** that tries to *refute* the result
  against the code and the live system before it's accepted. Mechanize it: spawn independent
  skeptics prompted to refute, **defaulting to refuted when uncertain**, and keep the finding only
  if a majority fails to break it. When a claim can fail several ways, give each verifier a
  distinct lens (correctness / security / does-it-reproduce / does-it-generalize) rather than N
  identical refuters. Full tactics: `orchestration` §4.
- **Never drop silently.** A verification that can't reach its ground truth is an *unknown*, not a
  pass. Say so and route it to review — never report a silent no-op as success.

## Scope regression with the blast radius

Don't blanket-retest. Use GitNexus (`detect_changes` / `impact`) to compute what the change
actually touches, then exercise only those scenarios. Unrelated flows don't need re-running.

## Testability gaps

Some values aren't persisted or observable (e.g. a transient ID, an internal decision). When you
can't inspect the data to confirm behavior, the fix often must **add the value to the logs/output**
so the behavior is verifiable at all. Some inputs aren't available in the environment — verifying a
miss may require an end-to-end run on the real input, not a spot-check.

## The PR evidence package

**Every fix ends as a PR.** The PR body must contain:
1. **Root cause** — one-sentence mechanism + `file:line`.
2. **The fix.**
3. **Why the prior attempt failed** (if any).
4. **Files/lines changed.**
5. **Before/after verification evidence** on the real artifact + the loop iteration count.

Cite the issue's source so the next reader has full context. Follow this project's promotion path
(recorded in the project map); don't deploy straight to a shared environment without review.

## Verify the diagnosis before you test the fix

Before trusting a root cause, cross-check it: run multiple agents on the same problem and have them
challenge each other ("do you agree? try to refute it") — the vote yields a superset answer. Feed
new facts ("it worked yesterday, not today") back in and let triage take another turn.

## Common mistakes
- Reporting "works" after only a UI spot-check (possibly against a cached/stale build).
- Writing the test after the fix instead of red-first.
- Diagnosing against the wrong branch instead of the deployed branch / live system.
- Writing a code fix for what is actually a deploy gap or an input gap.
- Hardcoding a fix to the one sample.
- Letting the coder grade its own work; re-testing already-verified work.
- Blanket regression instead of blast-radius-scoped.
- Deploying straight to a shared environment without the PR review.
