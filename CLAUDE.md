# Project Manifest

## North Star
Deliver scoped, testable changes aligned with locked PRD.

## Scope
- In: MVP workflow execution with lock gates
- Out: automatic production deployment

## Command Matrix
- install: pnpm install
- dev: tsx src/index.ts
- build: tsup src/index.ts --format esm --dts --clean --target node20
- test: vitest run
- lint: pnpm typecheck
- format: prettier --write .

## Definition of Done
- Scope aligned with locked PRD
- Review and tests pass
- No secret exposure
- Audit trail updated

## Architecture Boundaries
- CLI orchestration under src/cli
- Domain logic under src/core
- Contracts under src/contracts

## Security Non-Negotiables
- Never edit protected secret files
- Never log raw credentials or tokens

## PRD Lock Protocol
- Hash mismatch requires CHANGE_REQUEST state
