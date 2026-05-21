import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ThinkingLevel } from "./vendor/pi-rpc-types.js";

export interface ProviderConfig {
  apiKey?: string;
  apiKeyEnvVar?: string;
  defaultModel?: string;
  baseUrl?: string;
}

export interface BridgeConfig {
  providers: Record<string, ProviderConfig>;
  defaults: {
    provider?: string;
    model?: string;
    thinkingLevel?: ThinkingLevel;
  };
  limits: {
    maxConcurrentAgents: number;
    defaultTimeoutMs: number;
  };
}

const DEFAULT_CONFIG: BridgeConfig = {
  providers: {},
  defaults: {},
  limits: {
    maxConcurrentAgents: 5,
    defaultTimeoutMs: 120000,
  },
};

export function getConfigPath(): string {
  return join(homedir(), ".claude-pi-bridge", "config.json");
}

export function loadConfig(): BridgeConfig {
  const path = getConfigPath();
  if (!existsSync(path)) return DEFAULT_CONFIG;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function resolveAuthEnv(provider: string, config: BridgeConfig): Record<string, string> {
  const env: Record<string, string> = {};
  const providerConfig = config.providers[provider];
  if (!providerConfig) return env;

  const envVarName = providerConfig.apiKeyEnvVar ?? providerToEnvVar(provider);

  if (providerConfig.apiKey) {
    env[envVarName] = providerConfig.apiKey;
  }
  if (providerConfig.baseUrl) {
    env[`${envVarName.replace(/_API_KEY$/, "")}_BASE_URL`] = providerConfig.baseUrl;
  }
  return env;
}

function providerToEnvVar(provider: string): string {
  const mapping: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    groq: "GROQ_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    xai: "XAI_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    mistral: "MISTRAL_API_KEY",
    google: "GOOGLE_API_KEY",
    "google-vertex": "GOOGLE_APPLICATION_CREDENTIALS",
    "azure-openai-responses": "AZURE_OPENAI_API_KEY",
    "github-copilot": "GITHUB_COPILOT_TOKEN",
    "amazon-bedrock": "AWS_ACCESS_KEY_ID",
    minimax: "MINIMAX_API_KEY",
    moonshotai: "MOONSHOTAI_API_KEY",
    fireworks: "FIREWORKS_API_KEY",
    together: "TOGETHER_API_KEY",
    huggingface: "HF_TOKEN",
    zai: "ZAI_API_KEY",
    opencode: "OPENCODE_API_KEY",
    xiaomi: "XIAOMI_API_KEY",
  };
  return mapping[provider] ?? `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}
