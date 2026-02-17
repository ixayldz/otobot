import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_MODELS, type ModelInfo } from "./types.js";
import type { Provider } from "../../contracts/state.js";
import { getApiKey } from "./keys.js";
import { getProviderAdapter } from "./adapters.js";

const CACHE_PATH = join(".otobot", "model-cache.json");
export type ProviderHealthStatus = "unknown" | "healthy" | "degraded" | "unconfigured";

interface ModelCache {
  updatedAt: string;
  models: Record<Provider, string[]>;
}

export async function loadModelCache(projectRoot: string): Promise<ModelCache | null> {
  const filePath = join(projectRoot, CACHE_PATH);
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as ModelCache;
  } catch {
    return null;
  }
}

export async function saveModelCache(projectRoot: string, models: Record<Provider, string[]>): Promise<void> {
  const filePath = join(projectRoot, CACHE_PATH);
  await mkdir(join(projectRoot, ".otobot"), { recursive: true });
  const data: ModelCache = {
    updatedAt: new Date().toISOString(),
    models,
  };
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function listModelsRuntime(projectRoot: string, provider: Provider): Promise<ModelInfo[] | null> {
  const apiKey = await getApiKey(projectRoot, provider);
  if (!apiKey) {
    return null;
  }

  try {
    const adapter = getProviderAdapter(provider);
    const models = await adapter.listModelsLive(apiKey);
    if (models.length === 0) {
      return null;
    }

    const cache = (await loadModelCache(projectRoot)) ?? {
      updatedAt: new Date().toISOString(),
      models: {
        openai: [],
        google: [],
        anthropic: [],
      },
    };
    cache.models[provider] = models.map((m) => m.modelId);
    await saveModelCache(projectRoot, cache.models);
    return models;
  } catch {
    return null;
  }
}

export async function listModels(projectRoot: string, provider: Provider): Promise<ModelInfo[]> {
  const runtime = await listModelsRuntime(projectRoot, provider);
  if (runtime && runtime.length > 0) {
    return runtime;
  }

  const cache = await loadModelCache(projectRoot);
  const cached = cache?.models[provider] ?? [];
  if (cached.length > 0) {
    return cached.map((modelId) => ({ provider, modelId, source: "cache" as const }));
  }

  const defaults = DEFAULT_MODELS[provider];
  return defaults.map((modelId) => ({ provider, modelId, source: "default" as const }));
}

export async function checkProviderHealth(projectRoot: string, provider: Provider): Promise<ProviderHealthStatus> {
  const apiKey = await getApiKey(projectRoot, provider);
  if (!apiKey) {
    return "unconfigured";
  }

  try {
    const adapter = getProviderAdapter(provider);
    const ok = await adapter.healthcheck(apiKey);
    return ok ? "healthy" : "degraded";
  } catch {
    return "degraded";
  }
}

export async function checkAllProviderHealth(
  projectRoot: string,
): Promise<Record<Provider, ProviderHealthStatus>> {
  const providers: Provider[] = ["openai", "google", "anthropic"];
  const entries = await Promise.all(
    providers.map(async (provider) => [provider, await checkProviderHealth(projectRoot, provider)] as const),
  );
  return Object.fromEntries(entries) as Record<Provider, ProviderHealthStatus>;
}
