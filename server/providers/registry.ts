import { createDeepSeekProvider } from "./deepseek";
import { createGeminiProvider } from "./gemini";
import { createModelGatewayProvider } from "./model-gateway";
import { createMockProviderSet } from "./mock";
import { createOpenAIProvider } from "./openai";
import { evaluateProviderPolicy, isProviderPolicyAllowed, parseProviderPolicy, type ProviderPolicyDecision } from "./provider-policy";
import type { ImplementedProviderId, ModelProvider, ProviderId } from "./types";

export type Env = Record<string, string | undefined>;

export type ProviderRegistryEntry = {
  id: ProviderId;
  displayName: string;
  kind: "api" | "local";
  envKey?: string;
  modelEnvKey: string;
  defaultModel: string;
  implemented: boolean;
  notes: string;
};

export type ProviderStatus = {
  id: ProviderId;
  displayName: string;
  kind: ProviderRegistryEntry["kind"];
  configured: boolean;
  implemented: boolean;
  envKey?: string;
  modelEnvKey: string;
  model: string;
  notes: string;
  policy?: ProviderPolicyDecision;
};

export const providerRegistry: ProviderRegistryEntry[] = [
  {
    id: "model_gateway",
    displayName: "Unified Model Gateway",
    kind: "api",
    envKey: "MODEL_GATEWAY_API_KEY",
    modelEnvKey: "MODEL_GATEWAY_MODELS",
    defaultModel: "gpt-4o-mini,deepseek-chat,gemini-2.0-flash-lite",
    implemented: true,
    notes: "Implemented as an OpenAI-compatible chat completions gateway using one API key and base URL."
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    kind: "api",
    envKey: "DEEPSEEK_API_KEY",
    modelEnvKey: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-chat",
    implemented: true,
    notes: "Implemented through the DeepSeek chat completions API."
  },
  {
    id: "openai",
    displayName: "OpenAI",
    kind: "api",
    envKey: "OPENAI_API_KEY",
    modelEnvKey: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    implemented: true,
    notes: "Implemented through the OpenAI Responses API. ChatGPT Plus is not an API key."
  },
  {
    id: "gemini",
    displayName: "Google Gemini",
    kind: "api",
    envKey: "GEMINI_API_KEY",
    modelEnvKey: "GEMINI_MODEL",
    defaultModel: "gemini-2.0-flash-lite",
    implemented: true,
    notes: "Implemented through the Gemini generateContent API. Gemini Advanced is not an API key."
  },
  {
    id: "anthropic",
    displayName: "Anthropic Claude",
    kind: "api",
    envKey: "ANTHROPIC_API_KEY",
    modelEnvKey: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-4.5",
    implemented: false,
    notes: "Reserved for a future Anthropic Messages API adapter."
  },
  {
    id: "xai",
    displayName: "xAI Grok",
    kind: "api",
    envKey: "XAI_API_KEY",
    modelEnvKey: "XAI_MODEL",
    defaultModel: "grok-4",
    implemented: false,
    notes: "Reserved for a future xAI adapter."
  },
  {
    id: "mistral",
    displayName: "Mistral AI",
    kind: "api",
    envKey: "MISTRAL_API_KEY",
    modelEnvKey: "MISTRAL_MODEL",
    defaultModel: "mistral-large-latest",
    implemented: false,
    notes: "Reserved for a future Mistral chat adapter."
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    kind: "api",
    envKey: "OPENROUTER_API_KEY",
    modelEnvKey: "OPENROUTER_MODEL",
    defaultModel: "openai/gpt-5.2",
    implemented: false,
    notes: "Reserved as a model marketplace/proxy slot."
  },
  {
    id: "groq",
    displayName: "Groq",
    kind: "api",
    envKey: "GROQ_API_KEY",
    modelEnvKey: "GROQ_MODEL",
    defaultModel: "llama-3.3-70b-versatile",
    implemented: false,
    notes: "Reserved for a low-latency inference adapter."
  },
  {
    id: "together",
    displayName: "Together AI",
    kind: "api",
    envKey: "TOGETHER_API_KEY",
    modelEnvKey: "TOGETHER_MODEL",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    implemented: false,
    notes: "Reserved for open-weight hosted models."
  },
  {
    id: "cohere",
    displayName: "Cohere",
    kind: "api",
    envKey: "COHERE_API_KEY",
    modelEnvKey: "COHERE_MODEL",
    defaultModel: "command-a",
    implemented: false,
    notes: "Reserved for a future Cohere adapter."
  },
  {
    id: "perplexity",
    displayName: "Perplexity",
    kind: "api",
    envKey: "PERPLEXITY_API_KEY",
    modelEnvKey: "PERPLEXITY_MODEL",
    defaultModel: "sonar-pro",
    implemented: false,
    notes: "Reserved for research-oriented model calls."
  },
  {
    id: "ollama",
    displayName: "Ollama",
    kind: "local",
    modelEnvKey: "OLLAMA_MODEL",
    defaultModel: "llama3.1",
    implemented: false,
    notes: "Reserved for local models through OLLAMA_BASE_URL."
  },
  {
    id: "lmstudio",
    displayName: "LM Studio",
    kind: "local",
    modelEnvKey: "LMSTUDIO_MODEL",
    defaultModel: "local-model",
    implemented: false,
    notes: "Reserved for OpenAI-compatible local models through LMSTUDIO_BASE_URL."
  }
];

export function getProviderStatus(env: Env): Record<ProviderId, ProviderStatus> {
  const policy = parseProviderPolicy(env.QUORUMMIND_PROVIDER_POLICY);

  return Object.fromEntries(
    providerRegistry.map((entry) => [
      entry.id,
      {
        id: entry.id,
        displayName: entry.displayName,
        kind: entry.kind,
        configured: isProviderConfigured(entry, env),
        implemented: entry.implemented,
        envKey: entry.envKey,
        modelEnvKey: entry.modelEnvKey,
        model: modelForStatus(entry, env),
        notes: entry.notes,
        ...(entry.implemented
          ? {
              policy: evaluateProviderPolicy(
                policy,
                entry.id as ImplementedProviderId,
                modelForStatus(entry, env)
              )
            }
          : {})
      }
    ])
  ) as Record<ProviderId, ProviderStatus>;
}

export function createConfiguredProviders(env: Env): ModelProvider[] {
  if (env.QUORUMMIND_MOCK_PROVIDERS === "1") {
    return createMockProviderSet().filter((provider) => isLiveModelAllowed(env, provider.id, provider.model));
  }

  const providers: ModelProvider[] = [];
  const gatewayApiKey = modelGatewayApiKey(env);
  const gatewayBaseUrl = modelGatewayBaseUrl(env);

  if (gatewayApiKey && gatewayBaseUrl) {
    const gatewaySeats = seatsForGateway(env).filter((seat) => isLiveModelAllowed(env, seat.providerId, seat.model));

    return gatewaySeats.map((seat) =>
      createModelGatewayProvider({
        apiKey: gatewayApiKey,
        baseUrl: gatewayBaseUrl,
        model: seat.model,
        providerId: seat.providerId
      })
    );
  }

  if (env.OPENAI_API_KEY) {
    const model = env.OPENAI_MODEL ?? defaultModelFor("openai");
    if (isLiveModelAllowed(env, "openai", model)) {
      providers.push(
        createOpenAIProvider({
          apiKey: env.OPENAI_API_KEY,
          model
        })
      );
    }
  }

  if (env.DEEPSEEK_API_KEY) {
    const model = env.DEEPSEEK_MODEL ?? defaultModelFor("deepseek");
    if (isLiveModelAllowed(env, "deepseek", model)) {
      providers.push(
        createDeepSeekProvider({
          apiKey: env.DEEPSEEK_API_KEY,
          model
        })
      );
    }
  }

  if (env.GEMINI_API_KEY) {
    const model = env.GEMINI_MODEL ?? defaultModelFor("gemini");
    if (isLiveModelAllowed(env, "gemini", model)) {
      providers.push(
        createGeminiProvider({
          apiKey: env.GEMINI_API_KEY,
          model
        })
      );
    }
  }

  return providers;
}

function defaultModelFor(id: ImplementedProviderId): string {
  return providerRegistry.find((entry) => entry.id === id)?.defaultModel ?? id;
}

type GatewaySeat = {
  model: string;
  providerId: ImplementedProviderId;
};

const namedGatewaySeatIds: ImplementedProviderId[] = ["openai", "deepseek", "gemini"];

function seatsForGateway(env: Env): GatewaySeat[] {
  if (env.MODEL_GATEWAY_MODELS) {
    return modelsFromCommaSeparatedValue(env.MODEL_GATEWAY_MODELS).map((model, index) => ({
      model,
      providerId: namedGatewaySeatIds[index] ?? "model_gateway"
    }));
  }

  const namedSeats = [
    {
      model: env.MODEL_GATEWAY_GPT_MODEL,
      providerId: "openai" as const
    },
    {
      model: env.MODEL_GATEWAY_DEEPSEEK_MODEL,
      providerId: "deepseek" as const
    },
    {
      model: env.MODEL_GATEWAY_GEMINI_MODEL,
      providerId: "gemini" as const
    }
  ].flatMap((seat) => (seat.model ? [{ model: seat.model, providerId: seat.providerId }] : []));

  if (namedSeats.length > 0) {
    return namedSeats;
  }

  return modelsFromCommaSeparatedValue(defaultModelFor("model_gateway")).map((model, index) => ({
    model,
    providerId: namedGatewaySeatIds[index] ?? "model_gateway"
  }));
}

function modelForStatus(entry: ProviderRegistryEntry, env: Env): string {
  if (entry.id === "model_gateway") {
    const namedSeatModels = [
      env.MODEL_GATEWAY_GPT_MODEL,
      env.MODEL_GATEWAY_DEEPSEEK_MODEL,
      env.MODEL_GATEWAY_GEMINI_MODEL
    ].flatMap((model) => (model ? [model] : []));

    return env.MODEL_GATEWAY_MODELS ?? (namedSeatModels.length > 0 ? namedSeatModels.join(",") : entry.defaultModel);
  }

  return env[entry.modelEnvKey] ?? entry.defaultModel;
}

function modelsFromCommaSeparatedValue(value: string): string[] {
  return value
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function isLiveModelAllowed(env: Env, providerId: ImplementedProviderId, model: string): boolean {
  if (isLiveModelDisabledByLegacyList(env, providerId, model)) {
    return false;
  }

  return isProviderPolicyAllowed(parseProviderPolicy(env.QUORUMMIND_PROVIDER_POLICY), providerId, model);
}

function isLiveModelDisabledByLegacyList(env: Env, providerId: ImplementedProviderId, model: string): boolean {
  const disabled = modelsFromCommaSeparatedValue(env.QUORUMMIND_DISABLED_LIVE_MODELS ?? "").map((item) => item.toLowerCase());
  const normalizedModel = model.toLowerCase();
  const providerScoped = `${providerId}:${normalizedModel}`;

  return disabled.includes(normalizedModel) || disabled.includes(providerScoped);
}

function modelGatewayApiKey(env: Env): string | undefined {
  return env.MODEL_GATEWAY_API_KEY ?? env.DEEPSEEK_API_KEY;
}

function modelGatewayBaseUrl(env: Env): string | undefined {
  return env.MODEL_GATEWAY_BASE_URL ?? env.DEEPSEEK_BASE_URL;
}

function isProviderConfigured(entry: ProviderRegistryEntry, env: Env): boolean {
  if (entry.envKey) {
    return entry.id === "model_gateway"
      ? Boolean(modelGatewayApiKey(env) && modelGatewayBaseUrl(env))
      : Boolean(env[entry.envKey]);
  }

  if (entry.id === "ollama") {
    return Boolean(env.OLLAMA_BASE_URL);
  }

  if (entry.id === "lmstudio") {
    return Boolean(env.LMSTUDIO_BASE_URL);
  }

  return false;
}
