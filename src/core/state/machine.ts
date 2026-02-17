export const STATE_VALUES = [
  "IDLE",
  "PRD_LOADED",
  "INTERVIEWING",
  "LOCKED",
  "BOOTSTRAPPED",
  "HARDENED",
  "REFRESHED",
  "PLANNING",
  "IMPLEMENTING",
  "REVIEWING",
  "TESTING",
  "SHIPPED",
  "DEBUGGING",
  "CHANGE_REQUEST",
  "PAUSED",
  "FAILED",
  "ABORTED",
] as const;

export type OtobotMachineState = (typeof STATE_VALUES)[number];

export class StateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateTransitionError";
  }
}

const ALWAYS_ALLOWED_TARGETS: OtobotMachineState[] = ["PAUSED", "FAILED", "ABORTED", "CHANGE_REQUEST"];

const transitionMap: Record<OtobotMachineState, OtobotMachineState[]> = {
  IDLE: ["PRD_LOADED"],
  PRD_LOADED: ["INTERVIEWING", "LOCKED"],
  INTERVIEWING: ["PRD_LOADED", "LOCKED"],
  LOCKED: ["BOOTSTRAPPED", "CHANGE_REQUEST"],
  BOOTSTRAPPED: ["HARDENED", "CHANGE_REQUEST"],
  HARDENED: ["REFRESHED", "PLANNING", "CHANGE_REQUEST"],
  REFRESHED: ["PLANNING", "CHANGE_REQUEST"],
  PLANNING: ["IMPLEMENTING", "CHANGE_REQUEST"],
  IMPLEMENTING: ["REVIEWING", "PLANNING", "CHANGE_REQUEST"],
  REVIEWING: ["TESTING", "IMPLEMENTING", "PLANNING", "CHANGE_REQUEST"],
  TESTING: ["SHIPPED", "DEBUGGING", "CHANGE_REQUEST"],
  SHIPPED: ["PLANNING", "CHANGE_REQUEST", "PRD_LOADED"],
  DEBUGGING: ["TESTING", "IMPLEMENTING", "CHANGE_REQUEST"],
  CHANGE_REQUEST: ["PRD_LOADED", "INTERVIEWING", "LOCKED", "ABORTED"],
  PAUSED: ["IDLE", "PRD_LOADED", "INTERVIEWING", "LOCKED", "BOOTSTRAPPED", "HARDENED", "REFRESHED", "PLANNING", "IMPLEMENTING", "REVIEWING", "TESTING", "DEBUGGING", "CHANGE_REQUEST", "FAILED", "ABORTED", "SHIPPED"],
  FAILED: ["PLANNING", "IMPLEMENTING", "DEBUGGING", "ABORTED"],
  ABORTED: ["IDLE"],
};

export interface TransitionContext {
  hasLock?: boolean;
  isHardened?: boolean;
  hashMismatch?: boolean;
}

export function assertTransition(
  current: OtobotMachineState,
  next: OtobotMachineState,
  context: TransitionContext = {},
): void {
  if (context.hashMismatch && next !== "CHANGE_REQUEST") {
    throw new StateTransitionError("Hash mismatch requires transition to CHANGE_REQUEST.");
  }

  if (ALWAYS_ALLOWED_TARGETS.includes(next)) {
    return;
  }

  if (next === "BOOTSTRAPPED" && !context.hasLock) {
    throw new StateTransitionError("Cannot bootstrap without LOCKED state/lock artifacts.");
  }

  if (["PLANNING", "IMPLEMENTING", "REVIEWING", "TESTING"].includes(next) && !context.isHardened) {
    throw new StateTransitionError("Cannot enter build flow before HARDENED state.");
  }

  const allowed = transitionMap[current] ?? [];
  if (!allowed.includes(next)) {
    throw new StateTransitionError(`Invalid transition: ${current} -> ${next}`);
  }
}
