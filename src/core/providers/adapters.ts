import type { Provider } from "../../contracts/state.js";
import type { ModelInfo, ProviderAdapter } from "./types.js";

async function parseOpenAI(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    throw new Error(`OpenAI models request failed: ${res.status}`);
  }

  const json = (await res.json()) as { data?: Array<{ id: string }> };
  return (json.data ?? []).map((m) => ({
    provider: "openai" as const,
    modelId: m.id,
    source: "runtime" as const,
  }));
}

async function parseGemini(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);

  if (!res.ok) {
    throw new Error(`Gemini models request failed: ${res.status}`);
  }

  const json = (await res.json()) as { models?: Array<{ name: string }> };
  return (json.models ?? [])
    .map((m) => m.name.replace(/^models\//, ""))
    .map((modelId) => ({
      provider: "google" as const,
      modelId,
      source: "runtime" as const,
    }));
}

async function parseAnthropic(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });

  if (!res.ok) {
    throw new Error(`Anthropic models request failed: ${res.status}`);
  }

  const json = (await res.json()) as { data?: Array<{ id: string }> };
  return (json.data ?? []).map((m) => ({
    provider: "anthropic" as const,
    modelId: m.id,
    source: "runtime" as const,
  }));
}

const ADAPTERS: Record<Provider, ProviderAdapter> = {
  openai: {
    provider: "openai",
    listModelsLive: parseOpenAI,
    async validateModelId(apiKey: string, modelId: string): Promise<boolean> {
      const models = await parseOpenAI(apiKey);
      return models.some((m) => m.modelId === modelId);
    },
    async healthcheck(apiKey: string): Promise<boolean> {
      const models = await parseOpenAI(apiKey);
      return models.length > 0;
    },
  },
  google: {
    provider: "google",
    listModelsLive: parseGemini,
    async validateModelId(apiKey: string, modelId: string): Promise<boolean> {
      const models = await parseGemini(apiKey);
      return models.some((m) => m.modelId === modelId);
    },
    async healthcheck(apiKey: string): Promise<boolean> {
      const models = await parseGemini(apiKey);
      return models.length > 0;
    },
  },
  anthropic: {
    provider: "anthropic",
    listModelsLive: parseAnthropic,
    async validateModelId(apiKey: string, modelId: string): Promise<boolean> {
      const models = await parseAnthropic(apiKey);
      return models.some((m) => m.modelId === modelId);
    },
    async healthcheck(apiKey: string): Promise<boolean> {
      const models = await parseAnthropic(apiKey);
      return models.length > 0;
    },
  },
};

export function getProviderAdapter(provider: Provider): ProviderAdapter {
  return ADAPTERS[provider];
}
