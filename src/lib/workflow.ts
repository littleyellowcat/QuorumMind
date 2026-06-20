import { generateADR } from "./adr";
import { buildAHPAnalysis } from "./ahp";
import { createDefaultAgents, generateCritique, generateProposal, reviseProposal } from "./demo-agents";
import type {
  Agent,
  AgentRanking,
  AssumptionLedgerEntry,
  DelphiRound,
  DecisionContext,
  DecisionMode,
  Proposal,
  Verdict
} from "./domain";
import { buildKnowledgeInjection } from "./knowledge-inject";
import { calculateMonteCarloStressLens, calculateRegretMap, calculateTopsisLens, scoreProposals } from "./scoring";

type RunDecisionRoomInput = {
  question: string;
  mode: DecisionMode;
  context: DecisionContext;
};

export type DecisionRoomResult = {
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
  knowledgeInjection: string;
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
  const decisionPattern = inferDecisionPattern(input.question, input.context);
  const knowledgeInjection = buildKnowledgeInjection(input.question, input.context);
  const agents = createDefaultAgents();
  const activeAgents = input.mode === "fast" ? agents.slice(0, 3) : agents;
  const initialProposals = activeAgents.map((agent) => generateProposal(roomId, agent, input.context, input.question, knowledgeInjection));
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
  const weights = weightsForContext(input.context);
  const scoring = scoreProposals({
    proposals: revisedProposals.map((proposal) => ({
      proposalId: proposal.id,
      criteriaScores: proposal.criteriaScores,
      confidence: proposal.confidence,
      regretByScenario: proposal.regretByScenario
    })),
    rankings,
    weights
  });

  const winner = revisedProposals.find((proposal) => proposal.id === scoring.ranked[0]?.proposalId) ?? revisedProposals[0];
  const assumptionLedger = buildAssumptionLedger(revisedProposals);
  const regretMap = calculateRegretMap(
    revisedProposals.map((proposal) => ({
      proposalId: proposal.id,
      regretByScenario: proposal.regretByScenario
    }))
  );
  const topsisLens = calculateTopsisLens(
    revisedProposals.map((proposal) => ({
      proposalId: proposal.id,
      criteriaScores: proposal.criteriaScores
    })),
    weights
  );
  const monteCarloStress = calculateMonteCarloStressLens(
    revisedProposals.map((proposal) => ({
      proposalId: proposal.id,
      criteriaScores: proposal.criteriaScores,
      confidence: proposal.confidence,
      regretByScenario: proposal.regretByScenario
    })),
    weights,
    { iterations: input.mode === "fast" ? 120 : 240, seed: input.mode === "red_team" ? 97 : 41 }
  );
  const ahpAnalysis = buildAHPAnalysis({
    context: input.context,
    proposals: revisedProposals.map((proposal) => ({
      proposalId: proposal.id,
      criteriaScores: proposal.criteriaScores,
      confidence: proposal.confidence,
      regretByScenario: proposal.regretByScenario
    })),
    rankings
  });
  const riskRadar = Array.from(
    new Map(revisedProposals.flatMap((proposal) => proposal.risks).map((risk) => [risk.description, risk])).values()
  );
  const preMortem = preMortemForPattern(decisionPattern);
  const delphiRounds = buildDelphiRounds({
    initialProposalCount: initialProposals.length,
    critiqueCount: critiques.length,
    revisedProposalCount: revisedProposals.length,
    rankingCount: rankings.length,
    winnerId: winner.id
  });
  const adr = {
    title: adrTitleForPattern(decisionPattern),
    status: "accepted" as const,
    context: `${input.question} Context: ${input.context.expectedScale} Team: ${input.context.teamProfile}`,
    decision: winner.recommendation,
    alternatives: winner.alternatives,
    consequences: consequencesForPattern(decisionPattern),
    delphiRounds,
    assumptionLedger,
    regretMap,
    topsisLens,
    monteCarloStress,
    ahpAnalysis,
    risks: riskRadar,
    rollbackPlan: rollbackPlanForPattern(decisionPattern),
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
    knowledgeInjection,
    verdict: {
      selectedProposalId: winner.id,
      finalRecommendation: winner.recommendation,
      quorumScore: scoring.ranked[0]?.quorumScore ?? 0,
      dissentIndex: scoring.dissentIndex,
      rankedProposals: scoring.ranked,
      delphiRounds,
      assumptionLedger,
      regretMap,
      topsisLens,
      monteCarloStress,
      ahpAnalysis,
      riskRadar,
      preMortem,
      bayesianVoteWeights: scoring.bayesianVoteWeights,
      adr,
      adrMarkdown: generateADR(adr)
    }
  };
}

function buildDelphiRounds(input: {
  initialProposalCount: number;
  critiqueCount: number;
  revisedProposalCount: number;
  rankingCount: number;
  winnerId: string;
}): DelphiRound[] {
  return [
    {
      phase: "proposal",
      title: "Proposal Round",
      status: "complete",
      anonymity: "open",
      inputCount: input.initialProposalCount,
      outputCount: input.initialProposalCount,
      summary: "Agents independently generated candidate decision paths before seeing peer arguments."
    },
    {
      phase: "blind_review",
      title: "Blind Review",
      status: "complete",
      anonymity: "blind",
      inputCount: input.initialProposalCount,
      outputCount: input.critiqueCount,
      summary: "Proposal authorship was hidden so reviewers evaluated Proposal A/B/C-style content instead of model identity."
    },
    {
      phase: "cross_examination",
      title: "Cross-Examination",
      status: "complete",
      anonymity: "blind",
      inputCount: input.critiqueCount,
      outputCount: input.critiqueCount,
      summary: "Agents challenged assumptions, hidden risks, and missing considerations in rival proposals."
    },
    {
      phase: "revision",
      title: "Revision Round",
      status: "complete",
      anonymity: "open",
      inputCount: input.critiqueCount,
      outputCount: input.revisedProposalCount,
      summary: "Each proposal was revised after absorbing the strongest cross-agent objections."
    },
    {
      phase: "consensus",
      title: "Consensus Engine",
      status: "complete",
      anonymity: "n/a",
      inputCount: input.rankingCount,
      outputCount: 1,
      summary: "Borda ranking, Bayesian vote weights, weighted utility, dissent, and regret were aggregated into a final score."
    },
    {
      phase: "final_verdict",
      title: "Final Verdict",
      status: "complete",
      anonymity: "n/a",
      inputCount: 1,
      outputCount: 1,
      summary: `The decision room selected ${input.winnerId} and generated an ADR-ready recommendation.`
    }
  ];
}

function buildAssumptionLedger(proposals: Proposal[]): AssumptionLedgerEntry[] {
  const entries = proposals.flatMap((proposal, proposalIndex) =>
    proposal.assumptions.map((assumption, assumptionIndex) => {
      const lower = assumption.toLowerCase();
      const riskLevel: AssumptionLedgerEntry["riskLevel"] =
        lower.includes("regulatory") || lower.includes("compliance") ? "high" : lower.includes("scale") ? "medium" : "low";

      return {
        id: `${proposal.id}-assumption-${assumptionIndex}`,
        proposalId: proposal.id,
        assumption,
        riskLevel,
        validationQuestion: validationQuestionForAssumption(assumption, proposal),
        validationAction: validationActionForAssumption(assumption, proposalIndex)
      };
    })
  );

  return entries.filter((entry, index, all) => all.findIndex((candidate) => candidate.assumption === entry.assumption) === index);
}

function validationQuestionForAssumption(assumption: string, proposal: Proposal): string {
  const title = proposal.title.toLowerCase();
  const lowerAssumption = assumption.toLowerCase();

  if (
    title.includes("monolith") ||
    title.includes("service") ||
    lowerAssumption.includes("engineer") ||
    lowerAssumption.includes("feature delivery") ||
    lowerAssumption.includes("monolith")
  ) {
    return "Can we validate that modularizing the current backend preserves delivery speed better than a service split?";
  }

  if (lowerAssumption.includes("regulatory")) {
    return "Can we confirm the launch requirements do not mandate stronger isolation?";
  }

  if (lowerAssumption.includes("scale")) {
    return "Can the current design hold until the expected growth threshold?";
  }

  if (title.includes("security") || lowerAssumption.includes("tenant")) {
    return "Have we verified tenant-boundary tests and access controls across all data paths?";
  }

  return "Can this assumption be validated before the next release gate?";
}

function validationActionForAssumption(assumption: string, proposalIndex: number): string {
  const lower = assumption.toLowerCase();

  if (lower.includes("engineer") || lower.includes("feature delivery") || lower.includes("monolith")) {
    return "Run a two-week modularization spike and measure delivery throughput, test friction, and operational complexity.";
  }

  if (lower.includes("regulatory")) {
    return "Review launch requirements with product and legal before implementation.";
  }

  if (proposalIndex === 0) {
    return "Add the assumption to the ADR review checklist and owner it in the next design review.";
  }

  return "Capture an experiment or telemetry check that can retire this assumption.";
}

function createRankings(agents: Agent[], proposals: Proposal[]): AgentRanking[] {
  return agents.map((agent) => {
    const rankedProposals = [...proposals].sort((a, b) => roleAdjustedScore(b, agent) - roleAdjustedScore(a, agent));

    return {
      agentId: agent.id,
      rankedProposalIds: rankedProposals.map((proposal) => proposal.id),
      weight: agent.weight,
      confidence: rankedProposals[0]?.confidence,
      reputationScore: 67
    };
  });
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

type DecisionPattern = "agent_framework" | "service_decomposition" | "tenant_isolation" | "general_architecture";

function inferDecisionPattern(question: string, context: DecisionContext): DecisionPattern {
  const text = `${question} ${context.candidateOptions.join(" ")} ${context.teamProfile}`.toLowerCase();

  if (
    text.includes("langgraph") ||
    text.includes("langchain") ||
    text.includes("multi-agent") ||
    text.includes("多agent") ||
    text.includes("多 agent")
  ) {
    return "agent_framework";
  }

  if (
    text.includes("microservice") ||
    text.includes("micro-service") ||
    text.includes("monolith") ||
    text.includes("node.js") ||
    text.includes("nodejs") ||
    text.includes("微服务") ||
    text.includes("单体")
  ) {
    return "service_decomposition";
  }

  if (
    text.includes("tenant") ||
    text.includes("postgres") ||
    text.includes("schema-per-tenant") ||
    text.includes("tenant_id") ||
    text.includes("租户")
  ) {
    return "tenant_isolation";
  }

  return "general_architecture";
}

function preMortemForPattern(pattern: DecisionPattern): string[] {
  if (pattern === "agent_framework") {
    return [
      "如果只用线性 LangChain chain，长章节解析、角色一致性校验和复审回路会逐渐失控。",
      "如果一开始把图做得过大，团队会先陷入框架工程，而不是稳定 VN 数据 schema。",
      "缺少验证节点会让场景、角色、立绘需求和台词资产之间出现不一致。"
    ];
  }

  if (pattern === "service_decomposition") {
    return [
      "The team spends the next quarter building CI/CD, tracing, and service contracts instead of enterprise features.",
      "A service boundary is drawn around the wrong domain, creating cross-service changes for every customer request.",
      "Partial failures and version skew create incidents the 5-person team cannot comfortably operate."
    ];
  }

  if (pattern === "general_architecture") {
    return [
      "The team commits to the highest-ceremony option before validating whether the constraint is real.",
      "A decision is optimized for one stakeholder while creating hidden operating cost for another.",
      "The chosen path lacks rollback triggers, so the team notices the mismatch only after delivery slows down."
    ];
  }

  return [
    "A tenant boundary bug exposes data because data access helpers were bypassed.",
    "A high-value tenant demands stronger isolation before the migration playbook is ready.",
    "Noisy tenant growth causes shared indexes and connection pools to degrade."
  ];
}

function adrTitleForPattern(pattern: DecisionPattern): string {
  if (pattern === "agent_framework") {
    return "Use LangGraph as the multi-agent orchestrator and LangChain as the tool layer";
  }

  if (pattern === "service_decomposition") {
    return "Keep the Node.js backend as a modular monolith with service extraction triggers";
  }

  if (pattern === "general_architecture") {
    return "Choose the lowest-regret architecture path with explicit validation gates";
  }

  return "Use shared-table tenancy with an explicit isolation upgrade path";
}

function consequencesForPattern(pattern: DecisionPattern): string[] {
  if (pattern === "agent_framework") {
    return [
      "主流程用显式图状态表达章节解析、场景抽取、资产规划、校验和人工复审。",
      "LangChain 保留在模型调用、Prompt 模板、工具封装和文档加载层，避免承担复杂状态机。",
      "MVP 先控制图规模，等 VN 数据 schema 稳定后再扩展更多 agent。"
    ];
  }

  if (pattern === "service_decomposition") {
    return [
      "The 5-person team keeps one deployable while improving module ownership and dependency boundaries.",
      "Enterprise feature delivery remains the near-term priority instead of a broad platform migration.",
      "Microservice extraction remains available later through explicit triggers, metrics, and contract tests."
    ];
  }

  if (pattern === "general_architecture") {
    return [
      "The selected path is treated as a reversible operating decision, not a permanent platform bet.",
      "The team must define validation signals before scaling implementation effort.",
      "Alternatives remain available through documented triggers, exit criteria, and rollback steps."
    ];
  }

  return [
    "The MVP can ship with one PostgreSQL operational surface.",
    "Tenant-boundary tests and tenant-aware data access become launch blockers.",
    "Enterprise isolation remains a documented migration path, not an upfront default."
  ];
}

function rollbackPlanForPattern(pattern: DecisionPattern): string[] {
  if (pattern === "agent_framework") {
    return [
      "如果 LangGraph 图复杂度阻碍交付，收敛到最小节点集：parse、extract、validate、export。",
      "如果某个 agent 输出不稳定，先改为确定性规则或人工复审节点。",
      "如果框架耦合过高，把业务转换逻辑移回纯函数模块，只保留图编排。"
    ];
  }

  if (pattern === "service_decomposition") {
    return [
      "Stop service extraction work if delivery throughput drops for two consecutive iterations.",
      "Move any prematurely split capability back behind the monolith interface if incidents or coordination cost rise.",
      "Revisit extraction only when one domain has clear ownership, scaling pressure, and independent release needs."
    ];
  }

  if (pattern === "general_architecture") {
    return [
      "Pause expansion if the validation signal does not improve within the agreed review window.",
      "Keep the previous implementation path available until the new path proves lower operational cost.",
      "Re-run the decision with updated constraints if customer, scale, or staffing assumptions change."
    ];
  }

  return [
    "Freeze new tenant onboarding if a tenant-isolation incident occurs.",
    "Move affected tenants to schema-per-tenant isolation.",
    "Run authorization boundary tests before reopening onboarding."
  ];
}
