import { sep } from "node:path";

const PROTECTED_PATTERNS = [
  ".env",
  `.env${sep}`,
  "secrets",
  `${sep}secrets${sep}`,
  "id_rsa",
  ".pem",
  ".key",
  "credentials",
  "token",
];

export function isProtectedPath(targetPath: string): boolean {
  const normalized = targetPath.replaceAll("/", sep).toLowerCase();
  return PROTECTED_PATTERNS.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

export function assertPathAllowed(targetPath: string): void {
  if (isProtectedPath(targetPath)) {
    throw new Error(`Protected path blocked: ${targetPath}`);
  }
}
