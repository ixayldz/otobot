import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface RubricResult {
  score: number;
  missing: string[];
}

async function readSafe(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function includeScore(content: string, checks: string[]): RubricResult {
  const missing = checks.filter((check) => !content.toLowerCase().includes(check.toLowerCase()));
  const pass = checks.length - missing.length;
  const score = Math.round((pass / checks.length) * 100);
  return { score, missing };
}

export async function scoreClaudeMd(projectRoot: string): Promise<RubricResult> {
  const content = await readSafe(join(projectRoot, "CLAUDE.md"));
  return includeScore(content, [
    "north star",
    "scope",
    "command matrix",
    "definition of done",
    "architecture boundaries",
    "security",
    "lock protocol",
  ]);
}

export async function scoreSettings(projectRoot: string): Promise<RubricResult> {
  const content = await readSafe(join(projectRoot, ".claude", "settings.json"));
  return includeScore(content, ["defaultMode", "deny", "ask", "allow", "hooks"]);
}

export async function scoreAgents(projectRoot: string): Promise<RubricResult> {
  const files = ["architect", "coder", "reviewer", "debugger"];
  const results = await Promise.all(
    files.map(async (name) => {
      const content = await readSafe(join(projectRoot, ".claude", "agents", `${name}.md`));
      return includeScore(content, ["name:", "description:", "permissionMode", "tools"]);
    }),
  );

  const avg = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  return {
    score: avg,
    missing: results.flatMap((r, idx) => r.missing.map((m) => `${files[idx]}:${m}`)),
  };
}

export async function scoreCommands(projectRoot: string): Promise<RubricResult> {
  const files = ["plan", "implement", "review", "test"];
  const results = await Promise.all(
    files.map(async (name) => {
      const content = await readSafe(join(projectRoot, ".claude", "commands", `${name}.md`));
      return includeScore(content, ["validate", "execute", "audit"]);
    }),
  );

  const avg = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  return {
    score: avg,
    missing: results.flatMap((r, idx) => r.missing.map((m) => `${files[idx]}:${m}`)),
  };
}

export async function scoreKit(projectRoot: string): Promise<{ score: number; missing: string[] }> {
  const [claude, settings, agents, commands] = await Promise.all([
    scoreClaudeMd(projectRoot),
    scoreSettings(projectRoot),
    scoreAgents(projectRoot),
    scoreCommands(projectRoot),
  ]);

  const score = Math.round((claude.score + settings.score + agents.score + commands.score) / 4);
  return {
    score,
    missing: [...claude.missing, ...settings.missing, ...agents.missing, ...commands.missing],
  };
}
