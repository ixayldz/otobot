import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParsedPrd } from "../prd/parser.js";
import type { TaskGraph, Task } from "../../contracts/taskGraph.js";

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function sectionToTask(sectionTitle: string, content: string, index: number, previousTaskId: string | null): Task {
  const sectionSlug = slug(sectionTitle || `section-${index}`) || `section-${index}`;
  const id = `TASK-${String(index + 1).padStart(3, "0")}`;
  const sentences = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  const acceptanceCriteria = sentences.length > 0 ? sentences : [`${sectionTitle} section implemented`];

  const isSecurity = sectionTitle.toLowerCase().includes("security");
  const qualityGates: Task["qualityGates"] = isSecurity
    ? ["review", "tests", "security"]
    : ["review", "tests"];
  const riskControls = isSecurity
    ? ["protect secret paths", "require security review before merge"]
    : ["limit blast radius", "verify scope lock hash before release"];

  return {
    id,
    name: `Implement ${sectionTitle || "section"}`,
    acceptanceCriteria,
    risk: sectionTitle.toLowerCase().includes("security") ? "high" : "medium",
    expectedTouched: [`src/${sectionSlug}.ts`],
    tests: ["pnpm test"],
    verificationSteps: ["run targeted checks", "verify no scope drift"],
    rollbackPlan: [`revert changes for ${id}`],
    blastRadius: sectionSlug,
    dependsOn: previousTaskId ? [previousTaskId] : [],
    ownerRole: "executor",
    estimate: 1,
    retries: 1,
    status: "planned",
    sourcePrdSections: [sectionTitle || "ROOT"],
    qualityGates,
    riskControls,
  };
}

export function createTaskGraphFromPrd(prd: ParsedPrd): TaskGraph {
  const candidateSections = prd.sections.filter((s) => s.title !== "ROOT").slice(0, 8);

  if (candidateSections.length === 0) {
    return {
      version: "1.2",
      epics: [
        {
          id: "EPIC-001",
          name: "Default Epic",
          stories: [
            {
              id: "STORY-001",
              name: "Default Story",
              tasks: [
                {
                  id: "TASK-001",
                  name: "Implement baseline",
                  acceptanceCriteria: ["Baseline task completed"],
                  risk: "low",
                  expectedTouched: ["src/index.ts"],
                  tests: ["pnpm test"],
                  verificationSteps: ["run smoke command"],
                  rollbackPlan: ["revert baseline changes"],
                  blastRadius: "root",
                  dependsOn: [],
                  ownerRole: "executor",
                  estimate: 1,
                  retries: 1,
                  status: "planned",
                  sourcePrdSections: ["ROOT"],
                  qualityGates: ["review", "tests"],
                  riskControls: ["limit blast radius"],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  const tasks: Task[] = [];
  let prev: string | null = null;
  candidateSections.forEach((section, idx) => {
    const task = sectionToTask(section.title, section.content, idx, prev);
    prev = task.id;
    tasks.push(task);
  });

  return {
    version: "1.2",
    epics: [
      {
        id: "EPIC-001",
        name: "PRD Derived Epic",
        stories: [
          {
            id: "STORY-001",
            name: "PRD Driven Story",
            tasks,
          },
        ],
      },
    ],
  };
}

export async function writeTaskGraph(projectRoot: string, graph: TaskGraph): Promise<void> {
  const path = join(projectRoot, "docs", "task-graph.json");
  await writeFile(path, JSON.stringify(graph, null, 2), "utf8");
}
