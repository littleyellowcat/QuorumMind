import type { BayesianVoteWeight, DecisionContext, DecisionMode, ScoredProposal } from "./domain";
import type { BlueprintRoomResult } from "./blueprint";
import type { ModelReputation, ModelReputationFeedback } from "./model-reputation";
import type { ManualProviderAgent, ManualProviderBundle } from "./manual-provider";
import type { runDecisionRoom } from "./workflow";

export type DecisionRoomResult = ReturnType<typeof runDecisionRoom>;
export type DecisionTracePhase = "proposal" | "critique" | "revision" | "ranking" | "verdict";

export type HarnessFailure = {
  category:
    | "timeout"
    | "rate_limit"
    | "provider_error"
    | "safety_rejected"
    | "json_parse_error"
    | "schema_validation_error"
    | "missing_reference"
    | "qa_failed"
    | "permission_denied"
    | "unknown";
  retryability: "retryable" | "repairable" | "human_action_required" | "terminal";
  severity: "info" | "warning" | "error";
  message: string;
  providerStatus?: number;
};

export type BoundedOutputRef = {
  label: string;
  mime: "text/plain" | "application/json";
  preview: string;
  inline?: string;
  path?: string;
  redacted?: boolean;
  truncated: boolean;
  originalChars: number;
  omittedChars: number;
  sha256: string;
};

export type HarnessRunEvent = {
  schemaVersion?: 1;
  runId: string;
  seq: number;
  timestamp: string;
  type:
    | "run_start"
    | "route_intent_start"
    | "planner_complete"
    | "critic_warn"
    | "human_review_pause"
    | "provider_attempt_start"
    | "provider_attempt_success"
    | "provider_attempt_retry"
    | "provider_attempt_failure"
    | "context_compaction_start"
    | "context_compaction_complete"
    | "run_complete";
  severity: "info" | "warning" | "error";
  phase?: DecisionTracePhase | string;
  provider?: string;
  model?: string;
  attempt?: number;
  maxAttempts?: number;
  durationMs?: number;
  summary: string;
  truncated: boolean;
  failure?: HarnessFailure;
};

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

export type ProviderTraceEntry = {
  id: string;
  provider:
    | "model_gateway"
    | "openai"
    | "deepseek"
    | "gemini"
    | "anthropic"
    | "openrouter"
    | "ollama"
    | "lmstudio";
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
    failure?: HarnessFailure;
    outputRef?: BoundedOutputRef;
    error?: string;
  }>;
  validationStatus?: "valid" | "repaired" | "invalid" | "unparsed";
  validationIssues?: Array<{
    path: string;
    severity: "warning" | "error";
    message: string;
  }>;
  failureClass?: "provider_error" | "json_parse_error" | "schema_validation_error";
  failure?: HarnessFailure;
  normalized?: unknown;
  parsed?: unknown;
  outputRef?: BoundedOutputRef;
  events?: HarnessRunEvent[];
  error?: string;
};

export type ContextSourceType =
  | "user_input"
  | "structured_context"
  | "knowledge_injection"
  | "reputation_feedback"
  | "provider_trace"
  | "deterministic_fallback";

export type ContextSourceLedgerEntry = {
  id: string;
  sourceType: ContextSourceType;
  label: string;
  summary: string;
  hash: string;
  metadata?: Record<string, unknown>;
};

export type ContextSourceLedger = {
  schemaVersion: 1;
  contextHash: string;
  sources: ContextSourceLedgerEntry[];
  sourceCounts: Record<ContextSourceType, number>;
  providerEvidence: {
    attempted: boolean;
    usableCalls: number;
    failedCalls: number;
  };
  fallback: {
    used: boolean;
    reason: string;
  };
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
      policy?: {
        effect: "allow" | "deny";
        matchedAction?: string;
        matchedResource?: string;
        reason: string;
      };
    }
  >;
  providerTrace: ProviderTraceEntry[];
  providerRun?: {
    runId: string;
    trace: ProviderTraceEntry[];
    events: HarnessRunEvent[];
    summary: {
      providerCount: number;
      entryCount: number;
      failureCount: number;
      retryCount: number;
      truncatedOutputCount: number;
    };
  } | null;
  contextLedger?: ContextSourceLedger;
  liveVerdict: LiveDecisionVerdict | null;
  promptBundle: ManualProviderBundle;
  result: DecisionRoomResult;
};

export type BlueprintApiResponse = {
  providerMode: "demo" | "live";
  persistence?: NonNullable<DecisionApiResponse["persistence"]>;
  providerStatus: DecisionApiResponse["providerStatus"];
  providerTrace: DecisionApiResponse["providerTrace"];
  providerRun?: DecisionApiResponse["providerRun"];
  contextLedger?: ContextSourceLedger;
  blueprintExecution?: BlueprintExecutionSummary;
  promptBundle: ManualProviderBundle;
  result: BlueprintRoomResult;
};

export type AgentRuntimeConfig = {
  runId?: string;
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
    outputRef?: BoundedOutputRef;
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
  permissionApprovals: Array<{
    id: string;
    runId: string;
    toolName: string;
    node: string;
    category: "read_only" | "local_file_write" | "external_api_call" | "live_model_call" | "production_operation" | "paid_operation";
    risk: "low" | "medium" | "high";
    decision: "auto" | "requires_human" | "blocked";
    status: "pending" | "approved" | "denied";
    scope: "run" | "tool";
    requestedBy: "planner_agent" | "executor_agent" | "critic_agent" | "memory_agent" | "supervisor_agent";
    createdAt: string;
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

export type AgentRunStatusRecord = {
  runId: string;
  kind: "live_decision" | "autonomous_blueprint";
  status: "running" | "paused" | "completed" | "failed" | "interrupted";
  threadId?: string;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  resumeHint?: string;
  checkpoint?: {
    enabled: boolean;
    saver: string;
    threadId: string;
  };
  requestSnapshot?: Record<string, unknown>;
  error?: string;
};

export type AgentRunStatusResponse = {
  run: AgentRunStatusRecord;
  events?: HarnessRunEvent[];
  artifacts?: AgentRunArtifactRecord[];
};

export type AgentRunListResponse = {
  runs: AgentRunStatusRecord[];
};

export type AgentRunEventListResponse = {
  events: HarnessRunEvent[];
  nextAfter: number;
};

export type AgentRunReadModelResponse = {
  summary: {
    runId: string;
    kind?: AgentRunStatusRecord["kind"];
    status?: AgentRunStatusRecord["status"];
    createdAt?: string;
    updatedAt?: string;
    summary?: string;
    eventCount: number;
    artifactCount: number;
    lastEventType?: HarnessRunEvent["type"];
    lastEventAt?: string;
  };
  metrics: {
    runId: string;
    durationMs: number;
    providerCallCount: number;
    retryCount: number;
    failureCount: number;
    humanReviewCount: number;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedTotalTokens: number;
    estimatedCostUsd: number;
    retryCostUsd: number;
    fallbackSavedCostUsd: number;
    artifactCount: number;
    truncatedOutputCount: number;
    eventCount: number;
  };
  timeline: Array<{
    seq: number;
    timestamp: string;
    type: HarnessRunEvent["type"];
    severity: HarnessRunEvent["severity"];
    summary: string;
    phase?: string;
    provider?: string;
    model?: string;
    durationMs?: number;
  }>;
};

export type RunAuditReplayListItem = {
  runId: string;
  kind?: AgentRunStatusRecord["kind"];
  status?: AgentRunStatusRecord["status"];
  updatedAt?: string;
  summary?: string;
  eventCount: number;
  artifactCount: number;
  providers: string[];
  linkedPullRequests: number[];
  linkedAdrPaths: string[];
  riskLevels: string[];
};

export type AgentRunArtifactRecord = {
  kind:
    | "prompt_bundle"
    | "provider_trace"
    | "bounded_output"
    | "exported_pdf"
    | "resume_snapshot"
    | "run_status"
    | "event_log";
  label: string;
  createdAt?: string;
  path?: string;
  inline?: unknown;
  sha256?: string;
  metadata?: Record<string, unknown>;
};

export type RunAuditReplay = {
  summary: AgentRunReadModelResponse["summary"];
  metrics: AgentRunReadModelResponse["metrics"] & {
    permissionDecisionCount: number;
    githubReviewCount: number;
  };
  timeline: AgentRunReadModelResponse["timeline"];
  providerCalls: Array<{
    seq?: number;
    timestamp?: string;
    phase?: string;
    provider?: string;
    model?: string;
    status: "ok" | "error" | "unknown";
    durationMs?: number;
    summary: string;
  }>;
  artifacts: AgentRunArtifactRecord[];
  githubReviews: Array<{
    label: string;
    createdAt?: string;
    checkRunName?: string;
    checkRunConclusion?: string;
    reviewEvent?: string;
    reviewCommentCount: number;
    annotationCount: number;
  }>;
  permissionAudit: PermissionAuditReport;
  replayPackage: string;
};

export type RunAuditReplayListResponse = {
  replays: RunAuditReplayListItem[];
};

export type RunAuditReplayResponse = {
  replay: RunAuditReplay;
  bundle?: RunAuditBundle;
};

export type RunAuditBundle = {
  manifest: {
    formatVersion: 1;
    runId: string;
    createdAt: string;
    status?: AgentRunStatusRecord["status"];
    kind?: AgentRunStatusRecord["kind"];
    linkedPullRequests: number[];
    linkedAdrPaths: string[];
    eventCount: number;
    artifactCount: number;
    providerCallCount: number;
    permissionDecisionCount: number;
    githubReviewCount: number;
  };
  replay: RunAuditReplay;
  files: Array<{
    label: string;
    kind: AgentRunArtifactRecord["kind"];
    path?: string;
    sha256?: string;
  }>;
  markdown: string;
};

export type RunAuditReplayDiffResponse = {
  diff: {
    baseRunId: string;
    targetRunId: string;
    statusChanged: boolean;
    summaryChanged: boolean;
    metricDelta: {
      eventCount: number;
      artifactCount: number;
      providerCallCount: number;
      permissionDecisionCount: number;
      githubReviewCount: number;
      durationMs: number;
    };
    providerChanges: { added: string[]; removed: string[]; unchanged: string[] };
    artifactChanges: { added: string[]; removed: string[]; unchanged: string[] };
    riskLevelChanges: { added: string[]; removed: string[]; unchanged: string[] };
  };
};

export type TeamRole = "owner" | "reviewer" | "viewer";
export type TeamAction = "view" | "comment" | "create_adr" | "approve_adr" | "admin";

export type TeamMember = {
  userId: string;
  role: TeamRole;
};

export type TeamWorkspace = {
  id: string;
  name: string;
  persistenceMode: "browser_local" | "sqlite" | "postgres";
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
};

export type TeamAccessDecision = {
  allowed: boolean;
  userId: string;
  action: TeamAction;
  role?: TeamRole;
  reason: string;
};

export type AdrApprovalDecision = {
  userId: string;
  decision: "approve" | "request_changes" | "reject";
  note?: string;
  decidedAt: string;
};

export type AdrApprovalRecord = {
  id: string;
  workspaceId: string;
  adrId: string;
  title: string;
  requestedBy: string;
  requiredApprovers: string[];
  status: "pending" | "approved" | "changes_requested" | "rejected";
  createdAt: string;
  updatedAt: string;
  decisions: AdrApprovalDecision[];
};

export type PostgresPersistenceContract = {
  mode: "postgres";
  configured: boolean;
  schema: string;
  sslMode: "disable" | "prefer" | "require";
  requiredTables: string[];
  notes: string[];
  repository?: {
    available: boolean;
    driver: "external_query_client";
    migrationSafe: boolean;
  };
};

export type TeamWorkspaceResponse = {
  workspace: TeamWorkspace;
  access?: TeamAccessDecision;
  approvals?: AdrApprovalRecord[];
  persistenceContract?: PostgresPersistenceContract | { mode: string; configured: boolean };
};

export type TeamAccessResponse = {
  access: TeamAccessDecision;
};

export type TeamAdrApprovalResponse = {
  approval: AdrApprovalRecord;
};

export type AgentRunTerminalResponse = {
  runId: string;
  status: "completed" | "paused" | "interrupted" | "not_found" | AgentRunStatusRecord["status"];
  reason?: string;
  updatedAt?: string;
};

export type AgentRunResumeResponse = {
  status: "resumed" | "resume_recorded" | "not_resumable";
  message?: string;
  run: AgentRunStatusRecord | AutonomousBlueprintRun;
};

export type AgentRunApprovalReplyRequest = {
  reply: "approve" | "reject" | "always";
  message?: string;
};

export type AgentRunApprovalReplyResponse = {
  approval: {
    id: string;
    runId: string;
    toolName: string;
    node: string;
    category: string;
    risk: string;
    decision: string;
    status: "pending" | "approved" | "denied";
    scope: "run" | "tool";
    requestedBy: string;
    createdAt: string;
    approvedAt?: string;
    deniedAt?: string;
    expiresAt?: string;
    revokedAt?: string;
    replyMessage?: string;
    reason: string;
  };
};

export type PermissionApprovalLifecycleCounts = {
  pending: number;
  approved: number;
  denied: number;
  revoked: number;
  expired: number;
};

export type PermissionLifecycleReport = {
  generatedAt: string;
  summary: PermissionApprovalLifecycleCounts & {
    total: number;
  };
  byTool: Array<PermissionApprovalLifecycleCounts & {
    toolName: string;
  }>;
  byProvider: Array<PermissionApprovalLifecycleCounts & {
    providerId: string;
  }>;
};

export type PermissionAuditReport = {
  generatedAt: string;
  summary: {
    total: number;
    allowed: number;
    humanGated: number;
    blocked: number;
    redactedOrTruncated: number;
  };
  items: Array<{
    id: string;
    runId: string;
    toolName: string;
    node: string;
    category: string;
    risk: string;
    decision: string;
    status: string;
    scope?: "run" | "tool";
    outcome: "allowed" | "human_gated" | "blocked";
    requestedBy: string;
    createdAt: string;
    approvedAt?: string;
    deniedAt?: string;
    expiresAt?: string;
    revokedAt?: string;
    requiresHumanConfirmation: boolean;
    whyAllowedOrDenied: string;
    outputHandling: {
      redacted: boolean;
      truncated: boolean;
      reason: string;
    };
  }>;
  approvalPackage: string;
};

export type ProviderCapabilityValue = boolean | "model_dependent" | "proxy_dependent" | "unknown";

export type ProviderCapability = {
  providerId: string;
  displayName: string;
  implementationStatus: "implemented" | "reserved" | "local_reserved";
  capabilitySource: "adapter_verified" | "documented_not_verified" | "unknown";
  transport: "api" | "local";
  supportsJsonSchema: ProviderCapabilityValue;
  supportsToolCalls: ProviderCapabilityValue;
  supportsLongContext: ProviderCapabilityValue;
  supportsLowCostMode: ProviderCapabilityValue;
  notes: string[];
};

export type QuorumMindConfigSummary = {
  loaded: boolean;
  path?: string;
  errors: string[];
  mcpServers: Array<{
    name: string;
    command: string;
    configuredEnvKeys: string[];
  }>;
  customTools: Array<{
    name: string;
    description: string;
  }>;
  agentToolAccess: Array<{
    agentId: string;
    tools: string[];
  }>;
  providerOverrides: Array<{
    providerId: string;
    enabled: boolean;
    model?: string;
    baseUrlConfigured: boolean;
  }>;
};

export type DecisionApiHealth = {
  status: "ok";
  providerMode: "demo" | "live";
  persistence: NonNullable<DecisionApiResponse["persistence"]>;
  providerStatus: DecisionApiResponse["providerStatus"];
  providerCapabilities: Record<string, ProviderCapability>;
  configSummary: QuorumMindConfigSummary;
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

export async function getPermissionAudit(fetchImpl: FetchLike = fetch): Promise<PermissionAuditReport> {
  const response = await fetchImpl("/api/permissions/audit", {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Permission audit failed with ${response.status}`;
    throw new Error(message);
  }

  return body as PermissionAuditReport;
}

export async function getPermissionLifecycle(fetchImpl: FetchLike = fetch): Promise<PermissionLifecycleReport> {
  const response = await fetchImpl("/api/permissions/lifecycle", {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Permission lifecycle failed with ${response.status}`;
    throw new Error(message);
  }

  return body as PermissionLifecycleReport;
}

export async function replyPermissionApproval(
  approvalId: string,
  input: AgentRunApprovalReplyRequest,
  fetchImpl: FetchLike = fetch
): Promise<AgentRunApprovalReplyResponse> {
  const response = await fetchImpl(`/api/permissions/approvals/${encodeURIComponent(approvalId)}/reply`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Permission approval reply failed with ${response.status}`;
    throw new Error(message);
  }

  return body as AgentRunApprovalReplyResponse;
}

export async function revokePermissionApproval(
  approvalId: string,
  fetchImpl: FetchLike = fetch
): Promise<AgentRunApprovalReplyResponse> {
  const response = await fetchImpl(`/api/permissions/approvals/${encodeURIComponent(approvalId)}/revoke`, {
    method: "POST",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Permission approval revoke failed with ${response.status}`;
    throw new Error(message);
  }

  return body as AgentRunApprovalReplyResponse;
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

export async function getAgentRunStatus(
  runId: string,
  fetchImpl: FetchLike = fetch
): Promise<AgentRunStatusResponse> {
  const response = await fetchImpl(`/api/agent-runs/${encodeURIComponent(runId)}`, {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Agent run status failed with ${response.status}`;
    throw new Error(message);
  }

  return body as AgentRunStatusResponse;
}

export async function listAgentRuns(fetchImpl: FetchLike = fetch): Promise<AgentRunListResponse> {
  const response = await fetchImpl("/api/agent-runs", {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Agent run list failed with ${response.status}`;
    throw new Error(message);
  }

  return body as AgentRunListResponse;
}

export async function listAgentRunEvents(
  runId: string,
  options: { after?: number } = {},
  fetchImpl: FetchLike = fetch
): Promise<AgentRunEventListResponse> {
  const params = new URLSearchParams();

  if (typeof options.after === "number") {
    params.set("after", String(options.after));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetchImpl(`/api/agent-runs/${encodeURIComponent(runId)}/events${suffix}`, {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Agent run events failed with ${response.status}`;
    throw new Error(message);
  }

  return body as AgentRunEventListResponse;
}

export async function getAgentRunReadModel(
  runId: string,
  fetchImpl: FetchLike = fetch
): Promise<AgentRunReadModelResponse> {
  const response = await fetchImpl(`/api/agent-runs/${encodeURIComponent(runId)}/read-model`, {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Agent run read model failed with ${response.status}`;
    throw new Error(message);
  }

  return body as AgentRunReadModelResponse;
}

type RunAuditReplayFilters = {
    query?: string;
    status?: string;
    kind?: string;
    provider?: string;
    pr?: number;
    adr?: string;
    risk?: string;
    limit?: number;
};

export async function listRunAuditReplays(
  filtersOrFetch?: RunAuditReplayFilters | FetchLike,
  fetchImpl: FetchLike = fetch
): Promise<RunAuditReplayListResponse> {
  const filters = typeof filtersOrFetch === "function" ? undefined : filtersOrFetch;
  const fetchClient = typeof filtersOrFetch === "function" ? filtersOrFetch : fetchImpl;
  const query = filters ? queryString(filters) : "";
  const response = await fetchClient(`/api/agent-runs/audit${query}`, {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Run audit replay list failed with ${response.status}`;
    throw new Error(message);
  }

  return body as RunAuditReplayListResponse;
}

export async function getRunAuditReplay(
  runId: string,
  optionsOrFetch?: { bundle?: boolean } | FetchLike,
  fetchImpl: FetchLike = fetch
): Promise<RunAuditReplayResponse> {
  const options = typeof optionsOrFetch === "function" ? undefined : optionsOrFetch;
  const fetchClient = typeof optionsOrFetch === "function" ? optionsOrFetch : fetchImpl;
  const response = await fetchClient(`/api/agent-runs/${encodeURIComponent(runId)}/audit${options?.bundle ? "?bundle=true" : ""}`, {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Run audit replay failed with ${response.status}`;
    throw new Error(message);
  }

  return body as RunAuditReplayResponse;
}

export async function diffRunAuditReplays(
  baseRunId: string,
  targetRunId: string,
  fetchImpl: FetchLike = fetch
): Promise<RunAuditReplayDiffResponse> {
  const response = await fetchImpl(
    `/api/agent-runs/audit/diff?base=${encodeURIComponent(baseRunId)}&target=${encodeURIComponent(targetRunId)}`,
    {
      method: "GET",
      headers: apiHeaders()
    }
  );
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Run audit replay diff failed with ${response.status}`;
    throw new Error(message);
  }

  return body as RunAuditReplayDiffResponse;
}

export async function createTeamWorkspace(
  input: {
    id: string;
    name: string;
    persistenceMode?: TeamWorkspace["persistenceMode"];
    members: TeamMember[];
  },
  fetchImpl: FetchLike = fetch
): Promise<TeamWorkspaceResponse> {
  const response = await fetchImpl("/api/team/workspaces", {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Team workspace request failed with ${response.status}`;
    throw new Error(message);
  }

  return body as TeamWorkspaceResponse;
}

export async function getTeamWorkspace(
  workspaceId: string,
  fetchImpl: FetchLike = fetch
): Promise<TeamWorkspaceResponse> {
  const response = await fetchImpl(`/api/team/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Team workspace request failed with ${response.status}`;
    throw new Error(message);
  }

  return body as TeamWorkspaceResponse;
}

export async function checkTeamAccess(
  input: {
    workspaceId: string;
    userId: string;
    action: TeamAction;
  },
  fetchImpl: FetchLike = fetch
): Promise<TeamAccessResponse> {
  const response = await fetchImpl("/api/team/access", {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Team access request failed with ${response.status}`;
    throw new Error(message);
  }

  return body as TeamAccessResponse;
}

export async function createTeamAdrApproval(
  input: {
    workspaceId: string;
    adrId: string;
    title: string;
    requestedBy: string;
    requiredApprovers: string[];
  },
  fetchImpl: FetchLike = fetch
): Promise<TeamAdrApprovalResponse> {
  const response = await fetchImpl("/api/team/adr-approvals", {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Team ADR approval request failed with ${response.status}`;
    throw new Error(message);
  }

  return body as TeamAdrApprovalResponse;
}

export async function replyTeamAdrApproval(
  approvalId: string,
  input: {
    userId: string;
    decision: AdrApprovalDecision["decision"];
    note?: string;
  },
  fetchImpl: FetchLike = fetch
): Promise<TeamAdrApprovalResponse> {
  const response = await fetchImpl(`/api/team/adr-approvals/${encodeURIComponent(approvalId)}/reply`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Team ADR approval reply failed with ${response.status}`;
    throw new Error(message);
  }

  return body as TeamAdrApprovalResponse;
}

export async function resumeAgentRun(
  runId: string,
  humanReviewNote: string,
  fetchImpl: FetchLike = fetch
): Promise<AgentRunResumeResponse> {
  const response = await fetchImpl(`/api/agent-runs/${encodeURIComponent(runId)}/resume`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ humanReviewNote })
  });
  const body = await readJson(response);

  if (!response.ok && response.status !== 409) {
    const message = typeof body?.error === "string" ? body.error : `Agent run resume failed with ${response.status}`;
    throw new Error(message);
  }

  return body as AgentRunResumeResponse;
}

export async function replyAgentRunApproval(
  runId: string,
  approvalId: string,
  input: AgentRunApprovalReplyRequest,
  fetchImpl: FetchLike = fetch
): Promise<AgentRunApprovalReplyResponse> {
  const response = await fetchImpl(
    `/api/agent-runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}/reply`,
    {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input)
    }
  );
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Agent run approval reply failed with ${response.status}`;
    throw new Error(message);
  }

  return body as AgentRunApprovalReplyResponse;
}

export async function interruptAgentRun(
  runId: string,
  reason: string,
  fetchImpl: FetchLike = fetch
): Promise<AgentRunTerminalResponse> {
  const response = await fetchImpl(`/api/agent-runs/${encodeURIComponent(runId)}/interrupt`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ reason })
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Agent run interrupt failed with ${response.status}`;
    throw new Error(message);
  }

  return body as AgentRunTerminalResponse;
}

export async function waitAgentRun(
  runId: string,
  fetchImpl: FetchLike = fetch
): Promise<AgentRunTerminalResponse> {
  const response = await fetchImpl(`/api/agent-runs/${encodeURIComponent(runId)}/wait`, {
    method: "GET",
    headers: apiHeaders()
  });
  const body = await readJson(response);

  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `Agent run wait failed with ${response.status}`;
    throw new Error(message);
  }

  return body as AgentRunTerminalResponse;
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

function queryString(filters: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") {
      continue;
    }
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
