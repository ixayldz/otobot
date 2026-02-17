import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepoInsights } from "../repo/inspector.js";

function settingsJson(): string {
  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/claude-code-settings.json",
      permissions: {
        defaultMode: "plan",
        deny: [".env", ".env.*", "secrets/**", "**/*.pem", "**/*.key", "**/id_rsa*"],
        ask: ["curl *", "wget *", "rm -rf *"],
        allow: ["git status", "git diff", "pnpm test", "pnpm build"],
      },
      hooks: {
        PreToolUse: [".claude/hooks/protect-files"],
        PostToolUse: [".claude/hooks/post-edit-check"],
      },
    },
    null,
    2,
  );
}

function claudeMd(insights: RepoInsights): string {
  return `# Project Manifest\n\n## North Star\nDeliver scoped, testable changes aligned with locked PRD.\n\n## Scope\n- In: MVP workflow execution with lock gates\n- Out: automatic production deployment\n\n## Command Matrix\n- install: ${insights.commands.install}\n- dev: ${insights.commands.dev}\n- build: ${insights.commands.build}\n- test: ${insights.commands.test}\n- lint: ${insights.commands.lint}\n- format: ${insights.commands.format}\n\n## Definition of Done\n- Scope aligned with locked PRD\n- Review and tests pass\n- No secret exposure\n- Audit trail updated\n\n## Architecture Boundaries\n- CLI orchestration under src/cli\n- Domain logic under src/core\n- Contracts under src/contracts\n\n## Security Non-Negotiables\n- Never edit protected secret files\n- Never log raw credentials or tokens\n\n## PRD Lock Protocol\n- Hash mismatch requires CHANGE_REQUEST state\n`;}

function agentTemplate(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\nmodel: default\npermissionMode: plan\ntools: []\n---\n\n- Follow locked PRD scope\n- Keep diffs minimal\n- Respect security and test gates\n`;}

function commandTemplate(name: string): string {
  return `# /${name}\n\n- Validate lock and state preconditions\n- Execute ${name} phase\n- Record audit summary\n`;}

function hookProtect(ext: "ps1" | "sh"): string {
  if (ext === "ps1") {
    return `param([string]$TargetPath)\nif ($TargetPath -match "\\.env|secrets|\\.pem|\\.key|id_rsa") {\n  Write-Error \"Protected path blocked: $TargetPath\"\n  exit 1\n}\nexit 0\n`;
  }

  return `#!/usr/bin/env bash\nTARGET_PATH="$1"\nif [[ "$TARGET_PATH" =~ \.env|secrets|\.pem|\.key|id_rsa ]]; then\n  echo "Protected path blocked: $TARGET_PATH" >&2\n  exit 1\nfi\nexit 0\n`;
}

function hookPost(ext: "ps1" | "sh"): string {
  if (ext === "ps1") {
    return `Write-Output "post-edit-check: ok"\nexit 0\n`;
  }

  return `#!/usr/bin/env bash\necho "post-edit-check: ok"\nexit 0\n`;
}

export interface KitGenerationResult {
  files: string[];
}

export async function generateKit(projectRoot: string, insights: RepoInsights): Promise<KitGenerationResult> {
  const files: string[] = [];

  const claudeDir = join(projectRoot, ".claude");
  const agentsDir = join(claudeDir, "agents");
  const commandsDir = join(claudeDir, "commands");
  const hooksDir = join(claudeDir, "hooks");

  await mkdir(agentsDir, { recursive: true });
  await mkdir(commandsDir, { recursive: true });
  await mkdir(hooksDir, { recursive: true });

  const claudeMdPath = join(projectRoot, "CLAUDE.md");
  await writeFile(claudeMdPath, claudeMd(insights), "utf8");
  files.push("CLAUDE.md");

  const settingsPath = join(claudeDir, "settings.json");
  await writeFile(settingsPath, settingsJson(), "utf8");
  files.push(".claude/settings.json");

  const agents = [
    ["architect", "Plan-focused architecture agent"],
    ["coder", "Implementation agent with minimal diffs"],
    ["reviewer", "Diff-only risk reviewer"],
    ["debugger", "Root-cause and minimal fix agent"],
  ] as const;

  for (const [name, desc] of agents) {
    const path = join(agentsDir, `${name}.md`);
    await writeFile(path, agentTemplate(name, desc), "utf8");
    files.push(`.claude/agents/${name}.md`);
  }

  for (const cmd of ["plan", "implement", "review", "test"]) {
    const path = join(commandsDir, `${cmd}.md`);
    await writeFile(path, commandTemplate(cmd), "utf8");
    files.push(`.claude/commands/${cmd}.md`);
  }

  const ext: "ps1" | "sh" = process.platform === "win32" ? "ps1" : "sh";
  await writeFile(join(hooksDir, `protect-files.${ext}`), hookProtect(ext), "utf8");
  await writeFile(join(hooksDir, `post-edit-check.${ext}`), hookPost(ext), "utf8");
  files.push(`.claude/hooks/protect-files.${ext}`);
  files.push(`.claude/hooks/post-edit-check.${ext}`);

  return { files };
}
