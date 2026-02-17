import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { UnknownItem } from "./unknownDetector.js";

export interface InterviewAnswer {
  category: string;
  answer: string;
}

export async function writeInterviewArtifacts(
  projectRoot: string,
  unknowns: UnknownItem[],
  answers: InterviewAnswer[],
): Promise<void> {
  const docsDir = join(projectRoot, "docs");
  await mkdir(docsDir, { recursive: true });

  const decisions = answers
    .map((a, idx) => `## Decision ${idx + 1}\n- category: ${a.category}\n- answer: ${a.answer}`)
    .join("\n\n");

  const assumptions = unknowns
    .map((u, idx) => `## Assumption ${idx + 1}\n- category: ${u.category}\n- impact: ${u.impact}\n- default: ${u.assumption}`)
    .join("\n\n");

  await writeFile(join(docsDir, "decisions.md"), decisions || "# decisions\n", "utf8");
  await writeFile(join(docsDir, "assumptions.md"), assumptions || "# assumptions\n", "utf8");
}
