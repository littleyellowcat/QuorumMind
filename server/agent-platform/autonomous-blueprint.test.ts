// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DecisionContext } from "../../src/lib/domain";
import { runAutonomousBlueprintGraph } from "./autonomous-blueprint";

const context: DecisionContext = {
  productStage: "mvp",
  expectedScale: "第一版支持 3-5 部中篇小说试运行",
  teamProfile: "2 名全栈工程师和 1 名内容策划",
  budgetSensitivity: "medium",
  reliabilityRequirement: "medium",
  securityRequirement: "medium",
  existingConstraints: ["需要中文输出", "先做可审查的 MVP", "不能依赖人工复制粘贴流程"],
  candidateOptions: ["LangGraph", "LangChain", "Custom orchestration"],
  assumptions: ["先处理文本和结构化产物，不直接生成完整游戏工程"]
};

describe("runAutonomousBlueprintGraph", () => {
  it("runs a bounded LangGraph blueprint platform with LangChain tools", async () => {
    const run = await runAutonomousBlueprintGraph({
      question: "我想做一个视觉类游戏，用多 agent 拆解小说文本，工作流和人物字段怎么设计？",
      mode: "deep",
      locale: "zh",
      context
    });

    expect(run.platform).toMatchObject({
      orchestrator: "langgraph",
      toolLayer: "langchain-core",
      autonomyLevel: "bounded_server_graph",
      source: "deterministic_tools"
    });
    expect(run.goalBrief.likelyPattern).toBe("visual_novel_multi_agent");
    expect(run.trace.map((entry) => entry.node)).toEqual([
      "route_intent",
      "understand_request",
      "react_toolbox",
      "planner_agent",
      "memory_agent",
      "executor_agent",
      "draft_blueprint",
      "cross_review",
      "critic_agent",
      "supervisor_agent",
      "validate_result",
      "revise_discussion",
      "critic_agent",
      "supervisor_agent",
      "validate_result",
      "revise_discussion",
      "critic_agent",
      "supervisor_agent",
      "validate_result",
      "finalize"
    ]);
    expect(run.toolCalls.map((entry) => entry.toolName)).toEqual([
      "quorummind_route_intent",
      "quorummind_clarify_requirements",
      "quorummind_bounded_react_toolbox",
      "quorummind_planner_agent",
      "quorummind_tool_permission_policy",
      "quorummind_memory_agent",
      "quorummind_executor_agent",
      "quorummind_create_blueprint",
      "quorummind_critic_agent",
      "quorummind_supervisor_agent",
      "quorummind_validate_blueprint",
      "quorummind_advance_consensus_round",
      "quorummind_critic_agent",
      "quorummind_supervisor_agent",
      "quorummind_validate_blueprint",
      "quorummind_advance_consensus_round",
      "quorummind_critic_agent",
      "quorummind_supervisor_agent",
      "quorummind_validate_blueprint",
      "quorummind_select_next_actions"
    ]);
    expect(run.consensusLoop.map((iteration) => iteration.consensusScore)).toEqual(
      [...run.consensusLoop.map((iteration) => iteration.consensusScore)].sort((a, b) => a - b)
    );
    expect(run.consensusLoop.at(0)?.consensusScore).toBeLessThan(80);
    expect(run.consensusLoop.at(-1)?.consensusScore).toBeGreaterThanOrEqual(80);
    expect(run.consensusLoop.map((iteration) => iteration.action)).toEqual(["continue", "continue", "finalize"]);
    expect(run.agentPattern.layers).toContain("bounded_react_tools");
    expect(run.agentPattern.layers).toContain("planner_executor_critic");
    expect(run.agentPattern.layers).toContain("tool_permission_policy");
    expect(run.intent).toMatchObject({
      category: "agent_design",
      route: "blueprint_graph"
    });
    expect(run.clarification.strategy).toBe("answer_with_assumptions");
    expect(run.reactToolSteps.map((step) => step.toolName)).toContain("quorummind_validate_blueprint");
    expect(run.taskTree.map((task) => task.ownerAgent)).toContain("planner_agent");
    expect(run.toolPermissions.every((permission) => permission.decision === "auto" || permission.decision === "requires_human" || permission.decision === "blocked")).toBe(true);
    expect(run.toolPermissions.map((permission) => permission.category)).toEqual(
      expect.arrayContaining(["read_only", "local_file_write"])
    );
    expect(run.executorActions.some((action) => action.status === "executed")).toBe(true);
    expect(run.criticReviews.length).toBeGreaterThan(0);
    expect(run.memoryEvents.length).toBeGreaterThan(0);
    expect(run.memoryEvents.map((event) => event.key)).toEqual(
      expect.arrayContaining(["user_preference_summary", "project_profile", "last_vs_current_diff", "failure_sample_backlog"])
    );
    expect(run.supervisorDecisions.length).toBeGreaterThan(0);
    expect(run.evaluatorGate).toMatchObject({
      passed: true,
      action: "finalize"
    });
    expect(run.evaluatorGate.checks.map((check) => check.detail).join(" ")).not.toContain("live trace usable");
    expect(run.evaluatorGate.checks.map((check) => check.detail).join(" ")).not.toContain("deferred critique suggestions");
    expect(run.validation.passed).toBe(true);
    expect(run.validation.round).toBe(3);
    expect(run.summary.discussionRounds).toBe(3);
    expect(run.summary.nextActions).toHaveLength(3);
    expect(run.result.finalSpec.title).toContain("视觉小说");
    expect(run.result.finalSpec.implementationBacklog.some((item) => item.priority === "P0")).toBe(true);
  });

  it("keeps non-game multi-agent requests on the generic blueprint path", async () => {
    const run = await runAutonomousBlueprintGraph({
      question:
        "我想做一个面向中小跨境电商团队的 AI 运营助手。它需要根据店铺订单、商品库存、广告投放数据和客服对话，自动生成每日运营简报，并给出补货建议、广告预算调整建议、差评处理优先级和客服话术优化方案。请设计 Agent 分工、数据流、Schema、风险控制、MVP 路线和评估指标。",
      mode: "deep",
      locale: "zh",
      context: {
        ...context,
        expectedScale: "第一版支持 5 个店铺试运行",
        teamProfile: "3 人产品工程小组",
        existingConstraints: ["需要中文输出", "先做可审查 MVP"]
      }
    });

    expect(run.goalBrief.likelyPattern).toBe("generic_blueprint");
    expect(run.result.finalSpec.title).toContain("跨境电商");
    expect(run.result.finalSpec.title).toContain("AI 运营助手");
    expect(run.result.finalSpec.workflowStages).toHaveLength(6);
    expect(run.result.finalSpec.schemas.map((schema) => schema.name)).toContain("RecommendationItem");
    expect(run.result.finalSpec.markdown).toContain("订单数据");
    expect(run.result.finalSpec.markdown).toContain("库存数据");
    expect(run.result.finalSpec.markdown).toContain("广告投放数据");
    expect(run.result.finalSpec.markdown).toContain("客服对话");
    expect(run.result.finalSpec.markdown).not.toContain("视觉小说");
    expect(run.result.finalSpec.markdown).not.toContain("章节解析");
    expect(run.result.finalSpec.markdown).not.toContain("CharacterCard");
  });

  it("routes to human review when the consensus round budget is exhausted", async () => {
    const run = await runAutonomousBlueprintGraph({
      question: "我想做一个视觉类游戏，用多 agent 拆解小说文本，工作流和人物字段怎么设计？",
      mode: "deep",
      locale: "zh",
      context,
      threadId: "test-thread-round-budget",
      maxConsensusRounds: 2,
      humanReviewNote: "人工确认先保留 Schema Designer 的字段设计，再补样本回归。"
    });

    expect(run.checkpoint).toMatchObject({
      enabled: true,
      saver: "MemorySaver",
      threadId: "test-thread-round-budget"
    });
    expect(run.runtimeLimits.maxConsensusRounds).toBe(2);
    expect(run.consensusLoop).toHaveLength(2);
    expect(run.consensusLoop.at(-1)?.consensusScore).toBeLessThan(80);
    expect(run.routeDecisions.map((decision) => decision.toNode)).toEqual(["revise_discussion", "human_review_gate"]);
    expect(run.supervisorDecisions.at(-1)?.decision).toBe("pause_for_human");
    expect(run.validation).toMatchObject({
      passed: false,
      canRevise: false,
      terminationReason: "round_budget_exhausted",
      round: 2,
      maxConsensusRounds: 2
    });
    expect(run.trace.map((entry) => entry.node)).toContain("human_review_gate");
    expect(run.trace.find((entry) => entry.node === "human_review_gate")?.evidence).toContain(
      "人工确认先保留 Schema Designer 的字段设计，再补样本回归。"
    );
    expect(run.summary).toMatchObject({
      consensusPassed: false,
      humanReviewRequired: true,
      terminationReason: "round_budget_exhausted"
    });
  });

  it("returns a reviewable run instead of failing when no human review note is provided", async () => {
    const run = await runAutonomousBlueprintGraph({
      question: "我想做一个视觉类游戏，用多 agent 拆解小说文本，工作流和人物字段怎么设计？",
      mode: "deep",
      locale: "zh",
      context,
      threadId: "test-thread-needs-human-review",
      maxConsensusRounds: 2
    });

    expect(run.validation).toMatchObject({
      passed: false,
      canRevise: false,
      terminationReason: "round_budget_exhausted",
      round: 2
    });
    expect(run.summary).toMatchObject({
      consensusPassed: false,
      humanReviewRequired: true
    });
    expect(run.trace.find((entry) => entry.node === "human_review_gate")).toMatchObject({
      status: "needs_review"
    });
  });

  it("records live provider calls in the permission and executor ledgers", async () => {
    const run = await runAutonomousBlueprintGraph({
      question: "请设计一个 AI 代码评审平台，需要多 Agent 互评、风险分级和最终报告。",
      mode: "fast",
      locale: "zh",
      context,
      liveModel: {
        requested: true,
        runner: async () => []
      }
    });

    expect(run.trace.map((entry) => entry.node)).toContain("live_model_review");
    expect(run.toolPermissions).toContainEqual(
      expect.objectContaining({
        toolName: "quorummind_live_blueprint_provider_trace",
        node: "live_model_review",
        category: "live_model_call",
        risk: "medium",
        decision: "auto"
      })
    );
    expect(run.executorActions).toContainEqual(
      expect.objectContaining({
        taskId: "task-live-model-review",
        toolName: "quorummind_live_blueprint_provider_trace",
        permission: "auto",
        status: "executed"
      })
    );
    expect(run.liveModel).toMatchObject({
      requested: "live",
      actual: "deterministic",
      liveTraceAttempted: false,
      fallbackReason: "no_configured_providers"
    });
  });

  it("lets the supervisor force human review when permission policy blocks a high-risk tool", async () => {
    const run = await runAutonomousBlueprintGraph({
      question: "请设计一个 Agent 平台，并让它自动部署到生产、删除旧数据、发邮件通知客户。",
      mode: "deep",
      locale: "zh",
      context,
      threadId: "test-thread-blocked-permission",
      maxConsensusRounds: 4
    });

    expect(run.taskTree.map((task) => task.id)).toContain("task-high-risk-external-action");
    expect(run.toolPermissions).toContainEqual(
      expect.objectContaining({
        toolName: "external_write_or_deploy",
        category: "production_operation",
        risk: "high",
        decision: "blocked"
      })
    );
    expect(run.supervisorDecisions.at(-1)).toMatchObject({
      decision: "pause_for_human"
    });
    expect(run.routeDecisions.at(-1)).toMatchObject({
      toNode: "human_review_gate",
      reason: "human_review_required"
    });
    expect(run.validation).toMatchObject({
      passed: false,
      canRevise: false,
      terminationReason: "human_review_required"
    });
    expect(run.summary.humanReviewRequired).toBe(true);
  });
});
