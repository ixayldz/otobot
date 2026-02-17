import { describe, expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLockArtifacts, validateLockHash } from "../../src/core/prd/lock.js";

describe("prd lock", () => {
  test("creates lock and validates hash", async () => {
    const root = await mkdtemp(join(tmpdir(), "otobot-lock-"));
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "prd.md"), "# PRD\n## Goal\nShip MVP", "utf8");
    await writeFile(join(root, "docs", "decisions.md"), "# decisions", "utf8");
    await writeFile(join(root, "docs", "assumptions.md"), "# assumptions", "utf8");

    const lock = await createLockArtifacts(root, join(root, "prd.md"), {
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

    expect(lock.version).toBe("1.2");
    expect(lock.changeRequestPolicy.requiredEvidence.length).toBeGreaterThan(0);
    expect(lock.changeRequestPolicy.approvalSlaHours).toBe(24);

    const check = await validateLockHash(root);
    expect(check.valid).toBe(true);
  });
});
