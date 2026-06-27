import type { BayesianVoteWeight, DecisionContext, DecisionMode, ScoredProposal } from "./domain";
import type { BlueprintRoomResult } from "./blueprint";
import type { ModelReputation, ModelReputationFeedback } from "./model-reputation";
import type { ManualProviderAgent, ManualProviderBundle } from "./manual-provider";
import type { runDecisionRoom } from "./workflow";

export type DecisionRoomResult = ReturnType<typeof runDecisionRoom>;
export type DecisionTracePhase = "proposal" | "critique" | "revision" | "ranking" | "verdict";

export type LiveDecisionVerdict = {
  source: "live";
  selectedProposalId: string;
  finalRecommendation: string;
  quorumScore: number;
  dissentIndex: number;
  rankedProposals: ScoredProposal[];
  bayesianVoteWeights?: BayesianVoteWeight[];
  whyItWon: string[];
  remainingDissent: string[];
  usedProposalPhase: "proposal" | "revision";
};

export type DecisionApiRequest = {
  question: string;
  mode: DecisionMode;
  locale: "en" | "zh";
  context: DecisionContext;
  agentConfig?: ManualProviderAgent[];
  reputationFeedback?: ModelReputationFeedback[];
  blueprintRuntime?: BlueprintRuntimeConfig;
};

export type BlueprintExecutionMode = "deterministic" | "live";

export type BlueprintRuntimeConfig = {
  executionMode?: BlueprintExecutionMode;
  maxProviderRounds?: number;
};

export type BlueprintExecutionSummary = {
  requested: BlueprintExecutionMode;
  actual: "deterministic" | "live";
  liveTraceRequired: boolean;
  liveTraceAttempted: boolean;
  liveTraceUsable: boolean;
  providerCalls: number;
  usableCalls: number;
  fallbackReason?:
    | "deterministic_mode"
    | "provider_mode_demo"
    | "no_configured_providers"
    | "no_usable_live_trace"
    | "live_trace_error";
};

export type DecisionApiResponse = {
  providerMode: "demo" | "live";
  persistence?: {
    mode: "browser_local" | "sqlite";
    configured: boolean;
    saved?: boolean;
    error?: string;
  };
  providerStatus: Record<
    string,
    {
      id: string;
      displayName: string;
      kind: "api" | "local";
      configured: boolean;
      implemented: boolean;
      envKey?: string;
      modelEnvKey: string;
      model: string;
      notes: string;
    }
  >;
  providerTrace: Array<{
    id: string;
    provider: "model_gateway" | "openai" | "deepseek" | "gemini";
    model: string;
    phase: DecisionTracePhase;
    agentName?: string;
    agentRole?: string;
    agentWeight?: number;
    modelReputation?: ModelReputation;
    status: "ok" | "error";
    text: string;
    durationMs: number;
    jsonParsed: boolean;
    runId?: string;
    attempt?: number;
    maxAttempts?: number;
    retryCount?: number;
    attempts?: Array<{
      attempt: number;
      status: "ok" | "error";
      durationMs: number;
      jsonParsed: boolean;
      validationStatus: "valid" | "repaired" | "invalid" | "unparsed";
      failureClass?: "provider_error" | "json_parse_error" | "schema_validation_error";
      error?: string;
    }>;
    validationStatus?: "valid" | "repaired" | "invalid" | "unparsed";
    validationIssues?: Array<{
      path: string;
      severity: "warning" | "error";
      message: string;
    }>;
    failureClass?: "provider_error" | "json_parse_error" | "schema_validation_error";
    normalized?: unknown;
    parsed?: unknown;
    error?: string;
  }>;
  liveVerdict: LiveDecisionVerdict | null;
  promptBundle: ManualProviderBundle;
  result: DecisionRoomResult;
};

export type BlueprintApiResponse = {
  providerMode: "demo" | "live";
  persistence?: NonNullable<DecisionApiResponse["persistence"]>;
  providerStatus: DecisionApiResponse["providerStatus"];
  providerTrace: DecisionApiResponse["providerTrace"];
  blueprintExecution?: BlueprintExecutionSummary;
  promptBundle: ManualProviderBundle;
  result: BlueprintRoomResult;
};

export type AgentRuntimeConfig = {
  threadId?: string;
  maxConsensusRounds?: number;
  humanReviewNote?: string;
};

export type AutonomousAgentPlatformRuntime = {
  orchestrator: "langgraph";
  toolLayer: "langchain-core";
  autonomyLevel: "bounded_server_graph";
  source: "deterministic_tools" | "live_model_trace_with_deterministic_synthesis";
  checkpointing: "memory_saver" | "sqlite_saver";
  notes: string[];
};

export type AutonomousAgentPattern = {
  primary: "langgraph_workflow_agent";
  layers: Array<
    | "intent_router"
    | "clarifier_agent"
    | "multi_agent_debate"
    | "critique_revision"
    | "evaluator_optimizer"
    | "bounded_react_tools"
    | "planner_executor_critic"
    | "memory_agent"
    | "supervisor_agent"
    | "tool_permission_policy"
    | "human_in_the_loop"
  >;
  reactScope: "node_local_bounded_tools";
  description: string;
};

export type AutonomousBlueprintRun = {
  runId: string;
  platform: AutonomousAgentPlatformRuntime;
  checkpoint: {
    enabled: boolean;
    saver: "MemorySaver" | "SqliteSaver";
    threadId: string;
  };
  runtimeLimits: {
    maxConsensusRounds: number;
    recursionLimit: number;
  };
  question: string;
  mode: DecisionMode;
  locale: "en" | "zh";
  agentPattern: AutonomousAgentPattern;
  intent: {
    category: "decision" | "blueprint" | "agent_design" | "evaluation" | "report_export" | "localization" | "security" | "general";
    route: "blueprint_graph" | "decision_room_recommended" | "agent_eval_blueprint" | "report_export_blueprint" | "security_review_blueprint";
    confidence: number;
    complexity: "low" | "medium" | "high";
    signals: string[];
    shouldClarify: boolean;
    normalizedRequest: string;
  };
  clarification: {
    required: boolean;
    strategy: "answer_with_assumptions" | "ask_before_running";
    questions: string[];
    assumptions: string[];
  };
  goalBrief: {
    goal: string;
    likelyPattern: "visual_novel_multi_agent" | "generic_blueprint";
    constraints: string[];
    successSignals: string[];
  };
  trace: Array<{
    node: string;
    agentId: string;
    status: "complete" | "needs_review";
    summary: string;
    evidence: string[];
  }>;
  toolCalls: Array<{
    toolName: string;
    node: string;
    inputSummary: string;
    outputSummary: string;
    source: "langchain_tool" | "live_model_provider";
  }>;
  reactToolSteps: Array<{
    node: string;
    thought: string;
    action: string;
    toolName: string;
    observation: string;
  }>;
  taskTree: Array<{
    id: string;
    title: string;
    ownerAgent: "planner_agent" | "executor_agent" | "critic_agent" | "memory_agent" | "supervisor_agent";
    objective: string;
    dependencies: string[];
    status: "pending" | "ready" | "executed" | "blocked";
    toolName?: string;
    acceptanceCriteria: string[];
  }>;
  toolPermissions: Array<{
    toolName: string;
    node: string;
    category: "read_only" | "local_file_write" | "external_api_call" | "live_model_call" | "production_operation" | "paid_operation";
    risk: "low" | "medium" | "high";
    decision: "auto" | "requires_human" | "blocked";
    reason: string;
  }>;
  executorActions: Array<{
    taskId: string;
    node: string;
    toolName: string;
    permission: "auto" | "requires_human" | "blocked";
    status: "executed" | "requires_human" | "skipped";
    outputSummary: string;
  }>;
  criticReviews: Array<{
    targetTaskId: string;
    status: "pass" | "warn" | "fail";
    finding: string;
    recommendation: string;
  }>;
  memoryEvents: Array<{
    scope: "run" | "thread" | "durable";
    action: "read" | "write" | "summarize" | "inject" | "profile" | "compare" | "backlog";
    key: string;
    persistence: "memory" | "sqlite" | "knowledge_index";
    detail: string;
  }>;
  supervisorDecisions: Array<{
    node: string;
    decision: "continue" | "pause_for_human" | "finalize";
    reason: string;
    requiredHumanInputs: string[];
    nextNode: string;
  }>;
  providerTrace: DecisionApiResponse["providerTrace"];
  liveModel: BlueprintExecutionSummary;
  consensusLoop: Array<{
    round: number;
    phase: string;
    consensusScore: number;
    threshold: number;
    passed: boolean;
    action: "continue" | "finalize" | "human_review";
    summary: string;
    improvements: string[];
    remainingDisagreements: string[];
  }>;
  routeDecisions: Array<{
    fromNode: "validate_result";
    toNode: "revise_discussion" | "human_review_gate" | "finalize";
    reason: "threshold_met" | "round_budget_exhausted" | "human_review_required" | "below_threshold_can_revise";
    round: number;
    consensusScore: number;
    threshold: number;
  }>;
  evaluatorGate: {
    score: number;
    threshold: number;
    passed: boolean;
    action: "finalize" | "revise" | "human_review";
    checks: Array<{
      name: string;
      status: "pass" | "warn" | "fail";
      detail: string;
    }>;
  };
  validation: {
    passed: boolean;
    canRevise: boolean;
    terminationReason: "threshold_met" | "round_budget_exhausted" | "human_review_required";
    round: number;
    totalRounds: number;
    maxConsensusRounds: number;
    consensusScore: number;
    threshold: number;
    blockingIssues: string[];
    reviewWarnings: string[];
  };
  summary: {
    title: string;
    consensusScore: number;
    consensusPassed: boolean;
    discussionRounds: number;
    terminationReason: "threshold_met" | "round_budget_exhausted" | "human_review_required";
    nextActions: string[];
    reviewWarnings: string[];
    humanReviewRequired: boolean;
  };
  result: BlueprintRoomResult;
};

export type AgentBlueprintApiResponse = {
  providerMode: "demo" | "live";
  persistence?: NonNullable<DecisionApiResponse["persistence"]>;
  providerStatus: DecisionApiResponse["providerStatus"];
  run: AutonomousBlueprintRun;
};

export type DecisionApiHealth = {
  status: "ok";
  providerMode: "demo" | "live";
  persistence: NonNullable<DecisionApiResponse["persistence"]>;
  providerStatus: DecisionApiResponse["providerStatus"];
};

export type ApiSecurityPosture = {
  classification: string;
  controls: {
    securityHeaders: boolean;
    corsAllowlist: boolean;
    wildcardCors: boolean;
    rateLimiting: boolean;
    maxBodyBytes: number;
    authenticationRequired: boolean;
    hstsEnabled: boolean;
  };
  policy?: {
    authenticationRequired: boolean;
    allowedOrigins: string[];
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
    maxBodyBytes: number;
    hstsEnabled: boolean;
  };
};

export type ProviderConnectionTestResult = {
  provider: "model_gateway" | "openai" | "deepseek" | "gemini";
  model: string;
  configured: boolean;
  responded: boolean;
  jsonParsed: boolean;
  schemaUsable: boolean;
  validationStatus: "valid" | "repaired" | "invalid" | "unparsed" | "not_configured" | "error";
  durationMs: number;
  failureReason?: string;
  validationIssues: Array<{
    path: string;
    severity: "warning" | "error";
    message: string;
  }>;
};

export type ProviderConnectionTestResponse = {
  providerMode: "demo" | "live";
  providerStatus: DecisionApiResponse["providerStatus"];
  results: ProviderConnectionTestResult[];
};

export type ServerDecisionRoomSummary = {
  id: string;
  question: string;
  locale: "en" | "zh";
  mode: DecisionMode;
  providerMode: "demo" | "live";
  selectedProposalId: string;
  recommendation: string;
  quorumScore: number;
  dissentIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type ServerDecisionRoomSnapshot = ServerDecisionRoomSummary & {
  providerTrace: DecisionApiResponse["providerTrace"];
  liveVerdict: DecisionApiResponse["liveVerdict"];
  promptBundle: ManualProviderBundle;
  result: DecisionRoomResult;
  adrMarkdown: string;
};

export type ServerDecisionRoomListResponse = {
  persistence: NonNullable<DecisionApiResponse["persistence"]>;
  rooms: ServerDecisionRoomSummary[];
};

export type RenderedPdfRequest = {
  html: string;
  filename: string;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function getApiHealth(fetchImpl: FetchLike = fetch): Promise<DecisionApiHealth> {
  const response = await fetchImpl("/api/health", {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Decision API health failed with ${response.status}`;
    throw new Error(message);
  }

  return body as DecisionApiHealth;
}

export async function getApiSecurityPosture(fetchImpl: FetchLike = fetch): Promise<ApiSecurityPosture> {
  const response = await fetchImpl("/api/security", {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Decision API security status failed with ${response.status}`;
    throw new Error(message);
  }

  return body as ApiSecurityPosture;
}

export async function testProviderConnections(fetchImpl: FetchLike = fetch): Promise<ProviderConnectionTestResponse> {
  const response = await fetchImpl("/api/providers/test", {
    method: "POST",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Provider connection test failed with ${response.status}`;
    throw new Error(message);
  }

  return body as ProviderConnectionTestResponse;
}

export async function requestDecisionRoom(
  input: DecisionApiRequest,
  fetchImpl: FetchLike = fetch,
  options: { signal?: AbortSignal } = {}
): Promise<DecisionApiResponse> {
  const response = await fetchImpl("/api/decisions", {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    signal: options.signal,
    body: JSON.stringify(input)
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Decision API failed with ${response.status}`;
    throw new Error(message);
  }

  return body as DecisionApiResponse;
}

export async function requestBlueprintRoom(
  input: DecisionApiRequest,
  fetchImpl: FetchLike = fetch,
  options: { signal?: AbortSignal } = {}
): Promise<BlueprintApiResponse> {
  const response = await fetchImpl("/api/blueprints", {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    signal: options.signal,
    body: JSON.stringify(input)
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Blueprint API failed with ${response.status}`;
    throw new Error(message);
  }

  return body as BlueprintApiResponse;
}

export async function requestAutonomousBlueprintRun(
  input: DecisionApiRequest & { agentRuntime?: AgentRuntimeConfig },
  fetchImpl: FetchLike = fetch,
  options: { signal?: AbortSignal } = {}
): Promise<AgentBlueprintApiResponse> {
  const response = await fetchImpl("/api/agent-runs/blueprint", {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    signal: options.signal,
    body: JSON.stringify(input)
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Agent Blueprint API failed with ${response.status}`;
    throw new Error(message);
  }

  return body as AgentBlueprintApiResponse;
}

export async function downloadRenderedPdf(
  input: RenderedPdfRequest,
  fetchImpl: FetchLike = fetch
): Promise<void> {
  const response = await fetchImpl("/api/exports/pdf", {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const body = await readJson(response);
    const message = typeof body?.error === "string" ? body.error : `PDF export failed with ${response.status}`;
    throw new Error(message);
  }

  downloadBlob(await response.blob(), input.filename);
}

export async function listServerDecisionRooms(
  fetchImpl: FetchLike = fetch
): Promise<ServerDecisionRoomListResponse> {
  const response = await fetchImpl("/api/rooms", {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Decision room list failed with ${response.status}`;
    throw new Error(message);
  }

  return body as ServerDecisionRoomListResponse;
}

export async function openServerDecisionRoom(
  roomId: string,
  fetchImpl: FetchLike = fetch
): Promise<ServerDecisionRoomSnapshot> {
  const response = await fetchImpl(`/api/rooms/${encodeURIComponent(roomId)}`, {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Decision room open failed with ${response.status}`;
    throw new Error(message);
  }

  return body.room as ServerDecisionRoomSnapshot;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function apiHeaders(base: Record<string, string> = {}): HeadersInit {
  const token = (import.meta as { env?: { VITE_QUORUMMIND_API_TOKEN?: string } }).env?.VITE_QUORUMMIND_API_TOKEN;

  return token ? { ...base, "X-QuorumMind-Token": token } : base;
}
