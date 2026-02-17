import { describe, expect, test } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommandWithSandbox } from "../../src/core/sandbox/executor.js";

describe("sandbox executor", () => {
  test("blocks strict ask-pattern command", async () => {
    const root = await mkdtemp(join(tmpdir(), "otobot-sandbox-"));
    const result = await runCommandWithSandbox({
      projectRoot: root,
      command: "curl https://example.com",
      sandbox: {
        enabled: true,
        provider: "none",
        profile: "strict",
      },
      policy: {
        name: "strict",
        version: "1.0.0",
        description: "strict",
        permissions: {
          deny: [],
          ask: ["curl *"],
          allow: [],
        },
        diffBudget: {
          maxFiles: 1,
          maxLines: 1,
        },
        riskRules: {
          requireSecurityReviewOnHighRisk: true,
          maxHighRiskTasks: 1,
        },
      },
      execute: false,
    });

    expect(result.blocked).toBe(true);
    expect(result.ok).toBe(false);
  });

  test("executes local command when enabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "otobot-sandbox-local-"));
    const result = await runCommandWithSandbox({
      projectRoot: root,
      command: "echo hello",
      sandbox: {
        enabled: false,
        provider: "none",
        profile: "off",
      },
      policy: null,
      execute: true,
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("local");
  });
});
