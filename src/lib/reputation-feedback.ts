import type { ManualProviderAgent } from "./manual-provider";
import type { DecisionDomain, ModelReputationFeedback } from "./model-reputation";

export const reputationFeedbackStorageKey = "quorummind.reputation-feedback.v1";

const validAgentIds = new Set<ManualProviderAgent["id"]>(["gpt", "deepseek", "gemini"]);
const validDomains = new Set<DecisionDomain>([
  "technical_architecture",
  "product_strategy",
  "career_strategy",
  "portfolio_packaging"
]);
const validOutcomes = new Set<ModelReputationFeedback["outcome"]>(["helpful", "neutral", "unhelpful"]);

export function readModelReputationFeedback(
  storage: Storage = window.localStorage,
  options: { key?: string } = {}
): ModelReputationFeedback[] {
  const raw = storage.getItem(options.key ?? reputationFeedbackStorageKey);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.flatMap((item) => toFeedbackRecord(item)) : [];
  } catch {
    return [];
  }
}

export function addModelReputationFeedback(
  records: ModelReputationFeedback[],
  storage: Storage = window.localStorage,
  options: { key?: string; limit?: number } = {}
): ModelReputationFeedback[] {
  const key = options.key ?? reputationFeedbackStorageKey;
  const limit = options.limit ?? 60;
  const next = [
    ...records.flatMap((record) => toFeedbackRecord(record)),
    ...readModelReputationFeedback(storage, { key })
  ].slice(0, limit);

  storage.setItem(key, JSON.stringify(next));
  return next;
}

export function createModelReputationFeedbackForAgents(
  agents: ManualProviderAgent[],
  domain: DecisionDomain,
  outcome: ModelReputationFeedback["outcome"],
  createdAt: string
): ModelReputationFeedback[] {
  return agents.map((agent) => ({
    agentId: agent.id,
    domain,
    outcome,
    confidence: 1,
    createdAt
  }));
}

function toFeedbackRecord(value: unknown): ModelReputationFeedback[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const candidate = value as Partial<ModelReputationFeedback>;

  if (
    !validAgentIds.has(candidate.agentId as ManualProviderAgent["id"]) ||
    !validDomains.has(candidate.domain as DecisionDomain) ||
    !validOutcomes.has(candidate.outcome as ModelReputationFeedback["outcome"]) ||
    typeof candidate.createdAt !== "string"
  ) {
    return [];
  }

  return [
    {
      agentId: candidate.agentId as ManualProviderAgent["id"],
      domain: candidate.domain as DecisionDomain,
      outcome: candidate.outcome as ModelReputationFeedback["outcome"],
      confidence:
        typeof candidate.confidence === "number" ? Math.min(1, Math.max(0, candidate.confidence)) : undefined,
      createdAt: candidate.createdAt
    }
  ];
}
