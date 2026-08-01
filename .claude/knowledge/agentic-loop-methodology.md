---
name: agentic-loop-methodology
description: "The signature way to run any fix — design a trigger/execute/verify/state-log LOOP with your human partner first, with a hard stop, before diagnosing or touching code"
metadata:
  type: feedback
---

For any non-trivial fix, structure the work as an **agentic LOOP** designed up front *with* your
human partner — not ad-hoc edits. A loop = **trigger** (an explicit `GO`) + **execute** (the
smallest surgical, generalizable fix) + **verify** (against a concrete acceptance criterion on the
*real* artifact — a fresh read of the running system / output / record) + **state log** (hypothesis
→ diff → result each pass, persisted so the loop is self-improving across iterations/sessions). It
must have a **hard stop**: criterion passes, OR no progress for 2 iterations, OR an iteration cap
(default ~6) — so tokens aren't burned on drift.

**Why:** "Before you diagnose or touch code, design the loop *with me*." Uncapped or unstructured
loops waste tokens and drift; the success criterion and stop condition must be agreed before
anything runs.

**How to apply:** Before diagnosing, present symptom → where → how-I-know → exact change, ask ≤3
short questions (success criterion, iteration cap, where to pause for human judgment), and end with
*"Reply GO to run the loop."* Wait for GO. Log each pass. Related: [[verifier-not-author]],
[[fix-must-be-generalizable]], [[use-judgment-be-comprehensive]].
