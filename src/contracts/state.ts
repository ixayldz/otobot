import { z } from "zod";

export const providerSchema = z.enum(["openai", "google", "anthropic"]);

export const roleModelSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("provider"),
    provider: providerSchema,
    modelId: z.string().min(1),
  }),
  z.object({
    type: z.literal("claude_code"),
  }),
]);

export const claudeCapabilitiesSchema = z.object({
  printMode: z.boolean(),
  outputFormats: z.array(z.enum(["text", "json", "stream-json"])).default(["text"]),
  resumeLatest: z.boolean(),
  resumeById: z.boolean(),
  allowedToolsFlag: z.boolean(),
  initWorkflow: z.boolean(),
});

export const statePathsSchema = z.object({
  prdLocked: z.string(),
  prdLockJson: z.string(),
  taskGraph: z.string(),
});

export const sessionSchema = z.object({
  currentTaskId: z.string().nullable(),
  pausedAt: z.string().nullable(),
  resumeToken: z.string().nullable(),
  watchSessionId: z.string().nullable(),
  lastActiveState: z.string().nullable(),
  checkpointId: z.string().nullable().default(null),
  lastFailureReason: z.string().nullable().default(null),
  retryBudget: z.number().int().nonnegative().default(2),
});

export const sandboxSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["docker", "podman", "none"]),
  profile: z.enum(["strict", "balanced", "off"]),
});

export const policySchema = z.object({
  activePack: z.string().min(1),
  hash: z.string(),
  lastAppliedAt: z.string().nullable(),
});

export const pluginSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  enabled: z.boolean(),
  integrity: z.string().default(""),
  permissions: z.array(z.string()).default([]),
  compatMinVersion: z.string().default("0.1.0"),
  installedAt: z.string().nullable().default(null),
  manifestPath: z.string().nullable().default(null),
});

export const providerHealthSchema = z.enum(["unknown", "healthy", "degraded", "unconfigured"]);

export const telemetrySchema = z.object({
  lastSloSnapshotAt: z.string().nullable(),
  counters: z.object({
    commands: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
    builds: z.number().int().nonnegative(),
  }),
  latency: z.object({
    commandCount: z.number().int().nonnegative().default(0),
    totalMs: z.number().nonnegative().default(0),
    avgMs: z.number().nonnegative().default(0),
    lastCommandMs: z.number().nonnegative().default(0),
    lastBuildMs: z.number().nonnegative().default(0),
  }),
  failureBuckets: z.object({
    command: z.number().int().nonnegative().default(0),
    build: z.number().int().nonnegative().default(0),
    provider: z.number().int().nonnegative().default(0),
  }),
  providerHealth: z.object({
    openai: providerHealthSchema.default("unknown"),
    google: providerHealthSchema.default("unknown"),
    anthropic: providerHealthSchema.default("unknown"),
  }),
});

export const otobotStateSchema = z.object({
  version: z.literal("1.2"),
  projectId: z.string().min(1),
  state: z.string().min(1),
  policyVersion: z.string().min(1),
  lockVersion: z.string().min(1),
  activeProvider: z.object({
    provider: providerSchema,
    modelId: z.string().min(1),
  }),
  roles: z.object({
    planner: roleModelSchema,
    executor: roleModelSchema,
    reviewer: roleModelSchema,
  }),
  capabilities: claudeCapabilitiesSchema,
  paths: statePathsSchema,
  session: sessionSchema,
  sandbox: sandboxSchema,
  policy: policySchema,
  plugins: z.array(pluginSchema),
  telemetry: telemetrySchema,
});

export const legacyStateV11Schema = z.object({
  version: z.literal("1.1"),
  projectId: z.string().min(1),
  state: z.string().min(1),
  policyVersion: z.string().min(1),
  lockVersion: z.string().min(1),
  activeProvider: z.object({
    provider: providerSchema,
    modelId: z.string().min(1),
  }),
  roles: z.object({
    planner: roleModelSchema,
    executor: roleModelSchema,
    reviewer: roleModelSchema,
  }),
  capabilities: claudeCapabilitiesSchema,
  paths: statePathsSchema,
});

export type LegacyStateV11 = z.infer<typeof legacyStateV11Schema>;
export type Provider = z.infer<typeof providerSchema>;
export type RoleModel = z.infer<typeof roleModelSchema>;
export type ClaudeCapabilities = z.infer<typeof claudeCapabilitiesSchema>;
export type ProviderHealth = z.infer<typeof providerHealthSchema>;
export type OtobotPlugin = z.infer<typeof pluginSchema>;
export type OtobotState = z.infer<typeof otobotStateSchema>;
