import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { DecisionContext, DecisionMode } from "../lib/domain";
import type { ManualProviderAgent } from "../lib/manual-provider";
import type { DecisionHistoryRecord } from "../lib/decision-history";
import type { DecisionApiHealth } from "../lib/api-client";
import type { ModelReputationFeedback } from "../lib/model-reputation";
import type {
  DecisionReviewLoopState,
  DecisionRoomResult,
  DecisionSnapshot,
  Locale,
  RunProgress,
  WorkspaceMode
} from "../types/app";
import { createDecisionRunHandlers } from "./decision/decisionRunHandlers";
import { exportDecisionResult } from "./decision/decisionExportHandlers";

export function useDecisionRuns(input: {
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
}) {
  const { handleRunDecision, handleRunDecisionReviewToThreshold } = createDecisionRunHandlers(input);

  return {
    handleRunDecision,
    handleRunDecisionReviewToThreshold,
    handleDecisionExport: (kind: "adr" | "json" | "report" | "simplePdf") =>
      exportDecisionResult({
        kind,
        locale: input.locale,
        decisionQuestions: input.decisionQuestions,
        decisionResult: input.decisionResult,
        decisionSnapshot: input.decisionSnapshot,
        setRuntimeNotice: input.setRuntimeNotice
      })
  };
}
