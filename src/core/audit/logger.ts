import { mkdir, appendFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { redactSecrets, sanitizeObject } from "../security/redaction.js";

export interface AuditEvent {
  ts: string;
  level: "info" | "warn" | "error";
  kind: string;
  message: string;
  data?: Record<string, unknown>;
}

function todayFileName(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}.jsonl`;
}

export class AuditLogger {
  constructor(private readonly projectRoot: string) {}

  private get filePath(): string {
    return join(this.projectRoot, ".otobot", "audit", todayFileName());
  }

  async log(event: AuditEvent): Promise<void> {
    const path = this.filePath;
    await mkdir(dirname(path), { recursive: true });

    const safe: AuditEvent = {
      ...event,
      message: redactSecrets(event.message),
      data: event.data ? sanitizeObject(event.data) : undefined,
    };

    await appendFile(path, `${JSON.stringify(safe)}\n`, "utf8");
  }

  async info(kind: string, message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log({
      ts: new Date().toISOString(),
      level: "info",
      kind,
      message,
      data,
    });
  }

  async warn(kind: string, message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log({
      ts: new Date().toISOString(),
      level: "warn",
      kind,
      message,
      data,
    });
  }

  async error(kind: string, message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log({
      ts: new Date().toISOString(),
      level: "error",
      kind,
      message,
      data,
    });
  }

  async prune(days: number): Promise<number> {
    const dir = join(this.projectRoot, ".otobot", "audit");
    await mkdir(dir, { recursive: true });
    const files = await readdir(dir);

    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const file of files) {
      if (!file.endsWith(".jsonl")) {
        continue;
      }

      const datePart = file.replace(".jsonl", "");
      const ts = Date.parse(`${datePart}T00:00:00.000Z`);
      if (Number.isNaN(ts)) {
        continue;
      }

      if (ts < cutoff) {
        await rm(join(dir, file), { force: true });
        removed += 1;
      }
    }

    return removed;
  }
}
