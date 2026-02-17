import { execa } from "execa";

export interface StaticToolResult {
  tool: string;
  status: "passed" | "failed" | "skipped" | "unavailable";
  details: string;
  exitCode: number;
}

export interface StaticAnalysisSummary {
  reports: StaticToolResult[];
  blockers: string[];
  warnings: string[];
}

async function commandExists(command: string): Promise<boolean> {
  const result = await execa(command, ["--version"], {
    reject: false,
    timeout: 10_000,
    shell: true,
  });
  return result.exitCode === 0;
}

async function runTool(
  tool: string,
  command: string,
  projectRoot: string,
  strictMode: boolean,
): Promise<{ result: StaticToolResult; blocker?: string; warning?: string }> {
  const execution = await execa(command, {
    cwd: projectRoot,
    reject: false,
    timeout: 180_000,
    shell: true,
  });

  if (execution.exitCode === 0) {
    return {
      result: {
        tool,
        status: "passed",
        details: "ok",
        exitCode: 0,
      },
    };
  }

  const details = execution.stderr || execution.stdout || `${command} failed`;
  if (strictMode) {
    return {
      result: {
        tool,
        status: "failed",
        details,
        exitCode: execution.exitCode ?? 1,
      },
      blocker: `${tool} failed: ${details}`,
    };
  }

  return {
    result: {
      tool,
      status: "failed",
      details,
      exitCode: execution.exitCode ?? 1,
    },
    warning: `${tool} failed: ${details}`,
  };
}

export async function runStaticAnalysis(
  projectRoot: string,
  strictMode: boolean,
): Promise<StaticAnalysisSummary> {
  const reports: StaticToolResult[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  const enabled = process.env.OTOBOT_RUN_STATIC_ANALYSIS === "1";
  if (!enabled) {
    reports.push({
      tool: "static-analysis",
      status: "skipped",
      details: "Set OTOBOT_RUN_STATIC_ANALYSIS=1 to enable tool execution",
      exitCode: 0,
    });
    return { reports, blockers, warnings };
  }

  const lint = await runTool("lint", "pnpm lint", projectRoot, strictMode);
  reports.push(lint.result);
  if (lint.blocker) {
    blockers.push(lint.blocker);
  }
  if (lint.warning) {
    warnings.push(lint.warning);
  }

  const semgrepAvailable = await commandExists("semgrep");
  if (semgrepAvailable) {
    const semgrep = await runTool("semgrep", "semgrep scan --config auto .", projectRoot, strictMode);
    reports.push(semgrep.result);
    if (semgrep.blocker) {
      blockers.push(semgrep.blocker);
    }
    if (semgrep.warning) {
      warnings.push(semgrep.warning);
    }
  } else {
    reports.push({
      tool: "semgrep",
      status: "unavailable",
      details: "semgrep binary not found",
      exitCode: 127,
    });
    warnings.push("semgrep unavailable");
  }

  const gitleaksAvailable = await commandExists("gitleaks");
  if (gitleaksAvailable) {
    const gitleaks = await runTool("gitleaks", "gitleaks detect --no-banner --source .", projectRoot, strictMode);
    reports.push(gitleaks.result);
    if (gitleaks.blocker) {
      blockers.push(gitleaks.blocker);
    }
    if (gitleaks.warning) {
      warnings.push(gitleaks.warning);
    }
  } else {
    reports.push({
      tool: "gitleaks",
      status: "unavailable",
      details: "gitleaks binary not found",
      exitCode: 127,
    });
    warnings.push("gitleaks unavailable");
  }

  return {
    reports,
    blockers,
    warnings,
  };
}
