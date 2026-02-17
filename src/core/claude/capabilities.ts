import { execa } from "execa";
import type { ClaudeCapabilities } from "../../contracts/state.js";

function detectOutputFormats(helpText: string): Array<"text" | "json" | "stream-json"> {
  const formats: Array<"text" | "json" | "stream-json"> = ["text"];
  const lower = helpText.toLowerCase();
  if (lower.includes("json")) {
    formats.push("json");
  }
  if (lower.includes("stream-json") || lower.includes("stream json")) {
    formats.push("stream-json");
  }
  return Array.from(new Set(formats));
}

export async function detectClaudeCapabilities(): Promise<ClaudeCapabilities> {
  try {
    const result = await execa("claude", ["--help"]);
    const help = `${result.stdout}\n${result.stderr}`.toLowerCase();

    return {
      printMode: help.includes("-p") || help.includes("--print"),
      outputFormats: detectOutputFormats(help),
      resumeLatest: help.includes("-c") || help.includes("--continue"),
      resumeById: help.includes("-r") || help.includes("--resume"),
      allowedToolsFlag: help.includes("allowedtools") || help.includes("allowed-tools"),
      initWorkflow: help.includes("--init") || help.includes("init-only") || help.includes("/init"),
    };
  } catch {
    return {
      printMode: false,
      outputFormats: ["text"],
      resumeLatest: false,
      resumeById: false,
      allowedToolsFlag: false,
      initWorkflow: false,
    };
  }
}

export function preferredOutputFormat(capabilities: ClaudeCapabilities): "stream-json" | "json" | "text" {
  if (capabilities.outputFormats.includes("stream-json")) {
    return "stream-json";
  }
  if (capabilities.outputFormats.includes("json")) {
    return "json";
  }
  return "text";
}
