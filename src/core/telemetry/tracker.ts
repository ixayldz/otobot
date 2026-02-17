import type { OtobotState } from "../../contracts/state.js";

export type ProviderHealthMap = OtobotState["telemetry"]["providerHealth"];

export function withCommandTelemetry(state: OtobotState, hadError: boolean, durationMs: number): OtobotState {
  const latency = state.telemetry.latency;
  const commandCount = latency.commandCount + 1;
  const totalMs = latency.totalMs + Math.max(0, durationMs);

  return {
    ...state,
    telemetry: {
      ...state.telemetry,
      counters: {
        ...state.telemetry.counters,
        commands: state.telemetry.counters.commands + 1,
        errors: state.telemetry.counters.errors + (hadError ? 1 : 0),
      },
      latency: {
        commandCount,
        totalMs,
        avgMs: commandCount === 0 ? 0 : Math.round((totalMs / commandCount) * 100) / 100,
        lastCommandMs: Math.max(0, durationMs),
        lastBuildMs: latency.lastBuildMs,
      },
      failureBuckets: {
        ...state.telemetry.failureBuckets,
        command: state.telemetry.failureBuckets.command + (hadError ? 1 : 0),
      },
    },
  };
}

export function withBuildTelemetry(state: OtobotState, durationMs: number, succeeded: boolean): OtobotState {
  return {
    ...state,
    telemetry: {
      ...state.telemetry,
      counters: {
        ...state.telemetry.counters,
        builds: state.telemetry.counters.builds + 1,
      },
      latency: {
        ...state.telemetry.latency,
        lastBuildMs: Math.max(0, durationMs),
      },
      failureBuckets: {
        ...state.telemetry.failureBuckets,
        build: state.telemetry.failureBuckets.build + (succeeded ? 0 : 1),
      },
      lastSloSnapshotAt: new Date().toISOString(),
    },
  };
}

export function withProviderHealth(state: OtobotState, health: ProviderHealthMap): OtobotState {
  const degradedCount = Object.values(health).filter((status) => status === "degraded").length;
  return {
    ...state,
    telemetry: {
      ...state.telemetry,
      providerHealth: health,
      failureBuckets: {
        ...state.telemetry.failureBuckets,
        provider: state.telemetry.failureBuckets.provider + degradedCount,
      },
      lastSloSnapshotAt: new Date().toISOString(),
    },
  };
}
