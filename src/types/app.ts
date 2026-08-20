import type { DecisionMode } from "../lib/domain";
import type { BlueprintApiResponse, DecisionApiResponse, getApiSecurityPosture } from "../lib/api-client";
import type { runDecisionRoom } from "../lib/workflow";

export type Locale = "en" | "zh";
export type WorkspaceMode = "decision" | "blueprint";
export type AppSurface = "landing" | "workbench";
export type DecisionRoomResult = ReturnType<typeof runDecisionRoom>;
export type ProviderTraceEntry = DecisionApiResponse["providerTrace"][number];
export type ProviderStatus = DecisionApiResponse["providerStatus"];
export type ApiSecurityPosture = Awaited<ReturnType<typeof getApiSecurityPosture>>;
export type RunKind = "decision" | "decision-review" | "blueprint" | "agent" | "provider-test";

export type RunProgress = {
  kind: RunKind;
  stage: string;
  progress: number;
  message: string;
  modelCall?: string;
};

export type DecisionSnapshot = Pick<
  DecisionApiResponse,
  "providerMode" | "providerStatus" | "providerTrace" | "contextLedger" | "liveVerdict" | "promptBundle" | "persistence"
>;

export type DecisionRunResponse = {
  response: DecisionApiResponse;
  fallbackError?: string;
};

export type DecisionReviewRound = {
  round: number;
  mode: DecisionMode;
  score: number;
  deltaFromBest: number;
  dissentIndex: number;
  selectedProposalId: string;
  providerMode: DecisionApiResponse["providerMode"];
  traceCalls: number;
  reachedTarget: boolean;
  fallbackUsed: boolean;
  accepted: boolean;
};

export type DecisionReviewLoopState = {
  targetScore: number;
  maxRounds: number;
  baselineScore: number;
  bestScore: number;
  status: "running" | "passed" | "needs_review" | "cancelled";
  rounds: DecisionReviewRound[];
  finalMessage: string;
};

export type BlueprintSnapshot = Pick<
  BlueprintApiResponse,
  "providerMode" | "providerStatus" | "providerTrace" | "contextLedger" | "promptBundle" | "blueprintExecution"
>;

export type TraceStats = {
  calls: number;
  ok: number;
  failed: number;
  jsonParsed: number;
  schemaUsable: number;
  repaired: number;
  totalMs: number;
};
