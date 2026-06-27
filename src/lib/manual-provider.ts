import type { AgentRole, DecisionContext } from "./domain";
import type { ModelReputation } from "./model-reputation";

export type ManualProviderPhase = "proposal" | "critique" | "revision" | "ranking" | "final_verdict";

export type ManualProviderAgent = {
  id: "gpt" | "deepseek" | "gemini";
  name: string;
  providerLabel: string;
  role: AgentRole;
  weight: number;
  baseWeight?: number;
  effectiveWeight?: number;
  reputation?: ModelReputation;
  scoringFocus: string[];
};

export type ManualProviderPrompt = {
  id: string;
  agentId: ManualProviderAgent["id"];
  agentName: string;
  phase: ManualProviderPhase;
  title: string;
  prompt: string;
};

export type ManualProviderBundle = {
  version: "manual-v1";
  agents: ManualProviderAgent[];
  prompts: ManualProviderPrompt[];
};

type CreateManualProviderBundleInput = {
  question: string;
  locale: "en" | "zh";
  context: DecisionContext;
  agents?: ManualProviderAgent[];
};

export const defaultManualProviderAgents: ManualProviderAgent[] = [
  {
    id: "gpt",
    name: "GPT Product Architect",
    providerLabel: "ChatGPT / GPT Plus",
    role: "principal_architect",
    weight: 1,
    scoringFocus: ["product fit", "architecture coherence", "team feasibility"]
  },
  {
    id: "deepseek",
    name: "DeepSeek Cost/Risk Critic",
    providerLabel: "DeepSeek",
    role: "cost_engineer",
    weight: 1,
    scoringFocus: ["cost efficiency", "implementation complexity", "risk exposure"]
  },
  {
    id: "gemini",
    name: "Gemini Strategic Reviewer",
    providerLabel: "Gemini Pro",
    role: "sre_reviewer",
    weight: 1,
    scoringFocus: ["long-term strategy", "reliability", "migration flexibility"]
  }
];

const phases: ManualProviderPhase[] = ["proposal", "critique", "revision", "ranking", "final_verdict"];

export function createManualProviderBundle(input: CreateManualProviderBundleInput): ManualProviderBundle {
  const agents = input.agents ?? defaultManualProviderAgents;

  return {
    version: "manual-v1",
    agents,
    prompts: agents.flatMap((agent) =>
      phases.map((phase) => ({
        id: `${agent.id}-${phase}`,
        agentId: agent.id,
        agentName: agent.name,
        phase,
        title: `${agent.name} - ${phaseLabel(phase)}`,
        prompt: buildManualPrompt({ ...input, agent, phase })
      }))
    )
  };
}

function buildManualPrompt(input: CreateManualProviderBundleInput & { agent: ManualProviderAgent; phase: ManualProviderPhase }) {
  const language = input.locale === "zh" ? "Chinese" : "English";
  const baseWeight = input.agent.baseWeight ?? input.agent.weight;
  const reputationInstructions = input.agent.reputation
    ? [
        `Model reputation: ${input.agent.reputation.score}/100 for ${input.agent.reputation.domain}`,
        `Reputation rationale: ${input.agent.reputation.reasons.join("; ")}`,
        `Effective agent weight: ${input.agent.effectiveWeight ?? input.agent.weight}`
      ]
    : [];
  const blindReviewInstructions =
    input.phase === "critique"
      ? [
          "Blind review: evaluate only anonymized Proposal A/B/C labels.",
          "Do not infer or mention which model authored a proposal.",
          "Set targetProposalId to the blind label you are critiquing, such as Proposal A."
        ]
      : [];

  return [
    "You are participating in QuorumMind, a multi-agent technical architecture decision room.",
    `Agent name: ${input.agent.name}`,
    `Provider: ${input.agent.providerLabel}`,
    `Role: ${input.agent.role}`,
    `Agent weight: ${baseWeight}`,
    ...reputationInstructions,
    `Scoring focus: ${input.agent.scoringFocus.join(", ")}`,
    `Phase: ${input.phase}`,
    `Output language: ${language}`,
    ...blindReviewInstructions,
    "",
    "Return JSON only. Do not wrap the answer in markdown fences. Do not add commentary outside JSON.",
    "Use scores from 0 to 100 and confidence from 0 to 1.",
    "",
    "Decision input:",
    JSON.stringify(
      {
        question: input.question,
        context: input.context
      },
      null,
      2
    ),
    "",
    "Return this JSON shape:",
    JSON.stringify(schemaForPhase(input.phase), null, 2)
  ].join("\n");
}

function phaseLabel(phase: ManualProviderPhase): string {
  return phase
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function schemaForPhase(phase: ManualProviderPhase): unknown {
  if (phase === "ranking") {
    return {
      agentId: "gpt | deepseek | gemini",
      rankedProposalIds: ["proposal-id-1", "proposal-id-2"],
      rationale: "Why this ranking is preferred.",
      confidence: 0.82
    };
  }

  if (phase === "final_verdict") {
    return {
      selectedProposalId: "proposal-id",
      finalRecommendation: "Recommended architecture path.",
      whyItWon: ["Reason 1", "Reason 2"],
      remainingDissent: ["Open disagreement"],
      adr: {
        title: "ADR title",
        decision: "Decision text",
        consequences: ["Consequence"],
        rollbackPlan: ["Rollback step"]
      },
      confidence: 0.82
    };
  }

  if (phase === "critique") {
    return {
      targetProposalId: "Proposal A",
      strongestArgument: "Best argument in the target proposal.",
      weakestAssumption: "Most fragile assumption.",
      hiddenRisks: ["Risk"],
      missingConsiderations: ["Missing factor"],
      improvementSuggestions: ["Concrete improvement"],
      scores: criteriaScoreSchema()
    };
  }

  return {
    proposalId: "stable-id",
    title: "Short proposal title",
    recommendation: "Recommended architecture path.",
    reasoning: "Concise reasoning.",
    alternatives: ["Alternative path"],
    strengths: ["Strength"],
    weaknesses: ["Weakness"],
    assumptions: ["Assumption"],
    risks: [
      {
        category: "performance | reliability | security | cost | complexity | migration | vendor_lock_in",
        severity: "low | medium | high",
        description: "Risk description",
        mitigation: "Mitigation"
      }
    ],
    criteriaScores: criteriaScoreSchema(),
    regretByScenario: {
      scaleSpike: 35,
      securityIncident: 50,
      teamTurnover: 30
    },
    confidence: 0.82
  };
}

function criteriaScoreSchema() {
  return {
    scalability: 75,
    reliability: 75,
    security: 75,
    costEfficiency: 75,
    implementationComplexity: 75,
    maintainability: 75,
    migrationFlexibility: 75,
    teamFit: 75,
    timeToMarket: 75,
    reversibility: 75
  };
}
