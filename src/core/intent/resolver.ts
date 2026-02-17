export interface IntentResolution {
  command: string;
  args: string[];
}

export function resolveIntent(input: string): IntentResolution | null {
  const normalized = input.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("prd") && normalized.includes("oku")) {
    return { command: "/read", args: ["prd.md"] };
  }

  if (normalized.includes("kilitle")) {
    return { command: "/lock", args: [] };
  }

  if (normalized.includes("build") && normalized.includes("basla")) {
    return { command: "/build", args: [] };
  }

  return null;
}
