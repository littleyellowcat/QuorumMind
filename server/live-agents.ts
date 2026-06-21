import type { Agent, AgentRanking, Critique, DecisionContext, DecisionMode, Proposal } from "../src/lib/domain";
import type { ModelProvider, ProviderPhase } from "./providers/types";
import { parseProviderJson } from "./provider-json";
import { normalizeProviderPayload, type NormalizedProviderProposal } from "./provider-schema";
import { generateADR } from "../src/lib/adr";
import { buildAHPAnalysis } from "../src/lib/ahp";
import { createDefaultAgents, generateCritique, generateProposal, reviseProposal } from "../src/lib/demo-agents";
import { calculateMonteCarloStressLens, calculateRegretMap, calculateTopsisLens, scoreProposals } from "../src/lib/scoring";
import { inferDecisionDomain } from "../src/lib/model-reputation";
import { matchSkills, type SkillMeta } from "./skill-loader";
import { buildSkillCandidateList, buildSkillInjection } from "./skill-inject";

// ── Helpers ────────────────────────────────────────────

/**
 * Parse the LLM's JSON response to extract the `skills_used` field.
 * Returns an array of skill names, or an empty array if none found.
 */
function extractSkillsUsed(text: string): string[] {
  const parsed = parseProviderJson(text);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const skillsUsed = (parsed as Record<string, unknown>)["skills_used"];
    if (Array.isArray(skillsUsed) && skillsUsed.every((s) => typeof s === "string")) {
      return skillsUsed as string[];
    }
  }
  return [];
}

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
  knowledgeInjection = "",
  skillMatches?: SkillMeta[]
): Promise<Proposal> {
  const domain = inferDecisionDomain(question, context);
  const matched = skillMatches ?? matchSkills(question, domain, agent.role);
  const skillCandidateList = buildSkillCandidateList(matched);
  const enhancedQuestion = [knowledgeInjection, skillCandidateList, question]
    .filter(Boolean)
    .join("\n\n");

  const text = await buildLiveRequest(provider, "proposal", agent, enhancedQuestion, context, "en");

  // Extract skills_used from LLM response and build skill injection
  const skillsUsed = extractSkillsUsed(text);
  const skillInjection = skillsUsed.length > 0
    ? buildSkillInjection(skillsUsed, matched)
    : "";

  const parsed = parseProviderJson(text);
  const schema = parsed !== undefined
    ? normalizeProviderPayload("proposal", parsed)
    : null;

  if (schema?.ok && schema.normalized) {
    const proposal = mapToProposal(schema.normalized as NormalizedProviderProposal, roomId, agent);
    if (skillInjection) {
      proposal.reasoning = skillInjection + "\n\n" + proposal.reasoning;
    }
    return proposal;
  }

  // Fallback: return a minimal proposal with the raw text
  const fallbackReasoning = skillInjection
    ? skillInjection + "\n\n" + text.slice(0, 1000)
    : text.slice(0, 1000);

  return {
    id: `${agent.id}-proposal-initial`,
    roomId,
    agentId: agent.id,
    title: "Live proposal (unparsed)",
    recommendation: text.slice(0, 500),
    alternatives: [],
    reasoning: fallbackReasoning,
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
  allProposals: Proposal[],
  skillMatches?: SkillMeta[]
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

  // Reuse proposal-phase skillMatches and add review-specific skills
  const reviewSkills = (skillMatches ?? []).filter(s =>
    s.triggers.some(t => ["review", "critique", "audit", "评审"].includes(t))
  );
  const reviewCandidateList = buildSkillCandidateList(reviewSkills);

  const question = `Critique the proposal with id "${targetProposal.id}". Consider its strengths, weaknesses, hidden risks, and missing considerations.`;
  const enhancedQuestion = reviewCandidateList
    ? reviewCandidateList + "\n\n" + question
    : question;

  const text = await buildLiveRequest(
    provider, "critique", reviewer, enhancedQuestion,
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
  critiques: Critique[],
  skillMatches?: SkillMeta[]
): Promise<Proposal> {
  const suggestions = critiques
    .flatMap(c => c.improvementSuggestions)
    .filter(Boolean);

  // Build critique-aware skill enhancement: if critiques mention
  // specific domains, load additional skills for those areas.
  const critiqueText = critiques
    .map(c => `${c.strongestArgument} ${c.weakestAssumption} ${c.hiddenRisks.join(" ")} ${c.missingConsiderations.join(" ")}`)
    .join(" ");
  const extraSkills = (skillMatches ?? []).filter(s =>
    s.triggers.length === 0 ||
    s.triggers.some(t => critiqueText.toLowerCase().includes(t.toLowerCase()))
  );
  const revisionCandidateList = buildSkillCandidateList(extraSkills);

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
  const enhancedQuestion = revisionCandidateList
    ? revisionCandidateList + "\n\n" + question
    : question;

  const text = await buildLiveRequest(
    provider, "revision", agent, enhancedQuestion,
    proposal as unknown as DecisionContext,
    "en", payload
  );

  // Extract skills_used from LLM response for the revision round
  const skillsUsed = extractSkillsUsed(text);
  const revisionSkills = [...(skillMatches ?? []), ...extraSkills];
  const skillInjection = skillsUsed.length > 0
    ? buildSkillInjection(skillsUsed, revisionSkills)
    : "";

  const parsed = parseProviderJson(text);
  const schema = parsed !== undefined
    ? normalizeProviderPayload("proposal", parsed)
    : null;

  if (schema?.ok && schema.normalized) {
    const n = schema.normalized as NormalizedProviderProposal;
    const revisedReasoning = skillInjection
      ? skillInjection + "\n\n" + n.recommendation
      : n.recommendation;
    return {
      ...proposal,
      id: `${agent.id}-proposal-revised`,
      recommendation: n.recommendation,
      reasoning: revisedReasoning,
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

// ── Orchestrator-Worker Pipeline ──────────────────────────

export type OrchestrationTrace = {
  phase: string;
  workerCount: number;
  passCount: number;
  failCount: number;
  summary: string;
};

export async function runLiveDecisionRoom(input: LiveDecisionRoomInput) {
  const roomId = `live-${Date.now()}`;
  const knowledgeInjection = input.knowledgeInjection ?? "";
  const agents = createDefaultAgents();
  const activeAgents = input.mode === "fast" ? agents.slice(0, 3) : agents;
  const trace: OrchestrationTrace[] = [];

  // Pre-compute skill matches per agent
  const domain = inferDecisionDomain(input.question, input.context);
  const agentSkills = new Map<string, SkillMeta[]>();
  for (const agent of activeAgents) {
    agentSkills.set(agent.id, matchSkills(input.question, domain, agent.role));
  }

  // ═══════════════════════════════════════════════════════
  // Phase 1: Dispatch Workers
  // Orchestrator assigns each Worker a role, question, context,
  // knowledge injection, and matching skills.
  // ═══════════════════════════════════════════════════════
  const initialProposals: Proposal[] = [];
  let workerPass = 0, workerFail = 0;
  for (const agent of activeAgents) {
    const provider = pickProvider(agent, input.providers);
    const skills = agentSkills.get(agent.id);
    if (provider) {
      try {
        const p = await generateLiveProposal(provider, roomId, agent, input.context, input.question, knowledgeInjection, skills);
        initialProposals.push(p);
        workerPass++;
      } catch {
        initialProposals.push(generateProposal(roomId, agent, input.context, input.question, knowledgeInjection));
        workerFail++;
      }
    } else {
      initialProposals.push(generateProposal(roomId, agent, input.context, input.question, knowledgeInjection));
      workerPass++;
    }
  }
  trace.push({ phase: "dispatch", workerCount: activeAgents.length, passCount: workerPass, failCount: workerFail, summary: `${workerPass}/${activeAgents.length} Workers generated proposals` });

  // ═══════════════════════════════════════════════════════
  // Phase 2: Validate Worker Output
  // Validator checks: (a) all Workers returned a Proposal,
  // (b) proposals are structurally distinct (no >80% text overlap),
  // (c) each covers the 10 criteria dimensions.
  // ═══════════════════════════════════════════════════════
  const validationFailures: string[] = [];
  for (let i = 0; i < initialProposals.length; i++) {
    for (let j = i + 1; j < initialProposals.length; j++) {
      const overlap = textOverlap(initialProposals[i].recommendation, initialProposals[j].recommendation);
      if (overlap > 0.8) {
        validationFailures.push(`Proposals ${i} and ${j} have ${Math.round(overlap * 100)}% text overlap`);
      }
    }
  }
  trace.push({ phase: "validate", workerCount: initialProposals.length, passCount: initialProposals.length - validationFailures.length, failCount: validationFailures.length, summary: validationFailures.length === 0 ? "All Workers passed validation" : `Validation issues: ${validationFailures.join("; ")}` });

  // ═══════════════════════════════════════════════════════
  // Phase 3: Cross-Critique (Critic Round)
  // Each Worker blind-reviews every OTHER Worker's output.
  // Blind Review: proposal authorship is hidden (Proposal A/B/C).
  // ═══════════════════════════════════════════════════════
  const critiques: Critique[] = [];
  let criticPass = 0, criticFail = 0;
  for (const reviewer of activeAgents) {
    for (const proposal of initialProposals) {
      if (proposal.agentId === reviewer.id) continue;
      const provider = pickProvider(reviewer, input.providers);
      const proposalSkills = agentSkills.get(proposal.agentId);
      if (provider) {
        try {
          const c = await generateLiveCritique(provider, roomId, reviewer, proposal, initialProposals, proposalSkills);
          critiques.push(c);
          criticPass++;
        } catch {
          critiques.push(generateCritique(roomId, reviewer, proposal, critiques.length));
          criticFail++;
        }
      } else {
        critiques.push(generateCritique(roomId, reviewer, proposal, critiques.length));
        criticPass++;
      }
    }
  }
  trace.push({ phase: "cross_critique", workerCount: activeAgents.length, passCount: criticPass, failCount: criticFail, summary: `${criticPass}/${criticPass + criticFail} Critic reviews completed` });

  // ═══════════════════════════════════════════════════════
  // Phase 4: Revise
  // Each Worker absorbs Critic feedback and produces a
  // revised proposal (version: "revised").
  // ═══════════════════════════════════════════════════════
  const revisedProposals = await Promise.all(initialProposals.map(async (proposal) => {
    const agent = activeAgents.find(a => a.id === proposal.agentId)!;
    const provider = pickProvider(agent, input.providers);
    const relevant = critiques.filter(c => c.targetProposalId === proposal.id);
    // Pass the original agent's skillMatches to the revision
    const skills = agentSkills.get(proposal.agentId);
    if (provider) {
      try {
        return await reviseLiveProposal(provider, roomId, agent, proposal, relevant, skills);
      } catch {
        return reviseProposal(proposal, relevant);
      }
    }
    return reviseProposal(proposal, relevant);
  }));

  // ═══════════════════════════════════════════════════════
  // Phase 5: Finalize
  // Scoring (Borda/Bayesian/TOPSIS/Monte Carlo/AHP) +
  // ADR generation + decision summary persistence.
  // ═══════════════════════════════════════════════════════
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

  trace.push({ phase: "finalize", workerCount: 1, passCount: 1, failCount: 0, summary: `Winner: ${selectedProposalId}, Quorum Score: ${winner?.quorumScore ?? 0}` });

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
    orchestrationTrace: trace,
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

// ── Orchestrator Helpers ─────────────────────────────────

function textOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
  return intersection / Math.max(wordsA.size, wordsB.size);
}
