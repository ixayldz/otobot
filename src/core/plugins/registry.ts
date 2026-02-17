import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pluginManifestSchema, type PluginManifest } from "../../contracts/pluginManifest.js";
import { pluginSchema, type OtobotPlugin } from "../../contracts/state.js";

const PLUGINS_FILE = join(".otobot", "plugins.json");
const PLUGIN_MANIFEST_FILE = "manifest.json";
const OTOBOT_VERSION = "0.1.0";

function hashManifest(payload: Omit<PluginManifest, "integrity">): string {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

function compareSemver(left: string, right: string): number {
  const leftParts = left.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const rightParts = right.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let i = 0; i < length; i += 1) {
    const a = leftParts[i] ?? 0;
    const b = rightParts[i] ?? 0;
    if (a > b) {
      return 1;
    }
    if (a < b) {
      return -1;
    }
  }
  return 0;
}

function pluginDir(projectRoot: string, name: string): string {
  return join(projectRoot, ".otobot", "plugins", name);
}

function manifestPath(projectRoot: string, name: string): string {
  return join(pluginDir(projectRoot, name), PLUGIN_MANIFEST_FILE);
}

async function loadPlugins(projectRoot: string): Promise<OtobotPlugin[]> {
  try {
    const raw = await readFile(join(projectRoot, PLUGINS_FILE), "utf8");
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.map((item) => pluginSchema.parse(item));
  } catch {
    return [];
  }
}

async function savePlugins(projectRoot: string, plugins: OtobotPlugin[]): Promise<void> {
  await mkdir(join(projectRoot, ".otobot"), { recursive: true });
  await writeFile(join(projectRoot, PLUGINS_FILE), JSON.stringify(plugins, null, 2), "utf8");
}

function buildDefaultManifest(name: string, version: string): PluginManifest {
  const payload = {
    name,
    version,
    entry: "index.js",
    permissions: ["read:project", "write:docs"],
    compat: {
      minOtobotVersion: "0.1.0",
    },
  };

  return {
    ...payload,
    integrity: hashManifest(payload),
  };
}

async function readOrCreateManifest(projectRoot: string, name: string, version: string): Promise<PluginManifest> {
  const path = manifestPath(projectRoot, name);
  try {
    const raw = await readFile(path, "utf8");
    const manifest = pluginManifestSchema.parse(JSON.parse(raw));
    const expected = hashManifest({
      name: manifest.name,
      version: manifest.version,
      entry: manifest.entry,
      permissions: manifest.permissions,
      compat: manifest.compat,
    });

    if (expected !== manifest.integrity) {
      throw new Error(`Plugin integrity mismatch for ${name}`);
    }

    return manifest;
  } catch {
    let missing = false;
    try {
      await readFile(path, "utf8");
    } catch {
      missing = true;
    }

    if (!missing) {
      throw new Error(`Plugin manifest is invalid for ${name}`);
    }

    const manifest = buildDefaultManifest(name, version);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(manifest, null, 2), "utf8");
    return manifest;
  }
}

function ensureCompatibility(manifest: PluginManifest): void {
  if (compareSemver(OTOBOT_VERSION, manifest.compat.minOtobotVersion) < 0) {
    throw new Error(
      `Plugin ${manifest.name}@${manifest.version} requires otobot>=${manifest.compat.minOtobotVersion}`,
    );
  }
}

export async function listPlugins(projectRoot: string): Promise<OtobotPlugin[]> {
  const plugins = await loadPlugins(projectRoot);
  const validated: OtobotPlugin[] = [];

  for (const plugin of plugins) {
    if (!plugin.name) {
      continue;
    }
    const manifest = await readOrCreateManifest(projectRoot, plugin.name, plugin.version);
    ensureCompatibility(manifest);
    validated.push({
      ...plugin,
      integrity: manifest.integrity,
      permissions: manifest.permissions,
      compatMinVersion: manifest.compat.minOtobotVersion,
      installedAt: plugin.installedAt ?? new Date().toISOString(),
      manifestPath: manifestPath(projectRoot, plugin.name),
    });
  }

  if (validated.length !== plugins.length) {
    await savePlugins(projectRoot, validated);
  }

  return validated;
}

export async function installPlugin(projectRoot: string, name: string, version = "latest"): Promise<OtobotPlugin> {
  const plugins = await loadPlugins(projectRoot);
  const manifest = await readOrCreateManifest(projectRoot, name, version);
  ensureCompatibility(manifest);

  const plugin: OtobotPlugin = {
    name,
    version: manifest.version,
    enabled: true,
    integrity: manifest.integrity,
    permissions: manifest.permissions,
    compatMinVersion: manifest.compat.minOtobotVersion,
    installedAt: new Date().toISOString(),
    manifestPath: manifestPath(projectRoot, name),
  };

  const existing = plugins.find((p) => p.name === name);
  if (existing) {
    Object.assign(existing, plugin);
  } else {
    plugins.push(plugin);
  }

  await savePlugins(projectRoot, plugins);
  return plugin;
}

export async function removePlugin(projectRoot: string, name: string): Promise<boolean> {
  const plugins = await loadPlugins(projectRoot);
  const next = plugins.filter((p) => p.name !== name);
  const changed = next.length !== plugins.length;
  await savePlugins(projectRoot, next);
  return changed;
}
