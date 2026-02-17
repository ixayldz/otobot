import { taskGraphSchema, type TaskGraph } from "../../contracts/taskGraph.js";

export interface RiskAssessment {
  score: number;
  blockers: string[];
  warnings: string[];
}

function flatten(graph: TaskGraph) {
  return graph.epics.flatMap((epic) => epic.stories.flatMap((story) => story.tasks));
}

export function assessTaskGraphRisk(graphRaw: unknown): RiskAssessment {
  const graph = taskGraphSchema.parse(graphRaw);
  const tasks = flatten(graph);
  const blockers: string[] = [];
  const warnings: string[] = [];

  let penalty = 0;

  for (const task of tasks) {
    if (task.tests.length === 0) {
      blockers.push(`${task.id}: missing tests`);
      penalty += 20;
    }

    if (task.risk === "high" && !task.qualityGates.includes("security")) {
      blockers.push(`${task.id}: high-risk task missing security quality gate`);
      penalty += 25;
    }

    if (task.risk === "high" && task.riskControls.length === 0) {
      warnings.push(`${task.id}: high-risk task missing explicit risk controls`);
      penalty += 10;
    }

    if ((task.blastRadius ?? "").toLowerCase().includes("root")) {
      warnings.push(`${task.id}: broad blast radius`);
      penalty += 5;
    }
  }

  const score = Math.max(0, 100 - penalty);
  return { score, blockers, warnings };
}
