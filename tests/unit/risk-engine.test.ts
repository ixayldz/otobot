import { describe, expect, test } from "vitest";
import { assessTaskGraphRisk } from "../../src/core/risk/engine.js";

describe("risk engine", () => {
  test("blocks high-risk tasks without security quality gate", () => {
    const assessment = assessTaskGraphRisk({
      version: "1.2",
      epics: [
        {
          id: "E1",
          name: "Epic",
          stories: [
            {
              id: "S1",
              name: "Story",
              tasks: [
                {
                  id: "T1",
                  name: "Task",
                  acceptanceCriteria: ["ok"],
                  risk: "high",
                  expectedTouched: ["src/a.ts"],
                  tests: ["pnpm test"],
                  verificationSteps: ["manual"],
                  rollbackPlan: ["revert"],
                  blastRadius: "root",
                  dependsOn: [],
                  ownerRole: "executor",
                  estimate: 1,
                  retries: 1,
                  status: "planned",
                  sourcePrdSections: ["Security"],
                  qualityGates: ["review", "tests"],
                  riskControls: [],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(assessment.blockers.length).toBeGreaterThan(0);
    expect(assessment.score).toBeLessThan(100);
  });
});
