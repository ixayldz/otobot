import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

interface ProjectRow {
  id: string;
  root_path: string;
  name: string;
  created_at: number;
  updated_at: number;
  current_state: string;
}

interface MetadataJson {
  projects: ProjectRow[];
}

type SqliteDb = {
  exec: (sql: string) => void;
  prepare: (sql: string) => { run: (...args: unknown[]) => void };
};

function tryLoadSqlite(dbPath: string): SqliteDb | null {
  try {
    const require = createRequire(import.meta.url);
    const mod = require("node:sqlite") as { DatabaseSync?: new (path: string) => SqliteDb };
    if (!mod.DatabaseSync) {
      return null;
    }
    return new mod.DatabaseSync(dbPath);
  } catch {
    return null;
  }
}

export class MetadataDb {
  private sqlite: SqliteDb | null;
  private readonly jsonPath: string;

  constructor(private readonly projectRoot: string) {
    const dir = join(projectRoot, ".otobot");
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, "metadata.db");
    this.jsonPath = join(dir, "metadata.json");
    this.sqlite = tryLoadSqlite(dbPath);
    this.bootstrap();
  }

  private bootstrap(): void {
    if (this.sqlite) {
      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          root_path TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          current_state TEXT NOT NULL
        );
      `);
      return;
    }

    const current = this.readJson();
    this.writeJson(current);
  }

  private readJson(): MetadataJson {
    try {
      const raw = readFileSync(this.jsonPath, "utf8");
      const parsed = JSON.parse(raw) as MetadataJson;
      return {
        projects: parsed.projects ?? [],
      };
    } catch {
      return { projects: [] };
    }
  }

  private writeJson(data: MetadataJson): void {
    writeFileSync(this.jsonPath, JSON.stringify(data, null, 2), "utf8");
  }

  upsertProject(project: {
    id: string;
    rootPath: string;
    name: string;
    currentState: string;
  }): void {
    const now = Date.now();

    if (this.sqlite) {
      const stmt = this.sqlite.prepare(`
        INSERT INTO projects (id, root_path, name, created_at, updated_at, current_state)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(root_path) DO UPDATE SET
          updated_at = excluded.updated_at,
          current_state = excluded.current_state,
          name = excluded.name
      `);

      try {
        stmt.run(project.id, project.rootPath, project.name, now, now, project.currentState);
        return;
      } catch {
        // SQLite can be transiently locked in concurrent CLI invocations.
        // Fall back to JSON metadata path for availability.
        this.sqlite = null;
      }
    }

    const data = this.readJson();
    const existing = data.projects.find((p) => p.root_path === project.rootPath);
    if (existing) {
      existing.updated_at = now;
      existing.current_state = project.currentState;
      existing.name = project.name;
      this.writeJson(data);
      return;
    }

    data.projects.push({
      id: project.id,
      root_path: project.rootPath,
      name: project.name,
      created_at: now,
      updated_at: now,
      current_state: project.currentState,
    });
    this.writeJson(data);
  }
}
