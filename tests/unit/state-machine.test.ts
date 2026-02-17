import { describe, expect, test } from "vitest";
import { assertTransition, StateTransitionError } from "../../src/core/state/machine.js";

describe("state machine", () => {
  test("allows valid transition", () => {
    expect(() => assertTransition("IDLE", "PRD_LOADED")).not.toThrow();
  });

  test("blocks bootstrap without lock", () => {
    expect(() => assertTransition("PRD_LOADED", "BOOTSTRAPPED", { hasLock: false })).toThrow(StateTransitionError);
  });

  test("forces change request on hash mismatch", () => {
    expect(() => assertTransition("HARDENED", "PLANNING", { hashMismatch: true })).toThrow(StateTransitionError);
    expect(() => assertTransition("HARDENED", "CHANGE_REQUEST", { hashMismatch: true })).not.toThrow();
  });
});
