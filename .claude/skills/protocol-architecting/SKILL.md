---
name: protocol-architecting
description: Use when designing something new, making a significant technical decision, or starting greenfield work — before writing implementation code. Enforces brainstorm-first (understand intent one question at a time), 2–3 approaches with tradeoffs, a written design doc, and an explicit approval gate before any code. Verification is designed in from the start, and units are bounded so they can be understood and tested independently.
---

# Protocol: Architecting

## Overview

How to design before you build. Same loop as every protocol — **trigger → the loop → verify →
hard stop** — but the "artifact" being verified is a *design*, and the hard gate is: **no
implementation code until the design is written and approved.** Testing isn't bolted on later;
a good design says up front how each piece will be verified.

## When to use
- Greenfield: a new system, service, feature, or UI from scratch.
- A significant decision: data model, API shape, framework/library choice, module boundaries.
- Any change big enough that jumping to code would bake in an unexamined assumption.

Not for: a 1–2 line fix, a mechanical change, or a bug (use `protocol-debugging`). But even a
"simple" new thing gets a short design — one paragraph is fine. Simple is where unexamined
assumptions cause the most wasted work.

## The design gate
> **When your partner is deciding what to build, do NOT write implementation code, scaffold, or
> take an implementation action until you have presented a design and it has been approved.** This
> holds regardless of perceived simplicity. The design can be short; skipping it is what bakes in
> unexamined assumptions.

**The gate yields to a direct order** (`CLAUDE.md` §2). If your partner says "build it," "go," or
"just do it," that IS the approval — start immediately. Don't re-open a decision they've already
made, and don't manufacture an approval step in front of a clear instruction. When sign-off has
been delegated to you, **self-approve with reasoned judgment and keep the full process**: still
write the design, still state the tradeoffs, still design verification in — then proceed without
waiting. What the gate protects against is *unexamined* design, not *unapproved* design.

## The architecting loop

### 1. Understand the intent (brainstorm — one question at a time)
Before proposing anything, explore purpose, constraints, and success criteria. Ask **one question
at a time**, prefer multiple-choice, and don't overwhelm. Check the existing codebase and follow
its patterns before proposing new ones.

- If the request is really several independent subsystems, **flag it and decompose first** — don't
  refine details of a project that needs splitting. Each sub-project gets its own design → build.
- Nail the success criterion: *how will we know this is right?* This becomes the verify step.

### 2. Propose 2–3 approaches with tradeoffs
Present distinct options — not one plan and two strawmen. Lead with your recommendation and *why*.
Cover the real tradeoffs (complexity, risk, effort, reversibility). Let your partner choose or mix.

### 3. Design for isolation and clarity
Break the system into units that each have **one clear purpose**, communicate through
**well-defined interfaces**, and can be **understood and tested independently**. For each unit you
should be able to answer: what does it do, how do you use it, what does it depend on?
- Can someone understand a unit without reading its internals? Can you change the internals without
  breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are also easier to hold in context and edit reliably. A unit that
  keeps growing is usually doing too much — split it.

### 4. Design verification in from the start
For each unit and for the system, state **how it will be tested** — the layer, the positive and
negative scenarios, and the **real artifact** that proves it works (the ground truth from the
project map). If a design has no obvious way to verify a piece, that's a design smell — make it
observable (testable seams, logged decisions) before it's built. This is what hands off cleanly to
`protocol-testing` (red-test-first) at build time.

### 5. Write the design doc, then get approval (the trigger)
Write the validated design to `docs/design/YYYY-MM-DD-<topic>.md`. Cover: purpose, the chosen
approach + why, components & their interfaces, data flow, error handling, and the test/verification
plan. Self-review the doc first: scan for placeholders/TBDs, internal contradictions, ambiguity
(could a requirement be read two ways? pick one), and scope (is this one buildable plan or does it
need splitting?). Fix inline.

Then **present it.** If your partner is still choosing a direction, that presentation is the
approval request. If they've already told you to build, the presentation is a *heads-up* — state
the design and the assumptions you're proceeding under, then build. Either way the doc gets
written; the difference is only whether you wait.

### Hand off to build
On GO, implementation follows `protocol-testing` (red test first, verify on the real artifact,
verifier ≠ author) and `orchestration` (pick the lightest execution — direct, one agent, or a small
directed pipeline; don't spin up a big loose swarm to build from a plan).

### Hard stop
The design is approved, OR the human wants to defer/deprioritize, OR two rounds of revision aren't
converging (step back and reframe the problem rather than iterating the same doc a third time).

## Red flags — stop
- Writing code / scaffolding before the design is *written* (approval may be delegated; the doc isn't).
- Presenting one approach as if it's the only one.
- A design with a unit you can't describe in one sentence, or can't say how you'd test.
- "We'll figure out testing later" — verification is part of the design.
- Asking five questions in one message instead of one at a time.
- Designing a monolith with tangled responsibilities because it's "simpler for now."

## Common mistakes
- Skipping the design because the task "looks simple" — that's where assumptions bite hardest.
- Boundaries drawn around code layout instead of responsibility.
- Ignoring the existing codebase's patterns and inventing parallel ones.
- No written doc — a design that lives only in chat can't be reviewed or handed off.
