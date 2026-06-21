import type { ProviderRequest } from "./types";

export function buildSystemPrompt(request: ProviderRequest): string {
  const language = request.locale === "zh" ? "Chinese" : "English";
  const redTeamInstructions =
    request.mode === "red_team"
      ? [
          "Red-team mode: actively search for failure paths, counterexamples, hidden coupling, operational traps, and security edge cases.",
          "Prefer concrete objections over generic caution. If a proposal still wins, explain why it survives the strongest attack."
        ]
      : [];
  const blindReviewInstructions =
    request.phase === "critique"
      ? [
          "Blind review: evaluate only the anonymized Proposal A/B/C labels in the payload.",
          "Do not infer or mention which model authored a proposal.",
          "Set targetProposalId to the blind label you are critiquing, such as Proposal A."
        ]
      : [];
  const languageInstructions =
    request.locale === "zh"
      ? [
          "Language rule: every user-facing string value must be written in Simplified Chinese.",
          "Keep JSON field names, proposalId values, model names, library names, and technical identifiers unchanged.",
          "Do not answer in English except for unavoidable technical terms such as Node.js, LangGraph, LangChain, tenant_id, and PostgreSQL."
        ]
      : ["Language rule: every user-facing string value must be written in English."];
  const idInstructions =
    request.phase === "ranking" || request.phase === "verdict"
      ? [
          "Use only proposalId values that appear in the payload. Do not invent new proposal ids.",
          "If the payload uses revised proposal ids, preserve those exact ids."
        ]
      : [];

  const roleInstructions = roleSpecificInstructions(request.agentRole);

  return [
    "You are an expert architecture decision agent inside QuorumMind.",
    `Agent: ${request.agentName}`,
    `Role: ${request.agentRole}`,
    request.agentWeight ? `Agent weight: ${request.agentWeight}` : "",
    request.modelReputation
      ? `Model reputation: ${request.modelReputation.score}/100 for ${request.modelReputation.domain} - ${request.modelReputation.reasons.join("; ")}`
      : "",
    request.scoringFocus?.length ? `Scoring focus: ${request.scoringFocus.join(", ")}` : "",
    `Phase: ${request.phase}`,
    `Output language: ${language}`,
    ...languageInstructions,
    ...idInstructions,
    ...redTeamInstructions,
    ...blindReviewInstructions,
    ...roleInstructions,
    "Return concise JSON only. The response must be a valid json object. Do not include markdown fences.",
    "Use scores from 0 to 100 and confidence from 0 to 1.",
    "Return this JSON shape:",
    JSON.stringify(schemaForPhase(request.phase), null, 2)
  ].join("\n");
}

export function buildUserPrompt(request: ProviderRequest): string {
  return JSON.stringify(
    {
      question: request.question,
      context: request.context,
      payload: request.payload ?? null
    },
    null,
    2
  );
}

export async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

export function assertOkResponse(response: Response, providerName: string, body: unknown): void {
  if (response.ok) {
    return;
  }

  const message = typeof body === "object" && body !== null ? JSON.stringify(body) : String(body);
  throw new Error(`${providerName} request failed with ${response.status}: ${message}`);
}

export function requireApiKey(apiKey: string, providerName: string): void {
  if (!apiKey.trim()) {
    throw new Error(`${providerName} API key is required`);
  }
}

function schemaForPhase(phase: ProviderRequest["phase"]): unknown {
  if (phase === "ranking") {
    return {
      rankedProposalIds: ["proposal-id-1", "proposal-id-2"],
      rationale: "Explain why this ordering is strongest.",
      confidence: 0.82
    };
  }

  if (phase === "verdict") {
    return {
      selectedProposalId: "proposal-id",
      finalRecommendation: "Recommended architecture path.",
      whyItWon: ["Reason this option won"],
      remainingDissent: ["Remaining disagreement or risk"],
      confidence: 0.82
    };
  }

  if (phase === "critique") {
    return {
      targetProposalId: "Proposal A",
      strongestArgument: "Best argument in the target proposal.",
      weakestAssumption: "Most fragile assumption.",
      hiddenRisks: ["Risk not fully addressed"],
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

function roleSpecificInstructions(role: string): string[] {
  const instructions: Record<string, string[]> = {
    principal_architect: [
      "As Principal Architect, prioritize system coherence and long-term maintainability.",
      "Consider how each proposal interacts with the existing architecture.",
      "Evaluate trade-offs holistically across all quality dimensions."
    ],
    sre_reviewer: [
      "As SRE Reviewer, prioritize operational reliability and observability.",
      "Evaluate deployment complexity, monitoring requirements, and failure modes.",
      "Consider mean-time-to-recovery and operational toil."
    ],
    security_reviewer: [
      "As Security Reviewer, prioritize data protection and attack surface minimization.",
      "Evaluate authentication, authorization, and compliance implications.",
      "Identify security anti-patterns and vulnerability surfaces."
    ],
    cost_engineer: [
      "As Cost Engineer, prioritize implementation and operational cost efficiency.",
      "Evaluate infrastructure spend, engineering effort, and ongoing maintenance cost.",
      "Identify cheaper alternatives that meet the same requirements."
    ],
    pragmatic_builder: [
      "As Pragmatic Builder, prioritize delivery speed and incremental value.",
      "Evaluate how quickly each proposal can ship a working solution.",
      "Identify the simplest approach that solves the immediate problem."
    ]
  };
  return instructions[role] ?? [];
}
