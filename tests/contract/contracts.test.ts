import { describe, expect, test } from "vitest";
import { otobotStateSchema } from "../../src/contracts/state.js";
import { prdLockSchema } from "../../src/contracts/lock.js";
import { taskGraphSchema } from "../../src/contracts/taskGraph.js";
import { pluginManifestSchema } from "../../src/contracts/pluginManifest.js";

describe("contract schemas", () => {
  test("state schema validates", () => {
    const parsed = otobotStateSchema.parse({
      version: "1.2",
      projectId: "abc",
      state: "LOCKED",
      policyVersion: "2026-02-17",
      lockVersion: "1.2",
      activeProvider: { provider: "openai", modelId: "gpt-5" },
      roles: {
        planner: { type: "provider", provider: "openai", modelId: "gpt-5" },
        executor: { type: "claude_code" },
        reviewer: { type: "provider", provider: "anthropic", modelId: "claude-opus-4-1" },
      },
      capabilities: {
        printMode: true,
        outputFormats: ["text", "json"],
        resumeLatest: true,
        resumeById: true,
        allowedToolsFlag: true,
        initWorkflow: true,
      },
      paths: {
        prdLocked: "docs/prd.locked.md",
        prdLockJson: "docs/prd.lock.json",
        taskGraph: "docs/task-graph.json",
      },
      session: {
        currentTaskId: null,
        pausedAt: null,
        resumeToken: null,
        watchSessionId: null,
        lastActiveState: null,
        checkpointId: null,
        lastFailureReason: null,
        retryBudget: 2,
      },
      sandbox: {
        enabled: false,
        provider: "none",
        profile: "off",
      },
      policy: {
        activePack: "default-balanced",
        hash: "",
        lastAppliedAt: null,
      },
      plugins: [],
      telemetry: {
        lastSloSnapshotAt: null,
        counters: {
          commands: 1,
          errors: 0,
          builds: 0,
        },
        latency: {
          commandCount: 1,
          totalMs: 20,
          avgMs: 20,
          lastCommandMs: 20,
          lastBuildMs: 0,
        },
        failureBuckets: {
          command: 0,
          build: 0,
          provider: 0,
        },
        providerHealth: {
          openai: "healthy",
          google: "unconfigured",
          anthropic: "degraded",
        },
      },
    });

    expect(parsed.version).toBe("1.2");
  });

  test("lock schema validates", () => {
    const parsed = prdLockSchema.parse({
      version: "1.2",
      contractVersion: "1.2",
      lockedAt: new Date().toISOString(),
      hashAlgo: "sha256",
      hashScope: ["prd.locked.md"],
      prdHash: "hash",
      scope: { in: ["a"], out: ["b"] },
      changeRequestPolicy: {
        required: true,
        approvers: ["owner"],
        approvalMode: "any_of",
        requiredApprovals: 1,
        auditRequired: true,
        requiredEvidence: ["prd-diff", "review-note"],
        approvalSlaHours: 24,
      },
      stackHints: { language: "ts", frameworks: ["node"], db: "sqlite" },
    });

    expect(parsed.contractVersion).toBe("1.2");
  });

  test("task graph schema validates", () => {
    const parsed = taskGraphSchema.parse({
      version: "1.2",
      epics: [
        {
          id: "E1",
          name: "Epic",
          stories: [
            {
              id: "S1",
              name: "Story",
              tasks: [
                {
                  id: "T1",
                  name: "Task",
                  acceptanceCriteria: ["ok"],
                  risk: "low",
                  expectedTouched: ["a"],
                  tests: ["pnpm test"],
                  verificationSteps: ["manual"],
                  rollbackPlan: ["revert"],
                  blastRadius: "module",
                  dependsOn: [],
                  ownerRole: "executor",
                  estimate: 1,
                  retries: 1,
                  status: "planned",
                  sourcePrdSections: ["Problem"],
                  qualityGates: ["review", "tests"],
                  riskControls: ["limit blast radius"],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(parsed.epics[0]?.stories[0]?.tasks[0]?.id).toBe("T1");
  });

  test("plugin manifest schema validates", () => {
    const parsed = pluginManifestSchema.parse({
      name: "sample-plugin",
      version: "1.0.0",
      entry: "index.js",
      permissions: ["read:project"],
      integrity: "abc123",
      compat: {
        minOtobotVersion: "0.1.0",
      },
    });

    expect(parsed.name).toBe("sample-plugin");
  });
});
