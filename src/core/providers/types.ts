import type { Provider } from "../../contracts/state.js";

export interface ModelInfo {
  provider: Provider;
  modelId: string;
  source: "runtime" | "cache" | "default";
}

export interface ProviderAdapter {
  provider: Provider;
  listModelsLive(apiKey: string): Promise<ModelInfo[]>;
  validateModelId(apiKey: string, modelId: string): Promise<boolean>;
  healthcheck(apiKey: string): Promise<boolean>;
}

export const DEFAULT_MODELS: Record<Provider, string[]> = {
  openai: ["gpt-5", "gpt-5.2", "gpt-5-mini"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
  anthropic: ["claude-sonnet-4", "claude-opus-4-1"],
};
