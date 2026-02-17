import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

export interface RepoInsights {
  language: string;
  frameworks: string[];
  db: string;
  commands: {
    install: string;
    dev: string;
    build: string;
    test: string;
    lint: string;
    format: string;
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

export async function inspectRepo(projectRoot: string): Promise<RepoInsights> {
  const packageJsonPath = join(projectRoot, "package.json");
  const pyprojectPath = join(projectRoot, "pyproject.toml");

  if (await exists(packageJsonPath)) {
    const raw = await readFile(packageJsonPath, "utf8");
    const normalized = stripBom(raw);

    let scripts: Record<string, string> = {};
    try {
      const pkg = JSON.parse(normalized) as { scripts?: Record<string, string> };
      scripts = pkg.scripts ?? {};
    } catch {
      scripts = {};
    }

    return {
      language: "ts",
      frameworks: ["node-cli"],
      db: "sqlite",
      commands: {
        install: "pnpm install",
        dev: scripts.dev ?? "pnpm dev",
        build: scripts.build ?? "pnpm build",
        test: scripts.test ?? "pnpm test",
        lint: scripts.lint ?? "pnpm lint",
        format: scripts.format ?? "pnpm format",
      },
    };
  }

  if (await exists(pyprojectPath)) {
    return {
      language: "py",
      frameworks: ["python-cli"],
      db: "sqlite",
      commands: {
        install: "pip install -r requirements.txt",
        dev: "python -m app",
        build: "python -m build",
        test: "pytest",
        lint: "ruff check .",
        format: "ruff format .",
      },
    };
  }

  return {
    language: "unknown",
    frameworks: [],
    db: "unknown",
    commands: {
      install: "",
      dev: "",
      build: "",
      test: "",
      lint: "",
      format: "",
    },
  };
}
