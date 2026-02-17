import { describe, expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLockArtifacts } from "../../src/core/prd/lock.js";
import { checkReadiness } from "../../src/core/readiness/checker.js";

describe("readiness checker", () => {
  test("non-key score can be 100 while provider keys are missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "otobot-ready-"));
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, ".claude"), { recursive: true });
    await mkdir(join(root, ".github", "workflows"), { recursive: true });

    await writeFile(join(root, "prd.md"), "# PRD\n## Problem\nx\n", "utf8");
    await writeFile(join(root, ".claude", "settings.json"), JSON.stringify({ permissions: {} }, null, 2), "utf8");
    await writeFile(join(root, "docs", "release-runbook.md"), "# runbook", "utf8");
    await writeFile(join(root, ".github", "workflows", "ci.yml"), "name: ci", "utf8");
    await writeFile(join(root, ".github", "workflows", "nightly-real-e2e.yml"), "name: nightly", "utf8");

    await createLockArtifacts(root, join(root, "prd.md"), {
      language: "ts",
      frameworks: ["node"],
      db: "sqlite",
      commands: {
        install: "pnpm install",
        dev: "pnpm dev",
        build: "pnpm build",
        test: "pnpm test",
        lint: "pnpm lint",
        format: "pnpm format",
      },
    });

    await writeFile(join(root, "docs", "task-graph.json"), JSON.stringify({ version: "1.2", epics: [] }, null, 2), "utf8");

    const report = await checkReadiness(root);
    expect(report.nonKeyScore).toBe(100);
    expect(report.fullScore).toBeLessThan(100);
    expect(report.blockers.some((blocker) => blocker.includes("Missing API key for openai"))).toBe(true);
    expect(report.blockers.some((blocker) => blocker.includes("Missing API key for anthropic"))).toBe(true);
  });
});
