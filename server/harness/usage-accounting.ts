export type ProviderUsageTrace = {
  provider?: string;
  model?: string;
  text?: string;
  inputText?: string;
  outputText?: string;
  durationMs?: number;
  status?: "ok" | "error" | string;
  retryCount?: number;
  attempts?: Array<{
    status?: "ok" | "error" | string;
    outputRef?: {
      originalChars?: number;
      preview?: string;
      inline?: string;
    };
  }>;
  outputRef?: {
    originalChars?: number;
    preview?: string;
    inline?: string;
  };
};

export type UsageAccountingEvent = {
  type: string;
};

export type EstimateRunUsageInput = {
  providerTrace?: ProviderUsageTrace[];
  events?: UsageAccountingEvent[];
  liveTraceRequired?: boolean;
  liveTraceUsable?: boolean;
};

export type RunUsageEstimate = {
  providerCallCount: number;
  retryCount: number;
  failureCount: number;
  humanReviewCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  retryCostUsd: number;
  fallbackSavedCostUsd: number;
};

const DEFAULT_INPUT_TOKEN_FLOOR = 120;
const FALLBACK_SAVED_CALLS = 3;
const ESTIMATED_USD_PER_1K_TOKENS = 0.002;

export function estimateRunUsage(input: EstimateRunUsageInput): RunUsageEstimate {
  const providerTrace = input.providerTrace ?? [];
  const events = input.events ?? [];
  const providerCallCount = providerTrace.length || events.filter((event) => event.type === "provider_attempt_success").length;
  const retryCount = Math.max(
    providerTrace.reduce((sum, entry) => sum + (entry.retryCount ?? retryAttemptsFromEntry(entry)), 0),
    events.filter((event) => event.type === "provider_attempt_retry").length
  );
  const failureCount = Math.max(
    providerTrace.filter((entry) => entry.status === "error").length,
    events.filter((event) => event.type === "provider_attempt_failure").length
  );
  const humanReviewCount = events.filter((event) => event.type === "human_review_pause").length;
  const estimatedInputTokens = providerTrace.reduce((sum, entry) => sum + estimateInputTokens(entry), 0);
  const estimatedOutputTokens = providerTrace.reduce((sum, entry) => sum + estimateOutputTokens(entry), 0);
  const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;
  const estimatedCostUsd = roundUsd(costForTokens(estimatedTotalTokens));
  const averageCallCost = providerCallCount > 0 ? estimatedCostUsd / providerCallCount : costForTokens(DEFAULT_INPUT_TOKEN_FLOOR);
  const retryCostUsd = roundUsd(averageCallCost * retryCount);
  const fallbackSavedCostUsd =
    input.liveTraceRequired && !input.liveTraceUsable
      ? roundUsd(Math.max(averageCallCost, costForTokens(DEFAULT_INPUT_TOKEN_FLOOR)) * FALLBACK_SAVED_CALLS)
      : 0;

  return {
    providerCallCount,
    retryCount,
    failureCount,
    humanReviewCount,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens,
    estimatedCostUsd,
    retryCostUsd,
    fallbackSavedCostUsd
  };
}

function retryAttemptsFromEntry(entry: ProviderUsageTrace): number {
  return Math.max(0, (entry.attempts?.length ?? 1) - 1);
}

function estimateInputTokens(entry: ProviderUsageTrace): number {
  if (entry.inputText) {
    return estimateTokens(entry.inputText);
  }

  return Math.max(DEFAULT_INPUT_TOKEN_FLOOR, Math.ceil(estimateOutputTokens(entry) * 0.45));
}

function estimateOutputTokens(entry: ProviderUsageTrace): number {
  if (entry.outputText) {
    return estimateTokens(entry.outputText);
  }

  if (entry.text) {
    return estimateTokens(entry.text);
  }

  const ref = entry.outputRef ?? entry.attempts?.at(-1)?.outputRef;
  if (typeof ref?.originalChars === "number") {
    return Math.ceil(ref.originalChars / 3.5);
  }

  return estimateTokens(ref?.inline ?? ref?.preview ?? "");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function costForTokens(tokens: number): number {
  return (tokens / 1000) * ESTIMATED_USD_PER_1K_TOKENS;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
