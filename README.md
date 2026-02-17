# Otobot

Otobot is a PRD-driven CLI + REPL orchestrator that enforces a controlled delivery path:

`/read -> /interview start -> /lock -> /bootstrap -> /harden -> /build -> /ready`

It is built to reduce scope drift, enforce review/test gates, and keep an auditable execution trail.

## What It Solves
- PRD scope protection with lock hash verification.
- State-machine guardrails so review/test phases cannot be skipped.
- Runtime provider health checks with fallback handling.
- Security controls (deny rules, hooks, audit redaction).
- Resumable execution and project-level telemetry.

## Repository Structure
```text
src/
  cli/        CLI bootstrap, routing, REPL
  core/       Domain modules (prd, build, policy, sandbox, providers, watch)
  contracts/  Zod schemas (state, lock, taskGraph, pluginManifest)
  db/         Metadata persistence
docs/         Decision artifacts, lock files, runbooks
tests/        unit, integration, contract
```

## Requirements
- Node.js `>=20`
- `pnpm`
- Optional provider keys for runtime model checks

## Quick Start
```bash
pnpm install
pnpm build
pnpm dev run "/doctor"
pnpm dev run "/read prd.md"
# After /read, you can talk in natural language (no slash) for PRD refinements
pnpm dev run "login gereksinimlerini netlestirelim"
pnpm dev run "/interview start"
pnpm dev run "/lock"
pnpm dev run "/bootstrap"
pnpm dev run "/harden"
pnpm dev run "/build"
pnpm dev run "/ready"
```

## Command Groups
- General: `/help`, `/doctor`, `/ready`, `/exit`
- PRD flow: `/read`, `/interview start`, `/lock`
- Build flow: `/bootstrap`, `/harden`, `/refresh`, `/build`
- Provider and keys: `/model`, `/roles`, `/key`
- PRD chat: `/chat on|off|status|reset|<message>` or direct natural language after `/read`
- Runtime control: `/watch start|status|stop`, `/pause`, `/resume`
- Policy and sandbox: `/policy pack list|apply <name>`, `/sandbox on|off|status`, `/sandbox run <command>`
- Plugin and audit: `/plugin list|install|remove`, `/audit prune [--days N]`

## Quality Gates
Run before pushing:
```bash
pnpm lint
pnpm test
pnpm test:contract
pnpm test:integration
pnpm build
```

CI and operational references:
- `.github/workflows/ci.yml`
- `.github/workflows/nightly-real-e2e.yml`
- `docs/release-runbook.md`

## Readiness and Keys
`/ready` reports:
- `nonKey.score`: engineering readiness without provider key checks.
- `full.score`: includes live provider runtime checks.

Key commands:
```bash
pnpm dev run "/key set google <KEY>"
pnpm dev run "/key set openai <KEY>"
pnpm dev run "/key set anthropic <KEY>"
pnpm dev run "/key delete google"
```

## Governance
Decision order:
1. `prd.md` (normative source)
2. `docs/decision-summary.md`
3. `idea.md` and `research.md`

All product/technical changes should be reflected in `prd.md` first, then synced to implementation and docs.

## Troubleshooting
- `database is locked`: retry; metadata falls back to JSON when SQLite is transiently locked.
- `consistency.ok: false`: run `/lock`, `/harden`, then `/build`.
- Provider health issues: verify key and rerun `/model list <provider>`.
