import type { RepoInsights } from "../repo/inspector.js";
import { generateKit } from "../kit/generator.js";
import { scoreKit } from "./scorer.js";

export interface HardenResult {
  score: number;
  iterations: number;
  missing: string[];
}

export async function hardenKit(projectRoot: string, insights: RepoInsights): Promise<HardenResult> {
  let iterations = 0;
  let latest = { score: 0, missing: [] as string[] };

  while (iterations < 3) {
    iterations += 1;
    await generateKit(projectRoot, insights);
    latest = await scoreKit(projectRoot);
    if (latest.score >= 90) {
      break;
    }
  }

  return {
    score: latest.score,
    iterations,
    missing: latest.missing,
  };
}
