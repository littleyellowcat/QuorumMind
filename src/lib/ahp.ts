import type { AgentRanking, AHPAnalysis, CriteriaScores, CriteriaWeights, DecisionContext } from "./domain";
import { scoreProposals } from "./scoring";

type AHPProposalInput = {
  proposalId: string;
  criteriaScores: CriteriaScores;
  confidence: number;
  regretByScenario: Record<string, number>;
};

type BuildAHPAnalysisInput = {
  context: DecisionContext;
  proposals: AHPProposalInput[];
  rankings: AgentRanking[];
};

const criteriaKeys = [
  "scalability",
  "reliability",
  "security",
  "costEfficiency",
  "implementationComplexity",
  "maintainability",
  "migrationFlexibility",
  "teamFit",
  "timeToMarket",
  "reversibility"
] as const;

const baseWeights: CriteriaWeights = {
  scalability: 0.1,
  reliability: 0.1,
  security: 0.1,
  costEfficiency: 0.1,
  implementationComplexity: 0.1,
  maintainability: 0.1,
  migrationFlexibility: 0.1,
  teamFit: 0.1,
  timeToMarket: 0.1,
  reversibility: 0.1
};

export function deriveAHPWeights(context: DecisionContext): CriteriaWeights {
  const weighted = { ...baseWeights };

  if (context.productStage === "mvp" || context.productStage === "prototype") {
    weighted.timeToMarket += 0.08;
    weighted.teamFit += 0.06;
    weighted.implementationComplexity += 0.04;
  }

  if (context.productStage === "scale" || context.productStage === "enterprise") {
    weighted.scalability += 0.06;
    weighted.reliability += 0.06;
    weighted.maintainability += 0.04;
  }

  if (context.securityRequirement === "high") {
    weighted.security += 0.08;
    weighted.reversibility += 0.03;
  }

  if (context.reliabilityRequirement === "high") {
    weighted.reliability += 0.08;
    weighted.maintainability += 0.03;
  }

  if (context.budgetSensitivity === "high") {
    weighted.costEfficiency += 0.08;
    weighted.implementationComplexity += 0.03;
  }

  return normalizeWeights(weighted);
}

export function buildAHPAnalysis(input: BuildAHPAnalysisInput): AHPAnalysis {
  const priorityWeights = deriveAHPWeights(input.context);
  const baseline = scoreProposals({
    proposals: input.proposals,
    rankings: input.rankings,
    weights: priorityWeights
  }).ranked[0];
  const baselineWinner = baseline?.proposalId ?? input.proposals[0]?.proposalId ?? "none";
  const scenarios = [
    sensitivityScenario("security-first", "Security-first", { security: 0.1, reversibility: 0.04 }),
    sensitivityScenario("speed-first", "Speed-first", { timeToMarket: 0.1, teamFit: 0.04 }),
    sensitivityScenario("cost-first", "Cost-first", { costEfficiency: 0.1, implementationComplexity: 0.04 }),
    sensitivityScenario("reliability-first", "Reliability-first", { reliability: 0.1, maintainability: 0.04 })
  ].map((scenario) => {
    const weights = normalizeWeights(applyWeightDelta(priorityWeights, scenario.weightDelta));
    const winner = scoreProposals({
      proposals: input.proposals,
      rankings: input.rankings,
      weights
    }).ranked[0];

    return {
      ...scenario,
      selectedProposalId: winner?.proposalId ?? baselineWinner,
      quorumScore: winner?.quorumScore ?? 0,
      changedWinner: (winner?.proposalId ?? baselineWinner) !== baselineWinner
    };
  });
  const stableCount = scenarios.filter((scenario) => !scenario.changedWinner).length;
  const consistencyRatio = estimateConsistencyRatio(priorityWeights);

  return {
    priorityWeights,
    consistencyRatio,
    consistencyAssessment: consistencyRatio < 0.05 ? "strong" : consistencyRatio < 0.1 ? "acceptable" : "review",
    stableWinnerRate: scenarios.length === 0 ? 100 : Math.round((stableCount / scenarios.length) * 100),
    sensitivityScenarios: scenarios
  };
}

function sensitivityScenario(
  scenarioId: string,
  label: string,
  weightDelta: Partial<CriteriaWeights>
): Omit<AHPAnalysis["sensitivityScenarios"][number], "selectedProposalId" | "quorumScore" | "changedWinner"> {
  return {
    scenarioId,
    label,
    weightDelta
  };
}

function applyWeightDelta(weights: CriteriaWeights, delta: Partial<CriteriaWeights>): CriteriaWeights {
  return Object.fromEntries(criteriaKeys.map((key) => [key, weights[key] + (delta[key] ?? 0)])) as CriteriaWeights;
}

function normalizeWeights(weights: CriteriaWeights): CriteriaWeights {
  const total = criteriaKeys.reduce((sum, key) => sum + Math.max(0, weights[key]), 0);

  if (total === 0) {
    return baseWeights;
  }

  return Object.fromEntries(criteriaKeys.map((key) => [key, roundWeight(Math.max(0, weights[key]) / total)])) as CriteriaWeights;
}

function estimateConsistencyRatio(weights: CriteriaWeights): number {
  const values = criteriaKeys.map((key) => weights[key]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const spread = max === 0 ? 0 : (max - min) / max;

  return Math.round(Math.min(0.12, spread * 0.12) * 100) / 100;
}

function roundWeight(value: number): number {
  return Math.round(value * 1000) / 1000;
}
