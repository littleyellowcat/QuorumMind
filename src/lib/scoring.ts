import type {
  AgentRanking,
  BayesianVoteWeight,
  CriteriaScores,
  CriteriaWeights,
  MonteCarloStressEntry,
  RegretMapEntry,
  ScoredProposal,
  TopsisLensEntry
} from "./domain";

type ScoreInput = {
  proposalId: string;
  criteriaScores: CriteriaScores;
  confidence: number;
  regretByScenario: Record<string, number>;
};

type RegretMapInput = {
  proposalId: string;
  regretByScenario: Record<string, number>;
};

type TopsisInput = {
  proposalId: string;
  criteriaScores: CriteriaScores;
};

type MonteCarloInput = {
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

const neutralConfidence = 0.67;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const clampRatio = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function calculateBordaScores(rankings: AgentRanking[], proposalIds: string[]): Record<string, number> {
  const scores = Object.fromEntries(proposalIds.map((id) => [id, 0]));
  const proposalCount = proposalIds.length;
  const voteWeights = new Map(calculateBayesianVoteWeights(rankings).map((weight) => [weight.agentId, weight.effectiveVoteWeight]));

  for (const ranking of rankings) {
    const voteWeight = voteWeights.get(ranking.agentId) ?? 1;

    ranking.rankedProposalIds.forEach((proposalId, index) => {
      scores[proposalId] = (scores[proposalId] ?? 0) + (proposalCount - index - 1) * voteWeight;
    });
  }

  return scores;
}

export function calculateBayesianVoteWeights(rankings: AgentRanking[]): BayesianVoteWeight[] {
  return rankings.map((ranking) => {
    const baseWeight = positiveNumber(ranking.weight, 1);
    const confidence = clampRatio(positiveNumber(ranking.confidence, neutralConfidence));
    const reputationScore = clamp(positiveNumber(ranking.reputationScore, neutralConfidence * 100));
    const reputationPrior = reputationScore / 100;
    const posteriorConfidence = roundRatio((reputationPrior * 2 + confidence * 3) / 5);
    const effectiveVoteWeight = roundWeight(baseWeight * (posteriorConfidence / neutralConfidence));

    return {
      agentId: ranking.agentId,
      baseWeight,
      confidence,
      reputationScore,
      posteriorConfidence,
      effectiveVoteWeight
    };
  });
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

export function calculateRegretMap(proposals: RegretMapInput[]): RegretMapEntry[] {
  return proposals
    .map((proposal) => {
      const scenarioRegrets = proposal.regretByScenario;
      const entries = Object.entries(scenarioRegrets);
      const worst = entries.reduce<[string, number]>(
        (current, candidate) => (candidate[1] > current[1] ? candidate : current),
        ["none", 0]
      );
      const averageRegret =
        entries.length === 0 ? 0 : Math.round(entries.reduce((sum, [, regret]) => sum + regret, 0) / entries.length);

      return {
        proposalId: proposal.proposalId,
        minimaxRank: 0,
        worstScenario: worst[0],
        worstRegret: clamp(worst[1]),
        averageRegret: clamp(averageRegret),
        scenarioRegrets
      };
    })
    .sort((a, b) => a.worstRegret - b.worstRegret || a.averageRegret - b.averageRegret)
    .map((entry, index) => ({
      ...entry,
      minimaxRank: index + 1
    }));
}

export function calculateTopsisLens(proposals: TopsisInput[], weights: CriteriaWeights): TopsisLensEntry[] {
  if (proposals.length === 0) {
    return [];
  }

  const normalized = proposals.map((proposal) => ({
    proposalId: proposal.proposalId,
    values: Object.fromEntries(
      criteriaKeys.map((key) => {
        const denominator = Math.sqrt(
          proposals.reduce((sum, candidate) => sum + candidate.criteriaScores[key] ** 2, 0)
        );
        const normalizedScore = denominator === 0 ? 0 : proposal.criteriaScores[key] / denominator;

        return [key, normalizedScore * weights[key]];
      })
    ) as CriteriaScores
  }));
  const ideal = Object.fromEntries(criteriaKeys.map((key) => [key, Math.max(...normalized.map((item) => item.values[key]))])) as CriteriaScores;
  const antiIdeal = Object.fromEntries(criteriaKeys.map((key) => [key, Math.min(...normalized.map((item) => item.values[key]))])) as CriteriaScores;

  return normalized
    .map((item) => {
      const distanceToIdeal = euclideanDistance(item.values, ideal);
      const distanceToAntiIdeal = euclideanDistance(item.values, antiIdeal);
      const totalDistance = distanceToIdeal + distanceToAntiIdeal;
      const closenessScore = totalDistance === 0 ? 100 : Math.round((distanceToAntiIdeal / totalDistance) * 100);

      return {
        proposalId: item.proposalId,
        topsisRank: 0,
        closenessScore,
        distanceToIdeal: roundDistance(distanceToIdeal),
        distanceToAntiIdeal: roundDistance(distanceToAntiIdeal)
      };
    })
    .sort((a, b) => b.closenessScore - a.closenessScore || a.distanceToIdeal - b.distanceToIdeal)
    .map((entry, index) => ({
      ...entry,
      topsisRank: index + 1
    }));
}

export function calculateMonteCarloStressLens(
  proposals: MonteCarloInput[],
  weights: CriteriaWeights,
  options: { iterations?: number; seed?: number } = {}
): MonteCarloStressEntry[] {
  if (proposals.length === 0) {
    return [];
  }

  const iterations = Math.max(1, Math.round(options.iterations ?? 240));
  const random = createSeededRandom(options.seed ?? 41);
  const scoreSamples = new Map(proposals.map((proposal) => [proposal.proposalId, [] as number[]]));
  const winCounts = new Map(proposals.map((proposal) => [proposal.proposalId, 0]));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const simulatedScores = proposals.map((proposal) => {
      const utility = calculateWeightedUtility(proposal.criteriaScores, weights);
      const regretPenalty = calculateRegretPenalty(proposal.regretByScenario);
      const confidence = clampRatio(proposal.confidence);
      const centerScore = utility * 0.7 + confidence * 100 * 0.2 + (100 - regretPenalty) * 0.1;
      const uncertainty = 5 + (1 - confidence) * 18 + regretPenalty * 0.08;
      const shock = centeredTriangularRandom(random);
      const score = clamp(Math.round(centerScore + shock * uncertainty));

      scoreSamples.get(proposal.proposalId)?.push(score);

      return {
        proposalId: proposal.proposalId,
        score
      };
    });
    const winner = simulatedScores.sort((a, b) => b.score - a.score || a.proposalId.localeCompare(b.proposalId))[0];

    winCounts.set(winner.proposalId, (winCounts.get(winner.proposalId) ?? 0) + 1);
  }

  return proposals
    .map((proposal) => {
      const samples = scoreSamples.get(proposal.proposalId) ?? [];
      const sortedSamples = [...samples].sort((a, b) => a - b);
      const averageScore =
        samples.length === 0 ? 0 : Math.round(samples.reduce((sum, score) => sum + score, 0) / samples.length);
      const downsideIndex = Math.max(0, Math.ceil(sortedSamples.length * 0.1) - 1);

      return {
        proposalId: proposal.proposalId,
        monteCarloRank: 0,
        winRate: Math.round(((winCounts.get(proposal.proposalId) ?? 0) / iterations) * 100),
        averageScore,
        downsideP10: sortedSamples[downsideIndex] ?? 0,
        worstScore: sortedSamples[0] ?? 0
      };
    })
    .sort((a, b) => b.winRate - a.winRate || b.averageScore - a.averageScore || b.downsideP10 - a.downsideP10)
    .map((entry, index) => ({
      ...entry,
      monteCarloRank: index + 1
    }));
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

export function scoreProposals(input: ScoreProposalsInput): {
  ranked: ScoredProposal[];
  dissentIndex: number;
  bayesianVoteWeights: BayesianVoteWeight[];
} {
  const proposalIds = input.proposals.map((proposal) => proposal.proposalId);
  const bayesianVoteWeights = calculateBayesianVoteWeights(input.rankings);
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
    dissentIndex: calculateDissentIndex(input.rankings),
    bayesianVoteWeights
  };
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundWeight(value: number): number {
  return Math.round(Math.min(2.5, Math.max(0.1, value)) * 100) / 100;
}

function euclideanDistance(first: CriteriaScores, second: CriteriaScores): number {
  return Math.sqrt(criteriaKeys.reduce((sum, key) => sum + (first[key] - second[key]) ** 2, 0));
}

function roundDistance(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function createSeededRandom(seed: number): () => number {
  let state = Math.abs(Math.floor(seed)) || 1;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function centeredTriangularRandom(random: () => number): number {
  return (random() + random() + random()) / 1.5 - 1;
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
