import { describe, expect, it } from "vitest";
import type { DecisionContext } from "./domain";
import { enrichBlueprintWithModelContributions, runBlueprintRoom } from "./blueprint";

const context: DecisionContext = {
  productStage: "mvp",
  expectedScale: "single creator workflow",
  teamProfile: "Small full-stack team",
  budgetSensitivity: "medium",
  reliabilityRequirement: "medium",
  securityRequirement: "medium",
  existingConstraints: ["Use JSON exports"],
  candidateOptions: ["Multi-agent workflow", "Manual writing workflow"],
  assumptions: ["The source novel can be processed chapter by chapter"]
};

describe("runBlueprintRoom", () => {
  it("creates a Chinese visual-novel multi-agent blueprint with workflow, schemas, critique, and revisions", () => {
    const result = runBlueprintRoom({
      question:
        "我想做一个视觉类游戏，用多 agent 处理小说文本，工作流是什么样，人物字段怎么设计？",
      mode: "deep",
      locale: "zh",
      context
    });

    expect(result.finalSpec.title).toContain("视觉小说");
    expect(result.finalSpec.workflowStages).toHaveLength(7);
    expect(result.finalSpec.recommendedAgentCount).toBe(7);
    expect(result.finalSpec.schemas.map((schema) => schema.name)).toEqual([
      "CharacterCard",
      "SceneBeat",
      "DialogueLine",
      "AssetRequest"
    ]);
    expect(result.drafts.length).toBeGreaterThan(0);
    expect(result.critiques.length).toBeGreaterThan(result.drafts.length);
    expect(result.revisions).toHaveLength(result.drafts.length);
    expect(result.consensusThreshold).toBe(80);
    expect(result.consensusRounds.length).toBeGreaterThanOrEqual(3);
    expect(result.finalConsensusScore).toBeGreaterThanOrEqual(80);
    expect(result.consensusPassed).toBe(true);
    expect(result.consensusRounds.map((round) => round.consensusScore)).toEqual(
      [...result.consensusRounds.map((round) => round.consensusScore)].sort((a, b) => a - b)
    );
    expect(result.finalSpec.markdown).toContain("## 工作流");
    expect(result.finalSpec.markdown).toContain("## 共识收敛记录");
    expect(result.finalSpec.markdown).toContain("阈值：80%");
    expect(result.finalSpec.markdown).toContain("必填");
    expect(result.finalSpec.targetOutputs.length).toBeGreaterThanOrEqual(5);
    expect(result.finalSpec.successCriteria.length).toBeGreaterThanOrEqual(5);
    expect(result.finalSpec.systemAgents).toHaveLength(7);
    expect(result.finalSpec.implementationPlan.length).toBeGreaterThanOrEqual(4);
    expect(result.finalSpec.evaluationMatrix).toHaveLength(6);
    expect(result.finalSpec.evaluationMatrix.every((item) => item.score >= 0 && item.score <= 100)).toBe(true);
    expect(result.finalSpec.detailedRecommendations.length).toBeGreaterThanOrEqual(6);
    expect(result.finalSpec.detailedRecommendations[0]).toMatchObject({
      priority: "high",
      ownerAgentId: "quality-reviewer"
    });
    expect(result.finalSpec.adoptionLedger.length).toBeGreaterThan(result.critiques.length);
    expect(result.finalSpec.adoptionLedger.map((item) => item.adoptionStatus)).toContain("adopted");
    expect(result.finalSpec.adoptionLedger.map((item) => item.adoptionStatus)).toContain("deferred");
    expect(result.finalSpec.implementationBacklog.length).toBeGreaterThanOrEqual(8);
    expect(result.finalSpec.implementationBacklog[0]).toMatchObject({
      priority: "P0",
      ownerAgentId: "chapter-parser"
    });
    expect(result.finalSpec.markdown).toContain("## 目标系统 Agent 设计");
    expect(result.finalSpec.markdown).toContain("## 终局评估矩阵");
    expect(result.finalSpec.markdown).toContain("## 详细优化建议");
    expect(result.finalSpec.markdown).toContain("## 质询采纳账本");
    expect(result.finalSpec.markdown).toContain("## 实施任务清单");
    expect(result.finalSpec.markdown).toContain("## 多 Agent 协作与互评协议");
    expect(result.finalSpec.markdown).toContain("## 实施计划");
  });

  it("creates role-specific critiques instead of repeating one generic critique", () => {
    const result = runBlueprintRoom({
      question:
        "我想做一个视觉类游戏，用多 agent 处理小说文本，工作流是什么样，人物字段怎么设计？",
      mode: "deep",
      locale: "zh",
      context
    });

    const visibleCritiques = result.critiques.slice(0, 6);
    const uniqueGaps = new Set(visibleCritiques.map((critique) => critique.criticalGap));
    const uniqueSuggestions = new Set(visibleCritiques.flatMap((critique) => critique.improvementSuggestions));

    expect(uniqueGaps.size).toBeGreaterThanOrEqual(5);
    expect(uniqueSuggestions.size).toBeGreaterThanOrEqual(12);
    expect(result.revisions[0].incorporatedFeedback.length).toBeGreaterThanOrEqual(5);
    expect(new Set(result.revisions[0].incorporatedFeedback).size).toBe(result.revisions[0].incorporatedFeedback.length);
  });

  it("adds usable model contributions into the final blueprint markdown", () => {
    const result = runBlueprintRoom({
      question:
        "我想做一个视觉类游戏，用多 agent 处理小说文本，工作流是什么样，人物字段怎么设计？",
      mode: "deep",
      locale: "zh",
      context
    });
    const enriched = enrichBlueprintWithModelContributions(
      result,
      [
        {
          provider: "openai",
          model: "mock-model",
          agentName: "GPT Product Architect",
          phase: "proposal",
          status: "ok",
          parsed: {
            title: "章节到 VN 场景生产方案",
            recommendation: "先做章节级结构化，再逐步扩展为场景、对白和资产需求。",
            strengths: ["章节级闭环清晰", "便于人工复审"],
            weaknesses: ["资产范围可能膨胀"]
          }
        }
      ],
      "zh"
    );

    expect(enriched.finalSpec.modelContributions).toHaveLength(1);
    expect(enriched.consensusRounds.at(-1)?.phase).toBe("final");
    expect(enriched.finalConsensusScore).toBeGreaterThan(result.finalConsensusScore);
    expect(enriched.finalSpec.detailedRecommendations.map((recommendation) => recommendation.id)).toContain("live-model-evidence-loop");
    expect(enriched.finalSpec.evaluationMatrix.find((item) => item.id === "reviewability")?.evidence.join(" ")).toContain("真实模型贡献");
    expect(enriched.finalSpec.markdown).toContain("章节到 VN 场景生产方案");
    expect(enriched.finalSpec.markdown).toContain("章节级闭环清晰");
  });

  it("varies consensus by request specificity instead of using a fixed score bucket", () => {
    const shallow = runBlueprintRoom({
      question: "帮我做一个工具。",
      mode: "deep",
      locale: "zh",
      context
    });
    const detailed = runBlueprintRoom({
      question:
        "我想做一个面向中小跨境电商团队的 AI 运营助手，需要根据订单、库存、广告投放和客服对话生成每日简报、补货建议、广告预算建议、差评处理优先级，并设计 Agent 分工、数据流、Schema、风险控制、MVP 路线和评估指标。",
      mode: "deep",
      locale: "zh",
      context
    });

    expect(detailed.finalConsensusScore).toBeGreaterThan(shallow.finalConsensusScore);
    expect(new Set([...shallow.consensusRounds, ...detailed.consensusRounds].map((round) => round.consensusScore)).size).toBeGreaterThan(3);
  });

  it("weights live model consensus bump by contribution quality instead of a fixed maximum bump", () => {
    const result = runBlueprintRoom({
      question:
        "我想做一个视觉类游戏，用多 agent 处理小说文本，工作流是什么样，人物字段怎么设计？",
      mode: "deep",
      locale: "zh",
      context
    });
    const weak = enrichBlueprintWithModelContributions(
      result,
      [
        {
          provider: "openai",
          model: "mock-model",
          agentName: "GPT Product Architect",
          phase: "proposal",
          status: "ok",
          parsed: {
            recommendation: "可以先做 MVP。"
          }
        }
      ],
      "zh"
    );
    const rich = enrichBlueprintWithModelContributions(
      result,
      [
        {
          provider: "openai",
          model: "mock-model",
          agentName: "GPT Product Architect",
          phase: "proposal",
          status: "ok",
          parsed: {
            title: "章节到 VN 场景生产方案",
            recommendation: "先做章节级结构化，再逐步扩展为场景、对白、资产需求和人工复审队列。",
            strengths: ["章节级闭环清晰", "便于人工复审", "Schema 边界明确"],
            weaknesses: ["资产范围可能膨胀", "低置信度对白需要人工确认"]
          }
        },
        {
          provider: "deepseek",
          model: "mock-model",
          agentName: "DeepSeek Risk Reviewer",
          phase: "revision",
          status: "ok",
          parsed: {
            title: "风险修订建议",
            recommendation: "把人物一致性、剧情覆盖率、对白归属和资产闭环作为四个验收指标。",
            strengths: ["评估指标可量化", "人工接管点清晰"],
            weaknesses: ["需要准备回归样本"]
          }
        }
      ],
      "zh"
    );

    expect(weak.finalConsensusScore).toBeGreaterThan(result.finalConsensusScore);
    expect(rich.finalConsensusScore).toBeGreaterThan(weak.finalConsensusScore);
    expect(rich.finalConsensusScore - result.finalConsensusScore).toBeLessThanOrEqual(5);
  });

  it("keeps a non-game multi-agent blueprint grounded in the actual question instead of a visual-novel template", () => {
    const result = runBlueprintRoom({
      question:
        "我想做一个面向中小跨境电商团队的 AI 运营助手。它需要根据店铺订单、商品库存、广告投放数据和客服对话，自动生成每日运营简报，并给出补货建议、广告预算调整建议、差评处理优先级和客服话术优化方案。\n\n请帮我设计一套完整的产品蓝图，包括：\n1. 应该设计哪些 Agent，它们分别负责什么？\n2. 数据从哪些系统进入，整体工作流怎么编排？\n3. 每个 Agent 的输入、输出和需要调用的工具是什么？\n4. 关键数据表或 JSON Schema 应该怎么设计？\n5. 如何避免错误建议导致库存积压、广告浪费或客服误回复？\n6. MVP 阶段应该先做哪些功能，后续版本如何迭代？\n7. 如何评估这个多 Agent 系统的效果，包括准确性、延迟、成本和人工采纳率？",
      mode: "deep",
      locale: "zh",
      context
    });
    const markdown = result.finalSpec.markdown;
    const schemaNames = result.finalSpec.schemas.map((schema) => schema.name);

    expect(result.finalSpec.title).toContain("跨境电商");
    expect(result.finalSpec.title).toContain("AI 运营助手");
    expect(result.finalSpec.workflowStages).toHaveLength(6);
    expect(result.finalSpec.recommendedAgentCount).toBeGreaterThanOrEqual(6);
    expect(schemaNames).toEqual([
      "Requirement",
      "DataSourceProfile",
      "WorkflowArtifact",
      "RecommendationItem",
      "EvaluationMetric"
    ]);
    expect(markdown).toContain("订单数据");
    expect(markdown).toContain("库存数据");
    expect(markdown).toContain("广告投放数据");
    expect(markdown).toContain("客服对话");
    expect(markdown).toContain("补货建议");
    expect(markdown).toContain("差评处理优先级");
    expect(markdown).toContain("人工采纳率");
    expect(markdown).not.toContain("视觉小说");
    expect(markdown).not.toContain("章节解析");
    expect(markdown).not.toContain("CharacterCard");
    expect(markdown).not.toContain("SceneBeat");
    expect(markdown).not.toContain("DialogueLine");
  });

  it("falls back to a generic open-ended blueprint for non-game requests", () => {
    const result = runBlueprintRoom({
      question: "帮我设计一个企业客户 onboarding 的多团队协作流程。",
      mode: "fast",
      locale: "zh",
      context
    });

    expect(result.finalSpec.title).toContain("onboarding");
    expect(result.finalSpec.workflowStages).toHaveLength(6);
    expect(result.finalSpec.schemas.map((schema) => schema.name)).toContain("Requirement");
    expect(result.finalSpec.markdown).not.toContain("视觉小说");
  });
});
