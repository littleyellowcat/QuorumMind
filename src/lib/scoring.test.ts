import { describe, expect, it } from "vitest";
import {
  calculateBordaScores,
  calculateDissentIndex,
  calculateQuorumScore,
  scoreProposals
} from "./scoring";

const balancedCriteria = {
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

describe("consensus scoring", () => {
  it("ranks the most preferred proposal first with Borda Count", () => {
    const scores = calculateBordaScores(
      [
        { agentId: "architect", rankedProposalIds: ["shared-db", "schema-db", "microservice-db"] },
        { agentId: "sre", rankedProposalIds: ["shared-db", "microservice-db", "schema-db"] },
        { agentId: "security", rankedProposalIds: ["schema-db", "shared-db", "microservice-db"] }
      ],
      ["shared-db", "schema-db", "microservice-db"]
    );

    expect(scores["shared-db"]).toBeGreaterThan(scores["schema-db"]);
    expect(scores["schema-db"]).toBeGreaterThan(scores["microservice-db"]);
  });

  it("reports higher dissent when agents strongly disagree", () => {
    const aligned = calculateDissentIndex([
      { agentId: "architect", rankedProposalIds: ["a", "b", "c"] },
      { agentId: "sre", rankedProposalIds: ["a", "b", "c"] },
      { agentId: "security", rankedProposalIds: ["a", "b", "c"] }
    ]);

    const divided = calculateDissentIndex([
      { agentId: "architect", rankedProposalIds: ["a", "b", "c"] },
      { agentId: "sre", rankedProposalIds: ["c", "b", "a"] },
      { agentId: "security", rankedProposalIds: ["b", "c", "a"] }
    ]);

    expect(aligned).toBe(0);
    expect(divided).toBeGreaterThan(aligned);
    expect(divided).toBeLessThanOrEqual(100);
  });

  it("penalizes a high-regret proposal even when base utility is strong", () => {
    const lowRegret = calculateQuorumScore({
      bordaScore: 80,
      weightedUtility: 85,
      confidence: 0.85,
      regretPenalty: 10
    });

    const highRegret = calculateQuorumScore({
      bordaScore: 80,
      weightedUtility: 85,
      confidence: 0.85,
      regretPenalty: 85
    });

    expect(lowRegret).toBeGreaterThan(highRegret);
  });

  it("sorts proposals by final Quorum Score", () => {
    const result = scoreProposals({
      proposals: [
        {
          proposalId: "simple-monolith",
          criteriaScores: balancedCriteria,
          confidence: 0.82,
          regretByScenario: {
            trafficSpike: 20,
            smallTeam: 5,
            strictSecurity: 25,
            budgetPressure: 10
          }
        },
        {
          proposalId: "early-microservices",
          criteriaScores: {
            ...balancedCriteria,
            scalability: 94,
            implementationComplexity: 35,
            teamFit: 30,
            timeToMarket: 25
          },
          confidence: 0.65,
          regretByScenario: {
            trafficSpike: 15,
            smallTeam: 95,
            strictSecurity: 60,
            budgetPressure: 90
          }
        }
      ],
      rankings: [
        { agentId: "architect", rankedProposalIds: ["simple-monolith", "early-microservices"] },
        { agentId: "sre", rankedProposalIds: ["simple-monolith", "early-microservices"] },
        { agentId: "builder", rankedProposalIds: ["simple-monolith", "early-microservices"] }
      ],
      weights: {
        scalability: 0.1,
        reliability: 0.1,
        security: 0.1,
        costEfficiency: 0.1,
        implementationComplexity: 0.15,
        maintainability: 0.1,
        migrationFlexibility: 0.1,
        teamFit: 0.15,
        timeToMarket: 0.1,
        reversibility: 0.1
      }
    });

    expect(result.ranked[0]?.proposalId).toBe("simple-monolith");
    expect(result.dissentIndex).toBe(0);
  });
});
