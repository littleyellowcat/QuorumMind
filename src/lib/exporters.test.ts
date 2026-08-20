import { describe, expect, it } from "vitest";
import { runDecisionRoom } from "./workflow";
import { runBlueprintRoom } from "./blueprint";
import type { DecisionContext } from "./domain";
import type { ContextSourceLedger } from "./api-client";
import {
  createAdrMarkdownExport,
  createBlueprintBacklogExport,
  createBlueprintFinalPdfHtml,
  createBlueprintReportHtml,
  createDecisionFinalPdfHtml,
  createJsonTraceExport,
  createPdfReportHtml
} from "./exporters";

const context: DecisionContext = {
  productStage: "mvp",
  expectedScale: "50 tenants",
  teamProfile: "Small full-stack team",
  budgetSensitivity: "high",
  reliabilityRequirement: "medium",
  securityRequirement: "high",
  existingConstraints: ["Use PostgreSQL"],
  candidateOptions: ["Shared tables", "Schema per tenant"],
  assumptions: ["No strict compliance need at launch"]
};

const contextLedger: ContextSourceLedger = {
  schemaVersion: 1,
  contextHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  sourceCounts: {
    user_input: 1,
    structured_context: 1,
    knowledge_injection: 0,
    reputation_feedback: 0,
    provider_trace: 0,
    deterministic_fallback: 1
  },
  providerEvidence: {
    attempted: false,
    usableCalls: 0,
    failedCalls: 0
  },
  fallback: {
    used: true,
    reason: "provider_mode_demo"
  },
  sources: []
};

describe("exporters", () => {
  it("exports ADR markdown from a decision result", () => {
    const result = runDecisionRoom({
      question: "Should we use shared tables?",
      mode: "deep",
      context
    });

    const exported = createAdrMarkdownExport(result);

    expect(exported.filename).toMatch(/quorummind-adr-/);
    expect(exported.mimeType).toBe("text/markdown;charset=utf-8");
    expect(exported.contents).toContain("# ADR:");
  });

  it("exports JSON trace with provider trace and prompt bundle", () => {
    const result = runDecisionRoom({
      question: "Should we use shared tables?",
      mode: "deep",
      context
    });

    const exported = createJsonTraceExport({
      question: "Should we use shared tables?",
      providerMode: "demo",
      providerTrace: [
        {
          id: "proposal-openai-0",
          provider: "openai",
          model: "gpt-4o-mini",
          phase: "proposal",
          status: "ok",
          text: "{}",
          durationMs: 12,
          jsonParsed: true
        }
      ],
      liveVerdict: null,
      promptBundle: { version: "manual-v1", agents: [], prompts: [] },
      result,
      contextLedger
    });

    const parsed = JSON.parse(exported.contents) as Record<string, unknown>;

    expect(exported.filename).toMatch(/quorummind-trace-/);
    expect(exported.mimeType).toBe("application/json;charset=utf-8");
    expect(parsed.question).toBe("Should we use shared tables?");
    expect(parsed.contextLedger).toMatchObject({
      contextHash: contextLedger.contextHash,
      fallback: {
        used: true,
        reason: "provider_mode_demo"
      }
    });
    expect(JSON.stringify(parsed)).toContain("gpt-4o-mini");
  });

  it("creates a printable PDF report HTML with escaped decision content", () => {
    const result = runDecisionRoom({
      question: "Should we use <script>alert('x')</script>?",
      mode: "deep",
      context
    });

    const report = createPdfReportHtml({
      question: "Should we use <script>alert('x')</script>?",
      providerMode: "live",
      providerTrace: [
        {
          id: "proposal-openai-0",
          provider: "openai",
          model: "gpt-4o-mini",
          phase: "proposal",
          status: "ok",
          text: "{}",
          durationMs: 12,
          jsonParsed: true
        }
      ],
      liveVerdict: {
        source: "live",
        selectedProposalId: "schema-per-tenant",
        finalRecommendation: "Use schema-per-tenant for stronger isolation.",
        quorumScore: 91,
        dissentIndex: 18,
        rankedProposals: [
          {
            proposalId: "schema-per-tenant",
            bordaScore: 100,
            weightedUtility: 88,
            regretPenalty: 12,
            confidence: 0.9,
            quorumScore: 91
          }
        ],
        whyItWon: ["Isolation risk dominates."],
        remainingDissent: ["Higher setup cost."],
        usedProposalPhase: "revision"
      },
      promptBundle: { version: "manual-v1", agents: [], prompts: [] },
      result,
      contextLedger
    });

    expect(report).toContain("<title>QuorumMind Decision Report</title>");
    expect(report).toContain("QuorumMind Decision Report");
    expect(report).toContain("Should we use &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;?");
    expect(report).not.toContain("<script>alert");
    expect(report).toContain("Use schema-per-tenant for stronger isolation.");
    expect(report).toContain("Decision score");
    expect(report).toContain("91/100");
    expect(report).toContain("Dissent index");
    expect(report).toContain("18/100");
    expect(report).toContain("schema-per-tenant");
    expect(report).toContain("Delphi consensus protocol");
    expect(report).toContain("Blind Review");
    expect(report).toContain("Bayesian weighted voting");
    expect(report).toContain("Posterior");
    expect(report).toContain("TOPSIS decision lens");
    expect(report).toContain("Closeness");
    expect(report).toContain("Monte Carlo stress lens");
    expect(report).toContain("Win rate");
    expect(report).toContain("AHP sensitivity analysis");
    expect(report).toContain("Stable winner rate");
    expect(report).toContain("Risk radar");
    expect(report).toContain("Regret map");
    expect(report).toContain("Worst-case regret");
    expect(report).toContain("Architecture Decision Record");
    expect(report).toContain("Source transparency");
    expect(report).toContain("Context hash");
    expect(report).toContain("Provider policy");
  });

  it("creates a simplified final decision PDF HTML without audit-heavy sections", () => {
    const result = runDecisionRoom({
      question: "是否应该把当前单体 Node.js 后端拆成微服务？",
      mode: "deep",
      context
    });

    const report = createDecisionFinalPdfHtml({
      question: "是否应该把当前单体 Node.js 后端拆成微服务？",
      locale: "zh",
      providerMode: "demo",
      providerTrace: [],
      liveVerdict: null,
      promptBundle: { version: "manual-v1", agents: [], prompts: [] },
      result
    });

    expect(report).toContain("<title>最终决策方案</title>");
    expect(report).toContain("最终答案");
    expect(report).toContain("下一步执行");
    expect(report).toContain("重要风险");
    expect(report).toContain("是否应该把当前单体 Node.js 后端拆成微服务？");
    expect(report).not.toContain("TOPSIS");
    expect(report).not.toContain("贝叶斯");
    expect(report).not.toContain("Prompt");
    expect(report).not.toContain("JSON 解析率");
  });

  it("creates a printable Blueprint report HTML with detailed sections and escaped content", () => {
    const result = runBlueprintRoom({
      question: "我想做一个<script>视觉游戏</script>，用多 agent 拆小说。",
      mode: "deep",
      locale: "zh",
      context
    });

    const report = createBlueprintReportHtml({
      question: "我想做一个<script>视觉游戏</script>，用多 agent 拆小说。",
      locale: "zh",
      providerMode: "demo",
      providerTrace: [],
      result
    });

    expect(report).toContain("<title>QuorumMind 蓝图报告</title>");
    expect(report).toContain("目标系统 Agent 设计");
    expect(report).toContain("多 Agent 协作与互评协议");
    expect(report).toContain("共识收敛记录");
    expect(report).toContain("共识阈值");
    expect(report).toContain("80%");
    expect(report).toContain("终局评估矩阵");
    expect(report).toContain("详细优化建议");
    expect(report).toContain("质询采纳账本");
    expect(report).toContain("已采纳");
    expect(report).toContain("实施任务清单");
    expect(report).toContain("实现章节接入、段落切分和 sourceSpan 索引");
    expect(report).toContain("建立 10 个章节样本回归包");
    expect(report).toContain("实施计划");
    expect(report).toContain("CharacterCard");
    expect(report).toContain("章节解析 Agent");
    expect(report).toContain("我想做一个&lt;script&gt;视觉游戏&lt;/script&gt;");
    expect(report).not.toContain("<script>视觉游戏</script>");
  });

  it("creates a simplified final Blueprint PDF HTML focused on the final plan", () => {
    const result = runBlueprintRoom({
      question: "我想做一个<script>视觉游戏</script>，用多 agent 拆小说。",
      mode: "deep",
      locale: "zh",
      context
    });

    const report = createBlueprintFinalPdfHtml({
      question: "我想做一个<script>视觉游戏</script>，用多 agent 拆小说。",
      locale: "zh",
      providerMode: "demo",
      providerTrace: [],
      result
    });

    expect(report).toContain("<title>最终方案蓝图</title>");
    expect(report).toContain("目标产物");
    expect(report).toContain("Agent 分工");
    expect(report).toContain("实施计划");
    expect(report).toContain("我想做一个&lt;script&gt;视觉游戏&lt;/script&gt;");
    expect(report).not.toContain("共识收敛记录");
    expect(report).not.toContain("质询采纳账本");
    expect(report).not.toContain("模型贡献摘要");
    expect(report).not.toContain("<script>视觉游戏</script>");
  });

  it("keeps the simplified final Blueprint PDF grounded for non-game multi-agent requests", () => {
    const question =
      "我想做一个面向中小跨境电商团队的 AI 运营助手。它需要根据店铺订单、商品库存、广告投放数据和客服对话，自动生成每日运营简报，并给出补货建议、广告预算调整建议、差评处理优先级和客服话术优化方案。请设计 Agent 分工、数据流、Schema、风险控制、MVP 路线和评估指标。";
    const result = runBlueprintRoom({
      question,
      mode: "deep",
      locale: "zh",
      context
    });

    const report = createBlueprintFinalPdfHtml({
      question,
      locale: "zh",
      providerMode: "demo",
      providerTrace: [],
      result
    });

    expect(report).toContain("跨境电商");
    expect(report).toContain("AI 运营助手");
    expect(report).toContain("订单数据");
    expect(report).toContain("库存数据");
    expect(report).toContain("广告投放数据");
    expect(report).toContain("客服对话");
    expect(report).toContain("补货建议");
    expect(report).toContain("人工采纳率");
    expect(report).not.toContain("视觉小说");
    expect(report).not.toContain("章节解析");
    expect(report).not.toContain("CharacterCard");
    expect(report).not.toContain("SceneBeat");
  });

  it("exports the Blueprint implementation backlog as standalone Markdown", () => {
    const result = runBlueprintRoom({
      question: "我想做一个视觉游戏，用多 agent 拆小说。",
      mode: "deep",
      locale: "zh",
      context
    });

    const artifact = createBlueprintBacklogExport({
      question: "我想做一个视觉游戏，用多 agent 拆小说。",
      locale: "zh",
      result
    });

    expect(artifact.filename).toMatch(/^quorummind-blueprint-backlog-/);
    expect(artifact.mimeType).toBe("text/markdown;charset=utf-8");
    expect(artifact.contents).toContain("# QuorumMind 蓝图实施任务清单");
    expect(artifact.contents).toContain("最终共识");
    expect(artifact.contents).toContain("实现章节接入、段落切分和 sourceSpan 索引");
    expect(artifact.contents).toContain("跳过风险");
  });
});
