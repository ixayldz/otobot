import type { OtobotState, Provider, RoleModel } from "../../contracts/state.js";

export function setActiveModel(state: OtobotState, provider: Provider, modelId: string): OtobotState {
  const syncedProviderRole: RoleModel = {
    type: "provider",
    provider,
    modelId,
  };

  const syncedExecutor: RoleModel =
    state.roles.executor.type === "provider"
      ? {
          type: "provider",
          provider,
          modelId,
        }
      : state.roles.executor;

  return {
    ...state,
    activeProvider: { provider, modelId },
    roles: {
      planner: syncedProviderRole,
      reviewer: { ...syncedProviderRole },
      executor: syncedExecutor,
    },
  };
}

export function parseRoleToken(token: string): RoleModel {
  if (token === "claude_code") {
    return { type: "claude_code" };
  }

  const [provider, modelId] = token.split(":");
  if (!provider || !modelId) {
    throw new Error(`Invalid role token: ${token}`);
  }

  if (!["openai", "google", "anthropic"].includes(provider)) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return {
    type: "provider",
    provider: provider as Provider,
    modelId,
  };
}

export function setRoles(state: OtobotState, planner: RoleModel, reviewer: RoleModel, executor: RoleModel): OtobotState {
  return {
    ...state,
    roles: {
      planner,
      reviewer,
      executor,
    },
  };
}
