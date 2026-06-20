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
import { buildKnowledgeInjection } from "../../src/lib/knowledge-inject";
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
  goalBrief: AutonomousGoalBrief;
  trace: AutonomousAgentTraceEntry[];
  toolCalls: AutonomousToolCall[];
  providerTrace: LiveDecisionTraceEntry[];
  liveModel: AutonomousLiveModelSummary;
  consensusLoop: AutonomousConsensusIteration[];
  routeDecisions: AutonomousRouteDecision[];
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

/** Internal sentinel used by array reducers to signal state truncation during compression.
 *  When the first element of an update array is this sentinel, the reducer clears the
 *  accumulated array and replaces it with the remaining elements. */
const QM_TRUNCATE = { __qm_truncate: true as const };

const AutonomousBlueprintAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  question: Annotation<string>(),
  mode: Annotation<DecisionMode>(),
  locale: Annotation<"en" | "zh">(),
  context: Annotation<DecisionContext>(),
  humanReviewNote: Annotation<string | undefined>(),
  currentConsensusRoundIndex: Annotation<number>(),
  maxConsensusRounds: Annotation<number>(),
  goalBrief: Annotation<AutonomousGoalBrief | undefined>(),
  result: Annotation<BlueprintRoomResult | undefined>(),
  validation: Annotation<AutonomousValidationReport | undefined>(),
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
      currentConsensusRoundIndex: 0,
      maxConsensusRounds,
      trace: [],
      toolCalls: [],
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
    goalBrief: finalState.goalBrief,
    trace: finalState.trace,
    toolCalls: finalState.toolCalls,
    providerTrace: finalState.providerTrace,
    liveModel: finalLiveModel,
    consensusLoop: finalState.consensusLoop,
    routeDecisions: finalState.routeDecisions,
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
    .addNode("understand_request", understandRequestNode(options.liveModel))
    .addNode("draft_blueprint", draftBlueprintNode)
    .addNode("cross_review", crossReviewNode)
    .addNode("validate_result", validateResultNode)
    .addNode("revise_discussion", reviseDiscussionNode)
    .addNode("human_review_gate", humanReviewGateNode)
    .addNode("finalize", finalizeNode)
    .addEdge(START, "understand_request")
    .addEdge("understand_request", "draft_blueprint");

  if (options.liveModel.requested) {
    graph
      .addNode("live_model_review", liveModelReviewNode(options.liveModel))
      .addEdge("draft_blueprint", "live_model_review")
      .addEdge("live_model_review", "cross_review");
  } else {
    graph.addEdge("draft_blueprint", "cross_review");
  }

  return graph
    .addEdge("cross_review", "validate_result")
    .addConditionalEdges("validate_result", routeAfterValidation, {
      finalize: "finalize",
      revise_discussion: "revise_discussion",
      human_review_gate: "human_review_gate"
    })
    .addEdge("revise_discussion", "validate_result")
    .addEdge("human_review_gate", "finalize")
    .addEdge("finalize", END)
    .compile({
      name: "quorummind-autonomous-blueprint",
      checkpointer: autonomousBlueprintCheckpointer
    });
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

      return {
        liveModel: summary,
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

      return {
        result: enrichedResult,
        providerTrace: state.providerTrace.length > 0 ? [] : providerTrace,
        liveModel: summary,
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

      return {
        liveModel: summary,
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
  const validation = await validateBlueprintTool.invoke({
    round: currentRound.round,
    totalRounds,
    maxConsensusRounds: state.maxConsensusRounds,
    consensusScore: currentRound.consensusScore,
    threshold: result.consensusThreshold,
    highPriorityBacklogCount: result.finalSpec.implementationBacklog.filter((item) => item.priority === "P0").length,
    weakEvaluationCount: result.finalSpec.evaluationMatrix.filter((item) => item.status === "weak").length,
    deferredAdoptionCount: result.finalSpec.adoptionLedger.filter((item) => item.adoptionStatus === "deferred").length
  });
  const action: AutonomousConsensusIteration["action"] = validation.passed
    ? "finalize"
    : validation.canRevise
      ? "continue"
      : "human_review";
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
      trace: [QM_TRUNCATE as any, ...slice.trace, nodeTraceEntry],
      toolCalls: [QM_TRUNCATE as any, ...slice.toolCalls, nodeToolCall],
      consensusLoop: [QM_TRUNCATE as any, ...slice.consensusLoop, nodeConsensusEntry],
      providerTrace: [QM_TRUNCATE as any, ...slice.providerTrace],
      routeDecisions: [QM_TRUNCATE as any, ...(state.routeDecisions ?? []).slice(-2), nodeRouteEntry]
    };
  }

  return {
    validation,
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
    trace: [
      {
        node: "human_review_gate",
        agentId: "human-review-gate",
        status: humanReviewNote ? "complete" : "needs_review",
        summary:
          state.locale === "zh"
            ? humanReviewNote
              ? "已读取人工复审输入，并把它作为本次 checkpoint thread 的恢复证据。"
              : "已进入人工复审门禁，等待补充证据或继续一轮 agent 讨论。"
            : humanReviewNote
              ? "Read human review input and attached it as resume evidence for this checkpoint thread."
              : "Entered the human-review gate and awaits more evidence or another agent round.",
        evidence: [
          ...(validation.blockingIssues.length > 0 ? validation.blockingIssues : validation.reviewWarnings),
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

  return text.includes("视觉") ||
    text.includes("小说") ||
    text.includes("visual") ||
    text.includes("game") ||
    text.includes("vn") ||
    text.includes("multi-agent") ||
    text.includes("多 agent") ||
    text.includes("多agent")
    ? "visual_novel_multi_agent"
    : "generic_blueprint";
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
