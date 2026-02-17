import { describe, expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateProjectConsistency } from "../../src/core/consistency/validator.js";
import { buildPrdHash } from "../../src/core/prd/lock.js";

describe("consistency validator", () => {
  test("reports issues when lock file is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "otobot-consistency-"));
    const report = await validateProjectConsistency(root);
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.includes("prd.lock.json"))).toBe(true);
  });

  test("passes when core artifacts are valid", async () => {
    const root = await mkdtemp(join(tmpdir(), "otobot-consistency-valid-"));
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, ".claude"), { recursive: true });

    await writeFile(join(root, "docs", "prd.locked.md"), "# prd", "utf8");
    await writeFile(join(root, "docs", "decisions.md"), "# decisions", "utf8");
    await writeFile(join(root, "docs", "assumptions.md"), "# assumptions", "utf8");
    const prdHash = await buildPrdHash(root);
    await writeFile(
      join(root, "docs", "prd.lock.json"),
      JSON.stringify(
        {
          version: "1.2",
          contractVersion: "1.2",
          lockedAt: new Date().toISOString(),
          hashAlgo: "sha256",
          hashScope: ["assumptions.md", "decisions.md", "prd.locked.md"],
          prdHash,
          scope: { in: ["a"], out: ["b"] },
          changeRequestPolicy: {
            required: true,
            approvers: ["owner"],
            approvalMode: "any_of",
            requiredApprovals: 1,
            auditRequired: true,
            requiredEvidence: ["prd-diff"],
            approvalSlaHours: 24,
          },
          stackHints: { language: "ts", frameworks: ["node"], db: "sqlite" },
        },
        null,
        2,
      ),
      "utf8",
    );

    await writeFile(
      join(root, "docs", "task-graph.json"),
      JSON.stringify(
        {
          version: "1.2",
          epics: [],
        },
        null,
        2,
      ),
      "utf8",
    );

    await writeFile(join(root, ".claude", "settings.json"), JSON.stringify({ permissions: {} }, null, 2), "utf8");

    const report = await validateProjectConsistency(root);
    expect(report.ok).toBe(true);
  });
});
