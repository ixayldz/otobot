# Release Runbook

## Preconditions
- `pnpm test` passes locally.
- `pnpm build` succeeds.
- `ci` workflow is green.
- `nightly-real-e2e` last run is green or explicitly waived.

## Release Checklist
1. Confirm PRD lock is valid:
   - `node dist/index.js run "/doctor"` and verify `consistency.ok: true`.
2. Verify provider runtime sync:
   - `node dist/index.js run "/model list openai"` contains `(runtime)`.
   - `node dist/index.js run "/model list google"` contains `(runtime)`.
   - `node dist/index.js run "/model list anthropic"` contains `(runtime)`.
3. Verify hardening and policy:
   - `node dist/index.js run "/harden"`
   - `node dist/index.js run "/policy pack apply strict"`
4. Run build lifecycle:
   - `node dist/index.js run "/build"`
   - Confirm final state `SHIPPED` in `.otobot/state.json`.
5. Verify audit hygiene:
   - `.otobot/audit/*.jsonl` contains no raw secrets.

## Rollback
1. Revert release commit.
2. Re-run `pnpm build && pnpm test`.
3. Restore previous lock artifact if needed:
   - `docs/prd.lock.json`
   - `docs/prd.locked.md`
4. Create incident note with:
   - failing task id
   - audit event ids
   - mitigation and follow-up action items
