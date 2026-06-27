import { describe, expect, it } from "vitest";
import type { DecisionContext } from "./domain";
import { buildAHPAnalysis, deriveAHPWeights } from "./ahp";

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

const criteria = {
  scalability: 80,
  reliability: 80,
  security: 80,
  costEfficiency: 80,
  implementationComplexity: 80,
  maintainability: 80,
  migrationFlexibility: 80,
  teamFit: 80,
  timeToMarket: 80,
  reversibility: 80
};

describe("AHP decision analysis", () => {
  it("derives normalized priority weights from decision context", () => {
    const weights = deriveAHPWeights(context);
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);

    expect(Math.round(total * 100)).toBe(100);
    expect(weights.security).toBeGreaterThan(weights.scalability);
    expect(weights.timeToMarket).toBeGreaterThan(weights.maintainability);
    expect(weights.teamFit).toBeGreaterThan(weights.maintainability);
  });

  it("builds sensitivity scenarios and reports whether the winner is stable", () => {
    const analysis = buildAHPAnalysis({
      context,
      proposals: [
        {
          proposalId: "shared",
          criteriaScores: {
            ...criteria,
            costEfficiency: 92,
            teamFit: 90,
            timeToMarket: 94
          },
          confidence: 0.86,
          regretByScenario: { strictSecurity: 42, budgetPressure: 10 }
        },
        {
          proposalId: "schema",
          criteriaScores: {
            ...criteria,
            security: 94,
            reliability: 88,
            costEfficiency: 62,
            timeToMarket: 58
          },
          confidence: 0.78,
          regretByScenario: { strictSecurity: 12, budgetPressure: 68 }
        }
      ],
      rankings: [
        { agentId: "gpt", rankedProposalIds: ["shared", "schema"], confidence: 0.84 },
        { agentId: "deepseek", rankedProposalIds: ["shared", "schema"], confidence: 0.8 },
        { agentId: "gemini", rankedProposalIds: ["schema", "shared"], confidence: 0.74 }
      ]
    });

    expect(analysis.consistencyRatio).toBeLessThan(0.1);
    expect(analysis.sensitivityScenarios).toHaveLength(4);
    expect(analysis.sensitivityScenarios[0]).toMatchObject({
      scenarioId: expect.any(String),
      selectedProposalId: expect.any(String),
      changedWinner: expect.any(Boolean)
    });
    expect(analysis.stableWinnerRate).toBeGreaterThanOrEqual(50);
  });
});
