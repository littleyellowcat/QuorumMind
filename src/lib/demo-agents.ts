import type { Agent, Critique, DecisionContext, Proposal } from "./domain";

const baseRisks = {
  tenantLeak: {
    category: "security",
    severity: "high",
    description: "A missing tenant boundary can expose cross-tenant data.",
    mitigation: "Centralize tenant-scoped data access and add authorization boundary tests."
  },
  operationalLoad: {
    category: "complexity",
    severity: "medium",
    description: "More isolated tenancy models increase migration, backup, and support operations.",
    mitigation: "Automate tenant lifecycle tasks before moving beyond shared tables."
  },
  scalePressure: {
    category: "performance",
    severity: "medium",
    description: "Noisy tenants can stress shared indexes and connection pools.",
    mitigation: "Track per-tenant usage and add partitioning or premium isolation when needed."
  }
} as const;

export function createDefaultAgents(): Agent[] {
  return [
    {
      id: "principal-architect",
      name: "Principal Architect",
      role: "principal_architect",
      provider: "demo",
      weight: 1
    },
    {
      id: "sre-reviewer",
      name: "SRE Reviewer",
      role: "sre_reviewer",
      provider: "demo",
      weight: 0.95
    },
    {
      id: "security-reviewer",
      name: "Security Reviewer",
      role: "security_reviewer",
      provider: "demo",
      weight: 1
    },
    {
      id: "cost-engineer",
      name: "Cost Engineer",
      role: "cost_engineer",
      provider: "demo",
      weight: 0.9
    },
    {
      id: "pragmatic-builder",
      name: "Pragmatic Builder",
      role: "pragmatic_builder",
      provider: "demo",
      weight: 1
    }
  ];
}

export function generateProposal(roomId: string, agent: Agent, context: DecisionContext): Proposal {
  const sharedTableRecommendation =
    "Use PostgreSQL shared tables with tenant_id for the MVP, enforce tenant-aware repositories, and keep a documented path to schema-level isolation for enterprise tenants.";

  const schemaRecommendation =
    "Use schema-per-tenant for regulated or high-value tenants, but keep the MVP control plane and shared metadata simple.";

  const microserviceWarning =
    "Avoid database-per-tenant or service-per-tenant at launch unless a signed enterprise requirement justifies the operational load.";

  const common = {
    roomId,
    agentId: agent.id,
    alternatives: ["Shared tables with tenant_id", "Schema per tenant", "Database per tenant"],
    assumptions: context.assumptions,
    migrationPath: [
      "Start with shared tables and tenant_id on every tenant-owned table.",
      "Add tenant-aware repository helpers and authorization tests before beta.",
      "Introduce schema-per-tenant for enterprise tenants only after isolation requirements appear.",
      "Revisit database-per-tenant when operational automation and revenue justify it."
    ],
    version: "initial" as const
  };

  switch (agent.role) {
    case "security_reviewer":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Shared tenancy with strict access guardrails",
        recommendation: sharedTableRecommendation,
        reasoning:
          "Security risk is real, but the MVP can control it with centralized tenant scoping, row-level conventions, and tests. Schema-per-tenant should be reserved for stronger isolation commitments.",
        strengths: ["Fast MVP delivery", "Clear upgrade path", "Security controls can be tested centrally"],
        weaknesses: ["A missed tenant filter is severe", "Requires discipline in every data access path"],
        risks: [baseRisks.tenantLeak],
        criteriaScores: {
          scalability: 76,
          reliability: 78,
          security: 82,
          costEfficiency: 86,
          implementationComplexity: 80,
          maintainability: 78,
          migrationFlexibility: 82,
          teamFit: 86,
          timeToMarket: 88,
          reversibility: 80
        },
        regretByScenario: {
          trafficSpike: 28,
          smallTeam: 12,
          strictSecurity: 45,
          budgetPressure: 14
        },
        confidence: 0.82
      };
    case "sre_reviewer":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Operate one database first, isolate later",
        recommendation: sharedTableRecommendation,
        reasoning:
          "One shared PostgreSQL deployment keeps backups, migrations, monitoring, and incident response understandable for a small team. Isolation can become a premium migration path.",
        strengths: ["Low operational burden", "Simpler migrations", "Easier observability"],
        weaknesses: ["Noisy tenant risk", "Requires per-tenant metrics from the start"],
        risks: [baseRisks.scalePressure],
        criteriaScores: {
          scalability: 78,
          reliability: 84,
          security: 76,
          costEfficiency: 88,
          implementationComplexity: 84,
          maintainability: 82,
          migrationFlexibility: 78,
          teamFit: 88,
          timeToMarket: 86,
          reversibility: 76
        },
        regretByScenario: {
          trafficSpike: 35,
          smallTeam: 8,
          strictSecurity: 50,
          budgetPressure: 12
        },
        confidence: 0.84
      };
    case "cost_engineer":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Optimize for learning cost and migration optionality",
        recommendation: sharedTableRecommendation,
        reasoning:
          "The MVP's scarce resource is engineering time. Shared tables reduce infrastructure cost and defer expensive automation until revenue proves the isolation need.",
        strengths: ["Cheapest launch path", "Smallest engineering surface", "Avoids premature tenant automation"],
        weaknesses: ["Enterprise isolation may require later migration", "Cost savings depend on good indexing"],
        risks: [baseRisks.operationalLoad],
        criteriaScores: {
          scalability: 74,
          reliability: 78,
          security: 74,
          costEfficiency: 94,
          implementationComplexity: 88,
          maintainability: 80,
          migrationFlexibility: 80,
          teamFit: 90,
          timeToMarket: 90,
          reversibility: 82
        },
        regretByScenario: {
          trafficSpike: 34,
          smallTeam: 6,
          strictSecurity: 52,
          budgetPressure: 8
        },
        confidence: 0.85
      };
    case "pragmatic_builder":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Ship shared tables, test tenant boundaries hard",
        recommendation: sharedTableRecommendation,
        reasoning:
          "The product should not pay microservice or tenant-automation tax before it has customers. Build the narrow path well and make the escape hatch visible.",
        strengths: ["Fastest to build", "Best match for team size", "Avoids over-engineering"],
        weaknesses: ["Requires a strong data access convention", "Not ideal for hard isolation contracts"],
        risks: [baseRisks.tenantLeak, baseRisks.scalePressure],
        criteriaScores: {
          scalability: 75,
          reliability: 78,
          security: 78,
          costEfficiency: 90,
          implementationComplexity: 92,
          maintainability: 84,
          migrationFlexibility: 82,
          teamFit: 92,
          timeToMarket: 94,
          reversibility: 84
        },
        regretByScenario: {
          trafficSpike: 32,
          smallTeam: 5,
          strictSecurity: 48,
          budgetPressure: 7
        },
        confidence: 0.88
      };
    case "principal_architect":
    default:
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Shared core with explicit isolation evolution path",
        recommendation: `${sharedTableRecommendation} ${schemaRecommendation} ${microserviceWarning}`,
        reasoning:
          "Architecture should match the product stage while preserving a clean evolution path. Shared tables are the right default when the team needs speed, but the data model must make future isolation possible.",
        strengths: ["Balances speed and future migration", "Keeps system boundaries simple", "Documents when to evolve"],
        weaknesses: ["Needs careful schema conventions", "May need migration work for enterprise contracts"],
        risks: [baseRisks.tenantLeak, baseRisks.operationalLoad],
        criteriaScores: {
          scalability: 82,
          reliability: 82,
          security: 80,
          costEfficiency: 86,
          implementationComplexity: 84,
          maintainability: 86,
          migrationFlexibility: 88,
          teamFit: 88,
          timeToMarket: 86,
          reversibility: 86
        },
        regretByScenario: {
          trafficSpike: 25,
          smallTeam: 10,
          strictSecurity: 42,
          budgetPressure: 12
        },
        confidence: 0.86
      };
  }
}

export function generateCritique(
  roomId: string,
  reviewer: Agent,
  targetProposal: Proposal,
  index: number
): Critique {
  const risk = targetProposal.risks[0];

  return {
    id: `${reviewer.id}-critiques-${targetProposal.id}`,
    roomId,
    reviewerAgentId: reviewer.id,
    targetProposalId: targetProposal.id,
    strongestArgument: `Proposal ${String.fromCharCode(65 + index)} is strongest when it keeps the MVP aligned with current team capacity.`,
    weakestAssumption:
      reviewer.role === "security_reviewer"
        ? "It assumes tenant filtering will be applied perfectly across every future data path."
        : "It assumes current scale and compliance needs will remain stable long enough to defer deeper isolation.",
    hiddenRisks: [risk?.description ?? "The proposal may hide migration work until after customer commitments are made."],
    missingConsiderations: [
      "Define explicit triggers for moving from shared tables to schema-per-tenant.",
      "Add runbook ownership for tenant migration, backup, and incident response."
    ],
    improvementSuggestions: [
      "Add tenant boundary tests before launch.",
      "Track per-tenant metrics from day one.",
      "Document rollback and isolation upgrade paths in the ADR."
    ],
    scores: targetProposal.criteriaScores
  };
}

export function reviseProposal(proposal: Proposal, critiques: Critique[]): Proposal {
  const acceptedSuggestions = Array.from(
    new Set(critiques.flatMap((critique) => critique.improvementSuggestions))
  ).slice(0, 3);

  return {
    ...proposal,
    id: `${proposal.id}-revised`,
    version: "revised",
    recommendation: `${proposal.recommendation} The revised plan adds explicit tenant-boundary tests, per-tenant metrics, and a written isolation upgrade trigger.`,
    strengths: [...proposal.strengths, "Responds to cross-agent critique with concrete guardrails"],
    weaknesses: proposal.weaknesses.filter((weakness) => !weakness.toLowerCase().includes("requires discipline")),
    migrationPath: [...proposal.migrationPath, ...acceptedSuggestions],
    confidence: Math.min(0.95, proposal.confidence + 0.03)
  };
}
