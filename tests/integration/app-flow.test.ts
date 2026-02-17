import { describe, expect, test, vi } from "vitest";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OtobotApp } from "../../src/cli/app.js";

async function createFixtureRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));

  await writeFile(
    join(root, "prd.md"),
    "# PRD\n## Problem\nNeed scoped build\n## Testing\nUnit and integration tests required.\n## Security\nSecrets must be protected.",
    "utf8",
  );

  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "tmp",
        scripts: {
          dev: "pnpm dev",
          build: "pnpm build",
          test: "pnpm test",
          lint: "pnpm lint",
          format: "pnpm format",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  return root;
}

async function setupReadyApp(root: string): Promise<OtobotApp> {
  const app = new OtobotApp(root);
  await app.init();
  await app.run("/read prd.md");
  await app.run("/interview start");
  await app.run("/lock");
  await app.run("/bootstrap");
  await app.run("/harden");
  return app;
}

describe("app integration flow", () => {
  test("runs full command flow including v1 commands", async () => {
    const prev = process.env.OTOBOT_SKIP_CLAUDE;
    process.env.OTOBOT_SKIP_CLAUDE = "1";

    try {
      const root = await createFixtureRoot("otobot-app-");
      const app = await setupReadyApp(root);

      expect(await app.run("/watch start")).toContain("Watch started");
      expect(await app.run("/watch status")).toContain("Watch status");
      expect(await app.run("/pause")).toContain("Paused");
      expect(await app.run("/resume HARDENED")).toContain("Resumed");

      expect(await app.run("/policy pack apply default-balanced")).toContain("Policy applied");
      expect(await app.run("/sandbox on docker balanced")).toContain("Sandbox enabled");
      expect(await app.run("/sandbox run echo hello")).toContain("Sandbox command succeeded");
      expect(await app.run("/plugin install sample-plugin 1.0.0")).toContain("Plugin installed");
      expect(await app.run("/plugin list")).toContain("sample-plugin");
      expect(await app.run("/model set openai gpt-5.2")).toContain("Model updated");

      const settings = await readFile(join(root, ".claude", "settings.json"), "utf8");
      expect(settings).toContain("\"deny\"");
      expect(settings).toContain("protect-files");

      const hookExt = process.platform === "win32" ? "ps1" : "sh";
      const protectHook = await readFile(join(root, ".claude", "hooks", `protect-files.${hookExt}`), "utf8");
      expect(protectHook).toContain("Protected path blocked");

      const build = await app.run("/build");
      expect(build).toContain("Build succeeded");

      expect(await app.run("/audit prune --days 1")).toContain("Audit prune complete");
      expect(await app.run("/watch stop")).toContain("Watch stopped");
    } finally {
      if (prev === undefined) {
        delete process.env.OTOBOT_SKIP_CLAUDE;
      } else {
        process.env.OTOBOT_SKIP_CLAUDE = prev;
      }
    }
  }, 20000);

  test("blocks build until model is explicitly selected", async () => {
    const prev = process.env.OTOBOT_SKIP_CLAUDE;
    process.env.OTOBOT_SKIP_CLAUDE = "1";

    try {
      const root = await createFixtureRoot("otobot-model-gate-");
      const app = await setupReadyApp(root);

      const blocked = await app.run("/build");
      expect(blocked).toContain("Run /model set");

      expect(await app.run("/model set openai gpt-5.2")).toContain("Model updated");
      expect(await app.run("/build")).toContain("Build succeeded");
    } finally {
      if (prev === undefined) {
        delete process.env.OTOBOT_SKIP_CLAUDE;
      } else {
        process.env.OTOBOT_SKIP_CLAUDE = prev;
      }
    }
  }, 20000);

  test("model set synchronizes reviewer and provider-based executor roles", async () => {
    const prev = process.env.OTOBOT_SKIP_CLAUDE;
    process.env.OTOBOT_SKIP_CLAUDE = "1";

    try {
      const root = await createFixtureRoot("otobot-role-sync-");
      const app = await setupReadyApp(root);

      expect(await app.run("/roles set planner=openai:gpt-5.2 reviewer=anthropic:claude-opus-4-6 executor=openai:gpt-5.2")).toContain(
        "Roles updated",
      );
      expect(await app.run("/model set google gemini-3-pro-preview")).toContain("roles synced");

      const firstRaw = await readFile(join(root, ".otobot", "state.json"), "utf8");
      const firstState = JSON.parse(firstRaw) as {
        roles: {
          planner: { type: string; provider?: string; modelId?: string };
          reviewer: { type: string; provider?: string; modelId?: string };
          executor: { type: string; provider?: string; modelId?: string };
        };
      };

      expect(firstState.roles.planner).toEqual({
        type: "provider",
        provider: "google",
        modelId: "gemini-3-pro-preview",
      });
      expect(firstState.roles.reviewer).toEqual({
        type: "provider",
        provider: "google",
        modelId: "gemini-3-pro-preview",
      });
      expect(firstState.roles.executor).toEqual({
        type: "provider",
        provider: "google",
        modelId: "gemini-3-pro-preview",
      });

      expect(await app.run("/roles set planner=google:gemini-3-pro-preview reviewer=google:gemini-3-pro-preview executor=claude_code")).toContain(
        "Roles updated",
      );
      expect(await app.run("/model set openai gpt-5.2")).toContain("roles synced");

      const secondRaw = await readFile(join(root, ".otobot", "state.json"), "utf8");
      const secondState = JSON.parse(secondRaw) as {
        roles: {
          planner: { type: string; provider?: string; modelId?: string };
          reviewer: { type: string; provider?: string; modelId?: string };
          executor: { type: string; provider?: string; modelId?: string };
        };
      };

      expect(secondState.roles.planner).toEqual({
        type: "provider",
        provider: "openai",
        modelId: "gpt-5.2",
      });
      expect(secondState.roles.reviewer).toEqual({
        type: "provider",
        provider: "openai",
        modelId: "gpt-5.2",
      });
      expect(secondState.roles.executor).toEqual({
        type: "claude_code",
      });
    } finally {
      if (prev === undefined) {
        delete process.env.OTOBOT_SKIP_CLAUDE;
      } else {
        process.env.OTOBOT_SKIP_CLAUDE = prev;
      }
    }
  }, 20000);

  test("routes natural-language input to PRD chat after /read", async () => {
    const prevOpenAiKey = process.env.OTOBOT_OPENAI_KEY;
    process.env.OTOBOT_OPENAI_KEY = "test-openai-key";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/v1/chat/completions")) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "1. Onboarding akisini PRD'ye ekleyelim.\n2. Login acceptance criteria'sini netlestirelim.",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return new Response("not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    try {
      const root = await createFixtureRoot("otobot-nl-chat-");
      const app = new OtobotApp(root);
      await app.init();

      const readResult = await app.run("/read prd.md");
      expect(readResult).toContain("Natural-language PRD chat enabled");
      expect(await app.run("/read prd.md")).toContain("PRD loaded");

      const chatResult = await app.run("login ve onboarding gereksinimlerini netlestirelim");
      expect(chatResult).toContain("Onboarding");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const chatStatus = await app.run("/chat status");
      expect(chatStatus).toContain("enabled=true");
    } finally {
      vi.unstubAllGlobals();

      if (prevOpenAiKey === undefined) {
        delete process.env.OTOBOT_OPENAI_KEY;
      } else {
        process.env.OTOBOT_OPENAI_KEY = prevOpenAiKey;
      }
    }
  }, 20000);

  test("review failure returns state to IMPLEMENTING", async () => {
    const prevSkip = process.env.OTOBOT_SKIP_CLAUDE;
    const prevReview = process.env.OTOBOT_FORCE_REVIEW_FAIL;
    process.env.OTOBOT_SKIP_CLAUDE = "1";
    process.env.OTOBOT_FORCE_REVIEW_FAIL = "1";

    try {
      const root = await createFixtureRoot("otobot-review-fail-");
      const app = await setupReadyApp(root);
      await app.run("/model set openai gpt-5.2");

      const result = await app.run("/build");
      expect(result).toContain("Review failed");
      expect(result).toContain("IMPLEMENTING");

      const rawState = await readFile(join(root, ".otobot", "state.json"), "utf8");
      const state = JSON.parse(rawState) as { state: string };
      expect(state.state).toBe("IMPLEMENTING");
    } finally {
      if (prevSkip === undefined) {
        delete process.env.OTOBOT_SKIP_CLAUDE;
      } else {
        process.env.OTOBOT_SKIP_CLAUDE = prevSkip;
      }

      if (prevReview === undefined) {
        delete process.env.OTOBOT_FORCE_REVIEW_FAIL;
      } else {
        process.env.OTOBOT_FORCE_REVIEW_FAIL = prevReview;
      }
    }
  }, 20000);

  test("testing failure enters DEBUGGING and triggers automatic retest", async () => {
    const prevSkip = process.env.OTOBOT_SKIP_CLAUDE;
    const prevFailTask = process.env.OTOBOT_FORCE_FAIL_TASK;
    process.env.OTOBOT_SKIP_CLAUDE = "1";
    process.env.OTOBOT_FORCE_FAIL_TASK = "TASK-001";

    try {
      const root = await createFixtureRoot("otobot-test-fail-");
      const app = await setupReadyApp(root);
      await app.run("/model set openai gpt-5.2");

      const result = await app.run("/build");
      expect(result).toContain("after debugging retry");

      const auditDir = join(root, ".otobot", "audit");
      const files = (await readdir(auditDir)).filter((file) => file.endsWith(".jsonl"));
      expect(files.length).toBeGreaterThan(0);

      const auditRaw = await readFile(join(auditDir, files[0]), "utf8");
      expect(auditRaw).toContain("\"kind\":\"build.retest\"");
    } finally {
      if (prevSkip === undefined) {
        delete process.env.OTOBOT_SKIP_CLAUDE;
      } else {
        process.env.OTOBOT_SKIP_CLAUDE = prevSkip;
      }

      if (prevFailTask === undefined) {
        delete process.env.OTOBOT_FORCE_FAIL_TASK;
      } else {
        process.env.OTOBOT_FORCE_FAIL_TASK = prevFailTask;
      }
    }
  }, 20000);

  test("supports new PRD intake after shipped", async () => {
    const prev = process.env.OTOBOT_SKIP_CLAUDE;
    process.env.OTOBOT_SKIP_CLAUDE = "1";

    try {
      const root = await createFixtureRoot("otobot-restart-cycle-");
      const app = await setupReadyApp(root);

      expect(await app.run("/model set openai gpt-5.2")).toContain("Model updated");
      expect(await app.run("/build")).toContain("Build succeeded");

      expect(await app.run("/read prd.md")).toContain("PRD loaded");
      expect(await app.run("/interview start")).toContain("Interview completed");
    } finally {
      if (prev === undefined) {
        delete process.env.OTOBOT_SKIP_CLAUDE;
      } else {
        process.env.OTOBOT_SKIP_CLAUDE = prev;
      }
    }
  }, 20000);
});
