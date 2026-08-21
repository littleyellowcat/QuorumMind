import type { AgentRanking, BayesianVoteWeight, CriteriaScores, CriteriaWeights, DecisionContext, ScoredProposal } from "../src/lib/domain";
import { criteriaScoresSchema, regretByScenarioSchema } from "../src/lib/domain";
import { scoreProposals } from "../src/lib/scoring";
import type { LiveDecisionTraceEntry } from "./live-decision";

export type LiveDecisionVerdict = {
  source: "live";
  selectedProposalId: string;
  finalRecommendation: string;
  quorumScore: number;
  dissentIndex: number;
  rankedProposals: ScoredProposal[];
  bayesianVoteWeights: BayesianVoteWeight[];
  whyItWon: string[];
  remainingDissent: string[];
  usedProposalPhase: "proposal" | "revision";
};

type AggregateLiveVerdictInput = {
  trace: LiveDecisionTraceEntry[];
  context: DecisionContext;
};

type ParsedLiveProposal = {
  proposalId: string;
  aliases: string[];
  recommendation: string;
  criteriaScores: CriteriaScores;
  regretByScenario: Record<string, number>;
  confidence: number;
};

type ParsedLiveVerdict = {
  selectedProposalId?: string;
  finalRecommendation?: string;
  whyItWon?: string[];
  remainingDissent?: string[];
};

const defaultWeights: CriteriaWeights = {
  scalability: 0.1,
  reliability: 0.1,
  security: 0.14,
  costEfficiency: 0.1,
  implementationComplexity: 0.12,
  maintainability: 0.1,
  migrationFlexibility: 0.1,
  teamFit: 0.12,
  timeToMarket: 0.12,
  reversibility: 0.1
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

export function aggregateLiveVerdict(input: AggregateLiveVerdictInput): LiveDecisionVerdict | null {
  const { proposals, usedProposalPhase } = parsedProposalsForTrace(input.trace);
  const proposalIds = proposals.map((proposal) => proposal.proposalId);
  const aliasMap = proposalAliasMap(proposals);
  const rankings = parsedRankingsForTrace(input.trace, proposalIds, aliasMap);

  if (proposals.length === 0 || rankings.length === 0) {
    return null;
  }

  const scoring = scoreProposals({
    proposals: proposals.map((proposal) => ({
      proposalId: proposal.proposalId,
      criteriaScores: proposal.criteriaScores,
      confidence: proposal.confidence,
      regretByScenario: proposal.regretByScenario
    })),
    rankings,
    weights: weightsForContext(input.context)
  });
  const winnerId = scoring.ranked[0]?.proposalId;
  const winningProposal = proposals.find((proposal) => proposal.proposalId === winnerId) ?? proposals[0];
  const modelVerdict = parsedVerdictsForTrace(input.trace, aliasMap).find(
    (verdict) => verdict.selectedProposalId === winningProposal.proposalId
  );

  return {
    source: "live",
    selectedProposalId: winningProposal.proposalId,
    finalRecommendation: modelVerdict?.finalRecommendation ?? winningProposal.recommendation,
    quorumScore: scoring.ranked[0]?.quorumScore ?? 0,
    dissentIndex: scoring.dissentIndex,
    rankedProposals: scoring.ranked,
    bayesianVoteWeights: scoring.bayesianVoteWeights,
    whyItWon: modelVerdict?.whyItWon ?? [
      "This option received the strongest combined ranking, utility, confidence, and regret score."
    ],
    remainingDissent: modelVerdict?.remainingDissent ?? [],
    usedProposalPhase
  };
}

function parsedProposalsForTrace(trace: LiveDecisionTraceEntry[]): {
  proposals: ParsedLiveProposal[];
  usedProposalPhase: "proposal" | "revision";
} {
  const revisions = parseProposals(trace.filter((entry) => entry.phase === "revision"));

  if (revisions.length > 0) {
    return { proposals: revisions, usedProposalPhase: "revision" };
  }

  return {
    proposals: parseProposals(trace.filter((entry) => entry.phase === "proposal")),
    usedProposalPhase: "proposal"
  };
}

function parseProposals(entries: LiveDecisionTraceEntry[]): ParsedLiveProposal[] {
  return entries.flatMap((entry, index) => {
    const payload = normalizedOrParsed(entry);

    if (entry.status !== "ok" || !isRecord(payload)) {
      return [];
    }

    const proposalId = stringValue(payload.proposalId) ?? stringValue(payload.id);
    const recommendation = stringValue(payload.recommendation);
    const criteriaScores = parseCriteriaScores(payload.criteriaScores);

    if (!proposalId || !recommendation || !criteriaScores) {
      return [];
    }

    return [
      {
        proposalId,
        aliases: proposalAliases(entry, index, proposalId),
        recommendation,
        criteriaScores,
        regretByScenario: parseRegretByScenario(payload.regretByScenario),
        confidence: numberValue(payload.confidence, 0.65, 0, 1)
      }
    ];
  });
}

function parsedRankingsForTrace(
  trace: LiveDecisionTraceEntry[],
  proposalIds: string[],
  aliasMap: Map<string, string>
): AgentRanking[] {
  return trace.flatMap((entry, index) => {
    const payload = normalizedOrParsed(entry);

    if (entry.phase !== "ranking" || entry.status !== "ok" || !isRecord(payload)) {
      return [];
    }

    const ranked = uniqueStrings(
      arrayOfStrings(payload.rankedProposalIds)
        .map((proposalId) => normalizeProposalId(proposalId, aliasMap))
        .filter((proposalId) => proposalIds.includes(proposalId))
    );

    if (ranked.length === 0) {
      return [];
    }

    return [
      {
        agentId: `${entry.provider}-${index}`,
        rankedProposalIds: [...ranked, ...proposalIds.filter((proposalId) => !ranked.includes(proposalId))],
        weight: entry.agentWeight,
        confidence: numberValue(payload.confidence, 0.67, 0, 1),
        reputationScore: entry.modelReputation?.score
      }
    ];
  });
}

function parsedVerdictsForTrace(trace: LiveDecisionTraceEntry[], aliasMap: Map<string, string>): ParsedLiveVerdict[] {
  return trace.flatMap((entry) => {
    const payload = normalizedOrParsed(entry);

    if (entry.phase !== "verdict" || entry.status !== "ok" || !isRecord(payload)) {
      return [];
    }

    return [
      {
        selectedProposalId: normalizeProposalId(stringValue(payload.selectedProposalId), aliasMap),
        finalRecommendation: stringValue(payload.finalRecommendation),
        whyItWon: arrayOfStrings(payload.whyItWon),
        remainingDissent: arrayOfStrings(payload.remainingDissent)
      }
    ];
  });
}

function proposalAliasMap(proposals: ParsedLiveProposal[]): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const proposal of proposals) {
    for (const alias of proposal.aliases) {
      aliases.set(alias, proposal.proposalId);
    }
  }

  return aliases;
}

function proposalAliases(entry: LiveDecisionTraceEntry, index: number, proposalId: string): string[] {
  const providerIndexAliases: Record<LiveDecisionTraceEntry["provider"], string> = {
    openai: "proposal-openai-0",
    deepseek: "proposal-deepseek-1",
    gemini: "proposal-gemini-2",
    model_gateway: `proposal-model-gateway-${index}`,
    anthropic: `proposal-anthropic-${index}`,
    openrouter: `proposal-openrouter-${index}`,
    ollama: `proposal-ollama-${index}`,
    lmstudio: `proposal-lmstudio-${index}`
  };

  return uniqueStrings([
    proposalId,
    providerIndexAliases[entry.provider],
    `proposal-${entry.provider}-${index}`,
    `${entry.provider}-proposal`,
    entry.id
  ]);
}

function normalizeProposalId(value: string | undefined, aliasMap: Map<string, string>): string {
  if (!value) {
    return "";
  }

  return aliasMap.get(value) ?? value;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizedOrParsed(entry: LiveDecisionTraceEntry): unknown {
  return entry.normalized ?? entry.parsed;
}

function parseCriteriaScores(value: unknown): CriteriaScores | null {
  const parsed = criteriaScoresSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseRegretByScenario(value: unknown): Record<string, number> {
  const parsed = regretByScenarioSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function weightsForContext(context: DecisionContext): CriteriaWeights {
  if (context.productStage === "mvp") {
    return {
      ...defaultWeights,
      timeToMarket: 0.16,
      teamFit: 0.16,
      security: context.securityRequirement === "high" ? 0.16 : 0.12
    };
  }

  if (context.productStage === "enterprise") {
    return {
      ...defaultWeights,
      reliability: 0.16,
      security: 0.18,
      reversibility: 0.12
    };
  }

  return defaultWeights;
}

function numberValue(value: unknown, fallback: number, min = 0, max = 100): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
