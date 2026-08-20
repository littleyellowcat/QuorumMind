import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { DecisionContext, DecisionMode } from "../lib/domain";
import type { BlueprintRoomResult } from "../lib/blueprint";
import type { ManualProviderAgent } from "../lib/manual-provider";
import type {
  AutonomousBlueprintRun,
  BlueprintExecutionMode,
  DecisionApiHealth
} from "../lib/api-client";
import type { DecisionHistoryRecord } from "../lib/decision-history";
import type { ModelReputationFeedback } from "../lib/model-reputation";
import type { BlueprintSnapshot, Locale, RunProgress, WorkspaceMode } from "../types/app";
import { createBlueprintRunHandlers } from "./blueprint/blueprintRunHandlers";
import { exportBlueprintResult } from "./blueprint/blueprintExportHandlers";

export function useBlueprintRuns(input: {
  locale: Locale;
  decisionMode: DecisionMode;
  blueprintQuestions: Record<Locale, string>;
  blueprintExecutionMode: BlueprintExecutionMode;
  maxProviderRounds: number;
  agentThreadId: string;
  maxConsensusRounds: number;
  humanReviewNote: string;
  activeContext: DecisionContext;
  effectiveAgents: ManualProviderAgent[];
  reputationFeedback: ModelReputationFeedback[];
  health: DecisionApiHealth | null;
  blueprintResult: BlueprintRoomResult | null;
  blueprintSnapshot: BlueprintSnapshot | null;
  setBlueprintResult: Dispatch<SetStateAction<BlueprintRoomResult | null>>;
  setBlueprintSnapshot: Dispatch<SetStateAction<BlueprintSnapshot | null>>;
  setAgentRun: Dispatch<SetStateAction<AutonomousBlueprintRun | null>>;
  setHistoryRecords: Dispatch<SetStateAction<DecisionHistoryRecord[]>>;
  setRunning: Dispatch<SetStateAction<RunProgress | null>>;
  setRuntimeNotice: Dispatch<SetStateAction<string | null>>;
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>;
  abortRef: MutableRefObject<AbortController | null>;
}) {
  const { handleRunBlueprint, handleRunAgentPlatform } = createBlueprintRunHandlers(input);

  return {
    handleRunBlueprint,
    handleRunAgentPlatform,
    handleBlueprintExport: (kind: "markdown" | "report" | "backlog" | "simplePdf") =>
      exportBlueprintResult({
        kind,
        locale: input.locale,
        blueprintQuestions: input.blueprintQuestions,
        blueprintResult: input.blueprintResult,
        blueprintSnapshot: input.blueprintSnapshot,
        setRuntimeNotice: input.setRuntimeNotice
      })
  };
}
