# Knowledge seed — portable methodology

A curated snapshot of the durable, hard-won lessons about **how to work** with an AI coding agent.
Each file is a single fact with a `Why` and a `How to apply`. These are domain-agnostic — they say
nothing about any particular project, so they travel with the kit into any repo.

**How to use it:**
- Read these on day one (or let `/go` / `/onboard` summarize them). They encode lessons that cost
  prior sessions a lot of wasted time.
- To load them into Ruflo memory for semantic recall: `mcp__ruflo__memory_import_claude`
  (coordination layer; safe — doesn't overwrite existing memory).
- Project-specific facts (where things live, deploy quirks, people) do **not** go here — they live
  in `../skills/onboarding/references/project-map.md`, filled by `/onboard`.

## The lessons

| File | Lesson |
|---|---|
| `agentic-loop-methodology.md` | Run the fix as an execute→verify→state-log LOOP with a hard stop. It's how you work, never a gate you wait at — a direct order IS the trigger. |
| `orchestrate-dont-implement.md` | The main chat plans, delegates, and independently verifies. Under-orchestrating is the common failure; subagents explore deep and return distilled conclusions. |
| `capture-what-did-not-work.md` | Persist root causes, what worked, and especially the dead ends — capturing failures is what stops sessions from circling. |
| `verifier-not-author.md` | Agents over-trust their own output — the validator must be separate and check the real artifact; don't re-test verified work. |
| `fix-must-be-generalizable.md` | Fixes must be malleable / input-independent — work for any valid input, never hardcoded to the one sample. |
| `stay-in-scope-one-issue.md` | One issue, minimal diff, complete it fully; if a correct fix needs another work-stream's code, STOP and report it as a dependency. |
| `working-style-respect-time-and-trust.md` | Don't go dark; use inputs already given; self-verify; make every artifact self-sufficient; don't damage shared formatting/records. |
| `use-judgment-be-comprehensive.md` | When asked for a couple of things, package the whole apparatus they belong to. |

> These pair with the three protocol skills (`protocol-architecting`, `protocol-debugging`,
> `protocol-testing`) and the `orchestration` router. The knowledge is the *why*; the skills are
> the *how*.
