import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import type { Provider } from "../../contracts/state.js";
import { checkAllProviderHealth, listModels } from "../providers/index.js";
import { validateProjectConsistency } from "../consistency/index.js";

export type CriterionStatus = "pass" | "blocked";

export interface ReadinessCriterion {
  id: string;
  title: string;
  status: CriterionStatus;
  detail: string;
  category: "non_key" | "provider";
}

export interface ReadinessReport {
  generatedAt: string;
  criteria: ReadinessCriterion[];
  nonKeyScore: number;
  fullScore: number;
  blockers: string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function score(criteria: ReadinessCriterion[]): number {
  if (criteria.length === 0) {
    return 100;
  }
  const passed = criteria.filter((criterion) => criterion.status === "pass").length;
  return Math.round((passed / criteria.length) * 100);
}

async function providerCriterion(projectRoot: string, provider: Provider): Promise<ReadinessCriterion> {
  const health = await checkAllProviderHealth(projectRoot);
  const status = health[provider];

  if (status === "unconfigured") {
    return {
      id: `provider.${provider}.runtime`,
      title: `${provider} runtime models`,
      status: "blocked",
      detail: `Missing API key for ${provider}.`,
      category: "provider",
    };
  }

  if (status !== "healthy") {
    return {
      id: `provider.${provider}.runtime`,
      title: `${provider} runtime models`,
      status: "blocked",
      detail: `${provider} health is ${status}.`,
      category: "provider",
    };
  }

  const models = await listModels(projectRoot, provider);
  const runtimeCount = models.filter((model) => model.source === "runtime").length;

  if (runtimeCount === 0) {
    return {
      id: `provider.${provider}.runtime`,
      title: `${provider} runtime models`,
      status: "blocked",
      detail: `${provider} model list is not runtime-backed.`,
      category: "provider",
    };
  }

  return {
    id: `provider.${provider}.runtime`,
    title: `${provider} runtime models`,
    status: "pass",
    detail: `${runtimeCount} runtime model(s) available.`,
    category: "provider",
  };
}

export async function checkReadiness(projectRoot: string): Promise<ReadinessReport> {
  const criteria: ReadinessCriterion[] = [];

  const consistency = await validateProjectConsistency(projectRoot);
  criteria.push({
    id: "consistency",
    title: "Project consistency",
    status: consistency.ok ? "pass" : "blocked",
    detail: consistency.ok ? "Lock/hash/contracts consistent." : consistency.issues.join("; "),
    category: "non_key",
  });

  const hardened = await exists(join(projectRoot, ".claude", "settings.json"));
  criteria.push({
    id: "hardened",
    title: "Hardened Claude settings",
    status: hardened ? "pass" : "blocked",
    detail: hardened ? "settings.json exists." : "Missing .claude/settings.json",
    category: "non_key",
  });

  const taskGraph = await exists(join(projectRoot, "docs", "task-graph.json"));
  criteria.push({
    id: "task_graph",
    title: "Task graph generated",
    status: taskGraph ? "pass" : "blocked",
    detail: taskGraph ? "docs/task-graph.json exists." : "Missing docs/task-graph.json",
    category: "non_key",
  });

  const releaseArtifacts =
    (await exists(join(projectRoot, ".github", "workflows", "ci.yml"))) &&
    (await exists(join(projectRoot, ".github", "workflows", "nightly-real-e2e.yml"))) &&
    (await exists(join(projectRoot, "docs", "release-runbook.md")));

  criteria.push({
    id: "release_artifacts",
    title: "Release artifacts",
    status: releaseArtifacts ? "pass" : "blocked",
    detail: releaseArtifacts ? "CI + nightly + runbook present." : "Missing CI/nightly/runbook files.",
    category: "non_key",
  });

  const providers: Provider[] = ["openai", "google", "anthropic"];
  for (const provider of providers) {
    criteria.push(await providerCriterion(projectRoot, provider));
  }

  const nonKeyCriteria = criteria.filter((criterion) => criterion.category === "non_key");
  const blockers = criteria
    .filter((criterion) => criterion.status === "blocked")
    .map((criterion) => `${criterion.id}: ${criterion.detail}`);

  return {
    generatedAt: new Date().toISOString(),
    criteria,
    nonKeyScore: score(nonKeyCriteria),
    fullScore: score(criteria),
    blockers,
  };
}
