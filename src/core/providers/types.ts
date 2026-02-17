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
  openai: ["gpt-5.2"],
  google: ["gemini-3-pro-preview"],
  anthropic: ["claude-opus-4-6"],
};
