// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DecisionContext } from "../src/lib/domain";
import { runLiveDecisionRoom } from "./live-agents";
import type { ModelProvider, ProviderRequest } from "./providers/types";

const context: DecisionContext = {
  productStage: "mvp",
  expectedScale: "未来 6 个月服务 20 个企业客户",
  teamProfile: "5 人 Node.js 团队",
  budgetSensitivity: "high",
  reliabilityRequirement: "medium",
  securityRequirement: "high",
  existingConstraints: ["当前是单体 Node.js 后端"],
  candidateOptions: ["继续单体", "拆成微服务"],
  assumptions: ["主要目标是快速交付企业客户功能"]
};

describe("runLiveDecisionRoom", () => {
  it("passes the requested Chinese locale through every live provider call", async () => {
    const seenLocales: Array<ProviderRequest["locale"]> = [];
    const provider: ModelProvider = {
      id: "openai",
      model: "locale-probe",
      async generateDecisionText(request) {
        seenLocales.push(request.locale);
        return JSON.stringify(payloadForRequest(request));
      }
    };

    const result = await runLiveDecisionRoom({
      question: "我们是否应该把当前单体 Node.js 后端拆成微服务？",
      mode: "fast",
      context,
      providers: [provider],
      locale: "zh"
    });

    expect(result.initialProposals).toHaveLength(3);
    expect(seenLocales.length).toBeGreaterThan(0);
    expect(seenLocales.every((locale) => locale === "zh")).toBe(true);
  });
});

function payloadForRequest(request: ProviderRequest): unknown {
  if (request.phase === "critique") {
    return {
      targetProposalId: "Proposal A",
      strongestArgument: "中文评审：先保留模块化单体可以保护交付速度。",
      weakestAssumption: "模块边界可能继续腐化。",
      hiddenRisks: ["拆分过早会增加部署和排障成本。"],
      missingConsiderations: ["需要服务抽取触发条件。"],
      improvementSuggestions: ["补充模块边界检查和观测指标。"],
      scores: criteriaScores(82)
    };
  }

  return {
    proposalId: `${request.agentName}-${request.phase}`,
    title: "中文方案",
    recommendation: "先保持模块化单体，建立清晰边界，再按指标选择性拆分。",
    reasoning: "团队规模和 6 个月交付目标不适合一次性微服务化。",
    alternatives: ["全量微服务", "选择性拆分"],
    strengths: ["交付快", "运维成本低"],
    weaknesses: ["需要边界治理"],
    assumptions: ["当前规模尚未证明需要独立服务扩展"],
    risks: [
      {
        category: "complexity",
        severity: "medium",
        description: "模块边界如果缺少治理会退化。",
        mitigation: "增加 CI 边界检查。"
      }
    ],
    criteriaScores: criteriaScores(84),
    regretByScenario: {
      enterpriseFeatureRush: 8,
      teamTurnover: 18
    },
    confidence: 0.84
  };
}

function criteriaScores(score: number) {
  return {
    scalability: score,
    reliability: score,
    security: score,
    costEfficiency: score,
    implementationComplexity: score,
    maintainability: score,
    migrationFlexibility: score,
    teamFit: score,
    timeToMarket: score,
    reversibility: score
  };
}
