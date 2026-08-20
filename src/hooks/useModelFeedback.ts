import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DecisionContext } from "../lib/domain";
import type { Locale } from "../types/app";
import type { ManualProviderAgent } from "../lib/manual-provider";
import { addModelReputationFeedback, createModelReputationFeedbackForAgents } from "../lib/reputation-feedback";
import { inferDecisionDomain } from "../lib/model-reputation";

export function useModelFeedback(input: {
  locale: Locale;
  activeQuestion: string;
  activeContext: DecisionContext;
  effectiveAgents: ManualProviderAgent[];
  setReputationFeedback: Dispatch<SetStateAction<ReturnType<typeof addModelReputationFeedback>>>;
  setFeedbackNotice: Dispatch<SetStateAction<string | null>>;
}) {
  const { locale, activeQuestion, activeContext, effectiveAgents, setReputationFeedback, setFeedbackNotice } = input;

  return useCallback(function handleFeedback(outcome: "helpful" | "neutral" | "unhelpful") {
    const domain = inferDecisionDomain(activeQuestion, activeContext);
    const next = addModelReputationFeedback(
      createModelReputationFeedbackForAgents(effectiveAgents, domain, outcome, new Date().toISOString())
    );
    setReputationFeedback(next);
    setFeedbackNotice(
      locale === "zh"
        ? "已记录模型表现反馈，下次运行会轻微调整模型权重。"
        : "Model feedback recorded. Future runs will lightly adjust model weights."
    );
  }, [activeContext, activeQuestion, effectiveAgents, locale, setFeedbackNotice, setReputationFeedback]);
}
