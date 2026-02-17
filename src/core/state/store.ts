import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { otobotStateSchema, type OtobotState } from "../../contracts/state.js";
import type { ClaudeCapabilities, Provider, RoleModel } from "../../contracts/state.js";

export type { OtobotState };

const STATE_FILE = join(".otobot", "state.json");

interface LegacyStateV11 {
  version: "1.1";
  projectId: string;
  state: string;
  policyVersion: string;
  lockVersion: string;
  activeProvider: { provider: Provider; modelId: string };
  roles: { planner: RoleModel; executor: RoleModel; reviewer: RoleModel };
  capabilities: ClaudeCapabilities;
  paths: { prdLocked: string; prdLockJson: string; taskGraph: string };
}

export function defaultCapabilities(): ClaudeCapabilities {
  return {
    printMode: false,
    outputFormats: ["text"],
    resumeLatest: false,
    resumeById: false,
    allowedToolsFlag: false,
    initWorkflow: false,
  };
}

export function createDefaultState(projectPath: string): OtobotState {
  return {
    version: "1.2",
    projectId: randomUUID(),
    state: "IDLE",
    policyVersion: "2026-02-17",
    lockVersion: "1.2",
    activeProvider: {
      provider: "openai",
      modelId: "gpt-5.2",
    },
    roles: {
      planner: {
        type: "provider",
        provider: "openai",
        modelId: "gpt-5.2",
      },
      executor: {
        type: "claude_code",
      },
      reviewer: {
        type: "provider",
        provider: "anthropic",
        modelId: "claude-opus-4-6",
      },
    },
    capabilities: defaultCapabilities(),
    paths: {
      prdLocked: join(projectPath, "docs", "prd.locked.md"),
      prdLockJson: join(projectPath, "docs", "prd.lock.json"),
      taskGraph: join(projectPath, "docs", "task-graph.json"),
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
        commands: 0,
        errors: 0,
        builds: 0,
      },
      latency: {
        commandCount: 0,
        totalMs: 0,
        avgMs: 0,
        lastCommandMs: 0,
        lastBuildMs: 0,
      },
      failureBuckets: {
        command: 0,
        build: 0,
        provider: 0,
      },
      providerHealth: {
        openai: "unknown",
        google: "unknown",
        anthropic: "unknown",
      },
    },
  };
}

function migrateFromLegacy(projectPath: string, legacy: LegacyStateV11): OtobotState {
  return {
    ...createDefaultState(projectPath),
    projectId: legacy.projectId,
    state: legacy.state,
    policyVersion: legacy.policyVersion,
    activeProvider: legacy.activeProvider,
    roles: legacy.roles,
    capabilities: legacy.capabilities,
    paths: legacy.paths,
  };
}

export async function loadState(projectPath: string): Promise<OtobotState | null> {
  const filePath = join(projectPath, STATE_FILE);
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as LegacyStateV11 | OtobotState;

    if ((parsed as { version?: string }).version === "1.1") {
      const migrated = migrateFromLegacy(projectPath, parsed as LegacyStateV11);
      await saveState(projectPath, migrated);
      return migrated;
    }

    return otobotStateSchema.parse(parsed);
  } catch {
    return null;
  }
}

export async function saveState(projectPath: string, state: OtobotState): Promise<void> {
  const filePath = join(projectPath, STATE_FILE);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}

export async function ensureState(projectPath: string): Promise<OtobotState> {
  const current = await loadState(projectPath);
  if (current) {
    return current;
  }

  const next = createDefaultState(projectPath);
  await saveState(projectPath, next);
  return next;
}
