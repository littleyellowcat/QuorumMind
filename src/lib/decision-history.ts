import type { AutonomousBlueprintRun, BlueprintExecutionSummary, DecisionApiResponse, DecisionRoomResult } from "./api-client";
import type { BlueprintRoomResult } from "./blueprint";
import { createLocalStorageDecisionRepository, defaultDecisionHistoryStorageKey } from "./decision-repository";
import type { ManualProviderBundle } from "./manual-provider";

export type DecisionHistoryRecord = {
  id: string;
  kind?: "decision" | "blueprint";
  question: string;
  createdAt: string;
  providerMode: "demo" | "live";
  recommendation: string;
  quorumScore: number;
  providerTrace?: DecisionApiResponse["providerTrace"];
  contextLedger?: DecisionApiResponse["contextLedger"];
  liveVerdict?: DecisionApiResponse["liveVerdict"];
  promptBundle?: ManualProviderBundle;
  result?: DecisionRoomResult;
  blueprintResult?: BlueprintRoomResult;
  blueprintExecution?: BlueprintExecutionSummary;
  agentRun?: AutonomousBlueprintRun;
};

export const decisionHistoryStorageKey = defaultDecisionHistoryStorageKey;

export function readDecisionHistoryRecords(storage: Storage = window.localStorage): DecisionHistoryRecord[] {
  return createLocalStorageDecisionRepository(storage).list();
}

export function addDecisionHistoryRecord(
  record: DecisionHistoryRecord,
  storage: Storage = window.localStorage
): DecisionHistoryRecord[] {
  return createLocalStorageDecisionRepository(storage).save(record);
}

export function hasDecisionHistorySnapshot(
  record: DecisionHistoryRecord
): record is DecisionHistoryRecord &
  Required<Pick<DecisionHistoryRecord, "providerTrace" | "promptBundle" | "result">> {
  return Boolean(
    record.kind !== "blueprint" &&
    Array.isArray(record.providerTrace) &&
      record.promptBundle &&
      typeof record.promptBundle === "object" &&
      record.result &&
      typeof record.result === "object"
  );
}

export function hasBlueprintHistorySnapshot(
  record: DecisionHistoryRecord
): record is DecisionHistoryRecord &
  Required<Pick<DecisionHistoryRecord, "providerTrace" | "promptBundle" | "blueprintResult">> {
  return Boolean(
    record.kind === "blueprint" &&
      Array.isArray(record.providerTrace) &&
      record.promptBundle &&
      typeof record.promptBundle === "object" &&
      record.blueprintResult &&
      typeof record.blueprintResult === "object"
  );
}
