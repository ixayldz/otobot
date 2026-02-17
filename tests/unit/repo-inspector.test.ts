import { describe, expect, test } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectRepo } from "../../src/core/repo/inspector.js";

describe("repo inspector", () => {
  test("handles utf-8 bom in package.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "otobot-repo-inspector-"));
    const pkg = "\ufeff" + JSON.stringify({ name: "tmp", scripts: { test: "pnpm test --runInBand" } }, null, 2);
    await writeFile(join(root, "package.json"), pkg, "utf8");

    const insights = await inspectRepo(root);
    expect(insights.language).toBe("ts");
    expect(insights.commands.test).toBe("pnpm test --runInBand");
  });
});
