import { execa } from "execa";
import type { OtobotState } from "../../contracts/state.js";
import type { PolicyPack } from "../policy/packs.js";

export interface SandboxExecutionOptions {
  projectRoot: string;
  command: string;
  sandbox: OtobotState["sandbox"];
  policy: PolicyPack | null;
  execute: boolean;
  timeoutMs?: number;
}

export interface SandboxExecutionResult {
  ok: boolean;
  blocked: boolean;
  reason: string | null;
  mode: "simulated" | "local" | "container";
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  warnings: string[];
}

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .trim()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesPattern(command: string, pattern: string): boolean {
  const regex = patternToRegex(pattern);
  return regex.test(command.trim()) || normalize(command).includes(normalize(pattern).replace(" *", ""));
}

function evaluatePolicy(command: string, policy: PolicyPack | null): {
  blocked: boolean;
  requiresApproval: boolean;
  reason: string | null;
} {
  if (!policy) {
    return { blocked: false, requiresApproval: false, reason: null };
  }

  const deny = policy.permissions.deny.find((pattern) => matchesPattern(command, pattern));
  if (deny) {
    return {
      blocked: true,
      requiresApproval: false,
      reason: `Denied by policy pattern: ${deny}`,
    };
  }

  const ask = policy.permissions.ask.find((pattern) => matchesPattern(command, pattern));
  if (ask) {
    return {
      blocked: false,
      requiresApproval: true,
      reason: `Requires approval by policy pattern: ${ask}`,
    };
  }

  return { blocked: false, requiresApproval: false, reason: null };
}

async function executeLocal(projectRoot: string, command: string, timeoutMs: number): Promise<SandboxExecutionResult> {
  const result = await execa(command, {
    cwd: projectRoot,
    shell: true,
    reject: false,
    timeout: timeoutMs,
  });

  return {
    ok: result.exitCode === 0,
    blocked: false,
    reason: result.exitCode === 0 ? null : `Command failed with exit code ${result.exitCode}`,
    mode: "local",
    command,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 1,
    warnings: [],
  };
}

async function executeContainer(
  projectRoot: string,
  provider: "docker" | "podman",
  command: string,
  timeoutMs: number,
): Promise<SandboxExecutionResult> {
  const result = await execa(
    provider,
    ["run", "--rm", "-v", `${projectRoot}:/workspace`, "-w", "/workspace", "node:20-alpine", "sh", "-lc", command],
    {
      reject: false,
      timeout: timeoutMs,
    },
  );

  return {
    ok: result.exitCode === 0,
    blocked: false,
    reason: result.exitCode === 0 ? null : `${provider} execution failed with exit code ${result.exitCode}`,
    mode: "container",
    command,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 1,
    warnings: [],
  };
}

export async function runCommandWithSandbox(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const policy = evaluatePolicy(options.command, options.policy);

  if (policy.blocked) {
    return {
      ok: false,
      blocked: true,
      reason: policy.reason,
      mode: "simulated",
      command: options.command,
      stdout: "",
      stderr: "",
      exitCode: 126,
      warnings: [],
    };
  }

  if (policy.requiresApproval && options.sandbox.profile === "strict") {
    return {
      ok: false,
      blocked: true,
      reason: policy.reason,
      mode: "simulated",
      command: options.command,
      stdout: "",
      stderr: "",
      exitCode: 126,
      warnings: [],
    };
  }

  if (!options.execute) {
    return {
      ok: true,
      blocked: false,
      reason: null,
      mode: "simulated",
      command: options.command,
      stdout: "",
      stderr: "",
      exitCode: 0,
      warnings: policy.requiresApproval ? [policy.reason ?? "Policy approval required"] : [],
    };
  }

  if (options.sandbox.enabled && options.sandbox.provider !== "none" && options.sandbox.profile !== "off") {
    try {
      const containerResult = await executeContainer(
        options.projectRoot,
        options.sandbox.provider,
        options.command,
        timeoutMs,
      );
      if (containerResult.ok || options.sandbox.profile === "strict") {
        return containerResult;
      }

      const fallback = await executeLocal(options.projectRoot, options.command, timeoutMs);
      return {
        ...fallback,
        warnings: [
          `Container execution failed (${containerResult.reason ?? "unknown"}), fell back to local execution`,
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Container execution failed";
      if (options.sandbox.profile === "strict") {
        return {
          ok: false,
          blocked: false,
          reason: `Strict sandbox requires container execution: ${message}`,
          mode: "container",
          command: options.command,
          stdout: "",
          stderr: message,
          exitCode: 125,
          warnings: [],
        };
      }

      const fallback = await executeLocal(options.projectRoot, options.command, timeoutMs);
      return {
        ...fallback,
        warnings: [`Container unavailable, fell back to local execution: ${message}`],
      };
    }
  }

  return executeLocal(options.projectRoot, options.command, timeoutMs);
}
