import type { AgentRole, DecisionContext, DecisionMode } from "../../src/lib/domain";
import type { ModelReputation } from "../../src/lib/model-reputation";

export type ProviderPhase = "proposal" | "critique" | "revision" | "ranking" | "verdict";

export type ProviderRequest = {
  locale: "en" | "zh";
  mode?: DecisionMode;
  phase: ProviderPhase;
  agentName: string;
  agentRole: AgentRole;
  agentWeight?: number;
  modelReputation?: ModelReputation;
  scoringFocus?: string[];
  question: string;
  context: DecisionContext;
  payload?: unknown;
};

export type ProviderFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type ImplementedProviderId = "model_gateway" | "openai" | "deepseek" | "gemini";

export type ReservedProviderId =
  | "anthropic"
  | "xai"
  | "mistral"
  | "openrouter"
  | "groq"
  | "together"
  | "cohere"
  | "perplexity"
  | "ollama"
  | "lmstudio";

export type ProviderId = ImplementedProviderId | ReservedProviderId;

export type ModelProvider = {
  id: ImplementedProviderId;
  model: string;
  generateDecisionText(request: ProviderRequest): Promise<string>;
};

export type ProviderConfig = {
  apiKey: string;
  model: string;
  fetch?: ProviderFetch;
};

export type GatewayProviderConfig = ProviderConfig & {
  baseUrl: string;
  providerId?: ImplementedProviderId;
};
