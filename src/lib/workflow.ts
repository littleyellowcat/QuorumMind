import { generateADR } from "./adr";
import { createDefaultAgents, generateCritique, generateProposal, reviseProposal } from "./demo-agents";
import type { Agent, AgentRanking, DecisionContext, DecisionMode, Proposal, Verdict } from "./domain";
import { scoreProposals } from "./scoring";

type RunDecisionRoomInput = {
  question: string;
  mode: DecisionMode;
  context: DecisionContext;
};

type DecisionRoomResult = {
  roomId: string;
  question: string;
  mode: DecisionMode;
  context: DecisionContext;
  agents: Agent[];
  initialProposals: Proposal[];
  critiques: ReturnType<typeof generateCritique>[];
  revisedProposals: Proposal[];
  rankings: AgentRanking[];
  verdict: Verdict;
};

const defaultWeights = {
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

export function runDecisionRoom(input: RunDecisionRoomInput): DecisionRoomResult {
  const roomId = "demo-room";
  const agents = createDefaultAgents();
  const activeAgents = input.mode === "fast" ? agents.slice(0, 3) : agents;
  const initialProposals = activeAgents.map((agent) => generateProposal(roomId, agent, input.context));
  const critiques = activeAgents.flatMap((reviewer) =>
    initialProposals
      .filter((proposal) => proposal.agentId !== reviewer.id)
      .map((proposal, index) => generateCritique(roomId, reviewer, proposal, index))
  );

  const revisedProposals = initialProposals.map((proposal) =>
    reviseProposal(
      proposal,
      critiques.filter((critique) => critique.targetProposalId === proposal.id)
    )
  );

  const rankings = createRankings(activeAgents, revisedProposals);
  const scoring = scoreProposals({
    proposals: revisedProposals.map((proposal) => ({
      proposalId: proposal.id,
      criteriaScores: proposal.criteriaScores,
      confidence: proposal.confidence,
      regretByScenario: proposal.regretByScenario
    })),
    rankings,
    weights: weightsForContext(input.context)
  });

  const winner = revisedProposals.find((proposal) => proposal.id === scoring.ranked[0]?.proposalId) ?? revisedProposals[0];
  const assumptionLedger = Array.from(new Set(revisedProposals.flatMap((proposal) => proposal.assumptions)));
  const riskRadar = Array.from(
    new Map(revisedProposals.flatMap((proposal) => proposal.risks).map((risk) => [risk.description, risk])).values()
  );
  const preMortem = [
    "A tenant boundary bug exposes data because data access helpers were bypassed.",
    "A high-value tenant demands stronger isolation before the migration playbook is ready.",
    "Noisy tenant growth causes shared indexes and connection pools to degrade."
  ];
  const adr = {
    title: "Use shared-table tenancy with an explicit isolation upgrade path",
    status: "accepted" as const,
    context: `${input.question} Context: ${input.context.expectedScale} Team: ${input.context.teamProfile}`,
    decision: winner.recommendation,
    alternatives: winner.alternatives,
    consequences: [
      "The MVP can ship with one PostgreSQL operational surface.",
      "Tenant-boundary tests and tenant-aware data access become launch blockers.",
      "Enterprise isolation remains a documented migration path, not an upfront default."
    ],
    risks: riskRadar,
    rollbackPlan: [
      "Freeze new tenant onboarding if a tenant-isolation incident occurs.",
      "Move affected tenants to schema-per-tenant isolation.",
      "Run authorization boundary tests before reopening onboarding."
    ],
    reviewDate: "2026-09-12"
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
      selectedProposalId: winner.id,
      finalRecommendation: winner.recommendation,
      quorumScore: scoring.ranked[0]?.quorumScore ?? 0,
      dissentIndex: scoring.dissentIndex,
      rankedProposals: scoring.ranked,
      assumptionLedger,
      riskRadar,
      preMortem,
      adr,
      adrMarkdown: generateADR(adr)
    }
  };
}

function createRankings(agents: Agent[], proposals: Proposal[]): AgentRanking[] {
  return agents.map((agent) => ({
    agentId: agent.id,
    rankedProposalIds: [...proposals]
      .sort((a, b) => roleAdjustedScore(b, agent) - roleAdjustedScore(a, agent))
      .map((proposal) => proposal.id)
  }));
}

function roleAdjustedScore(proposal: Proposal, agent: Agent): number {
  const base =
    proposal.criteriaScores.scalability * 0.1 +
    proposal.criteriaScores.reliability * 0.1 +
    proposal.criteriaScores.security * 0.12 +
    proposal.criteriaScores.costEfficiency * 0.1 +
    proposal.criteriaScores.implementationComplexity * 0.12 +
    proposal.criteriaScores.maintainability * 0.1 +
    proposal.criteriaScores.migrationFlexibility * 0.1 +
    proposal.criteriaScores.teamFit * 0.12 +
    proposal.criteriaScores.timeToMarket * 0.12 +
    proposal.criteriaScores.reversibility * 0.12;

  if (agent.role === "security_reviewer") {
    return base + proposal.criteriaScores.security * 0.12;
  }

  if (agent.role === "sre_reviewer") {
    return base + proposal.criteriaScores.reliability * 0.12;
  }

  if (agent.role === "cost_engineer") {
    return base + proposal.criteriaScores.costEfficiency * 0.12;
  }

  if (agent.role === "pragmatic_builder") {
    return base + proposal.criteriaScores.timeToMarket * 0.12 + proposal.criteriaScores.teamFit * 0.08;
  }

  return base + proposal.criteriaScores.migrationFlexibility * 0.08;
}

function weightsForContext(context: DecisionContext) {
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
