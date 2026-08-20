import type { DecisionContext, DecisionMode } from "./domain";
import type { DecisionApiResponse } from "./api-client";
import type { DecisionReviewRound, DecisionRoomResult, Locale } from "../types/app";
import { formatProposalId, traceStats, uniquePreviewItems } from "./view-utils";

export function scoreFromDecisionResponse(response: {
  liveVerdict: DecisionApiResponse["liveVerdict"];
  result: DecisionRoomResult;
}): number {
  return response.liveVerdict?.quorumScore ?? response.result.verdict.quorumScore;
}

export function dissentFromDecisionResponse(response: {
  liveVerdict: DecisionApiResponse["liveVerdict"];
  result: DecisionRoomResult;
}): number {
  return response.liveVerdict?.dissentIndex ?? response.result.verdict.dissentIndex;
}

export function buildDecisionReviewContext(input: {
  context: DecisionContext;
  bestResponse: DecisionApiResponse | null;
  targetScore: number;
  locale: Locale;
}): DecisionContext {
  if (!input.bestResponse) {
    return input.context;
  }

  const verdict = input.bestResponse.liveVerdict ?? input.bestResponse.result.verdict;
  const currentBest = formatProposalId(verdict.selectedProposalId, input.locale);
  const continuationConstraint =
    input.locale === "zh"
      ? `深度复审续跑：必须基于当前最佳裁决继续改进，不要从零开始重选。当前最佳是 ${currentBest}，裁决综合分 ${verdict.quorumScore}/100，分歧指数 ${verdict.dissentIndex}%。目标是补齐质询、风险缓解、迁移路径和回滚条件后，让结果更稳健地接近 ${input.targetScore}+。`
      : `Deep review continuation: improve from the current best decision instead of restarting from scratch. Current best is ${currentBest}, Decision Score ${verdict.quorumScore}/100, dissent ${verdict.dissentIndex}%. The goal is to strengthen critiques, mitigations, migration path, and rollback conditions toward ${input.targetScore}+.`;
  const guardrailAssumption =
    input.locale === "zh"
      ? "如果新复审结果低于当前最佳，只把它作为风险证据，不替换当前最佳裁决。"
      : "If a new review scores below the current best, treat it as risk evidence rather than replacing the current best decision.";

  return {
    ...input.context,
    existingConstraints: uniquePreviewItems([...input.context.existingConstraints, continuationConstraint]).slice(-8),
    assumptions: uniquePreviewItems([...input.context.assumptions, guardrailAssumption]).slice(-8)
  };
}

export function decisionReviewRoundFromResponse(input: {
  response: DecisionApiResponse;
  round: number;
  mode: DecisionMode;
  targetScore: number;
  fallbackUsed: boolean;
  bestScoreBeforeRound: number;
  accepted: boolean;
}): DecisionReviewRound {
  const verdict = input.response.liveVerdict ?? input.response.result.verdict;
  const stats = traceStats(input.response.providerTrace);

  return {
    round: input.round,
    mode: input.mode,
    score: verdict.quorumScore,
    deltaFromBest: verdict.quorumScore - input.bestScoreBeforeRound,
    dissentIndex: verdict.dissentIndex,
    selectedProposalId: verdict.selectedProposalId,
    providerMode: input.response.providerMode,
    traceCalls: stats.calls,
    reachedTarget: verdict.quorumScore >= input.targetScore,
    fallbackUsed: input.fallbackUsed || input.response.providerMode === "demo" || stats.calls === 0,
    accepted: input.accepted
  };
}

export function decisionReviewFinalMessage(input: {
  locale: Locale;
  stopReason: "target_met" | "round_budget" | "deterministic_repeated" | "no_improvement";
  targetScore: number;
  finalRound?: DecisionReviewRound;
  bestScore: number;
  promoted: boolean;
  fallbackError?: string;
}): string {
  const { locale, stopReason, targetScore, finalRound, bestScore, promoted, fallbackError } = input;
  const finalScore = bestScore;

  if (stopReason === "target_met") {
    return locale === "zh"
      ? `深度复审已达到 ${targetScore}：当前最佳裁决综合分 ${finalScore}。可以继续查看分歧来源和风险矩阵后导出结果。`
      : `Deep review reached ${targetScore}: final Decision Score is ${finalScore}. Review dissent and risks before exporting.`;
  }

  if (stopReason === "no_improvement") {
    const challengedScore = finalRound?.score ?? 0;
    return locale === "zh"
      ? `复审没有超过当前最佳：挑战轮得分 ${challengedScore}，当前最佳仍保留为 ${finalScore}。低分复审已作为风险证据记录，没有覆盖原结果。`
      : `Review did not beat the current best: challenger scored ${challengedScore}, current best remains ${finalScore}. The lower score was recorded as risk evidence and did not replace the result.`;
  }

  if (stopReason === "deterministic_repeated") {
    const fallbackNote = fallbackError ? ` ${fallbackError}` : "";
    return locale === "zh"
      ? `本次未达到 ${targetScore}，当前最佳裁决综合分 ${finalScore}。当前没有可用真实模型复审证据，继续重复确定性结果不会产生新分歧；请补充约束、候选方案，或配置真实模型后再复审。${fallbackNote}`
      : `The run did not reach ${targetScore}; final Decision Score is ${finalScore}. No valid live review evidence was available, so repeating deterministic output would not add new disagreement. Add constraints/options or configure live models before reviewing again.${fallbackNote}`;
  }

  return locale === "zh"
    ? `${promoted ? "复审已有改进，但" : ""}最多复审轮次已用完，当前最佳裁决综合分 ${finalScore}，仍低于 ${targetScore}。建议进入人工复审：补充关键约束、不可接受风险、候选方案边界后再运行。`
    : `The review round budget was exhausted. Current best Decision Score is ${finalScore}, still below ${targetScore}. Add constraints, unacceptable risks, or option boundaries before running again.`;
}
