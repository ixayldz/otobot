import { describe, expect, test } from "vitest";
import { setActiveModel } from "../../src/core/providers/state.js";
import { createDefaultState } from "../../src/core/state/store.js";

describe("provider state", () => {
  test("syncs planner and reviewer when model changes", () => {
    const initial = createDefaultState("C:\\repo");
    const next = setActiveModel(initial, "google", "gemini-3-pro-preview");

    expect(next.activeProvider).toEqual({ provider: "google", modelId: "gemini-3-pro-preview" });
    expect(next.roles.planner).toEqual({
      type: "provider",
      provider: "google",
      modelId: "gemini-3-pro-preview",
    });
    expect(next.roles.reviewer).toEqual({
      type: "provider",
      provider: "google",
      modelId: "gemini-3-pro-preview",
    });
    expect(next.roles.executor).toEqual({ type: "claude_code" });
  });

  test("syncs executor only when executor uses provider role", () => {
    const initial = createDefaultState("C:\\repo");
    initial.roles.executor = {
      type: "provider",
      provider: "openai",
      modelId: "gpt-5.2",
    };

    const next = setActiveModel(initial, "anthropic", "claude-opus-4-6");

    expect(next.roles.executor).toEqual({
      type: "provider",
      provider: "anthropic",
      modelId: "claude-opus-4-6",
    });
  });
});
