import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { createSqliteSaver } from "../persistence/sqlite-saver";
import { DatabaseSync } from "node:sqlite";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  enrichBlueprintWithModelContributions,
  runBlueprintRoom,
  type BlueprintRoomResult
} from "../../src/lib/blueprint";
import type { DecisionContext, DecisionMode } from "../../src/lib/domain";
import type { LiveDecisionTraceEntry } from "../live-decision";
import { buildKnowledgeInjection } from "../knowledge-inject";
import {
  compressContext,
  estimateTokenCount,
  logPressure,
  persistContextSummary,
  assembleCompressedContext,
  extractTailMessages,
  type CompressionResult,
  type CompressedStateSlice,
  DEFAULT_MAX_TOKENS
} from "../context-compressor";

export type AutonomousAgentPlatformRuntime = {
  orchestrator: "langgraph";
  toolLayer: "langchain-core";
  autonomyLevel: "bounded_server_graph";
  source: "deterministic_tools" | "live_model_trace_with_deterministic_synthesis";
  checkpointing: "memory_saver" | "sqlite_saver";
  notes: string[];
};

export type AutonomousAgentTraceEntry = {
  node: string;
  agentId: string;
  status: "complete" | "needs_review";
  summary: string;
  evidence: string[];
};

export type AutonomousToolCall = {
  toolName: string;
  node: string;
  inputSummary: string;
  outputSummary: string;
  source: "langchain_tool" | "live_model_provider";
};

export type AutonomousLiveModelSummary = {
  requested: "deterministic" | "live";
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

export type AutonomousGoalBrief = {
  goal: string;
  likelyPattern: "visual_novel_multi_agent" | "generic_blueprint";
  constraints: string[];
  successSignals: string[];
  knowledgeInjection?: string;
};

export type AutonomousIntentCategory =
  | "decision"
  | "blueprint"
  | "agent_design"
  | "evaluation"
  | "report_export"
  | "localization"
  | "security"
  | "general";

export type AutonomousIntentPlan = {
  category: AutonomousIntentCategory;
  route:
    | "blueprint_graph"
    | "decision_room_recommended"
    | "agent_eval_blueprint"
    | "report_export_blueprint"
    | "security_review_blueprint";
  confidence: number;
  complexity: "low" | "medium" | "high";
  signals: string[];
  shouldClarify: boolean;
  normalizedRequest: string;
};

export type AutonomousClarificationPlan = {
  required: boolean;
  strategy: "answer_with_assumptions" | "ask_before_running";
  questions: string[];
  assumptions: string[];
};

export type AutonomousReactToolStep = {
  node: string;
  thought: string;
  action: string;
  toolName: string;
  observation: string;
};

export type AutonomousTaskNode = {
  id: string;
  title: string;
  ownerAgent: "planner_agent" | "executor_agent" | "critic_agent" | "memory_agent" | "supervisor_agent";
  objective: string;
  dependencies: string[];
  status: "pending" | "ready" | "executed" | "blocked";
  toolName?: string;
  acceptanceCriteria: string[];
};

export type AutonomousToolPermissionDecision = {
  toolName: string;
  node: string;
  category:
    | "read_only"
    | "local_file_write"
    | "external_api_call"
    | "live_model_call"
    | "production_operation"
    | "paid_operation";
  risk: "low" | "medium" | "high";
  decision: "auto" | "requires_human" | "blocked";
  reason: string;
};

export type AutonomousExecutorAction = {
  taskId: string;
  node: string;
  toolName: string;
  permission: AutonomousToolPermissionDecision["decision"];
  status: "executed" | "requires_human" | "skipped";
  outputSummary: string;
};

export type AutonomousCriticReview = {
  targetTaskId: string;
  status: "pass" | "warn" | "fail";
  finding: string;
  recommendation: string;
};

export type AutonomousMemoryEvent = {
  scope: "run" | "thread" | "durable";
  action: "read" | "write" | "summarize" | "inject" | "profile" | "compare" | "backlog";
  key: string;
  persistence: "memory" | "sqlite" | "knowledge_index";
  detail: string;
};

export type AutonomousSupervisorDecision = {
  node: string;
  decision: "continue" | "pause_for_human" | "finalize";
  reason: string;
  requiredHumanInputs: string[];
  nextNode: string;
};

export type AutonomousEvaluatorCheck = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type AutonomousEvaluatorGate = {
  score: number;
  threshold: number;
  passed: boolean;
  action: "finalize" | "revise" | "human_review";
  checks: AutonomousEvaluatorCheck[];
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

export type AutonomousValidationReport = {
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

export type AutonomousConsensusIteration = {
  round: number;
  phase: string;
  consensusScore: number;
  threshold: number;
  passed: boolean;
  action: "continue" | "finalize" | "human_review";
  summary: string;
  improvements: string[];
  remainingDisagreements: string[];
};

export type AutonomousRouteDecision = {
  fromNode: "validate_result";
  toNode: "revise_discussion" | "human_review_gate" | "finalize";
  reason: AutonomousValidationReport["terminationReason"] | "below_threshold_can_revise";
  round: number;
  consensusScore: number;
  threshold: number;
};

export type AutonomousBlueprintSummary = {
  title: string;
  consensusScore: number;
  consensusPassed: boolean;
  discussionRounds: number;
  terminationReason: AutonomousValidationReport["terminationReason"];
  nextActions: string[];
  reviewWarnings: string[];
  humanReviewRequired: boolean;
};

export type AutonomousCheckpointInfo = {
  enabled: boolean;
  saver: "MemorySaver" | "SqliteSaver";
  threadId: string;
};

export type AutonomousRuntimeLimits = {
  maxConsensusRounds: number;
  recursionLimit: number;
};

export type AutonomousBlueprintRun = {
  runId: string;
  platform: AutonomousAgentPlatformRuntime;
  checkpoint: AutonomousCheckpointInfo;
  runtimeLimits: AutonomousRuntimeLimits;
  question: string;
  mode: DecisionMode;
  locale: "en" | "zh";
  agentPattern: AutonomousAgentPattern;
  intent: AutonomousIntentPlan;
  clarification: AutonomousClarificationPlan;
  goalBrief: AutonomousGoalBrief;
  trace: AutonomousAgentTraceEntry[];
  toolCalls: AutonomousToolCall[];
  reactToolSteps: AutonomousReactToolStep[];
  taskTree: AutonomousTaskNode[];
  toolPermissions: AutonomousToolPermissionDecision[];
  executorActions: AutonomousExecutorAction[];
  criticReviews: AutonomousCriticReview[];
  memoryEvents: AutonomousMemoryEvent[];
  supervisorDecisions: AutonomousSupervisorDecision[];
  providerTrace: LiveDecisionTraceEntry[];
  liveModel: AutonomousLiveModelSummary;
  consensusLoop: AutonomousConsensusIteration[];
  routeDecisions: AutonomousRouteDecision[];
  evaluatorGate: AutonomousEvaluatorGate;
  validation: AutonomousValidationReport;
  summary: AutonomousBlueprintSummary;
  result: BlueprintRoomResult;
  contextSummary?: string;
  contextCompressedAt?: number;
};

export type RunAutonomousBlueprintGraphInput = {
  question: string;
  mode: DecisionMode;
  locale: "en" | "zh";
  context: DecisionContext;
  threadId?: string;
  maxConsensusRounds?: number;
  humanReviewNote?: string;
  liveModel?: {
    requested: boolean;
    unavailableReason?: AutonomousLiveModelSummary["fallbackReason"];
    runner?: () => Promise<LiveDecisionTraceEntry[]>;
  };
};

type BlueprintToolOutput = {
  result: BlueprintRoomResult;
  toolSummary: string;
};

const decisionModeSchema = z.enum(["fast", "deep", "red_team"]);
const localeSchema = z.enum(["en", "zh"]);
const decisionContextSchema = z.object({
  productStage: z.enum(["prototype", "mvp", "growth", "scale", "enterprise"]),
  expectedScale: z.string(),
  teamProfile: z.string(),
  budgetSensitivity: z.enum(["low", "medium", "high"]),
  reliabilityRequirement: z.enum(["low", "medium", "high"]),
  securityRequirement: z.enum(["low", "medium", "high"]),
  existingConstraints: z.array(z.string()),
  candidateOptions: z.array(z.string()),
  assumptions: z.array(z.string())
});

const createBlueprintTool = tool(
  async (input): Promise<BlueprintToolOutput> => {
    const result = runBlueprintRoom({
      question: input.question,
      mode: input.mode,
      locale: input.locale,
      context: input.context
    });

    return {
      result,
      toolSummary: `${result.finalSpec.title} · consensus ${result.finalConsensusScore}/${result.consensusThreshold} · backlog ${result.finalSpec.implementationBacklog.length}`
    };
  },
  {
    name: "quorummind_create_blueprint",
    description: "Create a reviewed QuorumMind Blueprint specification with drafts, critique, consensus, and backlog.",
    schema: z.object({
      question: z.string(),
      mode: decisionModeSchema,
      locale: localeSchema,
      context: decisionContextSchema
    })
  }
);

const validateBlueprintTool = tool(
  async (input): Promise<AutonomousValidationReport> => {
    const blockingIssues = input.consensusScore >= input.threshold ? [] : ["共识分未达到阈值，需要继续复核。"];
    const reviewWarnings = [
      input.highPriorityBacklogCount === 0 ? "没有 P0 任务，可能缺少第一步执行抓手。" : "",
      input.weakEvaluationCount > 0 ? "评估矩阵存在 weak 项，需要优先补强。" : "",
      input.deferredAdoptionCount > 0 ? "仍有质询建议被延后，需要人工确认。" : ""
    ].filter(Boolean);

    const roundLimit = Math.min(input.totalRounds, input.maxConsensusRounds);
    const canRevise = blockingIssues.length > 0 && input.round < roundLimit;
    const terminationReason: AutonomousValidationReport["terminationReason"] =
      blockingIssues.length === 0
        ? "threshold_met"
        : input.round >= input.maxConsensusRounds
          ? "round_budget_exhausted"
          : "human_review_required";

    return {
      passed: blockingIssues.length === 0,
      canRevise,
      terminationReason: canRevise ? "human_review_required" : terminationReason,
      round: input.round,
      totalRounds: input.totalRounds,
      maxConsensusRounds: input.maxConsensusRounds,
      consensusScore: input.consensusScore,
      threshold: input.threshold,
      blockingIssues,
      reviewWarnings
    };
  },
  {
    name: "quorummind_validate_blueprint",
    description: "Validate whether a Blueprint run is ready to finalize or should enter human review.",
    schema: z.object({
      round: z.number(),
      totalRounds: z.number(),
      maxConsensusRounds: z.number(),
      consensusScore: z.number(),
      threshold: z.number(),
      highPriorityBacklogCount: z.number(),
      weakEvaluationCount: z.number(),
      deferredAdoptionCount: z.number()
    })
  }
);

const advanceConsensusRoundTool = tool(
  async (input): Promise<{ nextRoundIndex: number; discussionSummary: string }> => {
    const nextRoundIndex = Math.min(input.currentRoundIndex + 1, input.totalRounds - 1);
    const discussionSummary =
      nextRoundIndex === input.currentRoundIndex
        ? "没有更多共识轮次，进入人工复审判断。"
        : `继续到第 ${nextRoundIndex + 1} 轮：${input.nextRoundSummary}`;

    return {
      nextRoundIndex,
      discussionSummary
    };
  },
  {
    name: "quorummind_advance_consensus_round",
    description: "Advance the autonomous graph to the next Blueprint consensus discussion round.",
    schema: z.object({
      currentRoundIndex: z.number(),
      totalRounds: z.number(),
      nextRoundSummary: z.string()
    })
  }
);

const selectNextActionsTool = tool(
  async (input): Promise<string[]> => {
    const p0 = input.backlog
      .filter((item) => item.priority === "P0")
      .slice(0, 3)
      .map((item) => `${item.title}：${item.deliverables[0] ?? item.acceptanceCriteria[0] ?? "完成可验收交付物"}`);

    if (p0.length >= 3) {
      return p0;
    }

    const fallback = input.recommendations.slice(0, 3 - p0.length);
    return [...p0, ...fallback].slice(0, 3);
  },
  {
    name: "quorummind_select_next_actions",
    description: "Select the top three actionable next steps from Blueprint backlog and recommendations.",
    schema: z.object({
      backlog: z.array(
        z.object({
          title: z.string(),
          priority: z.enum(["P0", "P1", "P2"]),
          deliverables: z.array(z.string()),
          acceptanceCriteria: z.array(z.string())
        })
      ),
      recommendations: z.array(z.string())
    })
  }
);

const routeIntentTool = tool(
  async (input): Promise<AutonomousIntentPlan> => buildIntentPlan(input.question, input.locale),
  {
    name: "quorummind_route_intent",
    description: "Classify the user request and choose the most suitable QuorumMind agent route.",
    schema: z.object({
      question: z.string(),
      locale: localeSchema
    })
  }
);

const clarifyRequirementsTool = tool(
  async (input): Promise<AutonomousClarificationPlan> =>
    buildClarificationPlan(input.question, input.locale, input.intent),
  {
    name: "quorummind_clarify_requirements",
    description: "Identify missing request details and decide whether to continue with assumptions or ask first.",
    schema: z.object({
      question: z.string(),
      locale: localeSchema,
      intent: z.object({
        category: z.string(),
        confidence: z.number(),
        shouldClarify: z.boolean(),
        complexity: z.string()
      })
    })
  }
);

const reactToolboxTool = tool(
  async (input): Promise<AutonomousReactToolStep[]> => buildReactToolSteps(input),
  {
    name: "quorummind_bounded_react_toolbox",
    description: "Select bounded local tools for the current graph node and record thought/action/observation steps.",
    schema: z.object({
      locale: localeSchema,
      intentCategory: z.string(),
      route: z.string(),
      goal: z.string(),
      clarificationRequired: z.boolean(),
      availableTools: z.array(z.string())
    })
  }
);

const plannerAgentTool = tool(
  async (input): Promise<AutonomousTaskNode[]> => buildAutonomousTaskTree(input),
  {
    name: "quorummind_planner_agent",
    description: "Decompose the user's open-ended goal into a bounded autonomous task tree.",
    schema: z.object({
      locale: localeSchema,
      intentCategory: z.string(),
      goal: z.string(),
      question: z.string(),
      constraints: z.array(z.string()),
      successSignals: z.array(z.string())
    })
  }
);

const toolPermissionPolicyTool = tool(
  async (input): Promise<AutonomousToolPermissionDecision[]> => evaluateToolPermissions(input),
  {
    name: "quorummind_tool_permission_policy",
    description: "Classify which tools can run automatically and which require human approval.",
    schema: z.object({
      locale: localeSchema,
      tasks: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          node: z.string(),
          toolName: z.string().optional(),
          objective: z.string()
        })
      )
    })
  }
);

const executorAgentTool = tool(
  async (input): Promise<AutonomousExecutorAction[]> => executePermittedTasks(input),
  {
    name: "quorummind_executor_agent",
    description: "Execute or stage permitted bounded tasks according to the permission policy.",
    schema: z.object({
      locale: localeSchema,
      tasks: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          node: z.string(),
          toolName: z.string().optional()
        })
      ),
      permissions: z.array(
        z.object({
          toolName: z.string(),
          node: z.string(),
          category: z.enum(["read_only", "local_file_write", "external_api_call", "live_model_call", "production_operation", "paid_operation"]),
          risk: z.enum(["low", "medium", "high"]),
          decision: z.enum(["auto", "requires_human", "blocked"]),
          reason: z.string()
        })
      )
    })
  }
);

const criticAgentTool = tool(
  async (input): Promise<AutonomousCriticReview[]> => reviewAutonomousExecution(input),
  {
    name: "quorummind_critic_agent",
    description: "Review task execution, permission boundaries, and blueprint evidence before validation.",
    schema: z.object({
      locale: localeSchema,
      tasks: z.array(z.object({ id: z.string(), title: z.string(), status: z.string() })),
      executorActions: z.array(z.object({ taskId: z.string(), status: z.string(), outputSummary: z.string() })),
      permissions: z.array(z.object({ toolName: z.string(), decision: z.string(), reason: z.string() })),
      consensusScore: z.number(),
      threshold: z.number(),
      weakEvaluationCount: z.number(),
      deferredAdoptionCount: z.number()
    })
  }
);

const memoryAgentTool = tool(
  async (input): Promise<AutonomousMemoryEvent[]> => buildMemoryEvents(input),
  {
    name: "quorummind_memory_agent",
    description: "Read, summarize, and write bounded run/thread memory events for the autonomous graph.",
    schema: z.object({
      locale: localeSchema,
      runId: z.string(),
      threadId: z.string(),
      goal: z.string(),
      knowledgeInjection: z.string().default(""),
      taskCount: z.number(),
      sqliteEnabled: z.boolean()
    })
  }
);

const supervisorAgentTool = tool(
  async (input): Promise<AutonomousSupervisorDecision> => superviseAutonomousRun(input),
  {
    name: "quorummind_supervisor_agent",
    description: "Decide whether the autonomous graph should continue, pause for human input, or finalize.",
    schema: z.object({
      locale: localeSchema,
      criticReviews: z.array(z.object({ status: z.enum(["pass", "warn", "fail"]), finding: z.string(), recommendation: z.string() })),
      permissions: z.array(z.object({ decision: z.enum(["auto", "requires_human", "blocked"]), reason: z.string() })),
      consensusScore: z.number(),
      threshold: z.number(),
      maxConsensusRounds: z.number(),
      currentRound: z.number()
    })
  }
);

/** Internal sentinel used by array reducers to signal state truncation during compression.
 *  When the first element of an update array is this sentinel, the reducer clears the
 *  accumulated array and replaces it with the remaining elements. */
const QM_TRUNCATE = { __qm_truncate: true as const };

const AutonomousBlueprintAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  threadId: Annotation<string>(),
  question: Annotation<string>(),
  mode: Annotation<DecisionMode>(),
  locale: Annotation<"en" | "zh">(),
  context: Annotation<DecisionContext>(),
  humanReviewNote: Annotation<string | undefined>(),
  currentConsensusRoundIndex: Annotation<number>(),
  maxConsensusRounds: Annotation<number>(),
  intent: Annotation<AutonomousIntentPlan | undefined>(),
  clarification: Annotation<AutonomousClarificationPlan | undefined>(),
  goalBrief: Annotation<AutonomousGoalBrief | undefined>(),
  result: Annotation<BlueprintRoomResult | undefined>(),
  validation: Annotation<AutonomousValidationReport | undefined>(),
  evaluatorGate: Annotation<AutonomousEvaluatorGate | undefined>(),
  summary: Annotation<AutonomousBlueprintSummary | undefined>(),
  trace: Annotation<AutonomousAgentTraceEntry[]>({
    reducer: (left, right) => {
      const arr = right as any[];
      if (arr.length > 0 && arr[0]?.__qm_truncate === true) {
        return arr.slice(1) as AutonomousAgentTraceEntry[];
      }
      return left.concat(right);
    },
    default: () => []
  }),
  toolCalls: Annotation<AutonomousToolCall[]>({
    reducer: (left, right) => {
      const arr = right as any[];
      if (arr.length > 0 && arr[0]?.__qm_truncate === true) {
        return arr.slice(1) as AutonomousToolCall[];
      }
      return left.concat(right);
    },
    default: () => []
  }),
  reactToolSteps: Annotation<AutonomousReactToolStep[]>({
    reducer: (left, right) => {
      const arr = right as any[];
      if (arr.length > 0 && arr[0]?.__qm_truncate === true) {
        return arr.slice(1) as AutonomousReactToolStep[];
      }
      return left.concat(right);
    },
    default: () => []
  }),
  taskTree: Annotation<AutonomousTaskNode[]>({
    reducer: (left, right) => {
      const arr = right as any[];
      if (arr.length > 0 && arr[0]?.__qm_truncate === true) {
        return arr.slice(1) as AutonomousTaskNode[];
      }
      return left.concat(right);
    },
    default: () => []
  }),
  toolPermissions: Annotation<AutonomousToolPermissionDecision[]>({
    reducer: (left, right) => {
      const arr = right as any[];
      if (arr.length > 0 && arr[0]?.__qm_truncate === true) {
        return arr.slice(1) as AutonomousToolPermissionDecision[];
      }
      return left.concat(right);
    },
    default: () => []
  }),
  executorActions: Annotation<AutonomousExecutorAction[]>({
    reducer: (left, right) => {
      const arr = right as any[];
      if (arr.length > 0 && arr[0]?.__qm_truncate === true) {
        return arr.slice(1) as AutonomousExecutorAction[];
      }
      return left.concat(right);
    },
    default: () => []
  }),
  criticReviews: Annotation<AutonomousCriticReview[]>({
    reducer: (left, right) => {
      const arr = right as any[];
      if (arr.length > 0 && arr[0]?.__qm_truncate === true) {
        return arr.slice(1) as AutonomousCriticReview[];
      }
      return left.concat(right);
    },
    default: () => []
  }),
  memoryEvents: Annotation<AutonomousMemoryEvent[]>({
    reducer: (left, right) => {
      const arr = right as any[];
      if (arr.length > 0 && arr[0]?.__qm_truncate === true) {
        return arr.slice(1) as AutonomousMemoryEvent[];
      }
      return left.concat(right);
    },
    default: () => []
  }),
  supervisorDecisions: Annotation<AutonomousSupervisorDecision[]>({
    reducer: (left, right) => {
      const arr = right as any[];
      if (arr.length > 0 && arr[0]?.__qm_truncate === true) {
        return arr.slice(1) as AutonomousSupervisorDecision[];
      }
      return left.concat(right);
    },
    default: () => []
  }),
  providerTrace: Annotation<LiveDecisionTraceEntry[]>({
    reducer: (left, right) => {
      const arr = right as any[];
      if (arr.length > 0 && arr[0]?.__qm_truncate === true) {
        return arr.slice(1) as LiveDecisionTraceEntry[];
      }
      return left.concat(right);
    },
    default: () => []
  }),
  liveModel: Annotation<AutonomousLiveModelSummary | undefined>(),
  consensusLoop: Annotation<AutonomousConsensusIteration[]>({
    reducer: (left, right) => {
      const arr = right as any[];
      if (arr.length > 0 && arr[0]?.__qm_truncate === true) {
        return arr.slice(1) as AutonomousConsensusIteration[];
      }
      return left.concat(right);
    },
    default: () => []
  }),
  routeDecisions: Annotation<AutonomousRouteDecision[]>({
    reducer: (left, right) => {
      const arr = right as any[];
      if (arr.length > 0 && arr[0]?.__qm_truncate === true) {
        return arr.slice(1) as AutonomousRouteDecision[];
      }
      return left.concat(right);
    },
    default: () => []
  }),
  contextSummary: Annotation<string | undefined>(),
  contextCompressedAt: Annotation<number | undefined>()
});

type AutonomousBlueprintGraphState = typeof AutonomousBlueprintAnnotation.State;
type AutonomousBlueprintGraphUpdate = typeof AutonomousBlueprintAnnotation.Update;
const AUTONOMOUS_GRAPH_RECURSION_LIMIT = 24;
const MAX_CONSENSUS_ROUNDS_LIMIT = 8;

/** Module-level reference to the SQLite DB, set when SqliteSaver is in use. */
let sqliteDb: DatabaseSync | undefined;

function getCheckpointer() {
  const dbPath = process.env.QUORUMMIND_SQLITE_PATH;
  if (dbPath) {
    sqliteDb = new DatabaseSync(dbPath);
    return createSqliteSaver(sqliteDb);
  }
  return new MemorySaver();
}

const autonomousBlueprintCheckpointer = getCheckpointer();
const autonomousBlueprintCheckpointerKind: "MemorySaver" | "SqliteSaver" =
  autonomousBlueprintCheckpointer instanceof MemorySaver ? "MemorySaver" : "SqliteSaver";

export async function runAutonomousBlueprintGraph(input: RunAutonomousBlueprintGraphInput): Promise<AutonomousBlueprintRun> {
  const threadId = normalizeThreadId(input.threadId);
  const maxConsensusRounds = clampPositiveInteger(input.maxConsensusRounds, 1, MAX_CONSENSUS_ROUNDS_LIMIT, MAX_CONSENSUS_ROUNDS_LIMIT);
  const liveModel = input.liveModel ?? { requested: false as const, unavailableReason: "deterministic_mode" as const };
  const { liveModel: _liveModelInput, threadId: _threadIdInput, maxConsensusRounds: _maxRoundsInput, ...initialStateInput } = input;
  const autonomousBlueprintGraph = buildAutonomousBlueprintGraph({ liveModel });
  const finalState = await autonomousBlueprintGraph.invoke(
    {
      ...initialStateInput,
      runId: createRunId(),
      threadId,
      currentConsensusRoundIndex: 0,
      maxConsensusRounds,
      trace: [],
      toolCalls: [],
      reactToolSteps: [],
      taskTree: [],
      toolPermissions: [],
      executorActions: [],
      criticReviews: [],
      memoryEvents: [],
      supervisorDecisions: [],
      providerTrace: [],
      consensusLoop: [],
      routeDecisions: []
    },
    {
      configurable: {
        thread_id: threadId
      },
      recursionLimit: AUTONOMOUS_GRAPH_RECURSION_LIMIT
    }
  );

  if (!finalState.goalBrief || !finalState.result || !finalState.validation || !finalState.summary) {
    throw new Error("Autonomous Blueprint graph finished without required state.");
  }

  const finalLiveModel =
    finalState.liveModel ??
    summarizeLiveModelTrace({
      requested: liveModel.requested,
      providerTrace: [],
      fallbackReason: liveModel.requested ? liveModel.unavailableReason ?? "no_configured_providers" : "deterministic_mode"
    });

  return {
    runId: finalState.runId,
    platform: autonomousPlatformRuntime(finalLiveModel),
    checkpoint: {
      enabled: true,
      saver: autonomousBlueprintCheckpointerKind,
      threadId
    },
    runtimeLimits: {
      maxConsensusRounds,
      recursionLimit: AUTONOMOUS_GRAPH_RECURSION_LIMIT
    },
    question: finalState.question,
    mode: finalState.mode,
    locale: finalState.locale,
    agentPattern: autonomousAgentPattern(finalState.locale),
    intent: finalState.intent ?? buildIntentPlan(finalState.question, finalState.locale),
    clarification: finalState.clarification ?? buildClarificationPlan(finalState.question, finalState.locale, finalState.intent),
    goalBrief: finalState.goalBrief,
    trace: finalState.trace,
    toolCalls: finalState.toolCalls,
    reactToolSteps: finalState.reactToolSteps,
    taskTree: finalState.taskTree,
    toolPermissions: finalState.toolPermissions,
    executorActions: finalState.executorActions,
    criticReviews: finalState.criticReviews,
    memoryEvents: finalState.memoryEvents,
    supervisorDecisions: finalState.supervisorDecisions,
    providerTrace: finalState.providerTrace,
    liveModel: finalLiveModel,
    consensusLoop: finalState.consensusLoop,
    routeDecisions: finalState.routeDecisions,
    evaluatorGate: finalState.evaluatorGate ?? buildFallbackEvaluatorGate(finalState.validation, finalState.result, finalLiveModel, finalState.locale),
    validation: finalState.validation,
    summary: finalState.summary,
    result: finalState.result,
    contextSummary: finalState.contextSummary,
    contextCompressedAt: finalState.contextCompressedAt
  };
}

export function autonomousPlatformRuntime(liveModel?: AutonomousLiveModelSummary): AutonomousAgentPlatformRuntime {
  const usesLiveModel = Boolean(liveModel?.liveTraceUsable);

  return {
    orchestrator: "langgraph",
    toolLayer: "langchain-core",
    autonomyLevel: "bounded_server_graph",
    source: usesLiveModel ? "live_model_trace_with_deterministic_synthesis" : "deterministic_tools",
    checkpointing: autonomousBlueprintCheckpointerKind === "SqliteSaver" ? "sqlite_saver" : "memory_saver",
    notes: usesLiveModel
      ? [
          autonomousBlueprintCheckpointerKind === "SqliteSaver"
            ? "LangGraph 状态图编排服务端 agent 节点，并已支持有界共识循环和 SQLite 持久化 checkpointer。"
            : "LangGraph 状态图编排服务端 agent 节点，并已支持有界共识循环和内存 checkpointer。",
          "live_model_review 节点已调用真实 provider trace，并把可用模型贡献融合进 Blueprint。",
          "最终结构化蓝图仍由 QuorumMind 确定性合成器收敛，避免直接信任未校验模型长文。"
        ]
      : [
          autonomousBlueprintCheckpointerKind === "SqliteSaver"
            ? "LangGraph 状态图编排服务端 agent 节点，并已支持有界共识循环和 SQLite 持久化 checkpointer。"
            : "LangGraph 状态图编排服务端 agent 节点，并已支持有界共识循环和内存 checkpointer。",
          "本次没有可用真实 provider trace，结果来自本地确定性 Blueprint 工具。",
          "后续可把更多节点替换为真实 LLM/tool-calling agent，并把 MemorySaver 替换为持久化 checkpointer。"
        ]
  };
}

function buildAutonomousBlueprintGraph(options: {
  liveModel: NonNullable<RunAutonomousBlueprintGraphInput["liveModel"]>;
}) {
  const graph = new StateGraph(AutonomousBlueprintAnnotation)
    .addNode("route_intent", routeIntentNode)
    .addNode("understand_request", understandRequestNode(options.liveModel))
    .addNode("react_toolbox", reactToolboxNode)
    .addNode("planner_agent", plannerAgentNode)
    .addNode("memory_agent", memoryAgentNode)
    .addNode("executor_agent", executorAgentNode)
    .addNode("draft_blueprint", draftBlueprintNode)
    .addNode("cross_review", crossReviewNode)
    .addNode("critic_agent", criticAgentNode)
    .addNode("supervisor_agent", supervisorAgentNode)
    .addNode("validate_result", validateResultNode)
    .addNode("revise_discussion", reviseDiscussionNode)
    .addNode("human_review_gate", humanReviewGateNode)
    .addNode("finalize", finalizeNode)
    .addEdge(START, "route_intent")
    .addEdge("route_intent", "understand_request")
    .addEdge("understand_request", "react_toolbox")
    .addEdge("react_toolbox", "planner_agent")
    .addEdge("planner_agent", "memory_agent")
    .addEdge("memory_agent", "executor_agent")
    .addEdge("executor_agent", "draft_blueprint");

  if (options.liveModel.requested) {
    graph
      .addNode("live_model_review", liveModelReviewNode(options.liveModel))
      .addEdge("draft_blueprint", "live_model_review")
      .addEdge("live_model_review", "cross_review");
  } else {
    graph.addEdge("draft_blueprint", "cross_review");
  }

  return graph
    .addEdge("cross_review", "critic_agent")
    .addEdge("critic_agent", "supervisor_agent")
    .addEdge("supervisor_agent", "validate_result")
    .addConditionalEdges("validate_result", routeAfterValidation, {
      finalize: "finalize",
      revise_discussion: "revise_discussion",
      human_review_gate: "human_review_gate"
    })
    .addEdge("revise_discussion", "critic_agent")
    .addEdge("human_review_gate", "finalize")
    .addEdge("finalize", END)
    .compile({
      name: "quorummind-autonomous-blueprint",
      checkpointer: autonomousBlueprintCheckpointer
    });
}

async function routeIntentNode(state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> {
  const intent = await routeIntentTool.invoke({
    question: state.question,
    locale: state.locale
  });
  const clarification = await clarifyRequirementsTool.invoke({
    question: state.question,
    locale: state.locale,
    intent
  });

  return {
    intent,
    clarification,
    toolCalls: [
      {
        toolName: routeIntentTool.name,
        node: "route_intent",
        inputSummary: `${state.locale} · ${state.question.slice(0, 80)}`,
        outputSummary: `${intent.category} -> ${intent.route} · confidence ${intent.confidence}`,
        source: "langchain_tool"
      },
      {
        toolName: clarifyRequirementsTool.name,
        node: "route_intent",
        inputSummary: `${intent.category} · ${intent.complexity}`,
        outputSummary:
          clarification.required
            ? `${clarification.questions.length} clarification questions · ${clarification.strategy}`
            : state.locale === "zh"
              ? "信息足够，直接继续。"
              : "Enough context to continue.",
        source: "langchain_tool"
      }
    ],
    trace: [
      {
        node: "route_intent",
        agentId: "intent-router",
        status: clarification.required && clarification.strategy === "ask_before_running" ? "needs_review" : "complete",
        summary:
          state.locale === "zh"
            ? `已识别为${intentCategoryLabel(intent.category, "zh")}，路由到${intentRouteLabel(intent.route, "zh")}。`
            : `Classified as ${intentCategoryLabel(intent.category, "en")} and routed to ${intentRouteLabel(intent.route, "en")}.`,
        evidence: [
          `confidence ${intent.confidence}`,
          `complexity ${intent.complexity}`,
          ...intent.signals,
          ...clarification.assumptions.slice(0, 2)
        ]
      }
    ]
  };
}

async function reactToolboxNode(state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> {
  const goalBrief = state.goalBrief ?? buildGoalBrief(state);
  const intent = state.intent ?? buildIntentPlan(state.question, state.locale);
  const clarification = state.clarification ?? buildClarificationPlan(state.question, state.locale, intent);
  const availableTools = [
    plannerAgentTool.name,
    toolPermissionPolicyTool.name,
    memoryAgentTool.name,
    executorAgentTool.name,
    criticAgentTool.name,
    supervisorAgentTool.name,
    createBlueprintTool.name,
    validateBlueprintTool.name,
    advanceConsensusRoundTool.name,
    selectNextActionsTool.name
  ];
  const steps = await reactToolboxTool.invoke({
    locale: state.locale,
    intentCategory: intent.category,
    route: intent.route,
    goal: goalBrief.goal,
    clarificationRequired: clarification.required,
    availableTools
  });

  return {
    reactToolSteps: steps,
    toolCalls: [
      {
        toolName: reactToolboxTool.name,
        node: "react_toolbox",
        inputSummary: `${intent.category} · ${availableTools.length} bounded tools`,
        outputSummary:
          state.locale === "zh"
            ? `已选择 ${steps.length} 个受控 ReAct 工具步骤。`
            : `Selected ${steps.length} bounded ReAct tool steps.`,
        source: "langchain_tool"
      }
    ],
    trace: [
      {
        node: "react_toolbox",
        agentId: "bounded-react-tool-agent",
        status: "complete",
        summary:
          state.locale === "zh"
            ? "已在节点内部选择受控工具，不让模型自由无界调用外部工具。"
            : "Selected bounded node-local tools instead of unrestricted external tool use.",
        evidence: steps.map((step) => `${step.toolName}: ${step.observation}`)
      }
    ]
  };
}

async function plannerAgentNode(state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> {
  const goalBrief = state.goalBrief ?? buildGoalBrief(state);
  const intent = state.intent ?? buildIntentPlan(state.question, state.locale);
  const taskTree = await plannerAgentTool.invoke({
    locale: state.locale,
    intentCategory: intent.category,
    goal: goalBrief.goal,
    question: state.question,
    constraints: goalBrief.constraints,
    successSignals: goalBrief.successSignals
  });
  const permissions = await toolPermissionPolicyTool.invoke({
    locale: state.locale,
    tasks: taskTree.map((task) => ({
      id: task.id,
      title: task.title,
      node: task.ownerAgent,
      toolName: task.toolName,
      objective: task.objective
    }))
  });

  return {
    taskTree,
    toolPermissions: permissions,
    toolCalls: [
      {
        toolName: plannerAgentTool.name,
        node: "planner_agent",
        inputSummary: `${intent.category} · ${goalBrief.successSignals.length} success signals`,
        outputSummary:
          state.locale === "zh"
            ? `已拆解 ${taskTree.length} 个自主任务。`
            : `Decomposed ${taskTree.length} autonomous tasks.`,
        source: "langchain_tool"
      },
      {
        toolName: toolPermissionPolicyTool.name,
        node: "planner_agent",
        inputSummary: `${taskTree.length} tasks`,
        outputSummary:
          state.locale === "zh"
            ? `${permissions.filter((item) => item.decision === "auto").length} 个自动执行，${permissions.filter((item) => item.decision === "requires_human").length} 个需人工确认。`
            : `${permissions.filter((item) => item.decision === "auto").length} auto, ${permissions.filter((item) => item.decision === "requires_human").length} human-gated.`,
        source: "langchain_tool"
      }
    ],
    trace: [
      {
        node: "planner_agent",
        agentId: "planner-agent",
        status: "complete",
        summary:
          state.locale === "zh"
            ? "Planner Agent 已把用户目标拆成任务树，并为每个任务绑定可审查验收标准。"
            : "Planner Agent decomposed the user goal into a task tree with reviewable acceptance criteria.",
        evidence: taskTree.map((task) => `${task.id}: ${task.title}`)
      }
    ]
  };
}

async function memoryAgentNode(state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> {
  const goalBrief = state.goalBrief ?? buildGoalBrief(state);
  const events = await memoryAgentTool.invoke({
    locale: state.locale,
    runId: state.runId,
    threadId: state.threadId,
    goal: goalBrief.goal,
    knowledgeInjection: goalBrief.knowledgeInjection ?? "",
    taskCount: state.taskTree.length,
    sqliteEnabled: Boolean(sqliteDb)
  });
  const summary = [
    goalBrief.goal,
    ...goalBrief.constraints,
    ...goalBrief.successSignals
  ].join("\n");

  persistContextSummary(
    state.threadId,
    state.currentConsensusRoundIndex,
    "incremental",
    summary,
    estimateTokenCount(state.question),
    estimateTokenCount(summary),
    sqliteDb
  );

  return {
    memoryEvents: events,
    toolCalls: [
      {
        toolName: memoryAgentTool.name,
        node: "memory_agent",
        inputSummary: `${state.threadId} · ${state.taskTree.length} tasks`,
        outputSummary:
          state.locale === "zh"
            ? `已记录 ${events.length} 条运行/线程记忆事件。`
            : `Recorded ${events.length} run/thread memory events.`,
        source: "langchain_tool"
      }
    ],
    trace: [
      {
        node: "memory_agent",
        agentId: "memory-agent",
        status: "complete",
        summary:
          state.locale === "zh"
            ? "Memory Agent 已读取知识注入、写入线程摘要，并标记本轮可复用上下文。"
            : "Memory Agent read knowledge injection, wrote a thread summary, and marked reusable context.",
        evidence: events.map((event) => `${event.action}:${event.key}:${event.persistence}`)
      }
    ]
  };
}

async function executorAgentNode(state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> {
  const actions = await executorAgentTool.invoke({
    locale: state.locale,
    tasks: state.taskTree.map((task) => ({
      id: task.id,
      title: task.title,
      node: task.ownerAgent,
      toolName: task.toolName
    })),
    permissions: state.toolPermissions
  });

  return {
    executorActions: actions,
    toolCalls: [
      {
        toolName: executorAgentTool.name,
        node: "executor_agent",
        inputSummary: `${state.taskTree.length} tasks · ${state.toolPermissions.length} permissions`,
        outputSummary:
          state.locale === "zh"
            ? `${actions.filter((action) => action.status === "executed").length} 个任务已执行/预备，${actions.filter((action) => action.status === "requires_human").length} 个任务等待人工确认。`
            : `${actions.filter((action) => action.status === "executed").length} tasks executed/staged, ${actions.filter((action) => action.status === "requires_human").length} human-gated.`,
        source: "langchain_tool"
      }
    ],
    trace: [
      {
        node: "executor_agent",
        agentId: "executor-agent",
        status: actions.some((action) => action.status === "requires_human") ? "needs_review" : "complete",
        summary:
          state.locale === "zh"
            ? "Executor Agent 已根据权限策略执行受控本地任务，高风险动作仅做预备不自动执行。"
            : "Executor Agent ran bounded local tasks according to the permission policy and staged high-risk actions for review.",
        evidence: actions.map((action) => `${action.taskId}:${action.status}:${action.toolName}`)
      }
    ]
  };
}

function understandRequestNode(liveModel: NonNullable<RunAutonomousBlueprintGraphInput["liveModel"]>) {
  return async (state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> => {
    const goalBrief = buildGoalBrief(state);
    const knowledgeInjection = buildKnowledgeInjection(state.question, state.context);
    if (knowledgeInjection) {
      goalBrief.knowledgeInjection = knowledgeInjection;
    }
    const augmentedQuestion = knowledgeInjection
      ? `${knowledgeInjection}\n\n---\n\n${state.question}`
      : state.question;
    const baseTrace: AutonomousAgentTraceEntry = {
      node: "understand_request",
      agentId: "goal-agent",
      status: "complete",
      summary: state.locale === "zh" ? "已识别目标、约束和成功信号。" : "Identified goal, constraints, and success signals.",
      evidence: [
        goalBrief.likelyPattern,
        ...goalBrief.successSignals,
        ...(knowledgeInjection ? [`knowledge_injection: ${knowledgeInjection.length} chars`] : [])
      ]
    };

    if (!liveModel.requested || !liveModel.runner) {
      return {
        question: augmentedQuestion,
        goalBrief,
        trace: [
          liveModel.requested
            ? {
                ...baseTrace,
                evidence: [...baseTrace.evidence, liveModel.unavailableReason ?? "no_configured_providers"]
              }
            : baseTrace
        ]
      };
    }

    try {
      const providerTrace = await liveModel.runner();
      const summary = summarizeLiveModelTrace({
        requested: true,
        providerTrace,
        fallbackReason: providerTrace.length > 0 ? "no_usable_live_trace" : "no_configured_providers"
      });
      const phaseSummary = summarizeTracePhases(providerTrace);

      return {
        question: augmentedQuestion,
        goalBrief,
        providerTrace,
        liveModel: summary,
        toolCalls: [
          {
            toolName: "quorummind_live_understand_request_trace",
            node: "understand_request",
            inputSummary: `${state.mode === "fast" ? "deep" : state.mode} · ${state.locale} · ${state.question.slice(0, 80)}`,
            outputSummary: `${providerTrace.length} provider calls · ${summary.usableCalls} usable · ${phaseSummary}`,
            source: "live_model_provider"
          }
        ],
        trace: [
          {
            ...baseTrace,
            status: summary.liveTraceUsable ? "complete" : "needs_review",
            summary:
              state.locale === "zh"
                ? summary.liveTraceUsable
                  ? "已用真实 provider trace 辅助理解需求，并记录可融合的模型证据。"
                  : "已尝试真实 provider trace，但当前没有可融合的结构化模型证据。"
                : summary.liveTraceUsable
                  ? "Used live provider trace to support request understanding and captured mergeable model evidence."
                  : "Attempted live provider trace, but no mergeable structured model evidence was available.",
            evidence: [...baseTrace.evidence, `calls ${providerTrace.length}`, `usable ${summary.usableCalls}`, phaseSummary]
          }
        ]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown live model error";
      const summary = summarizeLiveModelTrace({
        requested: true,
        providerTrace: [],
        fallbackReason: "live_trace_error"
      });

      return {
        question: augmentedQuestion,
        goalBrief,
        liveModel: summary,
        trace: [
          {
            ...baseTrace,
            status: "needs_review",
            summary:
              state.locale === "zh"
                ? "真实 provider trace 在需求理解阶段调用失败，本轮继续使用确定性理解结果。"
                : "Live provider trace failed during request understanding; continuing with deterministic understanding.",
            evidence: [...baseTrace.evidence, message]
          }
        ]
      };
    }
  };
}

async function draftBlueprintNode(state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> {
  const output = await createBlueprintTool.invoke({
    question: state.question,
    mode: state.mode,
    locale: state.locale,
    context: state.context
  });

  return {
    result: output.result,
    toolCalls: [
      {
        toolName: createBlueprintTool.name,
        node: "draft_blueprint",
        inputSummary: `${state.mode} · ${state.locale} · ${state.question.slice(0, 80)}`,
        outputSummary: output.toolSummary,
        source: "langchain_tool"
      }
    ],
    trace: [
      {
        node: "draft_blueprint",
        agentId: "blueprint-orchestrator",
        status: "complete",
        summary:
          state.locale === "zh"
            ? "已通过 LangChain tool 生成结构化 Blueprint 草案。"
            : "Generated the structured Blueprint draft through a LangChain tool.",
        evidence: [output.toolSummary]
      }
    ]
  };
}

function liveModelReviewNode(liveModel: NonNullable<RunAutonomousBlueprintGraphInput["liveModel"]>) {
  return async (state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> => {
    const result = requireBlueprintResult(state);

    if (!liveModel.requested) {
      const summary = summarizeLiveModelTrace({
        requested: false,
        providerTrace: [],
        fallbackReason: "deterministic_mode"
      });

      return {
        liveModel: summary,
        trace: [
          {
            node: "live_model_review",
            agentId: "live-provider-router",
            status: "complete",
            summary: state.locale === "zh" ? "已选择快速确定性蓝图，本轮不调用真实模型。" : "Fast deterministic Blueprint selected; live models were not called.",
            evidence: [summary.fallbackReason ?? "deterministic_mode"]
          }
        ]
      };
    }

    if (!liveModel.runner) {
      const summary = summarizeLiveModelTrace({
        requested: true,
        providerTrace: [],
        fallbackReason: liveModel.unavailableReason ?? "no_configured_providers"
      });
      const permission = liveProviderPermissionDecision(state.locale, false);
      const action = liveProviderExecutorAction(state.locale, permission, false);

      return {
        liveModel: summary,
        toolPermissions: [permission],
        executorActions: [action],
        trace: [
          {
            node: "live_model_review",
            agentId: "live-provider-router",
            status: "needs_review",
            summary:
              state.locale === "zh"
                ? "请求了真实模型深度蓝图，但当前没有可用 provider，本轮回退为确定性结果。"
                : "Live deep Blueprint was requested, but no provider was available; this run fell back to deterministic output.",
            evidence: [summary.fallbackReason ?? "no_configured_providers"]
          }
        ]
      };
    }

    try {
      const providerTrace = state.providerTrace.length > 0 ? state.providerTrace : await liveModel.runner();
      const summary = summarizeLiveModelTrace({
        requested: true,
        providerTrace,
        fallbackReason: providerTrace.length > 0 ? "no_usable_live_trace" : "no_configured_providers"
      });
      const enrichedResult = summary.liveTraceUsable
        ? enrichBlueprintWithModelContributions(result, providerTrace, state.locale)
        : result;
      const phaseSummary = summarizeTracePhases(providerTrace);
      const permission = liveProviderPermissionDecision(state.locale, true);
      const action = liveProviderExecutorAction(state.locale, permission, true, providerTrace.length);

      return {
        result: enrichedResult,
        providerTrace: state.providerTrace.length > 0 ? [] : providerTrace,
        liveModel: summary,
        toolPermissions: [permission],
        executorActions: [action],
        toolCalls: [
          {
            toolName: "quorummind_live_blueprint_provider_trace",
            node: "live_model_review",
            inputSummary: `${state.mode === "fast" ? "deep" : state.mode} · ${state.locale} · ${state.question.slice(0, 80)}`,
            outputSummary: `${providerTrace.length} provider calls · ${summary.usableCalls} usable · ${phaseSummary}`,
            source: "live_model_provider"
          }
        ],
        trace: [
          {
            node: "live_model_review",
            agentId: "live-provider-router",
            status: summary.liveTraceUsable ? "complete" : "needs_review",
            summary:
              state.locale === "zh"
                ? summary.liveTraceUsable
                  ? "真实模型已完成多阶段蓝图评审，模型贡献已融合进最终蓝图。"
                  : "已尝试真实模型调用，但没有可安全融合的结构化输出，本轮保留确定性结果。"
                : summary.liveTraceUsable
                  ? "Live models completed multi-phase Blueprint review and usable contributions were merged."
                  : "Live model calls were attempted, but no safe structured output could be merged; deterministic output was kept.",
            evidence: [`calls ${providerTrace.length}`, `usable ${summary.usableCalls}`, phaseSummary]
          }
        ]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown live model error";
      const summary = summarizeLiveModelTrace({
        requested: true,
        providerTrace: [],
        fallbackReason: "live_trace_error"
      });
      const permission = liveProviderPermissionDecision(state.locale, true);
      const action = liveProviderExecutorAction(state.locale, permission, false);

      return {
        liveModel: summary,
        toolPermissions: [permission],
        executorActions: [action],
        trace: [
          {
            node: "live_model_review",
            agentId: "live-provider-router",
            status: "needs_review",
            summary:
              state.locale === "zh"
                ? "真实模型蓝图调用失败，本轮回退为确定性结果。"
                : "Live Blueprint model call failed; this run fell back to deterministic output.",
            evidence: [message]
          }
        ]
      };
    }
  };
}

function crossReviewNode(state: AutonomousBlueprintGraphState): AutonomousBlueprintGraphUpdate {
  const result = requireBlueprintResult(state);

  // ── Context compression check ──────────────────────────────
  const compression = compressContext(state);
  const didCompress = compression.didCompress && !!compression.compressedSlice;
  const slice = compression.compressedSlice;

  // ── Node-level trace and tool calls ────────────────────────
  const deferred = result.finalSpec.adoptionLedger.filter((item) => item.adoptionStatus === "deferred");
  const watchItems = result.finalSpec.evaluationMatrix.filter((item) => item.status !== "strong");
  const liveCritiques = state.providerTrace.filter(
    (entry) =>
      entry.phase === "critique" &&
      entry.status === "ok" &&
      entry.jsonParsed &&
      (entry.validationStatus === "valid" || entry.validationStatus === "repaired")
  );
  const evidence = [
    `${result.critiques.length} critiques`,
    `${result.revisions.length} revisions`,
    `${watchItems.length} watch/weak evaluation items`,
    `${deferred.length} deferred critique suggestions`,
    ...(liveCritiques.length > 0 ? [`${liveCritiques.length} live critique traces`] : [])
  ];

  const nodeTraceEntry: AutonomousAgentTraceEntry = {
    node: "cross_review",
    agentId: "quality-reviewer",
    status: "complete",
    summary:
      state.locale === "zh"
        ? "已汇总互评、修订和仍需关注的分歧。"
        : "Summarized critique, revision, and remaining disagreement signals.",
    evidence
  };

  const nodeToolCalls: AutonomousToolCall[] =
    liveCritiques.length > 0
      ? [
          {
            toolName: "quorummind_live_cross_review_trace",
            node: "cross_review",
            inputSummary: `${liveCritiques.length} usable live critique entries`,
            outputSummary:
              state.locale === "zh"
                ? "真实模型质询证据已纳入交叉评审。"
                : "Live critique evidence was included in cross-review.",
            source: "live_model_provider"
          }
        ]
      : [];

  // ── Build return update ────────────────────────────────────
  if (didCompress && slice) {
    // Truncate accumulated arrays to tail + append current node entries
    const assembled = assembleCompressedContext(
      state.goalBrief?.goal ?? "",
      state.goalBrief?.knowledgeInjection ?? "",
      slice.contextSummary,
      extractTailMessages(slice)
    );

    logPressure(state.runId, compression.fillRatio, "compressed", sqliteDb);
    persistContextSummary(
      state.runId,
      state.currentConsensusRoundIndex,
      "consolidated",
      compression.summary ?? "",
      Math.ceil(compression.fillRatio * DEFAULT_MAX_TOKENS),
      estimateTokenCount(assembled),
      sqliteDb
    );

    return {
      contextSummary: assembled,
      contextCompressedAt: state.currentConsensusRoundIndex,
      trace: [QM_TRUNCATE as any, ...slice.trace, nodeTraceEntry],
      toolCalls: [QM_TRUNCATE as any, ...slice.toolCalls, ...nodeToolCalls],
      consensusLoop: [QM_TRUNCATE as any, ...slice.consensusLoop],
      providerTrace: [QM_TRUNCATE as any, ...slice.providerTrace]
    };
  }

  return {
    trace: [nodeTraceEntry],
    toolCalls: nodeToolCalls
  };
}

async function criticAgentNode(state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> {
  const result = requireBlueprintResult(state);
  const roundIndex = Math.min(state.currentConsensusRoundIndex, result.consensusRounds.length - 1);
  const currentRound = result.consensusRounds[roundIndex];
  const reviews = await criticAgentTool.invoke({
    locale: state.locale,
    tasks: state.taskTree.map((task) => ({ id: task.id, title: task.title, status: task.status })),
    executorActions: state.executorActions.map((action) => ({
      taskId: action.taskId,
      status: action.status,
      outputSummary: action.outputSummary
    })),
    permissions: state.toolPermissions.map((permission) => ({
      toolName: permission.toolName,
      decision: permission.decision,
      reason: permission.reason
    })),
    consensusScore: currentRound.consensusScore,
    threshold: result.consensusThreshold,
    weakEvaluationCount: result.finalSpec.evaluationMatrix.filter((item) => item.status === "weak").length,
    deferredAdoptionCount: result.finalSpec.adoptionLedger.filter((item) => item.adoptionStatus === "deferred").length
  });

  return {
    criticReviews: reviews,
    toolCalls: [
      {
        toolName: criticAgentTool.name,
        node: "critic_agent",
        inputSummary: `${state.taskTree.length} tasks · consensus ${currentRound.consensusScore}/${result.consensusThreshold}`,
        outputSummary:
          state.locale === "zh"
            ? `${reviews.filter((review) => review.status === "pass").length} 通过，${reviews.filter((review) => review.status !== "pass").length} 个关注项。`
            : `${reviews.filter((review) => review.status === "pass").length} pass, ${reviews.filter((review) => review.status !== "pass").length} review items.`,
        source: "langchain_tool"
      }
    ],
    trace: [
      {
        node: "critic_agent",
        agentId: "critic-agent",
        status: reviews.some((review) => review.status === "fail") ? "needs_review" : "complete",
        summary:
          state.locale === "zh"
            ? "Critic Agent 已检查任务执行、权限边界、共识分和蓝图弱项。"
            : "Critic Agent reviewed task execution, permission boundaries, consensus score, and Blueprint weak spots.",
        evidence: reviews.map((review) => `${review.targetTaskId}:${review.status}:${review.finding}`)
      }
    ]
  };
}

async function supervisorAgentNode(state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> {
  const result = requireBlueprintResult(state);
  const roundIndex = Math.min(state.currentConsensusRoundIndex, result.consensusRounds.length - 1);
  const currentRound = result.consensusRounds[roundIndex];
  const decision = await supervisorAgentTool.invoke({
    locale: state.locale,
    criticReviews: state.criticReviews.map((review) => ({
      status: review.status,
      finding: review.finding,
      recommendation: review.recommendation
    })),
    permissions: state.toolPermissions.map((permission) => ({
      decision: permission.decision,
      reason: permission.reason
    })),
    consensusScore: currentRound.consensusScore,
    threshold: result.consensusThreshold,
    maxConsensusRounds: state.maxConsensusRounds,
    currentRound: currentRound.round
  });

  return {
    supervisorDecisions: [decision],
    toolCalls: [
      {
        toolName: supervisorAgentTool.name,
        node: "supervisor_agent",
        inputSummary: `${state.criticReviews.length} critic reviews · round ${currentRound.round}`,
        outputSummary: `${decision.decision}: ${decision.reason}`,
        source: "langchain_tool"
      }
    ],
    trace: [
      {
        node: "supervisor_agent",
        agentId: "supervisor-agent",
        status: decision.decision === "pause_for_human" ? "needs_review" : "complete",
        summary:
          state.locale === "zh"
            ? `Supervisor Agent 决定${supervisorDecisionLabel(decision.decision, "zh")}，下一步进入 ${decision.nextNode}。`
            : `Supervisor Agent decided to ${supervisorDecisionLabel(decision.decision, "en")} and route toward ${decision.nextNode}.`,
        evidence: [decision.reason, ...decision.requiredHumanInputs]
      }
    ]
  };
}

async function validateResultNode(state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> {
  const result = requireBlueprintResult(state);

  // ── Context compression check ──────────────────────────────
  const compression = compressContext(state);
  const didCompress = compression.didCompress && !!compression.compressedSlice;
  const slice = compression.compressedSlice;

  // ── Validation logic ───────────────────────────────────────
  const roundIndex = Math.min(state.currentConsensusRoundIndex, result.consensusRounds.length - 1);
  const currentRound = result.consensusRounds[roundIndex];
  const totalRounds = result.consensusRounds.length;
  let validation = await validateBlueprintTool.invoke({
    round: currentRound.round,
    totalRounds,
    maxConsensusRounds: state.maxConsensusRounds,
    consensusScore: currentRound.consensusScore,
    threshold: result.consensusThreshold,
    highPriorityBacklogCount: result.finalSpec.implementationBacklog.filter((item) => item.priority === "P0").length,
    weakEvaluationCount: result.finalSpec.evaluationMatrix.filter((item) => item.status === "weak").length,
    deferredAdoptionCount: result.finalSpec.adoptionLedger.filter((item) => item.adoptionStatus === "deferred").length
  });
  const latestSupervisorDecision = state.supervisorDecisions.at(-1);

  if (latestSupervisorDecision?.decision === "pause_for_human") {
    validation = {
      ...validation,
      passed: false,
      canRevise: false,
      terminationReason:
        validation.terminationReason === "round_budget_exhausted" ? "round_budget_exhausted" : "human_review_required",
      blockingIssues: [...validation.blockingIssues, latestSupervisorDecision.reason],
      reviewWarnings: [...validation.reviewWarnings, ...latestSupervisorDecision.requiredHumanInputs]
    };
  }
  const action: AutonomousConsensusIteration["action"] = validation.passed
    ? "finalize"
    : validation.canRevise
      ? "continue"
      : "human_review";
  const evaluatorGate = buildEvaluatorGate({
    validation,
    result,
    liveModel: state.liveModel,
    action,
    locale: state.locale
  });
  const toNode: AutonomousRouteDecision["toNode"] =
    action === "finalize" ? "finalize" : action === "continue" ? "revise_discussion" : "human_review_gate";
  const routeReason: AutonomousRouteDecision["reason"] =
    action === "continue" ? "below_threshold_can_revise" : validation.terminationReason;

  // ── Node-level entries ─────────────────────────────────────
  const nodeConsensusEntry: AutonomousConsensusIteration = {
    round: currentRound.round,
    phase: currentRound.phase,
    consensusScore: currentRound.consensusScore,
    threshold: result.consensusThreshold,
    passed: validation.passed,
    action,
    summary: currentRound.summary,
    improvements: currentRound.improvements,
    remainingDisagreements: currentRound.remainingDisagreements
  };

  const nodeRouteEntry: AutonomousRouteDecision = {
    fromNode: "validate_result",
    toNode,
    reason: routeReason,
    round: currentRound.round,
    consensusScore: currentRound.consensusScore,
    threshold: result.consensusThreshold
  };

  const nodeToolCall: AutonomousToolCall = {
    toolName: validateBlueprintTool.name,
    node: "validate_result",
    inputSummary: `round ${currentRound.round}/${totalRounds} · consensus ${currentRound.consensusScore}/${result.consensusThreshold}`,
    outputSummary: validation.passed ? "passed" : `${validation.blockingIssues.join(" / ")} · ${action}`,
    source: "langchain_tool"
  };

  const nodeTraceEntry: AutonomousAgentTraceEntry = {
    node: "validate_result",
    agentId: "consistency-auditor",
    status: validation.passed ? "complete" : "needs_review",
    summary:
      state.locale === "zh"
        ? `第 ${currentRound.round} 轮验证${validation.passed ? "通过" : validation.canRevise ? "未达阈值，继续讨论" : "需要人工复审"}。`
        : `Round ${currentRound.round} validation ${
            validation.passed ? "passed" : validation.canRevise ? "continues discussion" : "requires human review"
          }.`,
    evidence: [
      `consensus ${validation.consensusScore}/${validation.threshold}`,
      `evaluator_gate ${evaluatorGate.score}/${evaluatorGate.threshold}`,
      ...validation.blockingIssues,
      ...validation.reviewWarnings
    ]
  };

  // ── Build return update ────────────────────────────────────
  if (didCompress && slice) {
    const assembled = assembleCompressedContext(
      state.goalBrief?.goal ?? "",
      state.goalBrief?.knowledgeInjection ?? "",
      slice.contextSummary,
      extractTailMessages(slice)
    );

    logPressure(state.runId, compression.fillRatio, "compressed", sqliteDb);
    persistContextSummary(
      state.runId,
      state.currentConsensusRoundIndex,
      "incremental",
      compression.summary ?? "",
      Math.ceil(compression.fillRatio * DEFAULT_MAX_TOKENS),
      estimateTokenCount(assembled),
      sqliteDb
    );

    return {
      contextSummary: assembled,
      contextCompressedAt: state.currentConsensusRoundIndex,
      validation,
      evaluatorGate,
      trace: [QM_TRUNCATE as any, ...slice.trace, nodeTraceEntry],
      toolCalls: [QM_TRUNCATE as any, ...slice.toolCalls, nodeToolCall],
      consensusLoop: [QM_TRUNCATE as any, ...slice.consensusLoop, nodeConsensusEntry],
      providerTrace: [QM_TRUNCATE as any, ...slice.providerTrace],
      routeDecisions: [QM_TRUNCATE as any, ...(state.routeDecisions ?? []).slice(-2), nodeRouteEntry]
    };
  }

  return {
    validation,
    evaluatorGate,
    consensusLoop: [nodeConsensusEntry],
    routeDecisions: [nodeRouteEntry],
    toolCalls: [nodeToolCall],
    trace: [nodeTraceEntry]
  };
}

function routeAfterValidation(state: AutonomousBlueprintGraphState): "finalize" | "revise_discussion" | "human_review_gate" {
  if (state.validation?.passed) {
    return "finalize";
  }

  return state.validation?.canRevise ? "revise_discussion" : "human_review_gate";
}

async function reviseDiscussionNode(state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> {
  const result = requireBlueprintResult(state);
  const nextRound = result.consensusRounds[Math.min(state.currentConsensusRoundIndex + 1, result.consensusRounds.length - 1)];
  const liveRevisions = state.providerTrace.filter(
    (entry) =>
      entry.phase === "revision" &&
      entry.status === "ok" &&
      entry.jsonParsed &&
      (entry.validationStatus === "valid" || entry.validationStatus === "repaired")
  );
  const output = await advanceConsensusRoundTool.invoke({
    currentRoundIndex: state.currentConsensusRoundIndex,
    totalRounds: result.consensusRounds.length,
    nextRoundSummary: nextRound.summary
  });

  return {
    currentConsensusRoundIndex: output.nextRoundIndex,
    toolCalls: [
      {
        toolName: advanceConsensusRoundTool.name,
        node: "revise_discussion",
        inputSummary: `round ${state.currentConsensusRoundIndex + 1} -> ${output.nextRoundIndex + 1}`,
        outputSummary: output.discussionSummary,
        source: "langchain_tool"
      },
      ...(liveRevisions.length > 0
        ? [
            {
              toolName: "quorummind_live_revision_trace",
              node: "revise_discussion",
              inputSummary: `${liveRevisions.length} usable live revision entries`,
              outputSummary:
                state.locale === "zh" ? "真实模型修订证据已纳入本轮继续讨论。" : "Live revision evidence was included in this discussion round.",
              source: "live_model_provider" as const
            }
          ]
        : [])
    ],
    trace: [
      {
        node: "revise_discussion",
        agentId: "revision-coordinator",
        status: "complete",
        summary:
          state.locale === "zh"
            ? `共识未达 80%，进入第 ${output.nextRoundIndex + 1} 轮修订讨论。`
            : `Consensus is below 80%, advancing to revision round ${output.nextRoundIndex + 1}.`,
        evidence: [output.discussionSummary, ...nextRound.improvements, ...nextRound.remainingDisagreements]
      }
    ]
  };
}

function humanReviewGateNode(state: AutonomousBlueprintGraphState): AutonomousBlueprintGraphUpdate {
  const validation = requireValidation(state);
  const humanReviewNote = typeof state.humanReviewNote === "string" && state.humanReviewNote.trim() ? state.humanReviewNote.trim() : undefined;

  return {
    humanReviewNote,
    trace: [
      {
        node: "human_review_gate",
        agentId: "human-review-gate",
        status: humanReviewNote ? "complete" : "needs_review",
        summary:
          state.locale === "zh"
            ? humanReviewNote
              ? `人工复审已记录: ${humanReviewNote.slice(0, 100)}`
              : "共识未达阈值，已生成可复制的人工复审包。"
            : humanReviewNote
              ? `Human review recorded: ${humanReviewNote.slice(0, 100)}`
              : "Consensus stayed below threshold; a human review package was generated.",
        evidence: [
          ...validation.blockingIssues,
          ...(humanReviewNote ? [humanReviewNote] : [])
        ]
      }
    ]
  };
}

async function finalizeNode(state: AutonomousBlueprintGraphState): Promise<AutonomousBlueprintGraphUpdate> {
  const result = requireBlueprintResult(state);
  const validation = requireValidation(state);
  const nextActions = await selectNextActionsTool.invoke({
    backlog: result.finalSpec.implementationBacklog,
    recommendations: result.finalSpec.detailedRecommendations.map((item) => item.title)
  });
  const summary: AutonomousBlueprintSummary = {
    title: result.finalSpec.title,
    consensusScore: validation.consensusScore,
    consensusPassed: validation.passed,
    discussionRounds: validation.round,
    terminationReason: validation.terminationReason,
    nextActions,
    reviewWarnings: validation.reviewWarnings,
    humanReviewRequired: !validation.passed
  };

  return {
    summary,
    toolCalls: [
      {
        toolName: selectNextActionsTool.name,
        node: "finalize",
        inputSummary: `${result.finalSpec.implementationBacklog.length} backlog items`,
        outputSummary: nextActions.join(" / "),
        source: "langchain_tool"
      }
    ],
    trace: [
      {
        node: "finalize",
        agentId: "delivery-planner",
        status: validation.passed ? "complete" : "needs_review",
        summary:
          state.locale === "zh"
            ? "已生成 autonomous run 摘要、下一步行动和最终蓝图。"
            : "Generated the autonomous run summary, next actions, and final Blueprint.",
        evidence: nextActions
      }
    ]
  };
}

function buildAutonomousTaskTree(input: {
  locale: "en" | "zh";
  intentCategory: string;
  goal: string;
  question: string;
  constraints: string[];
  successSignals: string[];
}): AutonomousTaskNode[] {
  const zh = input.locale === "zh";
  const task = (
    id: string,
    title: string,
    ownerAgent: AutonomousTaskNode["ownerAgent"],
    objective: string,
    dependencies: string[],
    toolName: string,
    acceptanceCriteria: string[]
  ): AutonomousTaskNode => ({
    id,
    title,
    ownerAgent,
    objective,
    dependencies,
    status: dependencies.length === 0 ? "ready" : "pending",
    toolName,
    acceptanceCriteria
  });

  const tasks: AutonomousTaskNode[] = [
    task(
      "task-plan-goal",
      zh ? "拆解用户目标与成功标准" : "Decompose goal and success criteria",
      "planner_agent",
      input.goal,
      [],
      plannerAgentTool.name,
      zh ? ["形成任务树", "保留约束", "标记验收标准"] : ["task tree exists", "constraints preserved", "acceptance criteria attached"]
    ),
    task(
      "task-memory-context",
      zh ? "读取并写入线程记忆" : "Read and write thread memory",
      "memory_agent",
      zh ? "把本轮目标、约束和知识注入写入可复用上下文。" : "Persist reusable goal, constraints, and knowledge context for this thread.",
      ["task-plan-goal"],
      memoryAgentTool.name,
      zh ? ["记录 threadId", "写入摘要", "标记知识注入来源"] : ["threadId recorded", "summary written", "knowledge source marked"]
    ),
    task(
      "task-execute-blueprint",
      zh ? "执行受控蓝图生成" : "Execute bounded blueprint generation",
      "executor_agent",
      zh ? "只调用权限允许的本地工具生成结构化蓝图。" : "Call only permitted local tools to generate a structured Blueprint.",
      ["task-memory-context"],
      createBlueprintTool.name,
      zh ? ["生成 workflow", "生成 Schema", "生成 backlog"] : ["workflow generated", "schemas generated", "backlog generated"]
    ),
    task(
      "task-critic-review",
      zh ? "检查结果与权限边界" : "Review output and permission boundaries",
      "critic_agent",
      zh ? "检查共识、弱项、延后采纳和是否越权。" : "Check consensus, weak items, deferred adoption, and permission boundaries.",
      ["task-execute-blueprint"],
      criticAgentTool.name,
      zh ? ["列出通过项", "列出关注项", "提出修正建议"] : ["passes listed", "watch items listed", "recommendations produced"]
    ),
    task(
      "task-supervise-route",
      zh ? "决定继续、暂停或收敛" : "Decide continue, pause, or finalize",
      "supervisor_agent",
      zh ? "根据 Critic 结果、权限和轮次预算决定下一步。" : "Use Critic results, permissions, and round budget to choose the next step.",
      ["task-critic-review"],
      supervisorAgentTool.name,
      zh ? ["给出路由原因", "列出人工输入", "保留预算信息"] : ["route reason recorded", "human inputs listed", "budget retained"]
    ),
    task(
      "task-finalize-delivery",
      zh ? "选择最终行动与交付物" : "Select final actions and deliverables",
      "executor_agent",
      zh ? "在达到阈值或进入复审后，输出下一步行动和最终蓝图。" : "Produce next actions and the final Blueprint after threshold or review routing.",
      ["task-supervise-route"],
      selectNextActionsTool.name,
      zh ? ["输出 3 个下一步", "保留终止原因", "可导出"] : ["three next actions", "termination reason retained", "export-ready"]
    )
  ];

  if (matchesAny(input.question.toLowerCase(), ["自动部署", "生产发布", "删除", "扣费", "发邮件", "send email", "deploy", "delete", "charge"])) {
    tasks.splice(
      5,
      0,
      task(
        "task-high-risk-external-action",
        zh ? "隔离高风险外部动作" : "Isolate high-risk external action",
        "supervisor_agent",
        zh ? "用户请求包含可能改变外部系统或不可逆操作的动作，必须进入权限审查。" : "The request includes actions that may change external systems or be irreversible and must enter permission review.",
        ["task-critic-review"],
        "external_write_or_deploy",
        zh ? ["默认不自动执行", "要求人工确认", "保留审计原因"] : ["not auto-executed by default", "human approval required", "audit reason retained"]
      )
    );
  }

  return tasks;
}

function evaluateToolPermissions(input: {
  locale: "en" | "zh";
  tasks: Array<{ id: string; title: string; node: string; toolName?: string; objective: string }>;
}): AutonomousToolPermissionDecision[] {
  const zh = input.locale === "zh";
  return input.tasks.map((task) => {
    const toolName = task.toolName ?? "unknown_tool";
    const text = `${toolName} ${task.title} ${task.objective}`.toLowerCase();
    const category = classifyToolPermissionCategory(text, toolName);
    const userFacingLocalWrite = category === "local_file_write" && !toolName.includes("memory_agent");

    if (category === "production_operation" || category === "paid_operation") {
      return {
        toolName,
        node: task.node,
        category,
        risk: "high",
        decision: "blocked",
        reason:
          category === "paid_operation"
            ? zh
              ? "该动作可能产生付费或扣费影响，默认禁止自动执行。"
              : "This action may create paid usage or charges, so it is blocked by default."
            : zh
              ? "该动作可能改变生产系统或产生不可逆影响，默认禁止自动执行。"
              : "This action may change production systems or cause irreversible effects, so it is blocked by default."
      };
    }

    if (category === "live_model_call" || category === "external_api_call" || userFacingLocalWrite) {
      return {
        toolName,
        node: task.node,
        category,
        risk: "medium",
        decision: "requires_human",
        reason:
          category === "live_model_call"
            ? zh
              ? "该动作会调用真实模型 provider，可能产生延迟和成本，执行前需要人工确认。"
              : "This action calls live model providers and may create latency or cost, so it requires human approval."
            : category === "external_api_call"
              ? zh
                ? "该动作会调用外部 API 或发送外部消息，执行前需要人工确认。"
                : "This action calls an external API or sends an external message, so it requires human approval."
              : zh
                ? "该动作会写入本地文件或导出结果，执行前需要人工确认。"
                : "This action writes local files or exports results, so it requires human approval."
      };
    }

    return {
      toolName,
      node: task.node,
      category,
      risk: "low",
      decision: "auto",
      reason:
        category === "local_file_write"
          ? zh
            ? "该动作只写入受控的本地 checkpoint/记忆状态，可以自动执行。"
            : "This action writes only bounded local checkpoint or memory state, so it can run automatically."
          : zh
            ? "该动作限制在只读或本地确定性工具内，可以自动执行。"
            : "This action stays inside read-only or local deterministic tools, so it can run automatically."
    };
  });
}

function classifyToolPermissionCategory(
  text: string,
  toolName: string
): AutonomousToolPermissionDecision["category"] {
  if (matchesAny(text, ["charge", "payment", "paid", "billing", "扣费", "付费", "计费"])) {
    return "paid_operation";
  }

  if (matchesAny(text, ["deploy", "delete", "production", "external_write", "生产发布", "生产", "删除", "不可逆"])) {
    return "production_operation";
  }

  if (matchesAny(text, ["live", "provider", "llm", "model", "真实模型", "模型调用"])) {
    return "live_model_call";
  }

  if (matchesAny(text, ["api", "webhook", "send_email", "email", "外部 api", "发邮件", "通知客户"])) {
    return "external_api_call";
  }

  if (matchesAny(text, ["pdf", "export", "sqlite", "durable", "write", "checkpoint", "导出", "写入", "持久化"])) {
    return "local_file_write";
  }

  if (toolName.includes("memory_agent")) {
    return "local_file_write";
  }

  return "read_only";
}

function executePermittedTasks(input: {
  locale: "en" | "zh";
  tasks: Array<{ id: string; title: string; node: string; toolName?: string }>;
  permissions: AutonomousToolPermissionDecision[];
}): AutonomousExecutorAction[] {
  const zh = input.locale === "zh";
  return input.tasks.map((task) => {
    const toolName = task.toolName ?? "unknown_tool";
    const permission = input.permissions.find((item) => item.toolName === toolName && item.node === task.node)?.decision ?? "requires_human";

    if (permission === "blocked") {
      return {
        taskId: task.id,
        node: task.node,
        toolName,
        permission,
        status: "skipped",
        outputSummary: zh ? "权限策略阻止执行，等待用户调整或人工操作。" : "Permission policy blocked execution; waiting for user adjustment or manual operation."
      };
    }

    if (permission === "requires_human") {
      return {
        taskId: task.id,
        node: task.node,
        toolName,
        permission,
        status: "requires_human",
        outputSummary: zh ? "已生成执行计划，但需要人工确认后才可调用。" : "Execution plan prepared, but human approval is required before calling the tool."
      };
    }

    return {
      taskId: task.id,
      node: task.node,
      toolName,
      permission,
      status: "executed",
      outputSummary: zh ? "已执行或预备本地受控步骤，结果会进入后续蓝图/验证节点。" : "Executed or staged the bounded local step; output flows into Blueprint/validation nodes."
    };
  });
}

function liveProviderPermissionDecision(locale: "en" | "zh", userPreapproved: boolean): AutonomousToolPermissionDecision {
  const zh = locale === "zh";

  return {
    toolName: "quorummind_live_blueprint_provider_trace",
    node: "live_model_review",
    category: "live_model_call",
    risk: "medium",
    decision: userPreapproved ? "auto" : "requires_human",
    reason: userPreapproved
      ? zh
        ? "用户已选择真实模型深度蓝图，本次 provider 调用视为已授权；仍受阶段预算、超时和 schema 质量门约束。"
        : "The user selected live deep Blueprint, so this provider call is pre-approved for this run; it remains bounded by phase budget, timeout, and schema gates."
      : zh
        ? "请求了真实模型深度蓝图，但当前没有可用 provider；需要先完成人工配置确认。"
        : "Live deep Blueprint was requested but no provider is available; human configuration approval is required first."
  };
}

function liveProviderExecutorAction(
  locale: "en" | "zh",
  permission: AutonomousToolPermissionDecision,
  executed: boolean,
  providerCalls = 0
): AutonomousExecutorAction {
  const zh = locale === "zh";

  return {
    taskId: "task-live-model-review",
    node: "live_model_review",
    toolName: permission.toolName,
    permission: permission.decision,
    status: executed && permission.decision === "auto" ? "executed" : "requires_human",
    outputSummary:
      executed && permission.decision === "auto"
        ? zh
          ? `已在用户授权的 live 模式下执行真实 provider 评审，共 ${providerCalls} 次调用。`
          : `Executed live provider review under user-approved live mode with ${providerCalls} calls.`
        : zh
          ? "真实 provider 评审未执行，等待人工配置或确认。"
          : "Live provider review did not run and is waiting for human configuration or approval."
  };
}

function reviewAutonomousExecution(input: {
  locale: "en" | "zh";
  tasks: Array<{ id: string; title: string; status: string }>;
  executorActions: Array<{ taskId: string; status: string; outputSummary: string }>;
  permissions: Array<{ toolName: string; decision: string; reason: string }>;
  consensusScore: number;
  threshold: number;
  weakEvaluationCount: number;
  deferredAdoptionCount: number;
}): AutonomousCriticReview[] {
  const zh = input.locale === "zh";
  const reviews: AutonomousCriticReview[] = [];
  const taskCount = input.tasks.length;
  const executedCount = input.executorActions.filter((action) => action.status === "executed").length;
  const humanGatedCount = input.executorActions.filter((action) => action.status === "requires_human").length;
  const blockedCount = input.permissions.filter((permission) => permission.decision === "blocked").length;

  reviews.push({
    targetTaskId: "task-plan-goal",
    status: taskCount >= 5 ? "pass" : "fail",
    finding: zh ? `任务树包含 ${taskCount} 个任务。` : `Task tree contains ${taskCount} tasks.`,
    recommendation: zh ? "保持任务、工具、验收标准可追踪。" : "Keep tasks, tools, and acceptance criteria traceable."
  });

  reviews.push({
    targetTaskId: "task-execute-blueprint",
    status: blockedCount > 0 ? "fail" : humanGatedCount > 0 ? "warn" : "pass",
    finding: zh ? `${executedCount} 个自动任务，${humanGatedCount} 个需人工确认，${blockedCount} 个被阻止。` : `${executedCount} auto tasks, ${humanGatedCount} human-gated, ${blockedCount} blocked.`,
    recommendation: zh ? "高风险动作必须继续保留人工确认，不要静默执行。" : "Keep human approval for high-risk actions; never execute them silently."
  });

  reviews.push({
    targetTaskId: "task-supervise-route",
    status: input.consensusScore >= input.threshold ? "pass" : "warn",
    finding: zh ? `当前共识 ${input.consensusScore}/${input.threshold}。` : `Current consensus is ${input.consensusScore}/${input.threshold}.`,
    recommendation: zh ? "低于阈值时继续修订或进入人工复审。" : "Continue revision or enter human review when below threshold."
  });

  if (input.weakEvaluationCount > 0 || input.deferredAdoptionCount > 0) {
    reviews.push({
      targetTaskId: "task-critic-review",
      status: "warn",
      finding:
        zh
          ? `${input.weakEvaluationCount} 个 weak 评估项，${input.deferredAdoptionCount} 个延后采纳项。`
          : `${input.weakEvaluationCount} weak evaluation items and ${input.deferredAdoptionCount} deferred adoption items.`,
      recommendation: zh ? "把 weak/deferred 项纳入下一轮修订或人工复审包。" : "Carry weak/deferred items into the next revision or human review package."
    });
  }

  return reviews;
}

function buildMemoryEvents(input: {
  locale: "en" | "zh";
  runId: string;
  threadId: string;
  goal: string;
  knowledgeInjection: string;
  taskCount: number;
  sqliteEnabled: boolean;
}): AutonomousMemoryEvent[] {
  const zh = input.locale === "zh";
  const events: AutonomousMemoryEvent[] = [
    {
      scope: "thread",
      action: "summarize",
      key: input.threadId,
      persistence: input.sqliteEnabled ? "sqlite" : "memory",
      detail:
        zh
          ? `线程摘要包含目标、约束和 ${input.taskCount} 个任务。`
          : `Thread summary contains the goal, constraints, and ${input.taskCount} tasks.`
    },
    {
      scope: "thread",
      action: "summarize",
      key: "user_preference_summary",
      persistence: input.sqliteEnabled ? "sqlite" : "memory",
      detail: summarizeUserPreferences(input.goal, zh)
    },
    {
      scope: "durable",
      action: "profile",
      key: "project_profile",
      persistence: input.sqliteEnabled ? "sqlite" : "memory",
      detail: summarizeProjectProfile(input.goal, input.knowledgeInjection, zh)
    },
    {
      scope: "thread",
      action: "compare",
      key: "last_vs_current_diff",
      persistence: input.sqliteEnabled ? "sqlite" : "memory",
      detail: zh
        ? "已写入本轮方案差异锚点；同一 thread 后续运行会优先对比目标、风险、工具权限和交付路线变化。"
        : "Stored this run as a comparison anchor; later runs on the same thread can compare goal, risk, tool permission, and delivery-plan changes."
    },
    {
      scope: "durable",
      action: "backlog",
      key: "failure_sample_backlog",
      persistence: input.sqliteEnabled ? "sqlite" : "memory",
      detail: zh
        ? "已准备失败样本回流入口；schema invalid、fallback、人工复审和权限阻断样本会进入后续 AgentEval/Prompt 改进队列。"
        : "Prepared a failure-sample backlog; schema invalid, fallback, human-review, and blocked-permission cases can feed later AgentEval and prompt-improvement queues."
    },
    {
      scope: "run",
      action: "write",
      key: input.runId,
      persistence: "memory",
      detail: zh ? "本轮运行状态已写入 LangGraph checkpoint。" : "Run state was written into the LangGraph checkpoint."
    }
  ];

  if (input.knowledgeInjection.trim()) {
    events.unshift({
      scope: "durable",
      action: "read",
      key: "knowledge_injection",
      persistence: "knowledge_index",
      detail:
        zh
          ? `读取到 ${input.knowledgeInjection.length} 字符的项目记忆注入。`
          : `Read ${input.knowledgeInjection.length} characters of project memory injection.`
    });
  }

  return events;
}

function summarizeUserPreferences(goal: string, zh: boolean): string {
  const wantsChinese = /中文|Chinese|zh/i.test(goal);
  const wantsAuditability = /审查|可追溯|复审|评估|audit|trace|review/i.test(goal);
  const wantsDetail = /详细|完整|需求书|蓝图|方案|backlog|schema/i.test(goal);
  const wantsSpeed = /快速|MVP|6 个月|交付|fast|ship/i.test(goal);
  const preferences = [
    wantsChinese ? (zh ? "偏好中文输出" : "prefers Chinese-facing output") : "",
    wantsAuditability ? (zh ? "重视可审查和可追溯过程" : "values auditable and traceable process") : "",
    wantsDetail ? (zh ? "偏好完整方案、Schema 和 backlog" : "prefers complete plans, schemas, and backlog") : "",
    wantsSpeed ? (zh ? "关注快速交付和 MVP 路线" : "cares about fast delivery and MVP path") : ""
  ].filter(Boolean);

  if (preferences.length === 0) {
    return zh ? "未检测到强偏好，默认保留可审查、可执行、成本受控的输出偏好。" : "No strong preference detected; defaulting to auditable, executable, cost-bounded output.";
  }

  return zh ? `历史偏好摘要：${preferences.join("；")}。` : `Preference summary: ${preferences.join("; ")}.`;
}

function summarizeProjectProfile(goal: string, knowledgeInjection: string, zh: boolean): string {
  const domain =
    /视觉|小说|游戏|VN|visual novel/i.test(goal)
      ? zh
        ? "视觉小说/互动内容生产"
        : "visual novel / interactive content production"
      : /agent|multi-agent|多 agent|智能体/i.test(goal)
        ? zh
          ? "Agent 平台或多智能体工作流"
          : "agent platform or multi-agent workflow"
        : /架构|微服务|Node\.js|系统/i.test(goal)
          ? zh
            ? "软件架构决策"
            : "software architecture decision"
          : zh
            ? "通用方案蓝图"
            : "general blueprint";
  const memorySignal = knowledgeInjection.trim()
    ? zh
      ? `已连接 ${knowledgeInjection.length} 字符项目记忆。`
      : `Connected ${knowledgeInjection.length} characters of project memory.`
    : zh
      ? "本轮未命中持久知识注入。"
      : "No durable knowledge injection matched this run.";

  return zh ? `用户项目画像：${domain}；${memorySignal}` : `Project profile: ${domain}; ${memorySignal}`;
}

function superviseAutonomousRun(input: {
  locale: "en" | "zh";
  criticReviews: Array<{ status: "pass" | "warn" | "fail"; finding: string; recommendation: string }>;
  permissions: Array<{ decision: "auto" | "requires_human" | "blocked"; reason: string }>;
  consensusScore: number;
  threshold: number;
  maxConsensusRounds: number;
  currentRound: number;
}): AutonomousSupervisorDecision {
  const zh = input.locale === "zh";
  const failedReviews = input.criticReviews.filter((review) => review.status === "fail");
  const blockedPermissions = input.permissions.filter((permission) => permission.decision === "blocked");
  const humanPermissions = input.permissions.filter((permission) => permission.decision === "requires_human");
  const belowThreshold = input.consensusScore < input.threshold;
  const budgetExhausted = input.currentRound >= input.maxConsensusRounds;

  if (failedReviews.length > 0 || blockedPermissions.length > 0 || (belowThreshold && budgetExhausted)) {
    return {
      node: "supervisor_agent",
      decision: "pause_for_human",
      reason:
        zh
          ? "存在失败检查、被阻止权限或轮次预算耗尽，主管要求进入人工复审。"
          : "Failed checks, blocked permissions, or exhausted round budget require human review.",
      requiredHumanInputs: [
        ...failedReviews.map((review) => review.recommendation),
        ...blockedPermissions.map((permission) => permission.reason),
        ...(belowThreshold && budgetExhausted ? [zh ? "请补充人工复审意见或提高轮次预算。" : "Provide human review evidence or raise the round budget."] : [])
      ],
      nextNode: "validate_result"
    };
  }

  if (belowThreshold || humanPermissions.length > 0) {
    return {
      node: "supervisor_agent",
      decision: "continue",
      reason:
        zh
          ? "仍有共识或人工确认关注项，但可以先进入验证节点，让共识循环决定是否继续修订。"
          : "Consensus or approval items remain, but validation should decide whether to continue revision.",
      requiredHumanInputs: humanPermissions.map((permission) => permission.reason),
      nextNode: "validate_result"
    };
  }

  return {
    node: "supervisor_agent",
    decision: "finalize",
    reason: zh ? "检查通过且共识达到阈值，可以进入最终收敛。" : "Checks passed and consensus reached the threshold; finalization is allowed.",
    requiredHumanInputs: [],
    nextNode: "validate_result"
  };
}

function supervisorDecisionLabel(value: AutonomousSupervisorDecision["decision"], locale: "en" | "zh"): string {
  const labels: Record<"en" | "zh", Record<AutonomousSupervisorDecision["decision"], string>> = {
    en: {
      continue: "continue",
      pause_for_human: "pause for human review",
      finalize: "finalize"
    },
    zh: {
      continue: "继续",
      pause_for_human: "暂停等待人工复审",
      finalize: "收敛"
    }
  };
  return labels[locale][value];
}

function buildGoalBrief(state: AutonomousBlueprintGraphState): AutonomousGoalBrief {
  const likelyPattern = inferPattern(state.question);
  const zh = state.locale === "zh";

  return {
    goal:
      likelyPattern === "visual_novel_multi_agent"
        ? zh
          ? "把开放式视觉小说/多 agent 需求转成可实施蓝图。"
          : "Turn the open-ended visual novel / multi-agent request into an implementable blueprint."
        : zh
          ? "把开放式需求转成可审查、可交付、可验证的方案。"
          : "Turn the open-ended request into a reviewable, deliverable, and verifiable plan.",
    likelyPattern,
    constraints: [
      state.context.teamProfile,
      state.context.expectedScale,
      ...state.context.existingConstraints.slice(0, 3)
    ],
    successSignals: zh
      ? ["有清晰 Agent 分工", "有 Schema", "有验证闭环", "有任务清单"]
      : ["clear agent responsibilities", "schemas", "validation loop", "implementation backlog"]
  };
}

function inferPattern(question: string): AutonomousGoalBrief["likelyPattern"] {
  const text = question.toLowerCase();
  const visualNovelCue =
    text.includes("visual novel") ||
    text.includes("视觉小说") ||
    text.includes("视觉类游戏") ||
    text.includes("vn") ||
    (text.includes("小说") && (text.includes("游戏") || text.includes("game") || text.includes("视觉")));

  return visualNovelCue ? "visual_novel_multi_agent" : "generic_blueprint";
}

function summarizeLiveModelTrace(input: {
  requested: boolean;
  providerTrace: LiveDecisionTraceEntry[];
  fallbackReason?: AutonomousLiveModelSummary["fallbackReason"];
}): AutonomousLiveModelSummary {
  const usableCalls = countUsableTraceEntries(input.providerTrace);
  const liveTraceUsable = usableCalls > 0;

  return {
    requested: input.requested ? "live" : "deterministic",
    actual: liveTraceUsable ? "live" : "deterministic",
    liveTraceRequired: input.requested,
    liveTraceAttempted: input.providerTrace.length > 0,
    liveTraceUsable,
    providerCalls: input.providerTrace.length,
    usableCalls,
    fallbackReason: liveTraceUsable ? undefined : input.fallbackReason
  };
}

function countUsableTraceEntries(trace: LiveDecisionTraceEntry[]): number {
  return trace.filter(
    (entry) =>
      entry.status === "ok" &&
      entry.jsonParsed &&
      (entry.validationStatus === "valid" || entry.validationStatus === "repaired")
  ).length;
}

function summarizeTracePhases(trace: LiveDecisionTraceEntry[]): string {
  const phaseCounts = trace.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.phase] = (counts[entry.phase] ?? 0) + 1;
    return counts;
  }, {});

  return Object.entries(phaseCounts)
    .map(([phase, count]) => `${phase}:${count}`)
    .join(" · ");
}

function autonomousAgentPattern(locale: "en" | "zh"): AutonomousAgentPattern {
  return {
    primary: "langgraph_workflow_agent",
    layers: [
      "intent_router",
      "clarifier_agent",
      "multi_agent_debate",
      "critique_revision",
      "evaluator_optimizer",
      "bounded_react_tools",
      "planner_executor_critic",
      "memory_agent",
      "supervisor_agent",
      "tool_permission_policy",
      "human_in_the_loop"
    ],
    reactScope: "node_local_bounded_tools",
    description:
      locale === "zh"
        ? "外层使用 LangGraph 状态图控制流程、预算、路由和 checkpoint；中层加入 Planner/Executor/Critic/Memory/Supervisor；内层只在节点内使用受控 ReAct 工具和权限策略。"
        : "LangGraph controls workflow, budget, routing, and checkpoints; the middle layer adds Planner/Executor/Critic/Memory/Supervisor agents; ReAct is limited to bounded node-local tools and permission policy."
  };
}

function buildIntentPlan(question: string, locale: "en" | "zh"): AutonomousIntentPlan {
  const text = question.toLowerCase();
  const signals: string[] = [];
  const pushIf = (condition: boolean, signal: string) => {
    if (condition) signals.push(signal);
  };

  pushIf(matchesAny(text, ["是否", "要不要", "选哪个", "取舍", "二选一", "decision", "tradeoff"]), "decision_tradeoff");
  pushIf(matchesAny(text, ["蓝图", "方案", "需求书", "工作流", "schema", "字段", "roadmap", "backlog", "workflow"]), "blueprint_planning");
  pushIf(matchesAny(text, ["agent", "多 agent", "multi-agent", "智能体", "协同", "分工"]), "agent_design");
  pushIf(matchesAny(text, ["评估", "测试集", "agenteval", "性能", "延迟", "成本", "指标", "eval"]), "evaluation");
  pushIf(matchesAny(text, ["导出", "pdf", "报告", "文档", "export"]), "report_export");
  pushIf(matchesAny(text, ["中文", "翻译", "本地化", "英文", "localization", "i18n"]), "localization");
  pushIf(matchesAny(text, ["安全", "cors", "token", "api key", "限流", "security"]), "security");

  const category = categoryFromSignals(signals);
  const complexity = estimateIntentComplexity(text, signals);
  const confidence = Math.min(0.96, Math.max(0.52, 0.56 + signals.length * 0.1 + (text.length > 80 ? 0.08 : 0)));
  const shouldClarify = confidence < 0.72 || (complexity === "high" && !hasSpecificOperationalContext(text));

  return {
    category,
    route: routeForCategory(category),
    confidence: Math.round(confidence * 100) / 100,
    complexity,
    signals: signals.length > 0 ? signals : ["general_open_request"],
    shouldClarify,
    normalizedRequest:
      locale === "zh"
        ? `围绕“${question.slice(0, 90)}${question.length > 90 ? "..." : ""}”生成可审查方案。`
        : `Create a reviewable plan for "${question.slice(0, 90)}${question.length > 90 ? "..." : ""}".`
  };
}

function buildClarificationPlan(
  question: string,
  locale: "en" | "zh",
  intent?: {
    category?: string;
    confidence?: number;
    shouldClarify?: boolean;
    complexity?: string;
  },
): AutonomousClarificationPlan {
  const zh = locale === "zh";
  const text = question.toLowerCase();
  const questions: string[] = [];

  if (!matchesAny(text, ["用户", "客户", "团队", "角色", "audience", "user", "team"])) {
    questions.push(zh ? "目标用户/使用团队是谁，谁最终验收这个方案？" : "Who is the target user or team, and who accepts the result?");
  }
  if (!matchesAny(text, ["数据", "接口", "系统", "文件", "database", "api", "schema", "data"])) {
    questions.push(zh ? "输入数据来自哪里，是否已有系统、接口或样例文件？" : "Where does the input data come from, and are there systems, APIs, or samples already?");
  }
  if (!matchesAny(text, ["成功", "指标", "验收", "评估", "kpi", "metric", "acceptance", "eval"])) {
    questions.push(zh ? "你准备用哪些指标判断这个方案做得好？" : "Which metrics should determine whether this plan works?");
  }

  const required = Boolean(intent?.shouldClarify) && questions.length > 0;

  return {
    required,
    strategy: required && intent?.confidence && intent.confidence < 0.58 ? "ask_before_running" : "answer_with_assumptions",
    questions: questions.slice(0, 3),
    assumptions: [
      zh ? "先按自用或小团队试运行设计，不默认公网开放。" : "Assume self-use or small-team pilot, not public deployment by default.",
      zh ? "先交付可审查 MVP，再把高风险能力放进后续迭代。" : "Deliver a reviewable MVP first, then move high-risk capabilities into later iterations.",
      ...(intent?.category === "agent_design"
        ? [zh ? "Agent 分工优先保证可观测、可回滚、可人工接管。" : "Agent responsibilities should stay observable, reversible, and human-reviewable."]
        : [])
    ]
  };
}

function buildReactToolSteps(input: {
  locale: "en" | "zh";
  intentCategory: string;
  route: string;
  goal: string;
  clarificationRequired: boolean;
  availableTools: string[];
}): AutonomousReactToolStep[] {
  const zh = input.locale === "zh";
  const steps: AutonomousReactToolStep[] = [
    {
      node: "react_toolbox",
      thought: zh ? "先确认请求类型和是否需要澄清，避免直接套模板。" : "Confirm request type and clarification need before drafting.",
      action: "inspect_intent",
      toolName: "quorummind_route_intent",
      observation: `${input.intentCategory} -> ${input.route}`
    },
    {
      node: "react_toolbox",
      thought: zh ? "需要一个能产生结构化蓝图的本地确定性工具。" : "A deterministic local tool is needed for structured Blueprint output.",
      action: "prepare_tool",
      toolName: input.availableTools.includes(createBlueprintTool.name) ? createBlueprintTool.name : "quorummind_create_blueprint",
      observation: zh ? "将生成草案、互评、修订、Schema、里程碑和 backlog。" : "Will generate drafts, critique, revisions, schemas, milestones, and backlog."
    },
    {
      node: "react_toolbox",
      thought: zh ? "开放目标需要先拆任务、再按权限执行。" : "Open-ended goals need task planning before permissioned execution.",
      action: "prepare_agent_loop",
      toolName: input.availableTools.includes(plannerAgentTool.name) ? plannerAgentTool.name : "quorummind_planner_agent",
      observation: zh ? "将启用 Planner、Executor、Critic、Memory、Supervisor 和工具权限策略。" : "Will enable Planner, Executor, Critic, Memory, Supervisor, and tool permission policy."
    },
    {
      node: "react_toolbox",
      thought: zh ? "每轮输出必须经过评估器，而不是生成后直接相信。" : "Each round needs evaluator gating rather than trusting first output.",
      action: "prepare_gate",
      toolName: validateBlueprintTool.name,
      observation: zh ? "将检查共识阈值、弱项、延后采纳和轮次预算。" : "Will check consensus threshold, weak items, deferred adoption, and round budget."
    }
  ];

  if (input.clarificationRequired) {
    steps.splice(1, 0, {
      node: "react_toolbox",
      thought: zh ? "问题有信息缺口，但本轮可以带假设继续，并把缺口暴露给用户。" : "The request has gaps; continue with assumptions and expose them.",
      action: "record_assumptions",
      toolName: clarifyRequirementsTool.name,
      observation: zh ? "澄清问题进入运行记录，不阻塞蓝图生成。" : "Clarification questions are recorded without blocking Blueprint generation."
    });
  }

  return steps;
}

function buildEvaluatorGate(input: {
  validation: AutonomousValidationReport;
  result: BlueprintRoomResult;
  liveModel?: AutonomousLiveModelSummary;
  action: AutonomousConsensusIteration["action"];
  locale: "en" | "zh";
}): AutonomousEvaluatorGate {
  const zh = input.locale === "zh";
  const highPriorityBacklogCount = input.result.finalSpec.implementationBacklog.filter((item) => item.priority === "P0").length;
  const weakEvaluationCount = input.result.finalSpec.evaluationMatrix.filter((item) => item.status === "weak").length;
  const deferredAdoptionCount = input.result.finalSpec.adoptionLedger.filter((item) => item.adoptionStatus === "deferred").length;
  const sourceTransparent =
    !input.liveModel?.liveTraceRequired ||
    input.liveModel.liveTraceUsable ||
    Boolean(input.liveModel.fallbackReason);
  const checks: AutonomousEvaluatorCheck[] = [
    {
      name: "consensus_threshold",
      status: input.validation.passed ? "pass" : input.validation.canRevise ? "warn" : "fail",
      detail: `${input.validation.consensusScore}/${input.validation.threshold}`
    },
    {
      name: "actionable_backlog",
      status: highPriorityBacklogCount > 0 ? "pass" : "warn",
      detail: zh ? `${highPriorityBacklogCount} 个 P0 任务` : `${highPriorityBacklogCount} P0 tasks`
    },
    {
      name: "evaluation_matrix",
      status: weakEvaluationCount === 0 ? "pass" : weakEvaluationCount <= 2 ? "warn" : "fail",
      detail: zh ? `${weakEvaluationCount} 个较弱评估项` : `${weakEvaluationCount} weak items`
    },
    {
      name: "critique_adoption",
      status: deferredAdoptionCount === 0 ? "pass" : deferredAdoptionCount <= 3 ? "warn" : "fail",
      detail: zh ? `${deferredAdoptionCount} 条延后采纳质询建议` : `${deferredAdoptionCount} deferred critique suggestions`
    },
    {
      name: "source_transparency",
      status: sourceTransparent ? "pass" : "fail",
      detail: input.liveModel?.liveTraceUsable
        ? zh
          ? "真实模型轨迹可用"
          : "live trace valid"
        : localizeLiveModelFallbackReason(input.liveModel?.fallbackReason, zh)
    }
  ];
  const penalty = checks.reduce((sum, check) => sum + (check.status === "fail" ? 12 : check.status === "warn" ? 5 : 0), 0);
  const score = Math.max(0, Math.min(100, input.validation.consensusScore - penalty + 8));

  return {
    score,
    threshold: input.validation.threshold,
    passed: score >= input.validation.threshold,
    action: input.action === "finalize" ? "finalize" : input.action === "continue" ? "revise" : "human_review",
    checks
  };
}

function buildFallbackEvaluatorGate(
  validation: AutonomousValidationReport,
  result: BlueprintRoomResult,
  liveModel?: AutonomousLiveModelSummary,
  locale: "en" | "zh" = "en"
): AutonomousEvaluatorGate {
  const action: AutonomousConsensusIteration["action"] = validation.passed ? "finalize" : validation.canRevise ? "continue" : "human_review";
  return buildEvaluatorGate({ validation, result, liveModel, action, locale });
}

function localizeLiveModelFallbackReason(reason: string | undefined, zh: boolean): string {
  if (!reason) {
    return zh ? "确定性本地结果" : "deterministic";
  }

  const labels: Record<string, { en: string; zh: string }> = {
    deterministic_mode: { en: "deterministic mode", zh: "确定性模式" },
    provider_mode_demo: { en: "provider mode is demo", zh: "当前是演示模式" },
    no_configured_providers: { en: "no configured providers", zh: "没有已配置的模型提供方" },
    no_usable_live_trace: { en: "no valid live trace", zh: "没有可用真实模型轨迹" },
    live_trace_error: { en: "live trace error", zh: "真实模型轨迹出错" }
  };

  return labels[reason]?.[zh ? "zh" : "en"] ?? reason;
}

function categoryFromSignals(signals: string[]): AutonomousIntentCategory {
  if (signals.includes("security")) return "security";
  if (signals.includes("report_export")) return "report_export";
  if (signals.includes("localization")) return "localization";
  if (signals.includes("evaluation")) return "evaluation";
  if (signals.includes("agent_design")) return "agent_design";
  if (signals.includes("blueprint_planning")) return "blueprint";
  if (signals.includes("decision_tradeoff")) return "decision";
  return "general";
}

function routeForCategory(category: AutonomousIntentCategory): AutonomousIntentPlan["route"] {
  if (category === "decision") return "decision_room_recommended";
  if (category === "evaluation") return "agent_eval_blueprint";
  if (category === "report_export") return "report_export_blueprint";
  if (category === "security") return "security_review_blueprint";
  return "blueprint_graph";
}

function estimateIntentComplexity(text: string, signals: string[]): AutonomousIntentPlan["complexity"] {
  if (text.length > 180 || signals.length >= 3) return "high";
  if (text.length > 70 || signals.length >= 2) return "medium";
  return "low";
}

function hasSpecificOperationalContext(text: string): boolean {
  return matchesAny(text, ["团队", "用户", "数据", "预算", "mvp", "阶段", "规模", "team", "user", "data", "budget", "scale"]);
}

function matchesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle.toLowerCase()));
}

function intentCategoryLabel(category: AutonomousIntentCategory | string, locale: "en" | "zh"): string {
  const labels: Record<"en" | "zh", Record<string, string>> = {
    en: {
      decision: "decision",
      blueprint: "blueprint",
      agent_design: "agent design",
      evaluation: "evaluation",
      report_export: "report export",
      localization: "localization",
      security: "security",
      general: "general"
    },
    zh: {
      decision: "决策取舍",
      blueprint: "方案蓝图",
      agent_design: "Agent 设计",
      evaluation: "评估",
      report_export: "报告导出",
      localization: "中文体验",
      security: "安全策略",
      general: "通用问题"
    }
  };
  return labels[locale][category] ?? category;
}

function intentRouteLabel(route: AutonomousIntentPlan["route"] | string, locale: "en" | "zh"): string {
  const labels: Record<"en" | "zh", Record<string, string>> = {
    en: {
      blueprint_graph: "Blueprint graph",
      decision_room_recommended: "Decision Room recommended",
      agent_eval_blueprint: "AgentEval blueprint",
      report_export_blueprint: "Report export blueprint",
      security_review_blueprint: "Security review blueprint"
    },
    zh: {
      blueprint_graph: "蓝图图编排",
      decision_room_recommended: "建议使用决策室",
      agent_eval_blueprint: "AgentEval 蓝图",
      report_export_blueprint: "报告导出蓝图",
      security_review_blueprint: "安全审查蓝图"
    }
  };
  return labels[locale][route] ?? route;
}

function requireBlueprintResult(state: AutonomousBlueprintGraphState): BlueprintRoomResult {
  if (!state.result) {
    throw new Error("Blueprint result is missing from autonomous graph state.");
  }

  return state.result;
}

function requireValidation(state: AutonomousBlueprintGraphState): AutonomousValidationReport {
  if (!state.validation) {
    throw new Error("Validation report is missing from autonomous graph state.");
  }

  return state.validation;
}

function createRunId(): string {
  return `agent-run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeThreadId(threadId: string | undefined): string {
  if (threadId?.trim()) {
    return threadId.trim().slice(0, 96);
  }

  return `agent-thread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampPositiveInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isInteger(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value as number));
}
