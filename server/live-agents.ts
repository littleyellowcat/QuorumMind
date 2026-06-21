import type { Agent, AgentRanking, Critique, DecisionContext, DecisionMode, Proposal } from "../src/lib/domain";
import type { ModelProvider, ProviderPhase } from "./providers/types";
import { parseProviderJson } from "./provider-json";
import { normalizeProviderPayload, type NormalizedProviderProposal } from "./provider-schema";
import { generateADR } from "../src/lib/adr";
import { buildAHPAnalysis } from "../src/lib/ahp";
import { createDefaultAgents, generateCritique, generateProposal, reviseProposal } from "../src/lib/demo-agents";
import { calculateMonteCarloStressLens, calculateRegretMap, calculateTopsisLens, scoreProposals } from "../src/lib/scoring";

// ── Helpers ────────────────────────────────────────────

function buildLiveRequest(
  provider: ModelProvider,
  phase: ProviderPhase,
  agent: Agent,
  question: string,
  context: DecisionContext,
  locale: "en" | "zh",
  payload?: unknown
) {
  return provider.generateDecisionText({
    locale,
    phase,
    agentName: agent.name,
    agentRole: agent.role,
    agentWeight: agent.weight,
    question,
    context,
    payload
  });
}

function mapToProposal(
  normalized: NormalizedProviderProposal,
  roomId: string,
  agent: Agent
): Proposal {
  return {
    id: `${agent.id}-proposal-initial`,
    roomId,
    agentId: agent.id,
    title: normalized.recommendation.slice(0, 80),
    recommendation: normalized.recommendation,
    alternatives: [],
    reasoning: normalized.recommendation,
    strengths: [],
    weaknesses: [],
    assumptions: [],
    risks: [],
    migrationPath: [],
    criteriaScores: normalized.criteriaScores,
    regretByScenario: normalized.regretByScenario,
    confidence: normalized.confidence,
    version: "initial" as const
  };
}

// ── Live Agent Functions ───────────────────────────────

export async function generateLiveProposal(
  provider: ModelProvider,
  roomId: string,
  agent: Agent,
  context: DecisionContext,
  question = "",
  knowledgeInjection = ""
): Promise<Proposal> {
  const enhancedQuestion = knowledgeInjection
    ? `${knowledgeInjection}\n\n---\n\n${question}`
    : question;

  const text = await buildLiveRequest(provider, "proposal", agent, enhancedQuestion, context, "en");
  const parsed = parseProviderJson(text);
  const schema = parsed !== undefined
    ? normalizeProviderPayload("proposal", parsed)
    : null;

  if (schema?.ok && schema.normalized) {
    return mapToProposal(schema.normalized as NormalizedProviderProposal, roomId, agent);
  }

  // Fallback: return a minimal proposal with the raw text
  return {
    id: `${agent.id}-proposal-initial`,
    roomId,
    agentId: agent.id,
    title: "Live proposal (unparsed)",
    recommendation: text.slice(0, 500),
    alternatives: [],
    reasoning: text.slice(0, 1000),
    strengths: [],
    weaknesses: [],
    assumptions: [],
    risks: [],
    migrationPath: [],
    criteriaScores: {
      scalability: 50, reliability: 50, security: 50,
      costEfficiency: 50, implementationComplexity: 50,
      maintainability: 50, migrationFlexibility: 50,
      teamFit: 50, timeToMarket: 50, reversibility: 50
    },
    regretByScenario: {},
    confidence: 0.5,
    version: "initial"
  };
}

export async function generateLiveCritique(
  provider: ModelProvider,
  roomId: string,
  reviewer: Agent,
  targetProposal: Proposal,
  allProposals: Proposal[]
): Promise<Critique> {
  // Build blind-review payload from all proposals
  const blindProposals = allProposals.map((p, i) => ({
    blindProposalId: `Proposal ${String.fromCharCode(65 + i)}`,
    title: p.title,
    recommendation: p.recommendation,
    reasoning: p.reasoning,
    strengths: p.strengths,
    weaknesses: p.weaknesses,
    assumptions: p.assumptions,
    risks: p.risks,
    criteriaScores: p.criteriaScores,
    regretByScenario: p.regretByScenario,
    confidence: p.confidence
  }));

  const payload = {
    blindReview: true,
    blindProposals,
    targetProposalId: targetProposal.id
  };

  const question = `Critique the proposal with id "${targetProposal.id}". Consider its strengths, weaknesses, hidden risks, and missing considerations.`;

  const text = await buildLiveRequest(
    provider, "critique", reviewer, question,
    targetProposal as unknown as DecisionContext,
    "en", payload
  );

  const parsed = parseProviderJson(text);
  const schema = parsed !== undefined
    ? normalizeProviderPayload("critique", parsed)
    : null;

  if (schema?.ok && schema.normalized) {
    const n = schema.normalized as Record<string, unknown>;
    return {
      id: `${reviewer.id}-critique-${targetProposal.id}`,
      roomId,
      reviewerAgentId: reviewer.id,
      targetProposalId: targetProposal.id,
      strongestArgument: (n.recommendation as string) ?? text.slice(0, 200),
      weakestAssumption: (n.weakestAssumption as string) ?? "",
      hiddenRisks: (n.hiddenRisks as string[]) ?? [],
      missingConsiderations: (n.missingConsiderations as string[]) ?? [],
      improvementSuggestions: (n.improvementSuggestions as string[]) ?? [],
      scores: targetProposal.criteriaScores
    };
  }

  return {
    id: `${reviewer.id}-critique-${targetProposal.id}`,
    roomId,
    reviewerAgentId: reviewer.id,
    targetProposalId: targetProposal.id,
    strongestArgument: text.slice(0, 200),
    weakestAssumption: "",
    hiddenRisks: [],
    missingConsiderations: [],
    improvementSuggestions: [],
    scores: targetProposal.criteriaScores
  };
}

export async function reviseLiveProposal(
  provider: ModelProvider,
  roomId: string,
  agent: Agent,
  proposal: Proposal,
  critiques: Critique[]
): Promise<Proposal> {
  const suggestions = critiques
    .flatMap(c => c.improvementSuggestions)
    .filter(Boolean);

  const payload = {
    originalProposal: proposal,
    critiqueSummary: critiques.map(c => ({
      from: c.reviewerAgentId,
      strongest: c.strongestArgument,
      weaknesses: c.weakestAssumption,
      suggestions: c.improvementSuggestions
    }))
  };

  const question = `Revise your proposal based on the critiques. Address the improvement suggestions and strengthen weak areas.`;

  const text = await buildLiveRequest(
    provider, "revision", agent, question,
    proposal as unknown as DecisionContext,
    "en", payload
  );

  const parsed = parseProviderJson(text);
  const schema = parsed !== undefined
    ? normalizeProviderPayload("proposal", parsed)
    : null;

  if (schema?.ok && schema.normalized) {
    const n = schema.normalized as NormalizedProviderProposal;
    return {
      ...proposal,
      id: `${agent.id}-proposal-revised`,
      recommendation: n.recommendation,
      reasoning: n.recommendation,
      criteriaScores: n.criteriaScores,
      regretByScenario: n.regretByScenario,
      confidence: Math.min(0.95, n.confidence + 0.03),
      version: "revised" as const,
      strengths: [...proposal.strengths, "Responds to cross-agent critique"],
      weaknesses: proposal.weaknesses.filter(w => !w.includes("requires discipline")),
      migrationPath: [...proposal.migrationPath, ...suggestions.slice(0, 3)]
    };
  }

  // Fallback: use the deterministic reviseProposal pattern
  return {
    ...proposal,
    id: `${agent.id}-proposal-revised`,
    version: "revised",
    confidence: Math.min(0.95, proposal.confidence + 0.03),
    strengths: [...proposal.strengths, "Responds to cross-agent critique"],
    weaknesses: proposal.weaknesses.filter(w => !w.includes("requires discipline")),
    migrationPath: [...proposal.migrationPath, ...suggestions.slice(0, 3).filter(Boolean) as string[]]
  };
}

// ── Provider mapping ────────────────────────────────────

function pickProvider(agent: Agent, providers: ModelProvider[]): ModelProvider | undefined {
  const idMap: Record<string, string> = {
    openai: "openai", deepseek: "deepseek", gemini: "gemini"
  };
  const targetId = idMap[agent.provider] ?? "openai";
  return providers.find(p => p.id === targetId) ?? providers[0];
}

// ── Live Decision Room ──────────────────────────────────

export type LiveDecisionRoomInput = {
  question: string;
  mode: DecisionMode;
  context: DecisionContext;
  providers: ModelProvider[];
  locale?: "en" | "zh";
  knowledgeInjection?: string;
};

export async function runLiveDecisionRoom(input: LiveDecisionRoomInput) {
  const roomId = `live-${Date.now()}`;
  const knowledgeInjection = input.knowledgeInjection ?? "";
  const agents = createDefaultAgents();
  const activeAgents = input.mode === "fast" ? agents.slice(0, 3) : agents;

  // ── 1. Generate live proposals ────────────────────────
  const initialProposals: Proposal[] = [];
  for (const agent of activeAgents) {
    const provider = pickProvider(agent, input.providers);
    if (provider) {
      try {
        const p = await generateLiveProposal(provider, roomId, agent, input.context, input.question, knowledgeInjection);
        initialProposals.push(p);
      } catch {
        initialProposals.push(generateProposal(roomId, agent, input.context, input.question, knowledgeInjection));
      }
    } else {
      initialProposals.push(generateProposal(roomId, agent, input.context, input.question, knowledgeInjection));
    }
  }

  // ── 2. Generate live critiques (blind review) ─────────
  const critiques: Critique[] = [];
  for (const reviewer of activeAgents) {
    for (const proposal of initialProposals) {
      if (proposal.agentId === reviewer.id) continue;
      const provider = pickProvider(reviewer, input.providers);
      if (provider) {
        try {
          const c = await generateLiveCritique(provider, roomId, reviewer, proposal, initialProposals);
          critiques.push(c);
        } catch {
          critiques.push(generateCritique(roomId, reviewer, proposal, critiques.length));
        }
      } else {
        critiques.push(generateCritique(roomId, reviewer, proposal, critiques.length));
      }
    }
  }

  // ── 3. Revise proposals ───────────────────────────────
  const revisedProposals = await Promise.all(initialProposals.map(async (proposal) => {
    const agent = activeAgents.find(a => a.id === proposal.agentId)!;
    const provider = pickProvider(agent, input.providers);
    const relevant = critiques.filter(c => c.targetProposalId === proposal.id);
    if (provider) {
      try {
        return await reviseLiveProposal(provider, roomId, agent, proposal, relevant);
      } catch {
        return reviseProposal(proposal, relevant);
      }
    }
    return reviseProposal(proposal, relevant);
  }));

  // ── 4. Scoring, lenses, ADR (deterministic) ───────────
  const rankings = createLiveRankings(activeAgents, revisedProposals);
  const weights = input.context.productStage === "mvp"
    ? { scalability: 0.1, reliability: 0.1, security: 0.14, costEfficiency: 0.1, implementationComplexity: 0.12, maintainability: 0.1, migrationFlexibility: 0.1, teamFit: 0.12, timeToMarket: 0.12, reversibility: 0.1 }
    : { scalability: 0.1, reliability: 0.1, security: 0.1, costEfficiency: 0.1, implementationComplexity: 0.1, maintainability: 0.1, migrationFlexibility: 0.1, teamFit: 0.1, timeToMarket: 0.1, reversibility: 0.1 };

  const scoring = scoreProposals({
    proposals: revisedProposals.map(p => ({
      proposalId: p.id, criteriaScores: p.criteriaScores,
      confidence: p.confidence, regretByScenario: p.regretByScenario
    })),
    rankings,
    weights
  });

  const winner = scoring.ranked[0];
  const selectedProposalId = winner?.proposalId ?? revisedProposals[0]?.id ?? "none";

  const regretMap = calculateRegretMap(
    revisedProposals.map(p => ({ proposalId: p.id, regretByScenario: p.regretByScenario }))
  );
  const topsisLens = calculateTopsisLens(
    revisedProposals.map(p => ({ proposalId: p.id, criteriaScores: p.criteriaScores })), weights
  );
  const monteCarloStress = calculateMonteCarloStressLens(
    revisedProposals.map(p => ({ proposalId: p.id, criteriaScores: p.criteriaScores, confidence: p.confidence, regretByScenario: p.regretByScenario })), weights
  );
  const ahpAnalysis = buildAHPAnalysis({
    context: input.context,
    proposals: revisedProposals.map(p => ({ proposalId: p.id, criteriaScores: p.criteriaScores, confidence: p.confidence, regretByScenario: p.regretByScenario })),
    rankings
  });

  const allRisks = revisedProposals.flatMap(p => p.risks);
  const riskRadar = [...new Map(allRisks.map(r => [r.description, r])).values()];
  const preMortem = ["Live-model generated proposals were merged into the deterministic scoring pipeline. Cross-agent critiques were applied during revision."];

  const decision = revisedProposals.find(p => p.id === selectedProposalId)?.recommendation ?? "";
  const delphiRounds = [
    { phase: "proposal" as const, title: "Proposal Round", status: "complete" as const, anonymity: "open" as const, inputCount: activeAgents.length, outputCount: initialProposals.length, summary: "Live LLM agents generated independent proposals." },
    { phase: "blind_review" as const, title: "Blind Review", status: "complete" as const, anonymity: "blind" as const, inputCount: initialProposals.length, outputCount: critiques.length, summary: "Agents critiqued anonymized proposals." },
    { phase: "revision" as const, title: "Revision Round", status: "complete" as const, anonymity: "open" as const, inputCount: critiques.length, outputCount: revisedProposals.length, summary: "Proposals revised after absorbing critiques." },
    { phase: "consensus" as const, title: "Consensus Engine", status: "complete" as const, anonymity: "n/a" as const, inputCount: revisedProposals.length, outputCount: 1, summary: `Consensus score: ${winner?.quorumScore ?? 0}` },
    { phase: "final_verdict" as const, title: "Final Verdict", status: "complete" as const, anonymity: "n/a" as const, inputCount: 1, outputCount: 1, summary: `Selected: ${selectedProposalId}` }
  ];

  const adrObj = {
    title: `ADR: ${input.question.slice(0, 60)}`,
    status: "proposed" as const,
    context: input.question,
    decision,
    alternatives: revisedProposals.map(p => p.recommendation),
    consequences: [] as string[],
    delphiRounds,
    assumptionLedger: [] as any[],
    regretMap, topsisLens, monteCarloStress, ahpAnalysis,
    risks: riskRadar,
    rollbackPlan: [] as string[],
    reviewDate: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
  };

  return {
    roomId,
    question: input.question,
    mode: input.mode,
    context: input.context,
    agents: activeAgents,
    initialProposals,
    critiques,
    revisedProposals,
    rankings,
    verdict: {
      selectedProposalId,
      finalRecommendation: decision,
      quorumScore: winner?.quorumScore ?? 0,
      dissentIndex: scoring.dissentIndex,
      rankedProposals: scoring.ranked,
      delphiRounds,
      assumptionLedger: [],
      regretMap,
      topsisLens,
      monteCarloStress,
      ahpAnalysis,
      riskRadar,
      preMortem,
      bayesianVoteWeights: scoring.bayesianVoteWeights,
      adr: adrObj as any,
      adrMarkdown: generateADR(adrObj as any)
    },
    knowledgeInjection
  };
}

function createLiveRankings(agents: Agent[], proposals: Proposal[]): AgentRanking[] {
  return agents.map(agent => {
    const scores = proposals.map(p => {
      const criteria = p.criteriaScores;
      const total = criteria.scalability + criteria.reliability + criteria.security +
        criteria.costEfficiency + criteria.implementationComplexity + criteria.maintainability +
        criteria.migrationFlexibility + criteria.teamFit + criteria.timeToMarket + criteria.reversibility;
      return { id: p.id, score: total };
    }).sort((a, b) => b.score - a.score);
    return {
      agentId: agent.id,
      rankedProposalIds: scores.map(s => s.id),
      weight: agent.weight,
      confidence: 0.8
    };
  });
}
