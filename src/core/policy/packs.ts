import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PolicyPack {
  name: string;
  version: string;
  extends?: string;
  description: string;
  permissions: {
    deny: string[];
    ask: string[];
    allow: string[];
  };
  diffBudget: {
    maxFiles: number;
    maxLines: number;
  };
  riskRules: {
    requireSecurityReviewOnHighRisk: boolean;
    maxHighRiskTasks: number;
  };
}

const DEFAULT_PACKS: Record<string, PolicyPack> = {
  "default-balanced": {
    name: "default-balanced",
    version: "1.0.0",
    description: "Balanced policy pack for normal development",
    permissions: {
      deny: [".env", ".env.*", "secrets/**"],
      ask: ["curl *", "wget *", "rm -rf *"],
      allow: ["git status", "git diff", "pnpm test", "pnpm build"],
    },
    diffBudget: {
      maxFiles: 12,
      maxLines: 500,
    },
    riskRules: {
      requireSecurityReviewOnHighRisk: true,
      maxHighRiskTasks: 3,
    },
  },
  strict: {
    name: "strict",
    version: "1.0.0",
    extends: "default-balanced",
    description: "Strict policy for enterprise-sensitive repos",
    permissions: {
      deny: ["**/*.pem", "**/*.key", "**/id_rsa*"],
      ask: ["git push *"],
      allow: ["pnpm test:contract", "pnpm test:integration"],
    },
    diffBudget: {
      maxFiles: 6,
      maxLines: 200,
    },
    riskRules: {
      requireSecurityReviewOnHighRisk: true,
      maxHighRiskTasks: 1,
    },
  },
};

const POLICY_FILE = join(".otobot", "policy-pack.json");

function hashPack(pack: PolicyPack): string {
  return createHash("sha256").update(JSON.stringify(pack), "utf8").digest("hex");
}

function mergeUnique(base: string[], extra: string[]): string[] {
  return Array.from(new Set([...base, ...extra]));
}

function resolvePack(name: string, seen = new Set<string>()): PolicyPack {
  if (seen.has(name)) {
    throw new Error(`Policy inheritance cycle detected: ${name}`);
  }

  const current = DEFAULT_PACKS[name];
  if (!current) {
    throw new Error(`Unknown policy pack: ${name}`);
  }

  if (!current.extends) {
    return {
      ...current,
      permissions: {
        deny: [...current.permissions.deny],
        ask: [...current.permissions.ask],
        allow: [...current.permissions.allow],
      },
    };
  }

  seen.add(name);
  const base = resolvePack(current.extends, seen);
  seen.delete(name);

  return {
    ...base,
    ...current,
    permissions: {
      deny: mergeUnique(base.permissions.deny, current.permissions.deny),
      ask: mergeUnique(base.permissions.ask, current.permissions.ask),
      allow: mergeUnique(base.permissions.allow, current.permissions.allow),
    },
    diffBudget: {
      maxFiles: Math.min(base.diffBudget.maxFiles, current.diffBudget.maxFiles),
      maxLines: Math.min(base.diffBudget.maxLines, current.diffBudget.maxLines),
    },
    riskRules: {
      requireSecurityReviewOnHighRisk:
        base.riskRules.requireSecurityReviewOnHighRisk || current.riskRules.requireSecurityReviewOnHighRisk,
      maxHighRiskTasks: Math.min(base.riskRules.maxHighRiskTasks, current.riskRules.maxHighRiskTasks),
    },
  };
}

export function listPolicyPacks(): PolicyPack[] {
  return Object.keys(DEFAULT_PACKS).map((name) => resolvePack(name));
}

export async function getActivePolicy(projectRoot: string): Promise<{ pack: PolicyPack; hash: string } | null> {
  try {
    const raw = await readFile(join(projectRoot, POLICY_FILE), "utf8");
    const parsed = JSON.parse(raw) as { pack: PolicyPack; hash: string };
    return parsed;
  } catch {
    return null;
  }
}

async function applyToClaudeSettings(projectRoot: string, pack: PolicyPack): Promise<void> {
  const path = join(projectRoot, ".claude", "settings.json");
  try {
    const raw = await readFile(path, "utf8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    settings.permissions = {
      defaultMode: "plan",
      deny: pack.permissions.deny,
      ask: pack.permissions.ask,
      allow: pack.permissions.allow,
    };
    await writeFile(path, JSON.stringify(settings, null, 2), "utf8");
  } catch {
    // settings may not exist yet
  }
}

export async function applyPolicyPack(projectRoot: string, name: string): Promise<{ pack: PolicyPack; hash: string }> {
  const pack = resolvePack(name);
  const payload = {
    pack,
    hash: hashPack(pack),
  };

  await mkdir(join(projectRoot, ".otobot"), { recursive: true });
  await writeFile(join(projectRoot, POLICY_FILE), JSON.stringify(payload, null, 2), "utf8");
  await applyToClaudeSettings(projectRoot, pack);

  return payload;
}
