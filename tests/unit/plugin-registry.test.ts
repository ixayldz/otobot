import { describe, expect, test } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPlugin, listPlugins, removePlugin } from "../../src/core/plugins/registry.js";

describe("plugin registry", () => {
  test("installs plugin with manifest integrity and lists it", async () => {
    const root = await mkdtemp(join(tmpdir(), "otobot-plugin-"));
    const installed = await installPlugin(root, "sample-plugin", "1.0.0");
    expect(installed.integrity.length).toBeGreaterThan(0);
    expect(installed.manifestPath).toContain("manifest.json");

    const plugins = await listPlugins(root);
    expect(plugins.length).toBe(1);
    expect(plugins[0]?.name).toBe("sample-plugin");
    expect(plugins[0]?.integrity.length).toBeGreaterThan(0);
  });

  test("removes installed plugin", async () => {
    const root = await mkdtemp(join(tmpdir(), "otobot-plugin-remove-"));
    await installPlugin(root, "sample-plugin", "1.0.0");
    const removed = await removePlugin(root, "sample-plugin");
    expect(removed).toBe(true);

    const plugins = await listPlugins(root);
    expect(plugins.length).toBe(0);
  });
});
