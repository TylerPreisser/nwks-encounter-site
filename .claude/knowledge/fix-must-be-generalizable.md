---
name: fix-must-be-generalizable
description: "A fix must be malleable and input-independent — work for ANY valid input, never hardcoded to the one sample you tested"
metadata:
  type: feedback
---

Fixes (especially parsing/extraction/transform logic) must be **flexible to any valid input**, not
tuned to the one sample you tested. "It needs to be malleable. It needs to be flexible to any
different input." Prefer a deterministic backstop that works **independent of the specific case**
over a fix that pattern-matches one input's structure.

**Why:** Real systems process many varied inputs. A fix that only satisfies the one sample is
worthless for the next one and will silently regress.

**How to apply:** When designing a fix, explicitly state how it generalizes (what varies across
inputs and why the fix still holds), and add an input-independent guard where possible. In the red
test, include a negative/variant scenario, not just the sample. Related: [[agentic-loop-methodology]].
