# NWKS Encounter Backend — Implementation Plan Index

Full ministry backend + admin panel for the NWKS Encounter site. Built on Cloudflare
(Pages Functions + D1 + R2 + KV), free-tier, single codebase partitioned by
`program` (mens/women). See the design spec: `../specs/2026-07-23-nwks-encounter-backend-design.md`.

## Read order

1. **[Plan 00 — Foundation Contract](2026-07-23-nwks-encounter-00-foundation.md)** — repo layout, D1 schema, API surface, shared module signatures, bindings, testing, deploy. **The authoritative contract** (with the v2 Addenda that reconcile all phases). Read this first.
2. **[Plan P0 — Scaffold & Shared Modules](2026-07-23-nwks-encounter-p0-scaffold.md)** — buildable TDD tasks for the scaffold, migrations, `db/auth/email/dedupe`, Hono app, test harness, build/seed scripts.
3. **[Plan P1 — Public Registration & Thank-You Email](2026-07-23-nwks-encounter-p1-registration.md)**
4. **[Plan P2 — Admin Panel (auth, dashboard, lists, profiles, CSV, matching)](2026-07-23-nwks-encounter-p2-admin.md)**
5. **[Plan P3 — Event/Date Manager & Gateway Sync](2026-07-23-nwks-encounter-p3-events-gateway.md)**
6. **[Plan P4 — Email Center (templates, segments, scheduling)](2026-07-23-nwks-encounter-p4-email-center.md)**
7. **[Plan P5 — AI Ops Assistant (Opus, draft-and-approve)](2026-07-23-nwks-encounter-p5-ai-assistant.md)**
8. **[Plan P6 — Public Photo Gallery (R2)](2026-07-23-nwks-encounter-p6-gallery.md)**
9. **[Plan 07 — Open Items & Launch Runbook](2026-07-23-nwks-encounter-07-launch-runbook.md)** — provisioning, secrets, DNS/SPF/DKIM, deploy, smoke test. Human-in-the-loop, last.

## Dependency graph

```
00 (contract) ── P0 ──┬── P1 ──┬── P2 ──┬── P3
                      │        │        ├── P4 ── P5
                      │        │        └── P6
                      └────────┴────────┴── 07 (launch, needs all)
```

## Build strategy

Per-task TDD via **superpowers:subagent-driven-development** (fresh subagent per task,
review between). P0 → P1 → P2 are the critical path; after P2, **P3 / P4 / P6 are largely
independent** and can be built in parallel; P5 depends on P4. Everything builds and tests
locally against miniflare (D1/R2/KV) with no Cloudflare account or API keys — those are
launch gates in Plan 07.
