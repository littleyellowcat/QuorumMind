import type { Dispatch, SetStateAction } from "react";
import { addDecisionHistoryRecord, type DecisionHistoryRecord } from "../../lib/decision-history";
import type { DecisionRoomResult, DecisionSnapshot } from "../../types/app";
import { newId } from "../../lib/view-utils";

export function persistDecisionRecord(input: {
  question: string;
  response: DecisionSnapshot;
  result: DecisionRoomResult;
  setHistoryRecords: Dispatch<SetStateAction<DecisionHistoryRecord[]>>;
}) {
  const record: DecisionHistoryRecord = {
    id: newId(),
    kind: "decision",
    question: input.question,
    createdAt: new Date().toISOString(),
    providerMode: input.response.providerMode,
    recommendation: input.response.liveVerdict?.finalRecommendation ?? input.result.verdict.finalRecommendation,
    quorumScore: input.response.liveVerdict?.quorumScore ?? input.result.verdict.quorumScore,
    providerTrace: input.response.providerTrace,
    contextLedger: input.response.contextLedger,
    liveVerdict: input.response.liveVerdict,
    promptBundle: input.response.promptBundle,
    result: input.result
  };
  input.setHistoryRecords(addDecisionHistoryRecord(record));
}
