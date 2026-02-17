import { describe, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listModels } from "../../src/core/providers/cache.js";

describe("provider catalog filtering", () => {
  test("keeps only supported runtime models", async () => {
    const root = await mkdtemp(join(tmpdir(), "otobot-catalog-runtime-"));
    const prev = process.env.OTOBOT_GEMINI_KEY;
    process.env.OTOBOT_GEMINI_KEY = "test-key";

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          models: [
            { name: "models/gemini-3-pro-preview" },
            { name: "models/gemini-3-flash-preview" },
            { name: "models/gemini-2.5-pro" },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const models = await listModels(root, "google");
      expect(models).toEqual([
        {
          provider: "google",
          modelId: "gemini-3-pro-preview",
          source: "runtime",
        },
      ]);
    } finally {
      vi.unstubAllGlobals();
      if (prev === undefined) {
        delete process.env.OTOBOT_GEMINI_KEY;
      } else {
        process.env.OTOBOT_GEMINI_KEY = prev;
      }
    }
  });

  test("keeps only supported cached models when runtime is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "otobot-catalog-cache-"));
    delete process.env.OTOBOT_GEMINI_KEY;

    await mkdir(join(root, ".otobot"), { recursive: true });
    await writeFile(
      join(root, ".otobot", "model-cache.json"),
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          models: {
            openai: ["gpt-5.2"],
            google: ["gemini-2.5-pro", "gemini-3-pro-preview", "gemini-3-flash-preview"],
            anthropic: ["claude-opus-4-6"],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const models = await listModels(root, "google");
    expect(models).toEqual([
      {
        provider: "google",
        modelId: "gemini-3-pro-preview",
        source: "cache",
      },
    ]);
  });
});
