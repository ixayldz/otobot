import { access, constants } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prdLockSchema } from "../../contracts/lock.js";
import { taskGraphSchema } from "../../contracts/taskGraph.js";
import { validateLockHash } from "../prd/lock.js";

export interface ConsistencyReport {
  ok: boolean;
  issues: string[];
  warnings: string[];
}

async function exists(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    access(path, constants.F_OK, (err) => resolve(!err));
  });
}

export async function validateProjectConsistency(projectRoot: string): Promise<ConsistencyReport> {
  const issues: string[] = [];
  const warnings: string[] = [];

  const lockPath = join(projectRoot, "docs", "prd.lock.json");
  const taskGraphPath = join(projectRoot, "docs", "task-graph.json");
  const settingsPath = join(projectRoot, ".claude", "settings.json");

  if (!(await exists(lockPath))) {
    issues.push("Missing docs/prd.lock.json");
  } else {
    try {
      const raw = await readFile(lockPath, "utf8");
      prdLockSchema.parse(JSON.parse(raw));
      const hashCheck = await validateLockHash(projectRoot);
      if (!hashCheck.valid) {
        issues.push("PRD lock hash mismatch");
      }
    } catch {
      issues.push("Invalid docs/prd.lock.json");
    }
  }

  if (await exists(taskGraphPath)) {
    try {
      const raw = await readFile(taskGraphPath, "utf8");
      taskGraphSchema.parse(JSON.parse(raw));
    } catch {
      issues.push("Invalid docs/task-graph.json");
    }
  } else {
    warnings.push("docs/task-graph.json not generated yet");
  }

  if (!(await exists(settingsPath))) {
    warnings.push("Missing .claude/settings.json (run /harden)");
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
  };
}
