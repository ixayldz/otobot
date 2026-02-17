import type { OtobotState, Provider, RoleModel } from "../../contracts/state.js";

export function setActiveModel(state: OtobotState, provider: Provider, modelId: string): OtobotState {
  return {
    ...state,
    activeProvider: { provider, modelId },
    roles: {
      ...state.roles,
      planner: {
        type: "provider",
        provider,
        modelId,
      },
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
