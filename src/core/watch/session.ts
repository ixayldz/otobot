import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

export interface WatchSession {
  id: string;
  running: boolean;
  startedAt: string;
  command: string[];
  pid: number | null;
  logPath: string | null;
  reconnectToken: string;
  lastHeartbeatAt: string;
  endedAt: string | null;
}

const WATCH_FILE = join(".otobot", "watch-session.json");

function normalizeSession(raw: Partial<WatchSession>): WatchSession {
  return {
    id: raw.id ?? randomUUID(),
    running: Boolean(raw.running),
    startedAt: raw.startedAt ?? new Date().toISOString(),
    command: raw.command ?? ["claude"],
    pid: raw.pid ?? null,
    logPath: raw.logPath ?? null,
    reconnectToken: raw.reconnectToken ?? randomUUID(),
    lastHeartbeatAt: raw.lastHeartbeatAt ?? new Date().toISOString(),
    endedAt: raw.endedAt ?? null,
  };
}

async function readSession(projectRoot: string): Promise<WatchSession | null> {
  try {
    const raw = await readFile(join(projectRoot, WATCH_FILE), "utf8");
    return normalizeSession(JSON.parse(raw) as Partial<WatchSession>);
  } catch {
    return null;
  }
}

async function saveSession(projectRoot: string, session: WatchSession): Promise<void> {
  const path = join(projectRoot, WATCH_FILE);
  await mkdir(join(projectRoot, ".otobot"), { recursive: true });
  await writeFile(path, JSON.stringify(session, null, 2), "utf8");
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function startWatch(projectRoot: string): Promise<WatchSession> {
  const id = randomUUID();
  const watchDir = join(projectRoot, ".otobot", "watch");
  await mkdir(watchDir, { recursive: true });
  const logPath = join(watchDir, `${id}.log`);

  if (process.env.OTOBOT_SKIP_CLAUDE === "1") {
    await writeFile(logPath, "watch-mode simulated\n", "utf8");
    const fake: WatchSession = {
      id,
      running: true,
      startedAt: new Date().toISOString(),
      command: ["claude"],
      pid: null,
      logPath,
      reconnectToken: randomUUID(),
      lastHeartbeatAt: new Date().toISOString(),
      endedAt: null,
    };
    await saveSession(projectRoot, fake);
    return fake;
  }

  const shellCommand = `claude >> "${logPath}" 2>&1`;
  const child = spawn(shellCommand, {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
    shell: true,
  });
  child.unref();

  const session: WatchSession = {
    id,
    running: true,
    startedAt: new Date().toISOString(),
    command: ["claude"],
    pid: child.pid ?? null,
    logPath,
    reconnectToken: randomUUID(),
    lastHeartbeatAt: new Date().toISOString(),
    endedAt: null,
  };

  await saveSession(projectRoot, session);
  return session;
}

export async function stopWatch(projectRoot: string): Promise<WatchSession | null> {
  const current = await readSession(projectRoot);
  if (!current) {
    return null;
  }

  if (current.pid && isPidAlive(current.pid)) {
    try {
      process.kill(current.pid);
    } catch {
      // no-op
    }
  }

  const stopped: WatchSession = {
    ...current,
    running: false,
    pid: null,
    endedAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
  };

  await saveSession(projectRoot, stopped);
  return stopped;
}

export async function watchStatus(projectRoot: string): Promise<WatchSession | null> {
  const current = await readSession(projectRoot);
  if (!current) {
    return null;
  }

  if (current.pid && !isPidAlive(current.pid)) {
    const updated: WatchSession = {
      ...current,
      running: false,
      pid: null,
      endedAt: current.endedAt ?? new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    };
    await saveSession(projectRoot, updated);
    return updated;
  }
  const heartbeat = {
    ...current,
    lastHeartbeatAt: new Date().toISOString(),
  };
  await saveSession(projectRoot, heartbeat);
  return heartbeat;
}
