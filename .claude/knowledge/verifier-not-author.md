---
name: verifier-not-author
description: "Agents over-trust their own output — whoever verifies a fix must be separate from whoever wrote it and must check the real artifact (a fresh read of the running system), not re-read its own work"
metadata:
  type: feedback
---

The single most-repeated principle: **the verifier is never the author.** The tester/validator
judges success via a *fresh* read of the real artifact (the running system's output, the live
record, the rendered UI) — the coder never grades its own work. Equally: **do not re-test work you
already verified in-session** — trust the evidence you just gathered.

**Why:** Agents over-trust their own output. A fix that the author declares "working" off its own
summary is how wrong root causes and stale verdicts survive. Trust the diff and the live system,
not an agent's self-report.

**How to apply:** In a swarm, separate coder from tester/reviewer; for high-stakes root causes add
an adversarial **challenger** that tries to *refute* each load-bearing claim against the code + live
system before it's accepted. Verify against the artifact, once — don't loop re-verifying.
Related: [[agentic-loop-methodology]].
