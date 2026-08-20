import type { Dispatch, SetStateAction } from "react";
import type { BlueprintRoomResult } from "../lib/blueprint";
import {
  hasBlueprintHistorySnapshot,
  hasDecisionHistorySnapshot,
  type DecisionHistoryRecord
} from "../lib/decision-history";
import type { AutonomousBlueprintRun, DecisionApiHealth } from "../lib/api-client";
import type {
  BlueprintSnapshot,
  DecisionRoomResult,
  DecisionSnapshot,
  Locale,
  WorkspaceMode
} from "../types/app";

export function useRunHistory(input: {
  locale: Locale;
  health: DecisionApiHealth | null;
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>;
  setDecisionResult: Dispatch<SetStateAction<DecisionRoomResult | null>>;
  setDecisionSnapshot: Dispatch<SetStateAction<DecisionSnapshot | null>>;
  setDecisionQuestions: Dispatch<SetStateAction<Record<Locale, string>>>;
  setBlueprintResult: Dispatch<SetStateAction<BlueprintRoomResult | null>>;
  setBlueprintSnapshot: Dispatch<SetStateAction<BlueprintSnapshot | null>>;
  setBlueprintQuestions: Dispatch<SetStateAction<Record<Locale, string>>>;
  setAgentRun: Dispatch<SetStateAction<AutonomousBlueprintRun | null>>;
}) {
  const {
    locale,
    health,
    setWorkspaceMode,
    setDecisionResult,
    setDecisionSnapshot,
    setDecisionQuestions,
    setBlueprintResult,
    setBlueprintSnapshot,
    setBlueprintQuestions,
    setAgentRun
  } = input;

  function handleRestoreHistory(record: DecisionHistoryRecord) {
    if (hasDecisionHistorySnapshot(record)) {
      setWorkspaceMode("decision");
      setDecisionResult(record.result);
      setDecisionSnapshot({
        providerMode: record.providerMode,
        providerStatus: health?.providerStatus ?? {},
        providerTrace: record.providerTrace,
        contextLedger: record.contextLedger,
        liveVerdict: record.liveVerdict ?? null,
        promptBundle: record.promptBundle,
        persistence: { mode: "browser_local", configured: true, saved: true }
      });
      setDecisionQuestions((current) => ({ ...current, [locale]: record.question }));
      return;
    }

    if (hasBlueprintHistorySnapshot(record)) {
      setWorkspaceMode("blueprint");
      setBlueprintResult(record.blueprintResult);
      setBlueprintSnapshot({
        providerMode: record.providerMode,
        providerStatus: health?.providerStatus ?? {},
        providerTrace: record.providerTrace,
        contextLedger: record.contextLedger,
        promptBundle: record.promptBundle,
        blueprintExecution: record.blueprintExecution
      });
      setAgentRun(record.agentRun ?? null);
      setBlueprintQuestions((current) => ({ ...current, [locale]: record.question }));
    }
  }

  return { handleRestoreHistory };
}
