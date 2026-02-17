# Repository Guidelines

## Project Structure & Module Organization
- `src/cli`: CLI entry, command routing, REPL (`main.ts`, `app.ts`, `repl.ts`)
- `src/core`: domain modules (`prd`, `state`, `build`, `claude`, `providers`, `audit`, `security`, etc.)
- `src/contracts`: Zod-backed public contracts (`state`, `lock`, `taskGraph`, `pluginManifest`)
- `src/db`: metadata persistence
- `tests/unit`, `tests/integration`, `tests/contract`: Vitest suites by scope
- `docs`: generated artifacts (`prd.locked.md`, `decisions.md`, `assumptions.md`, `prd.lock.json`)
- `.otobot`: runtime state, audit logs, caches, plugin/policy data

## Build, Test, and Development Commands
- `pnpm dev` runs the TypeScript CLI directly (`tsx src/index.ts`)
- `pnpm build` compiles to `dist/` via `tsup`
- `pnpm test` runs all tests
- `pnpm test:integration` runs only integration tests
- `pnpm test:contract` validates contract compatibility
- `pnpm lint` runs strict typecheck gate (`tsc --noEmit`)

Example direct command run:
`pnpm dev run "/doctor"`
`pnpm dev run "/sandbox run echo ok"`

## Coding Style & Naming Conventions
- Language: TypeScript (Node 20+), ES modules
- Indentation: 2 spaces; keep code ASCII unless file already requires Unicode
- Naming: `camelCase` for functions/variables, `PascalCase` for classes/types, kebab-style filenames for docs/scripts
- Keep module boundaries explicit: contracts in `src/contracts`, orchestration in `src/cli`, behavior in `src/core`

## Testing Guidelines
- Framework: Vitest
- Add tests with every behavior change:
- `tests/unit/*` for pure logic (state, parser, redaction, detectors)
- `tests/integration/*` for end-to-end command flow
- `tests/contract/*` for schema/version guarantees
- Test file naming: `*.test.ts`

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- PRs should include:
- scope summary and rationale
- linked issue/requirement (`prd.md` section or task id)
- verification evidence (`pnpm test`, `pnpm build`, or CLI output)
- risk notes (state transitions, security, migration impact)

## Security & Configuration Tips
- Never log or commit raw keys/secrets; audit is redacted by design
- Prefer `/key set <provider> <value>` and OS keychain fallback over plaintext files
- Respect protected paths (`.env`, `secrets/**`, key files) and keep lock/hash gate intact before `/build`

