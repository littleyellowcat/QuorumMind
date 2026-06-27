import { describe, expect, it } from "vitest";
import { runDecisionRoom } from "./workflow";

describe("Decision Room workflow", () => {
  it("runs a complete Deep Quorum architecture decision", () => {
    const result = runDecisionRoom({
      question:
        "Should a B2B SaaS MVP use schema-per-tenant or shared tables with tenant_id in PostgreSQL?",
      mode: "deep",
      context: {
        productStage: "mvp",
        expectedScale: "First six months: 50 tenants and fewer than 10,000 daily active users.",
        teamProfile: "Small full-stack team with strong PostgreSQL experience.",
        budgetSensitivity: "high",
        reliabilityRequirement: "medium",
        securityRequirement: "high",
        existingConstraints: ["Use PostgreSQL", "Ship MVP in eight weeks"],
        candidateOptions: ["Shared tables with tenant_id", "Schema per tenant", "Database per tenant"],
        assumptions: ["No hard regulatory tenant isolation requirement at launch"]
      }
    });

    expect(result.agents.length).toBeGreaterThanOrEqual(3);
    expect(result.initialProposals.length).toBe(result.agents.length);
    expect(result.critiques.length).toBeGreaterThan(result.initialProposals.length);
    expect(result.revisedProposals.length).toBe(result.initialProposals.length);
    expect(result.verdict.quorumScore).toBeGreaterThan(0);
    expect(result.verdict.dissentIndex).toBeGreaterThanOrEqual(0);
    expect(result.verdict.assumptionLedger[0]).toMatchObject({
      proposalId: expect.any(String),
      assumption: expect.any(String),
      riskLevel: expect.stringMatching(/low|medium|high/),
      validationQuestion: expect.stringMatching(/\?$/),
      validationAction: expect.any(String)
    });
    expect(result.verdict.regretMap[0]).toMatchObject({
      proposalId: expect.any(String),
      minimaxRank: 1,
      worstScenario: expect.any(String),
      worstRegret: expect.any(Number),
      averageRegret: expect.any(Number)
    });
    expect(result.verdict.topsisLens[0]).toMatchObject({
      proposalId: expect.any(String),
      topsisRank: 1,
      closenessScore: expect.any(Number),
      distanceToIdeal: expect.any(Number),
      distanceToAntiIdeal: expect.any(Number)
    });
    expect(result.verdict.monteCarloStress[0]).toMatchObject({
      proposalId: expect.any(String),
      monteCarloRank: 1,
      winRate: expect.any(Number),
      averageScore: expect.any(Number),
      downsideP10: expect.any(Number),
      worstScore: expect.any(Number)
    });
    expect(result.verdict.ahpAnalysis).toMatchObject({
      consistencyRatio: expect.any(Number),
      stableWinnerRate: expect.any(Number),
      sensitivityScenarios: expect.arrayContaining([
        expect.objectContaining({
          scenarioId: expect.any(String),
          selectedProposalId: expect.any(String),
          changedWinner: expect.any(Boolean)
        })
      ])
    });
    expect(result.verdict.bayesianVoteWeights[0]).toMatchObject({
      agentId: expect.any(String),
      posteriorConfidence: expect.any(Number),
      effectiveVoteWeight: expect.any(Number)
    });
    expect(result.verdict.delphiRounds.map((round) => round.phase)).toEqual([
      "proposal",
      "blind_review",
      "cross_examination",
      "revision",
      "consensus",
      "final_verdict"
    ]);
    expect(result.verdict.delphiRounds.find((round) => round.phase === "blind_review")).toMatchObject({
      anonymity: "blind",
      status: "complete"
    });
    expect(result.verdict.adrMarkdown).toContain("# ADR:");
    expect(result.verdict.adrMarkdown).toContain("## Regret Map");
    expect(result.verdict.adrMarkdown).toContain("## TOPSIS Decision Lens");
    expect(result.verdict.adrMarkdown).toContain("## Monte Carlo Stress Lens");
    expect(result.verdict.adrMarkdown).toContain("## AHP Sensitivity Analysis");
    expect(result.verdict.adrMarkdown).toContain("## Rollback Plan");
  });

  it("adapts the demo decision to a Node.js monolith versus microservices question", () => {
    const result = runDecisionRoom({
      question:
        "我们是否应该把当前单体 Node.js 后端拆成微服务？团队 5 人，未来 6 个月主要目标是快速交付企业客户功能。",
      mode: "deep",
      context: {
        productStage: "mvp",
        expectedScale: "First six months: one main backend and a few enterprise customer workflows.",
        teamProfile: "Small full-stack Node.js team of 5 engineers focused on delivery.",
        budgetSensitivity: "high",
        reliabilityRequirement: "medium",
        securityRequirement: "medium",
        existingConstraints: ["Use Node.js", "Ship enterprise features in six months"],
        candidateOptions: ["Modular monolith", "Selective service extraction", "Full microservices now"],
        assumptions: ["No immediate compliance requirement for service isolation"]
      }
    });

    expect(result.question).toContain("单体 Node.js 后端");
    expect(result.verdict.adr.title.toLowerCase()).toContain("monolith");
    expect(result.verdict.finalRecommendation.toLowerCase()).toContain("monolith");
    expect(result.initialProposals[0].recommendation.toLowerCase()).not.toContain("tenant_id");
    expect(result.verdict.preMortem.join(" ")).toContain("service");
  });

  it("uses a generic reversible decision path instead of tenant isolation for unmatched questions", () => {
    const result = runDecisionRoom({
      question: "我们应该自研还是购买一个客户成功系统？",
      mode: "deep",
      context: {
        productStage: "mvp",
        expectedScale: "Internal tooling decision for a small team.",
        teamProfile: "Small product engineering team balancing delivery speed and operating cost.",
        budgetSensitivity: "medium",
        reliabilityRequirement: "medium",
        securityRequirement: "medium",
        existingConstraints: ["Avoid long platform work", "Keep the first step reversible"],
        candidateOptions: ["Buy SaaS", "Build in-house", "Hybrid integration"],
        assumptions: ["The team can validate workflow fit before committing deeply"]
      }
    });

    const visibleText = [
      result.verdict.adr.title,
      result.verdict.finalRecommendation,
      ...result.initialProposals.map((proposal) => proposal.recommendation),
      ...result.verdict.preMortem
    ].join(" ");

    expect(visibleText.toLowerCase()).toContain("validation");
    expect(visibleText.toLowerCase()).not.toContain("tenant_id");
    expect(visibleText.toLowerCase()).not.toContain("schema-per-tenant");
    expect(visibleText.toLowerCase()).not.toContain("postgresql");
  });
});
