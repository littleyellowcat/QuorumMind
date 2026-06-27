import type { DecisionContext } from "./domain";
import type { ManualProviderAgent } from "./manual-provider";

export type DecisionDomain = "technical_architecture" | "product_strategy" | "career_strategy" | "portfolio_packaging";

export type ModelReputation = {
  domain: DecisionDomain;
  score: number;
  weightMultiplier: number;
  reasons: string[];
};

export type ReputationAdjustedAgent = ManualProviderAgent & {
  baseWeight: number;
  effectiveWeight: number;
  reputation: ModelReputation;
};

export type ModelReputationFeedback = {
  agentId: ManualProviderAgent["id"];
  domain: DecisionDomain;
  outcome: "helpful" | "neutral" | "unhelpful";
  confidence?: number;
  createdAt: string;
};

const reputationMatrix: Record<DecisionDomain, Record<ManualProviderAgent["id"], Omit<ModelReputation, "domain">>> = {
  technical_architecture: {
    gpt: {
      score: 88,
      weightMultiplier: 1.06,
      reasons: ["Strong architecture coherence", "Good product and team feasibility synthesis"]
    },
    deepseek: {
      score: 90,
      weightMultiplier: 1.08,
      reasons: ["Strong cost and risk critique", "Good implementation complexity sensitivity"]
    },
    gemini: {
      score: 86,
      weightMultiplier: 1.03,
      reasons: ["Strong long-term strategy view", "Good reliability and migration framing"]
    }
  },
  product_strategy: {
    gpt: {
      score: 90,
      weightMultiplier: 1.08,
      reasons: ["Strong product framing", "Good prioritization and user-value synthesis"]
    },
    deepseek: {
      score: 84,
      weightMultiplier: 1.01,
      reasons: ["Useful cost discipline", "Good risk objections"]
    },
    gemini: {
      score: 88,
      weightMultiplier: 1.06,
      reasons: ["Strong strategic review", "Good market and roadmap perspective"]
    }
  },
  career_strategy: {
    gpt: {
      score: 87,
      weightMultiplier: 1.05,
      reasons: ["Strong narrative synthesis", "Good trade-off articulation"]
    },
    deepseek: {
      score: 83,
      weightMultiplier: 1,
      reasons: ["Useful downside analysis", "Good practical risk checks"]
    },
    gemini: {
      score: 89,
      weightMultiplier: 1.07,
      reasons: ["Strong long-horizon reasoning", "Good second-order consequence review"]
    }
  },
  portfolio_packaging: {
    gpt: {
      score: 91,
      weightMultiplier: 1.1,
      reasons: ["Strong positioning and storytelling", "Good resume bullet synthesis"]
    },
    deepseek: {
      score: 84,
      weightMultiplier: 1.01,
      reasons: ["Useful specificity checks", "Good implementation credibility review"]
    },
    gemini: {
      score: 86,
      weightMultiplier: 1.03,
      reasons: ["Good strategic packaging review", "Useful differentiation checks"]
    }
  }
};

export function inferDecisionDomain(question: string, context: DecisionContext): DecisionDomain {
  const haystack = [
    question,
    context.expectedScale,
    context.teamProfile,
    ...context.existingConstraints,
    ...context.candidateOptions,
    ...context.assumptions
  ]
    .join(" ")
    .toLowerCase();

  if (matchesAny(haystack, ["resume", "portfolio", "简历", "项目包装", "作品集"])) {
    return "portfolio_packaging";
  }

  if (matchesAny(haystack, ["quit", "career", "创业", "辞职", "转行", "offer"])) {
    return "career_strategy";
  }

  if (
    matchesAny(haystack, [
      "next.js",
      "vue",
      "react",
      "postgres",
      "postgresql",
      "database",
      "schema",
      "api",
      "architecture",
      "架构",
      "数据库",
      "技术栈"
    ])
  ) {
    return "technical_architecture";
  }

  if (matchesAny(haystack, ["mvp", "feature", "roadmap", "pricing", "growth", "产品", "功能", "用户"])) {
    return "product_strategy";
  }

  return "technical_architecture";
}

export function applyModelReputation(
  agents: ManualProviderAgent[],
  input: { question: string; context: DecisionContext },
  feedback: ModelReputationFeedback[] = []
): ReputationAdjustedAgent[] {
  const domain = inferDecisionDomain(input.question, input.context);

  return agents.map((agent) => {
    const baseWeight = agent.baseWeight ?? agent.weight;
    const reputation = calibrateModelReputation(reputationForAgent(agent, domain), agent.id, feedback);
    const effectiveWeight = roundWeight(baseWeight * reputation.weightMultiplier);

    return {
      ...agent,
      baseWeight,
      weight: effectiveWeight,
      effectiveWeight,
      reputation
    };
  });
}

export function calibrateModelReputation(
  reputation: ModelReputation,
  agentId: ManualProviderAgent["id"],
  feedback: ModelReputationFeedback[]
): ModelReputation {
  const relevant = feedback.filter((item) => item.agentId === agentId && item.domain === reputation.domain);

  if (relevant.length === 0) {
    return reputation;
  }

  const delta = relevant.reduce((sum, item) => {
    const confidence = typeof item.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : 1;
    const signed = item.outcome === "helpful" ? 4 : item.outcome === "unhelpful" ? -5 : 0;

    return sum + signed * confidence;
  }, 0);
  const score = Math.round(Math.min(98, Math.max(60, reputation.score + delta)));
  const multiplierDelta = (score - reputation.score) / 100;
  const weightMultiplier = roundWeight(reputation.weightMultiplier + multiplierDelta);

  return {
    ...reputation,
    score,
    weightMultiplier,
    reasons: [
      ...reputation.reasons,
      `feedback calibration ${delta >= 0 ? "+" : ""}${Math.round(delta * 10) / 10} from ${relevant.length} historical signal${relevant.length === 1 ? "" : "s"}`
    ]
  };
}

function reputationForAgent(agent: ManualProviderAgent, domain: DecisionDomain): ModelReputation {
  const reputation = reputationMatrix[domain][agent.id];

  return {
    domain,
    ...reputation
  };
}

function matchesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle.toLowerCase()));
}

function roundWeight(value: number): number {
  return Math.min(2, Math.max(0.1, Math.round(value * 100) / 100));
}
