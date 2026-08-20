import type { Dispatch, SetStateAction } from "react";
import type { BlueprintRoomResult } from "../../lib/blueprint";
import { addDecisionHistoryRecord, type DecisionHistoryRecord } from "../../lib/decision-history";
import type { AutonomousBlueprintRun } from "../../lib/api-client";
import type { BlueprintSnapshot } from "../../types/app";
import { newId } from "../../lib/view-utils";

export function persistBlueprintRecord(input: {
  question: string;
  response: BlueprintSnapshot;
  result: BlueprintRoomResult;
  agentRun?: AutonomousBlueprintRun;
  setHistoryRecords: Dispatch<SetStateAction<DecisionHistoryRecord[]>>;
}) {
  const record: DecisionHistoryRecord = {
    id: newId(),
    kind: "blueprint",
    question: input.question,
    createdAt: new Date().toISOString(),
    providerMode: input.response.providerMode,
    recommendation: input.result.finalSpec.title,
    quorumScore: input.result.finalConsensusScore,
    providerTrace: input.response.providerTrace,
    contextLedger: input.response.contextLedger,
    promptBundle: input.response.promptBundle,
    blueprintResult: input.result,
    blueprintExecution: input.response.blueprintExecution,
    agentRun: input.agentRun
  };
  input.setHistoryRecords(addDecisionHistoryRecord(record));
}
