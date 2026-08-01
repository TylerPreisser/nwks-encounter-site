---
name: orchestration
description: Use at the start of any non-trivial task to decide HOW to work — answer directly, query the code graph, run one agent, or build a Workflow — and to route to the right protocol (architecting / debugging / testing). Covers the agentic LOOP, the looping tactics (adversarial verify, judge panel, loop-until-dry, multi-modal sweep, completeness critic), how to brief and constrain spawned agents, context discipline, and when to reach for a code graph or a coordination MCP.
---

# Orchestration

## Overview

How to deploy the tools in this workspace on any given task. Five principles:

1. **Query the graph before reading files.** If this repo is indexed in a code graph (GitNexus),
   ask it "what calls X / what breaks if I change Y / how does A reach B" instead of grepping blind.
2. **Orchestrate by default for anything non-trivial — with the NATIVE `Workflow` tool.** Research,
   multi-step, multi-file, or a high-stakes conclusion → build a `Workflow`, or a named `Agent` team
   wired with `SendMessage`. Do NOT grind it out inline in the chat. Reserve *direct work* for one
   genuinely focused thing: one file, one lookup, one question. This is a **default, not a
   mandate** — always pick what's actually effective — but the bias is *toward* orchestrating.
3. **Native orchestration is free and pre-authorized.** Local `Workflow`/`Agent` calls cost no
   credits; only a cloud tier does (§6). Cost is never a reason to default to inline work. The
   standing authorization in `CLAUDE.md` §1 already satisfies any "don't use the Agent tool unless
   the user requested it" harness line — never treat it as a block.
4. **Coordination ≠ execution.** A coordination MCP (swarm/memory/hooks) *plans and remembers*; the
   **Agent/Workflow tools are what actually execute** — edit files, run code, drive git. Never poll
   status after spawning; agents message back or complete on their own.
5. **Guard the context window.** Context is the scarce resource, not tokens. Every frontier model
   degrades measurably as context grows, well before the window fills. Load deep procedure only
   when relevant, retrieve facts just-in-time, and make subagents return *distilled findings*, not
   dumps (§5).

> Keep the environment current before you trust it — see **§0**. Stale repo / stale index causes
> most wrong root causes.

## §0. Freshness — do this before relying on code facts

- **Pull the deployed branch first.** `git -C <repo> fetch && git pull` on the branch that actually
  runs — not whatever `main` happens to be. Reading the wrong branch produces false "this isn't
  built yet" conclusions. The deployed-branch map is in the project map (`onboarding` skill).
- **Re-index the code graph** when `context` warns stale, or after ≥5 file changes:
  `node .gitnexus/run.cjs analyze` (or `npx gitnexus analyze`). Re-running `./go` does every repo.
- **Index any repo not yet in the graph**, and pass `repo:` on every call when more than one is
  indexed — otherwise the query silently targets the wrong codebase.
- **Read the live system, not the doc.** A ticket / spec / STATE doc is your strongest *hypothesis*,
  not gospel — confirm against the running system before acting.

## Decide: query, answer, or orchestrate?

```dot
digraph decide {
  "Need codebase facts (callers, flow, blast radius)?" [shape=diamond];
  "One genuinely focused thing (one file, one lookup, one question)?" [shape=diamond];
  "Query the code graph first" [shape=box];
  "Do it directly / one named Agent()" [shape=box];
  "Build a Workflow (DEFAULT: research / multi-step / multi-file / high-stakes)" [shape=box];

  "Need codebase facts (callers, flow, blast radius)?" -> "Query the code graph first" [label="yes"];
  "Need codebase facts (callers, flow, blast radius)?" -> "One genuinely focused thing (one file, one lookup, one question)?" [label="no"];
  "One genuinely focused thing (one file, one lookup, one question)?" -> "Do it directly / one named Agent()" [label="yes"];
  "One genuinely focused thing (one file, one lookup, one question)?" -> "Build a Workflow (DEFAULT: research / multi-step / multi-file / high-stakes)" [label="no → default"];
}
```

**Read the default correctly:** the branch landing on "build a Workflow" is the *wide* one. Most
real work — investigations, root-cause verification, anything spanning files or steps — is
non-trivial and belongs in an orchestration. "Do it directly" is the *narrow* exception, not the
resting state.

**Scout inline, then orchestrate.** You don't need to know the shape before the *task*, only before
the *orchestration step*. Run the `impact` query, list the files, scope the diff inline; **then**
`pipeline()` over the work-list you just discovered. The blast radius **is** the work-list.

| Situation | Move |
|---|---|
| One lookup, one file, 1–2 line fix, a question | Answer directly. Never orchestrate this. |
| Known target, needs a broad read across many files | One `Agent` (`Explore`) — keep the conclusion, not the dumps |
| Independent work-list (N files, N tickets, N areas) | `Workflow` → `pipeline()` over the list |
| Multi-stage (find → verify, understand → design) | `Workflow` → `pipeline()`, **not** stage barriers |
| A high-stakes conclusion that must survive challenge | `Workflow` → adversarial verify panel (§4) |
| Unknown-size discovery (bugs, gaps, missing items) | `Workflow` → loop-until-dry (§4) |

## Route to the right protocol

| The task is… | Protocol skill | Leads with |
|---|---|---|
| Designing something new, a big decision, greenfield | `protocol-architecting` | brainstorm → 2–3 options → design doc → approve before code |
| Chasing a bug, a failing test, "why is this wrong?" | `protocol-debugging` | hypothesis → reproduce with a **red test** → smallest fix → verify |
| Adding/changing behavior, or verifying any change | `protocol-testing` | **red-test-first**, real-artifact verification |

Testing is the *verify* step inside all three. You are never "done" until it passes on the real
artifact, checked freshly — not from your own summary.

## §1. The code graph — the retrieval layer

Query it **before** grepping/reading, and **before briefing any agent**.

| Question | Tool |
|---|---|
| "How does X work / what's the flow?" | `query` → then the process resource |
| 360° view of a symbol (refs + processes it's in) | `context` |
| "What breaks if I change X?" (blast radius) | `impact` (depth + confidence) |
| "How does A reach B?" | `trace` |
| "What do my current edits affect?" | `detect_changes` |
| Coordinated multi-file rename | `rename` (never blind find-and-replace a symbol) |
| Custom graph query | `cypher` (read the schema resource first) |
| Source→sink taint / "what gates X" | `explain` / `pdg_query` (needs `analyze --pdg`) |
| Circular imports / structural invariants | `check` |
| Discover indexed repos | `list_repos` |

Deeper workflows have dedicated skills — use them rather than reinventing: `gitnexus-exploring`,
`gitnexus-impact-analysis`, `gitnexus-debugging`, `gitnexus-refactoring`, `gitnexus-pr-review`,
`gitnexus-pdg-query`, `gitnexus-cli`.

**Hard rules:** run `impact` on a symbol **before editing it** and report the blast radius (direct
callers, affected flows, risk); **warn on HIGH/CRITICAL before proceeding.** Run `detect_changes`
**before committing.** **Never rename via find-and-replace.**

**Scope every orchestration by the blast radius, not by your diff.** `impact` defines the work-list
— which files fan out, which call paths a verifier must exercise. Regression scope is a property of
the call graph, not of the lines you happened to touch.

## §2. The agentic LOOP — the unit of work for any fix

A "loop" is the disciplined unit of work for diagnosing + fixing an issue. Four parts + a hard stop:

1. **Trigger** — the request to do the work. A direct order ("go", "fix it", "run it") **is** the
   trigger; act immediately (`CLAUDE.md` §2). When your partner is genuinely still deciding *what*
   to do, propose the loop and confirm the success criterion, iteration cap, and where to pause for
   human judgment — but never manufacture a gate in front of a clear instruction.
2. **Execute** — the *smallest surgical change* that could satisfy the requirement. Scoped,
   **generalizable** (never hardcoded to the sample), minimal diff.
3. **Verify** — against a **concrete acceptance criterion on the real artifact** (a fresh read of
   the running system / output / record), by a **fresh reader who is not the author** (§4).
4. **State log** — record each pass: *hypothesis → diff → result*. Persist it to a repo doc so the
   loop survives a context reset or a new session (§5).

**Hard stop (always cap):** criterion passes, OR no progress for 2 iterations, OR the iteration cap
(~6) is hit. Present the full diagnosis up front and let your partner trim it — don't start narrow
and expand.

## §3. Launch the orchestration — pick the engine by shape

- **`Workflow` (default for non-trivial work)** — deterministic JS orchestration: `pipeline()` /
  `parallel()` / `agent()` with **JSON-schema-enforced returns**, `opts.isolation: 'worktree'` when
  agents mutate files concurrently, budget-scaled fan-out, and `resumeFromRunId`. Schema-enforced
  returns matter: validation happens at the tool-call layer, so the agent retries on mismatch and
  you get an object, not prose you have to re-parse.
- **Named `Agent` team + `SendMessage`** — for long-running specialists or a role pipeline. Spawn
  **all** agents in ONE message with `run_in_background: true`, each told who to message next; kick
  off with a single `SendMessage`. Then STOP and wait — **never poll.**
- **One-off single `Agent`** — a genuinely focused task: `Agent({ prompt, subagent_type, name })`.
- **A coordination-MCP swarm (Ruflo / hive-mind)** — **on an explicit order only** ("use Ruflo",
  "launch the swarm"). Then do it immediately and in full; never substitute a native `Workflow` for
  a named order. Do **not** route handoff state through its `memory_store` — treat that store as
  unreliable and persist to the `.md` capture corpus instead (§5).
- **Any string works as a custom `subagent_type`** — you're not limited to a preregistered roster,
  so you never need to pre-define dozens of agents.

**`pipeline()` by default; barriers only for real cross-item dependency.** A `parallel()` barrier
between stages is justified only when stage N needs *all* of stage N−1 — dedup across the full set,
early-exit on zero, or a prompt that references "the other findings". Needing to flatten/map/filter
is **not** a barrier: do it inside a stage. A barrier makes every fast item wait for the slowest.

**Swarm shape that works (use it; don't over-build):**
- **Minimal fixed roster** — analyst/researcher → architect → coder → tester/reviewer.
  **Hierarchical (queen-led), sequential.**
- **Do NOT** use mesh/adaptive topology, spawn a large free-ranging cloud of agents, or let agents
  wander. **Small and directed beats big and loose.**

## §4. Looping tactics — compose these, don't just fan out

- **Adversarial verify — this is `verifier ≠ author`, mechanized.** Never let the agent that
  produced a finding grade it. Spawn independent skeptics prompted to *refute*, **defaulting to
  refuted when uncertain**; keep the finding only if a majority fails to refute.
- **Perspective-diverse verify.** When a claim can fail several ways, give each verifier a distinct
  lens (correctness / security / does-it-reproduce / does-it-generalize-beyond-the-sample) rather
  than N identical refuters. Diversity catches failure modes redundancy can't.
- **Judge panel.** For design questions, generate N independent approaches from *different angles*
  (MVP-first, risk-first, user-first), score with parallel judges, synthesize from the winner while
  grafting the best ideas from the runners-up. Beats one-attempt-iterated when the solution space
  is wide.
- **Loop-until-dry.** For unknown-size discovery, keep spawning finders until K consecutive rounds
  surface nothing new. **Dedup against *everything seen*, not against what survived judging** — or
  rejected findings reappear every round and it never converges.
- **Multi-modal sweep.** Parallel agents each searching a *different way* (by call graph, by string,
  by live-system query, by git history). One angle never finds everything.
- **Completeness critic.** A final agent asking "what's missing — a modality not run, a claim
  unverified, a source unread?" Its answer is the next round of work.
- **No silent caps.** If you bound coverage (top-N, no-retry, sampling), **`log()` what was
  dropped.** Silent truncation reads as "covered everything" when it didn't.

**Adversarial consensus for high-stakes root causes:** ≥2 independent provers **plus one challenger
whose only job is to *refute*** each load-bearing claim against the code and the live system.
Accept only if the challenger fails to break it. This is how meta-findings surface — e.g. "the
environment runs a stale revision, not merged code."

**Scale to what was asked.** "Find any bugs" → a few finders, single-vote verify. "Thoroughly audit
this" → a larger finder pool, a 3–5 vote adversarial pass, and a synthesis stage.

## §5. Briefing agents & guarding context

**Every spawned agent inherits these — put them in the prompt, don't assume:**
- **What the ground truth is** — which environment/record/artifact to read, and that it must be
  read *fresh*.
- **Prove it live** — a merge, a CI-green, or a self-summary is not evidence.
- **Red test first** — a test that passes on its first run proves nothing.
- **Scope** — one issue, minimal diff, report dependencies rather than expanding.
- **What was already tried** — the known dead ends, so it doesn't re-tread them.

**Return distilled findings, not dumps.** A subagent may burn tens of thousands of tokens exploring
and must return a condensed result (aim for ~1–2k tokens): the conclusion, the evidence for it, and
the file:line citations. Tell it so explicitly. That asymmetry — deep exploration, narrow return —
is the entire reason subagents beat doing it inline.

**Retrieve just-in-time.** Prefer a query that answers the question over pre-loading files "in case
they're needed." Pull the identifier, then fetch what it points to.

**Pick the right layer for a rule** — this is what keeps the always-on context small:

| The rule is… | Put it in |
|---|---|
| Must be enforced deterministically, every time | A **hook** or a permission — not a prompt |
| Deep procedure needed only for certain tasks | A **skill** (loads on demand) |
| A big job needing its own clean context window | A **subagent** |
| A short fact or hard rule needed in every session | **`CLAUDE.md`** — and keep it short |

**Persist state across resets.** Long work outlives a context window. Write the loop's state log,
root causes, what worked, and — most importantly — **what did NOT work** to a durable repo doc or
capture corpus. Capturing dead ends is the part that actually breaks the circling: the next session
reads it instead of re-deriving it. If this project has a pre-brief/capture helper, run it before
any fan-out and paste the brief verbatim into every spawned agent's prompt.

## §6. The cloud tier (opt-in, credit-based) — last resort

A cloud execution layer (isolated sandboxes, hosted swarms, distributed training) is the heaviest
tier and **costs credits**. Reach for it only when local layers genuinely can't do the job — a
clean-room env, compute beyond the local box, or a swarm that must outlive the session. **Confirm
before any credit-spending call**; read-only calls are free.

**Escalation ladder (lightest first):** code graph → direct edit / one agent → **native `Workflow`
(the default engine, free)** → coordination-MCP swarm on explicit order → **cloud only** for the
above. Note that "cloud is the last resort" does *not* make local orchestration a last resort —
`Workflow` is the default engine for non-trivial work.

## §7. Scope & communication discipline (hard-won)

- **One issue, nothing else.** Minimal, scoped diffs. If a correct fix requires another
  work-stream's code, **STOP and report it as a dependency** — don't silently expand. But *fully*
  satisfy the one issue here and now, then ship it.
- **Don't go dark.** Surface a crisp status heartbeat during long work.
- **Use the inputs you were given.** Never re-ask for files/data/credentials already provided.
- **Don't make your partner the verifier** when you can check directly — go read the real output.
- **Don't re-test work you already verified in-session** — trust the evidence you just gathered.

## Common mistakes
- **Under-orchestrating (the #1 mistake):** grinding a research / multi-step / verification task out
  inline, or reaching for a lone `Agent()`, when it should have been a `Workflow`.
- Grepping/reading files for facts a graph query answers in one call.
- Forgetting `repo:` when multiple repos are indexed (query targets the wrong codebase).
- Trusting a stale branch or stale index instead of the deployed branch + live system (§0).
- A barrier (`parallel()` between stages) where a `pipeline()` would do.
- Spawning a swarm for a one-file fix; or spawning agents that aren't told who to report to.
- Letting the coder grade its own work; treating one agent's root cause as truth without a challenge.
- Polling agent status instead of waiting for messages/completion.
- Subagents that return raw dumps instead of distilled conclusions.
- Proliferating skills/agents; running an uncapped loop (always set a hard stop).
- Bounding coverage silently and reporting it as complete.
