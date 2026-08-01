---
name: onboarding
description: Use at the START of any session in a loopkit repo, when setting up the dev environment, or when you need the project map (where everything lives — services, environments, key docs, people, deploy path). This is the first skill to read on a new machine or a fresh repo (the `go` / `/go` bootstrap and the `/onboard` project-adoption flow).
---

# Onboarding ("Go")

## Overview

loopkit makes a fresh checkout productive in one command, then adapts itself to *this* project.
There are two moves — a machine/repo bootstrap, and a one-time project adoption:

1. **`./go`** (terminal) or **`/go`** (Claude Code) — wires the intelligence layer (GitNexus
   code-graph + Ruflo coordination/memory/hooks), indexes the repo(s), opens the GitNexus web UI.
   Idempotent; safe to re-run. Flags: `--no-browser`, `--repos "a b c"`, `--install-into <dir>`.
2. **`/onboard`** — the *dynamic* step. It interviews you about this system and writes the
   project-specific context into the template slots: the **Project context** section of
   `CLAUDE.md`, and `references/project-map.md`. Re-run it any time the project changes.

**The kit ships with zero project content.** Everything project-specific arrives via `/onboard`.
That is what makes it droppable into any repo without dragging another project's names, context, or
config along.

## Where everything lives → `references/project-map.md`

Read **[references/project-map.md](references/project-map.md)** for the full map of this project:
the services/repos and their roles, the environments (dev/QA/prod) and how to reach each, the key
docs and data sources, the people and their roles, the deploy/CI path, and how to run/verify the
system end-to-end. **When you need a fact ("where is X / who owns Y / how is Z deployed"), look
there first.** If it still reads like a blank template, the project hasn't been onboarded — run
`/onboard`.

## What `/onboard` asks (and why)

| It asks | So the kit can… |
|---|---|
| Name + one-line purpose of the system | Describe the project in every artifact and PR |
| Domain / stack (languages, frameworks, services) | Choose the right test layer and agent types |
| Current phase — architecting / building / debugging | Know which protocol leads right now |
| Where everything lives (services, envs, docs, data) | Fill `project-map.md` so facts are one lookup away |
| **How you know a change works** (the real artifact / ground truth for *verify*) | Make testing portable — this is the most important answer |
| People, roles, stakeholders | Route hand-offs and write self-sufficient artifacts |
| Extra domain guardrails / constraints | Append project-specific rules to `CLAUDE.md` |

## Keep the environment fresh (before trusting code facts)

Stale state causes most wrong root causes. Before relying on anything:
- **Pull the deployed branch.** `git -C <repo> fetch && git pull` on the branch that actually runs.
- **Re-index GitNexus** when `context` warns stale, or after ≥5 file changes: `gitnexus analyze
  --skills`. Re-running `./go` does this for every repo.
- **Index any new repo** so the graph stays complete (`gitnexus analyze`; `gitnexus list`).
- **Read the live system, not the doc** — the ticket/spec is your strongest hypothesis, not gospel.

## When to reach for each layer (intelligent timing)

| Situation | Reach for |
|---|---|
| "How does X work / what calls X / blast radius of changing Y" | **The code graph** (`query`/`context`/`impact`/`trace`) — before grepping |
| One genuinely focused thing (one file, one lookup, one question) | Do it directly / one named agent. No fan-out. |
| **Anything else non-trivial — research, multi-step, multi-file** | **`Workflow`** → `pipeline()` over the work-list. This is the default. |
| Several independent pieces at once | `Workflow` → `pipeline()`, or all Agents spawned in ONE message |
| Sequential dependency (research → design → build → test → review) | `Workflow` → `pipeline()` (no barriers), or A→B→C→D via SendMessage |
| A root cause that will drive a big change, or a contested design call | **Adversarial consensus** — provers + a challenger whose only job is to refute |

Details + full pattern: the `orchestration` skill. Protocols: `protocol-architecting`,
`protocol-debugging`, `protocol-testing`.

## The non-negotiables (read these into every task)
1. **Query the graph before grepping;** pass `repo:` when multiple repos are indexed.
2. **Diagnose against the deployed branch + live system — never a stale branch.** Most "shipped but
   still broken" = a stale deploy, not a code bug.
3. **Red-test-first; the verifier is never the author; verify against the real artifact.**
4. **Design the fix as a LOOP** (trigger → execute → verify → state-log, hard stop) before touching
   code; keep it generalizable, scoped to one issue, and don't go dark.
