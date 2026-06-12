import type { AgentRanking, CriteriaScores, CriteriaWeights, ScoredProposal } from "./domain";

type ScoreInput = {
  proposalId: string;
  criteriaScores: CriteriaScores;
  confidence: number;
  regretByScenario: Record<string, number>;
};

type ScoreProposalsInput = {
  proposals: ScoreInput[];
  rankings: AgentRanking[];
  weights: CriteriaWeights;
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

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export function calculateBordaScores(rankings: AgentRanking[], proposalIds: string[]): Record<string, number> {
  const scores = Object.fromEntries(proposalIds.map((id) => [id, 0]));
  const proposalCount = proposalIds.length;

  for (const ranking of rankings) {
    ranking.rankedProposalIds.forEach((proposalId, index) => {
      scores[proposalId] = (scores[proposalId] ?? 0) + proposalCount - index - 1;
    });
  }

  return scores;
}

export function calculateDissentIndex(rankings: AgentRanking[]): number {
  if (rankings.length < 2) {
    return 0;
  }

  let totalDistance = 0;
  let pairCount = 0;

  for (let i = 0; i < rankings.length; i += 1) {
    for (let j = i + 1; j < rankings.length; j += 1) {
      totalDistance += normalizedRankDistance(rankings[i].rankedProposalIds, rankings[j].rankedProposalIds);
      pairCount += 1;
    }
  }

  return Math.round((totalDistance / pairCount) * 100);
}

export function calculateWeightedUtility(criteriaScores: CriteriaScores, weights: CriteriaWeights): number {
  const totalWeight = criteriaKeys.reduce((sum, key) => sum + weights[key], 0);

  if (totalWeight === 0) {
    return 0;
  }

  const weighted = criteriaKeys.reduce((sum, key) => sum + criteriaScores[key] * weights[key], 0);
  return clamp(Math.round(weighted / totalWeight));
}

export function calculateRegretPenalty(regretByScenario: Record<string, number>): number {
  const regrets = Object.values(regretByScenario);

  if (regrets.length === 0) {
    return 0;
  }

  const maxRegret = Math.max(...regrets);
  const averageRegret = regrets.reduce((sum, value) => sum + value, 0) / regrets.length;

  return clamp(Math.round(maxRegret * 0.65 + averageRegret * 0.35));
}

export function calculateQuorumScore(input: {
  bordaScore: number;
  weightedUtility: number;
  confidence: number;
  regretPenalty: number;
}): number {
  const confidenceScore = input.confidence * 100;
  return clamp(
    Math.round(input.weightedUtility * 0.5 + input.bordaScore * 0.25 + confidenceScore * 0.2 - input.regretPenalty * 0.15)
  );
}

export function scoreProposals(input: ScoreProposalsInput): { ranked: ScoredProposal[]; dissentIndex: number } {
  const proposalIds = input.proposals.map((proposal) => proposal.proposalId);
  const rawBorda = calculateBordaScores(input.rankings, proposalIds);
  const maxBorda = Math.max(...Object.values(rawBorda), 1);

  const ranked = input.proposals
    .map((proposal) => {
      const bordaScore = Math.round(((rawBorda[proposal.proposalId] ?? 0) / maxBorda) * 100);
      const weightedUtility = calculateWeightedUtility(proposal.criteriaScores, input.weights);
      const regretPenalty = calculateRegretPenalty(proposal.regretByScenario);
      const quorumScore = calculateQuorumScore({
        bordaScore,
        weightedUtility,
        confidence: proposal.confidence,
        regretPenalty
      });

      return {
        proposalId: proposal.proposalId,
        bordaScore,
        weightedUtility,
        regretPenalty,
        confidence: proposal.confidence,
        quorumScore
      };
    })
    .sort((a, b) => b.quorumScore - a.quorumScore);

  return {
    ranked,
    dissentIndex: calculateDissentIndex(input.rankings)
  };
}

function normalizedRankDistance(first: string[], second: string[]): number {
  const shared = first.filter((id) => second.includes(id));
  const pairCount = (shared.length * (shared.length - 1)) / 2;

  if (pairCount === 0) {
    return 0;
  }

  const firstPositions = new Map(first.map((id, index) => [id, index]));
  const secondPositions = new Map(second.map((id, index) => [id, index]));
  let inversions = 0;

  for (let i = 0; i < shared.length; i += 1) {
    for (let j = i + 1; j < shared.length; j += 1) {
      const a = shared[i];
      const b = shared[j];
      const firstOrder = (firstPositions.get(a) ?? 0) - (firstPositions.get(b) ?? 0);
      const secondOrder = (secondPositions.get(a) ?? 0) - (secondPositions.get(b) ?? 0);

      if (Math.sign(firstOrder) !== Math.sign(secondOrder)) {
        inversions += 1;
      }
    }
  }

  return inversions / pairCount;
}
