import { execa } from "execa";
import type { ClaudeCapabilities } from "../../contracts/state.js";
import { preferredOutputFormat } from "./capabilities.js";

export interface ClaudeRunResult {
  ok: boolean;
  command: string[];
  stdout: string;
  stderr: string;
  format: "stream-json" | "json" | "text";
}

function claudeTimeoutMs(): number {
  const raw = process.env.OTOBOT_CLAUDE_TIMEOUT_MS ?? "20000";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20000;
  }
  return parsed;
}

function extractErrorOutput(error: unknown): { stdout: string; stderr: string; timedOut: boolean } {
  const cast = error as {
    stdout?: string;
    stderr?: string;
    shortMessage?: string;
    timedOut?: boolean;
  };

  return {
    stdout: cast.stdout ?? "",
    stderr: cast.stderr ?? cast.shortMessage ?? "",
    timedOut: Boolean(cast.timedOut),
  };
}

export async function bootstrapClaude(capabilities: ClaudeCapabilities): Promise<ClaudeRunResult> {
  const args: string[] = [];

  if (capabilities.initWorkflow) {
    args.push("--init-only");
  } else {
    args.push("-p", "Initialize project scaffolding in this repository.");
  }

  try {
    const result = await execa("claude", args, {
      timeout: claudeTimeoutMs(),
    });
    return {
      ok: true,
      command: ["claude", ...args],
      stdout: result.stdout,
      stderr: result.stderr,
      format: "text",
    };
  } catch (error) {
    const cast = extractErrorOutput(error);
    return {
      ok: false,
      command: ["claude", ...args],
      stdout: cast.stdout,
      stderr: cast.timedOut ? `${cast.stderr}\n(timeout)` : cast.stderr,
      format: "text",
    };
  }
}

export async function runClaudePrompt(
  prompt: string,
  capabilities: ClaudeCapabilities,
): Promise<ClaudeRunResult> {
  const format = preferredOutputFormat(capabilities);

  const args = capabilities.printMode ? ["-p", prompt] : [prompt];

  if (format !== "text") {
    args.push("--output-format", format);
  }

  try {
    const result = await execa("claude", args, {
      timeout: claudeTimeoutMs(),
    });
    return {
      ok: true,
      command: ["claude", ...args],
      stdout: result.stdout,
      stderr: result.stderr,
      format,
    };
  } catch (error) {
    const cast = extractErrorOutput(error);

    if (cast.timedOut) {
      return {
        ok: false,
        command: ["claude", ...args],
        stdout: cast.stdout,
        stderr: `${cast.stderr}\n(timeout)`,
        format,
      };
    }

    if (format === "stream-json") {
      return runClaudePrompt(prompt, { ...capabilities, outputFormats: ["json", "text"] });
    }
    if (format === "json") {
      return runClaudePrompt(prompt, { ...capabilities, outputFormats: ["text"] });
    }
    return {
      ok: false,
      command: ["claude", ...args],
      stdout: cast.stdout,
      stderr: cast.stderr,
      format,
    };
  }
}
