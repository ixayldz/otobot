import { describe, expect, test } from "vitest";
import { detectUnknowns } from "../../src/core/prd/unknownDetector.js";

describe("unknown detector", () => {
  test("covers billing and realtime categories when missing from PRD", () => {
    const unknowns = detectUnknowns({
      raw: "# PRD\n## Goal\nShip MVP",
      sections: [],
    });

    const categories = unknowns.map((item) => item.category);
    expect(categories).toContain("billing");
    expect(categories).toContain("realtime");
    expect(categories).toContain("test_strategy");
  });
});
