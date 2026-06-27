import { describe, expect, it } from "vitest";
import {
  calculateBayesianVoteWeights,
  calculateBordaScores,
  calculateDissentIndex,
  calculateMonteCarloStressLens,
  calculateQuorumScore,
  calculateRegretMap,
  calculateTopsisLens,
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

  it("uses Bayesian weighted voting when ranking agents include confidence and reputation", () => {
    const weights = calculateBayesianVoteWeights([
      {
        agentId: "senior-security",
        rankedProposalIds: ["schema-db", "shared-db"],
        weight: 1.2,
        confidence: 0.92,
        reputationScore: 90
      },
      {
        agentId: "weak-builder",
        rankedProposalIds: ["shared-db", "schema-db"],
        weight: 0.7,
        confidence: 0.52,
        reputationScore: 55
      }
    ]);
    const scores = calculateBordaScores(
      [
        {
          agentId: "senior-security",
          rankedProposalIds: ["schema-db", "shared-db"],
          weight: 1.2,
          confidence: 0.92,
          reputationScore: 90
        },
        {
          agentId: "weak-builder",
          rankedProposalIds: ["shared-db", "schema-db"],
          weight: 0.7,
          confidence: 0.52,
          reputationScore: 55
        }
      ],
      ["shared-db", "schema-db"]
    );

    expect(weights[0]).toMatchObject({
      agentId: "senior-security",
      baseWeight: 1.2,
      reputationScore: 90
    });
    expect(weights[0].posteriorConfidence).toBeGreaterThan(weights[1].posteriorConfidence);
    expect(weights[0].effectiveVoteWeight).toBeGreaterThan(weights[1].effectiveVoteWeight);
    expect(scores["schema-db"]).toBeGreaterThan(scores["shared-db"]);
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

  it("builds a minimax regret map from scenario regrets", () => {
    const regretMap = calculateRegretMap([
      {
        proposalId: "shared-tables",
        regretByScenario: {
          trafficSpike: 32,
          strictSecurity: 48,
          budgetPressure: 7
        }
      },
      {
        proposalId: "database-per-tenant",
        regretByScenario: {
          trafficSpike: 18,
          strictSecurity: 10,
          budgetPressure: 84
        }
      }
    ]);

    expect(regretMap[0]).toMatchObject({
      proposalId: "shared-tables",
      minimaxRank: 1,
      worstScenario: "strictSecurity",
      worstRegret: 48
    });
    expect(regretMap[1]).toMatchObject({
      proposalId: "database-per-tenant",
      minimaxRank: 2,
      worstScenario: "budgetPressure",
      worstRegret: 84
    });
  });

  it("builds a TOPSIS decision lens from weighted criteria scores", () => {
    const lens = calculateTopsisLens(
      [
        {
          proposalId: "balanced-option",
          criteriaScores: {
            ...balancedCriteria,
            security: 88,
            teamFit: 86,
            timeToMarket: 84
          }
        },
        {
          proposalId: "lopsided-option",
          criteriaScores: {
            ...balancedCriteria,
            security: 95,
            teamFit: 45,
            timeToMarket: 42
          }
        }
      ],
      {
        scalability: 0.1,
        reliability: 0.1,
        security: 0.18,
        costEfficiency: 0.1,
        implementationComplexity: 0.1,
        maintainability: 0.1,
        migrationFlexibility: 0.1,
        teamFit: 0.12,
        timeToMarket: 0.1,
        reversibility: 0.1
      }
    );

    expect(lens[0]).toMatchObject({
      proposalId: "balanced-option",
      topsisRank: 1
    });
    expect(lens[0].closenessScore).toBeGreaterThan(lens[1].closenessScore);
    expect(lens[0].distanceToIdeal).toBeLessThan(lens[1].distanceToIdeal);
    expect(lens[0].distanceToAntiIdeal).toBeGreaterThan(lens[1].distanceToAntiIdeal);
  });

  it("builds a deterministic Monte Carlo stress lens from score uncertainty", () => {
    const lens = calculateMonteCarloStressLens(
      [
        {
          proposalId: "steady-option",
          criteriaScores: {
            ...balancedCriteria,
            reliability: 88,
            security: 86,
            teamFit: 85
          },
          confidence: 0.88,
          regretByScenario: {
            trafficSpike: 22,
            strictSecurity: 28,
            budgetPressure: 16
          }
        },
        {
          proposalId: "swingy-option",
          criteriaScores: {
            ...balancedCriteria,
            scalability: 96,
            reliability: 62,
            teamFit: 48,
            timeToMarket: 52
          },
          confidence: 0.58,
          regretByScenario: {
            trafficSpike: 12,
            strictSecurity: 72,
            budgetPressure: 82
          }
        }
      ],
      {
        scalability: 0.1,
        reliability: 0.12,
        security: 0.14,
        costEfficiency: 0.1,
        implementationComplexity: 0.1,
        maintainability: 0.1,
        migrationFlexibility: 0.1,
        teamFit: 0.12,
        timeToMarket: 0.1,
        reversibility: 0.02
      },
      { iterations: 120, seed: 17 }
    );

    expect(lens[0]).toMatchObject({
      proposalId: "steady-option",
      monteCarloRank: 1
    });
    expect(lens[0].winRate).toBeGreaterThan(lens[1].winRate);
    expect(lens[0].averageScore).toBeGreaterThan(lens[1].averageScore);
    expect(lens[0].downsideP10).toBeGreaterThan(lens[1].downsideP10);
    expect(lens[0].worstScore).toBeLessThanOrEqual(lens[0].downsideP10);
  });

  it("sorts proposals by final Decision Score", () => {
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
