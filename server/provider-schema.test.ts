import { describe, expect, it } from "vitest";
import { normalizeProviderPayload } from "./provider-schema";

describe("provider schema hardening", () => {
  it("normalizes a valid proposal payload", () => {
    const result = normalizeProviderPayload("proposal", {
      proposalId: "shared-table",
      recommendation: "Use shared tables with tenant_id.",
      criteriaScores: {
        scalability: 80,
        reliability: 78,
        security: 84,
        costEfficiency: 91,
        implementationComplexity: 86,
        maintainability: 82,
        migrationFlexibility: 76,
        teamFit: 88,
        timeToMarket: 92,
        reversibility: 74
      },
      regretByScenario: {
        strictSecurity: 42
      },
      confidence: 0.82
    });

    expect(result.ok).toBe(true);
    expect(result.validationStatus).toBe("valid");
    expect(result.normalized).toMatchObject({
      proposalId: "shared-table",
      recommendation: "Use shared tables with tenant_id.",
      confidence: 0.82
    });
  });

  it("repairs a partial proposal payload with bounded defaults", () => {
    const result = normalizeProviderPayload("proposal", {
      id: "schema-per-tenant",
      recommendation: "Use schema-per-tenant.",
      criteriaScores: {
        security: 120,
        timeToMarket: -10
      },
      confidence: 2
    });

    expect(result.ok).toBe(true);
    expect(result.validationStatus).toBe("repaired");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "criteriaScores.scalability" }),
        expect.objectContaining({ path: "confidence" })
      ])
    );
    expect(result.normalized).toMatchObject({
      proposalId: "schema-per-tenant",
      confidence: 1
    });
    expect(result.normalized?.criteriaScores.security).toBe(100);
    expect(result.normalized?.criteriaScores.timeToMarket).toBe(0);
  });

  it("repairs common provider aliases for proposal fields and numeric strings", () => {
    const result = normalizeProviderPayload("proposal", {
      proposal_id: "modular-monolith",
      decision: "先做模块化单体，暂缓微服务。",
      scores: {
        scalability: "72",
        reliability: "80",
        security: "76",
        cost_efficiency: "88",
        implementation_complexity: "63",
        maintainability: "82",
        migration_flexibility: "79",
        team_fit: "91",
        time_to_market: "90",
        reversibility: "85"
      },
      regrets: {
        scaleSpike: "34"
      },
      confidence: "0.81"
    });

    expect(result.ok).toBe(true);
    expect(result.validationStatus).toBe("repaired");
    expect(result.normalized).toMatchObject({
      proposalId: "modular-monolith",
      recommendation: "先做模块化单体，暂缓微服务。",
      confidence: 0.81
    });
    expect(result.normalized?.criteriaScores.costEfficiency).toBe(88);
    expect(result.normalized?.regretByScenario.scaleSpike).toBe(34);
  });

  it("rejects ranking payloads without usable proposal ids", () => {
    const result = normalizeProviderPayload("ranking", {
      rankedProposalIds: [42, "", null],
      confidence: 0.7
    });

    expect(result.ok).toBe(false);
    expect(result.validationStatus).toBe("invalid");
    expect(result.issues[0]).toMatchObject({
      path: "rankedProposalIds",
      severity: "error"
    });
  });

  it("repairs ranking arrays of objects into proposal ids", () => {
    const result = normalizeProviderPayload("ranking", {
      ranking: [
        { proposal_id: "modular-monolith" },
        { id: "microservices-later" }
      ],
      confidence: "0.74"
    });

    expect(result.ok).toBe(true);
    expect(result.validationStatus).toBe("repaired");
    expect(result.normalized).toMatchObject({
      rankedProposalIds: ["modular-monolith", "microservices-later"],
      confidence: 0.74
    });
  });

  it("normalizes verdict payloads and coerces dissent lists", () => {
    const result = normalizeProviderPayload("verdict", {
      selectedProposalId: "shared-table",
      finalRecommendation: "Choose the low-regret path.",
      whyItWon: ["Best balance.", 123],
      remainingDissent: "Security reviewer wanted stronger isolation."
    });

    expect(result.ok).toBe(true);
    expect(result.validationStatus).toBe("repaired");
    expect(result.normalized).toMatchObject({
      selectedProposalId: "shared-table",
      finalRecommendation: "Choose the low-regret path.",
      whyItWon: ["Best balance."],
      remainingDissent: ["Security reviewer wanted stronger isolation."]
    });
  });

  it("repairs common verdict aliases and object reason lists", () => {
    const result = normalizeProviderPayload("verdict", {
      winnerProposalId: "modular-monolith",
      decision: "选择模块化单体，并设置拆分触发条件。",
      reasons: [{ text: "更符合 5 人团队的交付目标。" }],
      risks: [{ description: "未来边界不清会增加拆分成本。" }]
    });

    expect(result.ok).toBe(true);
    expect(result.validationStatus).toBe("repaired");
    expect(result.normalized).toMatchObject({
      selectedProposalId: "modular-monolith",
      finalRecommendation: "选择模块化单体，并设置拆分触发条件。",
      whyItWon: ["更符合 5 人团队的交付目标。"],
      remainingDissent: ["未来边界不清会增加拆分成本。"]
    });
  });
});
