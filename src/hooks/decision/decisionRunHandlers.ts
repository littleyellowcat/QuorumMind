import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { DecisionContext, DecisionMode } from "../../lib/domain";
import { runDecisionRoom } from "../../lib/workflow";
import {
  createManualProviderBundle,
  type ManualProviderAgent
} from "../../lib/manual-provider";
import {
  requestDecisionRoom,
  type DecisionApiHealth,
  type DecisionApiResponse
} from "../../lib/api-client";
import type { ModelReputationFeedback } from "../../lib/model-reputation";
import type {
  DecisionReviewLoopState,
  DecisionReviewRound,
  DecisionRoomResult,
  DecisionSnapshot,
  Locale,
  RunProgress,
  WorkspaceMode
} from "../../types/app";
import type { DecisionHistoryRecord } from "../../lib/decision-history";
import {
  DECISION_REVIEW_MAX_ROUNDS,
  DECISION_REVIEW_TARGET_SCORE
} from "../../i18n/view-copy";
import {
  buildDecisionReviewContext,
  decisionReviewFinalMessage,
  decisionReviewRoundFromResponse,
  dissentFromDecisionResponse,
  scoreFromDecisionResponse
} from "../../lib/decision-review";
import { modelCallHint } from "../../lib/run-progress";
import { errorMessage, traceStats } from "../../lib/view-utils";
import { persistDecisionRecord } from "./decisionHistory";

export type DecisionRunHandlersInput = {
  locale: Locale;
  decisionMode: DecisionMode;
  decisionQuestions: Record<Locale, string>;
  activeContext: DecisionContext;
  effectiveAgents: ManualProviderAgent[];
  reputationFeedback: ModelReputationFeedback[];
  health: DecisionApiHealth | null;
  decisionResult: DecisionRoomResult | null;
  decisionSnapshot: DecisionSnapshot | null;
  setDecisionResult: Dispatch<SetStateAction<DecisionRoomResult | null>>;
  setDecisionSnapshot: Dispatch<SetStateAction<DecisionSnapshot | null>>;
  setDecisionReviewLoop: Dispatch<SetStateAction<DecisionReviewLoopState | null>>;
  setHistoryRecords: Dispatch<SetStateAction<DecisionHistoryRecord[]>>;
  setRunning: Dispatch<SetStateAction<RunProgress | null>>;
  setRuntimeNotice: Dispatch<SetStateAction<string | null>>;
  setFeedbackNotice: Dispatch<SetStateAction<string | null>>;
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>;
  abortRef: MutableRefObject<AbortController | null>;
};

export async function runDecisionOnce(input: {
  question: string;
  mode: DecisionMode;
  context?: DecisionContext;
  signal: AbortSignal;
  locale: Locale;
  activeContext: DecisionContext;
  effectiveAgents: ManualProviderAgent[];
  reputationFeedback: ModelReputationFeedback[];
  health: DecisionApiHealth | null;
}): Promise<{ response: DecisionApiResponse; fallbackError?: string }> {
  const runContext = input.context ?? input.activeContext;

  try {
    const response = await requestDecisionRoom(
      {
        question: input.question,
        mode: input.mode,
        locale: input.locale,
        context: runContext,
        agentConfig: input.effectiveAgents,
        reputationFeedback: input.reputationFeedback
      },
      fetch,
      { signal: input.signal }
    );

    return { response };
  } catch (error) {
    if (input.signal.aborted) {
      throw error;
    }

    const fallback = runDecisionRoom({ question: input.question, mode: input.mode, context: runContext });
    const promptBundle = createManualProviderBundle({
      question: input.question,
      locale: input.locale,
      context: runContext,
      agents: input.effectiveAgents
    });

    return {
      fallbackError: errorMessage(error),
      response: {
        providerMode: "demo",
        providerStatus: input.health?.providerStatus ?? {},
        providerTrace: [],
        liveVerdict: null,
        promptBundle,
        result: fallback,
        persistence: { mode: "browser_local", configured: true, saved: true }
      }
    };
  }
}

export function createDecisionRunHandlers(input: DecisionRunHandlersInput) {
  const {
    locale,
    decisionMode,
    decisionQuestions,
    activeContext,
    effectiveAgents,
    reputationFeedback,
    health,
    decisionResult,
    decisionSnapshot,
    setDecisionResult,
    setDecisionSnapshot,
    setDecisionReviewLoop,
    setHistoryRecords,
    setRunning,
    setRuntimeNotice,
    setFeedbackNotice,
    setWorkspaceMode,
    abortRef
  } = input;

  const runOnce = (runInput: {
    question: string;
    mode: DecisionMode;
    context?: DecisionContext;
    signal: AbortSignal;
  }) =>
    runDecisionOnce({
      ...runInput,
      locale,
      activeContext,
      effectiveAgents,
      reputationFeedback,
      health
    });

  async function handleRunDecision() {
    const question = decisionQuestions[locale].trim();
    if (!question) {
      setRuntimeNotice(locale === "zh" ? "请先输入问题。" : "Enter a question first.");
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    setWorkspaceMode("decision");
    setRuntimeNotice(null);
    setFeedbackNotice(null);
    setDecisionReviewLoop(null);
    setRunning({
      kind: "decision",
      stage: locale === "zh" ? "调用决策室" : "Calling Decision Room",
      progress: 28,
      message:
        locale === "zh"
          ? "正在请求服务端；如果真实模型不可用，会透明回退到本地确定性结果。"
          : "Requesting the server; if live providers are unavailable, the UI will show deterministic fallback.",
      modelCall: modelCallHint(decisionMode, locale)
    });

    try {
      const { response, fallbackError } = await runOnce({
        question,
        mode: decisionMode,
        signal: abortController.signal
      });
      if (abortController.signal.aborted) return;

      setRunning({
        kind: "decision",
        stage: locale === "zh" ? "聚合结果" : "Aggregating result",
        progress: 82,
        message: locale === "zh" ? "正在更新中间预览和右侧分析。" : "Updating the center preview and right inspector.",
        modelCall: traceStats(response.providerTrace).calls ? "provider trace" : undefined
      });
      setDecisionResult(response.result);
      setDecisionSnapshot(response);
      persistDecisionRecord({
        question,
        response,
        result: response.result,
        setHistoryRecords
      });
      if (fallbackError) {
        setRuntimeNotice(
          locale === "zh"
            ? `服务端或真实模型调用不可用：${fallbackError}。已显示确定性本地结果。`
            : `Server or live provider unavailable: ${fallbackError}. Showing deterministic local result.`
        );
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        setRuntimeNotice(
          locale === "zh"
            ? `决策室运行失败：${errorMessage(error)}。`
            : `Decision Room run failed: ${errorMessage(error)}.`
        );
      }
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  }

  async function handleRunDecisionReviewToThreshold() {
    const question = decisionQuestions[locale].trim();
    if (!question) {
      setRuntimeNotice(locale === "zh" ? "请先输入问题。" : "Enter a question first.");
      return;
    }

    const baselineResponse: DecisionApiResponse | null = decisionResult
      ? {
          providerMode: decisionSnapshot?.providerMode ?? "demo",
          providerStatus: decisionSnapshot?.providerStatus ?? health?.providerStatus ?? {},
          providerTrace: decisionSnapshot?.providerTrace ?? [],
          liveVerdict: decisionSnapshot?.liveVerdict ?? null,
          promptBundle:
            decisionSnapshot?.promptBundle ??
            createManualProviderBundle({
              question,
              locale,
              context: activeContext,
              agents: effectiveAgents
            }),
          result: decisionResult,
          persistence: decisionSnapshot?.persistence ?? { mode: "browser_local", configured: true, saved: true }
        }
      : null;
    const currentScore = baselineResponse ? scoreFromDecisionResponse(baselineResponse) : undefined;

    if (typeof currentScore === "number" && currentScore >= DECISION_REVIEW_TARGET_SCORE) {
      setRuntimeNotice(
        locale === "zh"
          ? `当前裁决综合分已经达到 ${DECISION_REVIEW_TARGET_SCORE}，无需启动深度复审。`
          : `Current Decision Score already reaches ${DECISION_REVIEW_TARGET_SCORE}; deep review is not needed.`
      );
      setDecisionReviewLoop({
        targetScore: DECISION_REVIEW_TARGET_SCORE,
        maxRounds: DECISION_REVIEW_MAX_ROUNDS,
        baselineScore: currentScore,
        bestScore: currentScore,
        status: "passed",
        rounds: [],
        finalMessage:
          locale === "zh"
            ? `当前裁决综合分 ${currentScore} 已达到 ${DECISION_REVIEW_TARGET_SCORE}。`
            : `Current Decision Score ${currentScore} already reaches ${DECISION_REVIEW_TARGET_SCORE}.`
      });
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    setWorkspaceMode("decision");
    setRuntimeNotice(null);
    setFeedbackNotice(null);
    setDecisionReviewLoop({
      targetScore: DECISION_REVIEW_TARGET_SCORE,
      maxRounds: DECISION_REVIEW_MAX_ROUNDS,
      baselineScore: currentScore ?? 0,
      bestScore: currentScore ?? 0,
      status: "running",
      rounds: [],
      finalMessage:
        locale === "zh"
          ? `正在基于当前最佳结果继续复审，达到 ${DECISION_REVIEW_TARGET_SCORE} 即停止；低于当前最佳的复审只记录风险，不覆盖结果。`
          : `Continuing from the current best result until ${DECISION_REVIEW_TARGET_SCORE}; lower-scoring reviews are recorded as risk evidence, not promoted.`
    });
    setRunning({
      kind: "decision-review",
      stage: locale === "zh" ? "基于当前结果复审到 80" : "Review current result to 80",
      progress: 18,
      message:
        locale === "zh"
          ? `最多 ${DECISION_REVIEW_MAX_ROUNDS} 轮增量复审；只采用比当前最佳更高的裁决结果。`
          : `Up to ${DECISION_REVIEW_MAX_ROUNDS} incremental review rounds; only better decisions are promoted.`,
      modelCall: modelCallHint("red_team", locale)
    });

    const rounds: DecisionReviewRound[] = [];
    let bestResponse: DecisionApiResponse | null = baselineResponse;
    let bestScore = currentScore ?? 0;
    let promoted = false;
    let fallbackError: string | undefined;
    let stopReason: "target_met" | "round_budget" | "deterministic_repeated" | "no_improvement" = "round_budget";

    try {
      for (let index = 0; index < DECISION_REVIEW_MAX_ROUNDS; index += 1) {
        setRunning({
          kind: "decision-review",
          stage:
            locale === "zh"
              ? `深度复审第 ${index + 1}/${DECISION_REVIEW_MAX_ROUNDS} 轮`
              : `Deep review round ${index + 1}/${DECISION_REVIEW_MAX_ROUNDS}`,
          progress: Math.min(78, 24 + index * 28),
          message:
            locale === "zh"
              ? "正在基于当前最佳结果继续质询、补强和复审。"
              : "Continuing from the current best result with critique, strengthening, and review.",
          modelCall: modelCallHint("red_team", locale)
        });

        const reviewContext = buildDecisionReviewContext({
          context: activeContext,
          bestResponse,
          targetScore: DECISION_REVIEW_TARGET_SCORE,
          locale
        });
        const run = await runOnce({
          question,
          mode: "red_team",
          context: reviewContext,
          signal: abortController.signal
        });
        if (abortController.signal.aborted) return;

        fallbackError = run.fallbackError;
        const candidateScore = scoreFromDecisionResponse(run.response);
        const candidateDissent = dissentFromDecisionResponse(run.response);
        const bestDissent = bestResponse ? dissentFromDecisionResponse(bestResponse) : 101;
        const accepted = !bestResponse || candidateScore > bestScore || (candidateScore === bestScore && candidateDissent < bestDissent);
        const round = decisionReviewRoundFromResponse({
          response: run.response,
          round: index + 1,
          mode: "red_team",
          targetScore: DECISION_REVIEW_TARGET_SCORE,
          fallbackUsed: Boolean(run.fallbackError),
          bestScoreBeforeRound: bestScore,
          accepted
        });
        rounds.push(round);

        if (accepted) {
          bestResponse = run.response;
          bestScore = candidateScore;
          promoted = true;
          setDecisionResult(run.response.result);
          setDecisionSnapshot(run.response);
        }

        setDecisionReviewLoop({
          targetScore: DECISION_REVIEW_TARGET_SCORE,
          maxRounds: DECISION_REVIEW_MAX_ROUNDS,
          baselineScore: currentScore ?? 0,
          bestScore,
          status: "running",
          rounds: [...rounds],
          finalMessage:
            locale === "zh"
              ? accepted
                ? `第 ${round.round} 轮成为当前最佳：${round.score}/${DECISION_REVIEW_TARGET_SCORE}，已采用。`
                : `第 ${round.round} 轮为 ${round.score}，低于当前最佳 ${bestScore}，已仅记录为风险证据。`
              : accepted
                ? `Round ${round.round} became the current best at ${round.score}/${DECISION_REVIEW_TARGET_SCORE}; promoted.`
                : `Round ${round.round} scored ${round.score}, below current best ${bestScore}; recorded as risk evidence only.`
        });

        if (accepted && round.reachedTarget) {
          stopReason = "target_met";
          break;
        }

        if (!accepted) {
          stopReason = "no_improvement";
          break;
        }

        if (round.traceCalls === 0 || round.providerMode === "demo") {
          stopReason = "deterministic_repeated";
          break;
        }
      }

      if (!bestResponse) {
        return;
      }

      setRunning({
        kind: "decision-review",
        stage: locale === "zh" ? "复审收敛" : "Review convergence",
        progress: 92,
        message: locale === "zh" ? "正在写入当前最佳复审结果。" : "Writing the current best review result.",
        modelCall: modelCallHint("red_team", locale)
      });

      if (promoted || !baselineResponse) {
        persistDecisionRecord({
          question,
          response: bestResponse,
          result: bestResponse.result,
          setHistoryRecords
        });
      }

      const finalRound = rounds.at(-1);
      const passed = bestScore >= DECISION_REVIEW_TARGET_SCORE;
      const finalMessage = decisionReviewFinalMessage({
        locale,
        stopReason,
        targetScore: DECISION_REVIEW_TARGET_SCORE,
        finalRound,
        bestScore,
        promoted,
        fallbackError
      });

      setDecisionReviewLoop({
        targetScore: DECISION_REVIEW_TARGET_SCORE,
        maxRounds: DECISION_REVIEW_MAX_ROUNDS,
        baselineScore: currentScore ?? 0,
        bestScore,
        status: passed ? "passed" : "needs_review",
        rounds,
        finalMessage
      });
      setRuntimeNotice(finalMessage);
    } catch (error) {
      if (!abortController.signal.aborted) {
        const message =
          locale === "zh"
            ? `深度复审失败：${errorMessage(error)}。`
            : `Deep review failed: ${errorMessage(error)}.`;
        setRuntimeNotice(message);
        setDecisionReviewLoop((current) =>
          current
            ? {
                ...current,
                status: "needs_review",
                finalMessage: message
              }
            : current
        );
      }
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  }

  return {
    handleRunDecision,
    handleRunDecisionReviewToThreshold
  };
}
