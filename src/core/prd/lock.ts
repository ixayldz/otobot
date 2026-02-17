import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { prdLockSchema, type PrdLock } from "../../contracts/lock.js";
import type { RepoInsights } from "../repo/inspector.js";

const HASH_SCOPE = ["assumptions.md", "decisions.md", "prd.locked.md"] as const;

function canonicalize(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "  ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

async function readIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

export async function buildPrdHash(projectRoot: string): Promise<string> {
  const docsDir = join(projectRoot, "docs");
  const sortedScope = [...HASH_SCOPE].sort();
  const content = await Promise.all(
    sortedScope.map(async (fileName) => {
      const raw = await readIfExists(join(docsDir, fileName));
      return `${fileName}\n${canonicalize(raw)}`;
    }),
  );

  const hash = createHash("sha256");
  hash.update(content.join("\n---\n"), "utf8");
  return hash.digest("hex");
}

export async function createLockArtifacts(projectRoot: string, prdPath: string, repo: RepoInsights): Promise<PrdLock> {
  const docsDir = join(projectRoot, "docs");
  await mkdir(docsDir, { recursive: true });

  const rawPrd = await readFile(prdPath, "utf8");
  await writeFile(join(docsDir, "prd.locked.md"), canonicalize(rawPrd), "utf8");

  const decisionsPath = join(docsDir, "decisions.md");
  const assumptionsPath = join(docsDir, "assumptions.md");
  await writeFile(decisionsPath, (await readIfExists(decisionsPath)) || "# decisions\n", "utf8");
  await writeFile(assumptionsPath, (await readIfExists(assumptionsPath)) || "# assumptions\n", "utf8");

  const prdHash = await buildPrdHash(projectRoot);

  const lock: PrdLock = {
    version: "1.2",
    contractVersion: "1.2",
    lockedAt: new Date().toISOString(),
    hashAlgo: "sha256",
    hashScope: [...HASH_SCOPE].sort(),
    prdHash,
    scope: {
      in: ["MVP workflow", "PRD lock", "state-machine gates"],
      out: ["auto production deploy"],
    },
    changeRequestPolicy: {
      required: true,
      approvers: ["project-owner"],
      approvalMode: "any_of",
      requiredApprovals: 1,
      auditRequired: true,
      requiredEvidence: ["prd-diff", "review-note", "test-proof"],
      approvalSlaHours: 24,
    },
    stackHints: {
      language: repo.language,
      frameworks: repo.frameworks,
      db: repo.db,
    },
  };

  prdLockSchema.parse(lock);
  await writeFile(join(docsDir, "prd.lock.json"), JSON.stringify(lock, null, 2), "utf8");
  return lock;
}

export async function validateLockHash(projectRoot: string): Promise<{ valid: boolean; expected?: string; actual: string }> {
  const lockPath = join(projectRoot, "docs", "prd.lock.json");
  const raw = await readFile(lockPath, "utf8");
  const parsed = prdLockSchema.parse(JSON.parse(raw));
  const actual = await buildPrdHash(projectRoot);

  return {
    valid: parsed.prdHash === actual,
    expected: parsed.prdHash,
    actual,
  };
}

export function lockFileName(path: string): string {
  return basename(path);
}
