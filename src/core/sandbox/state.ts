import type { OtobotState } from "../../contracts/state.js";

export function setSandboxEnabled(
  state: OtobotState,
  enabled: boolean,
  provider: "docker" | "podman" | "none",
  profile: "strict" | "balanced" | "off",
): OtobotState {
  return {
    ...state,
    sandbox: {
      enabled,
      provider,
      profile,
    },
  };
}

export function sandboxStatus(state: OtobotState): string {
  return `enabled=${state.sandbox.enabled} provider=${state.sandbox.provider} profile=${state.sandbox.profile}`;
}
