import { createHash } from "node:crypto";
import type { ContextSourceLedger, ContextSourceLedgerEntry, ContextSourceType, DecisionApiResponse } from "../src/lib/api-client";
import type { DecisionContext } from "../src/lib/domain";
import type { ModelReputationFeedback } from "../src/lib/model-reputation";

export type BuildContextSourceLedgerInput = {
  question: string;
  context: DecisionContext;
  knowledgeInjection?: string;
  reputationFeedback?: ModelReputationFeedback[];
  providerTrace?: DecisionApiResponse["providerTrace"];
  fallbackReason?: string;
};

export function buildContextSourceLedger(input: BuildContextSourceLedgerInput): ContextSourceLedger {
  const providerTrace = input.providerTrace ?? [];
  const fallbackReason = input.fallbackReason ?? fallbackReasonForTrace(providerTrace);
  const sources = [
    sourceEntry("user_input", "User question", input.question, { chars: input.question.length }),
    sourceEntry("structured_context", "Structured decision context", input.context, {
      productStage: input.context.productStage,
      candidateOptions: input.context.candidateOptions.length,
      assumptions: input.context.assumptions.length
    }),
    ...(input.knowledgeInjection
      ? [
          sourceEntry("knowledge_injection", "Knowledge injection", input.knowledgeInjection, {
            chars: input.knowledgeInjection.length
          })
        ]
      : []),
    ...(input.reputationFeedback?.length
      ? [
          sourceEntry("reputation_feedback", "Model reputation feedback", input.reputationFeedback, {
            records: input.reputationFeedback.length
          })
        ]
      : []),
    ...(providerTrace.length
      ? [
          sourceEntry("provider_trace", "Provider trace evidence", providerTrace.map(providerTraceSummary), {
            calls: providerTrace.length
          })
        ]
      : []),
    sourceEntry("deterministic_fallback", "Fallback state", fallbackReason, {
      used: fallbackReason !== "none"
    })
  ];

  return {
    schemaVersion: 1,
    contextHash: hashStable(sources.map((source) => ({ sourceType: source.sourceType, hash: source.hash }))),
    sources,
    sourceCounts: countSources(sources),
    providerEvidence: {
      attempted: providerTrace.length > 0,
      usableCalls: providerTrace.filter((entry) => entry.status === "ok" && entry.validationStatus !== "invalid" && entry.validationStatus !== "unparsed").length,
      failedCalls: providerTrace.filter((entry) => entry.status === "error").length
    },
    fallback: {
      used: fallbackReason !== "none",
      reason: fallbackReason
    }
  };
}

function sourceEntry(
  sourceType: ContextSourceType,
  label: string,
  value: unknown,
  metadata: Record<string, unknown> = {}
): ContextSourceLedgerEntry {
  const hash = hashStable(value);

  return {
    id: `${sourceType}:${hash.slice(0, 12)}`,
    sourceType,
    label,
    summary: summarizeSourceValue(value),
    hash,
    metadata
  };
}

function countSources(sources: ContextSourceLedgerEntry[]): Record<ContextSourceType, number> {
  const counts: Record<ContextSourceType, number> = {
    user_input: 0,
    structured_context: 0,
    knowledge_injection: 0,
    reputation_feedback: 0,
    provider_trace: 0,
    deterministic_fallback: 0
  };

  for (const source of sources) {
    counts[source.sourceType] += 1;
  }

  return counts;
}

function providerTraceSummary(entry: DecisionApiResponse["providerTrace"][number]) {
  return {
    id: entry.id,
    provider: entry.provider,
    model: entry.model,
    phase: entry.phase,
    status: entry.status,
    validationStatus: entry.validationStatus ?? "unparsed",
    jsonParsed: entry.jsonParsed
  };
}

function fallbackReasonForTrace(providerTrace: DecisionApiResponse["providerTrace"]): string {
  if (providerTrace.length === 0) {
    return "provider_mode_demo";
  }

  return providerTrace.some((entry) => entry.status === "ok" && entry.validationStatus !== "invalid" && entry.validationStatus !== "unparsed")
    ? "none"
    : "no_usable_live_trace";
}

function summarizeSourceValue(value: unknown): string {
  const text = typeof value === "string" ? value : stableStringify(value);
  const normalized = text.replace(/\s+/g, " ").trim();

  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 177)}...`;
}

function hashStable(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
