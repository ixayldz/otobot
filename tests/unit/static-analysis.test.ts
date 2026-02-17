import { describe, expect, test } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStaticAnalysis } from "../../src/core/risk/staticAnalysis.js";

describe("static analysis", () => {
  test("returns skipped when analysis is disabled", async () => {
    const previous = process.env.OTOBOT_RUN_STATIC_ANALYSIS;
    delete process.env.OTOBOT_RUN_STATIC_ANALYSIS;

    try {
      const root = await mkdtemp(join(tmpdir(), "otobot-static-analysis-"));
      const summary = await runStaticAnalysis(root, true);
      expect(summary.reports[0]?.status).toBe("skipped");
      expect(summary.blockers.length).toBe(0);
    } finally {
      if (previous === undefined) {
        delete process.env.OTOBOT_RUN_STATIC_ANALYSIS;
      } else {
        process.env.OTOBOT_RUN_STATIC_ANALYSIS = previous;
      }
    }
  });
});
