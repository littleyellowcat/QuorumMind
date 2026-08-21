import type { ImplementedProviderId, ModelProvider, ProviderRequest } from "./types";

const proposalIds: Record<ImplementedProviderId, string> = {
  model_gateway: "gateway-balanced-proposal",
  openai: "gpt-balanced-proposal",
  deepseek: "deepseek-cost-risk-proposal",
  gemini: "gemini-strategy-proposal",
  anthropic: "anthropic-safety-proposal",
  openrouter: "openrouter-marketplace-proposal",
  ollama: "ollama-local-proposal",
  lmstudio: "lmstudio-local-proposal"
};

const providerScores: Record<ImplementedProviderId, number> = {
  model_gateway: 82,
  openai: 88,
  deepseek: 84,
  gemini: 80,
  anthropic: 86,
  openrouter: 83,
  ollama: 78,
  lmstudio: 77
};

export function createMockProvider(id: ImplementedProviderId, model: string): ModelProvider {
  return {
    id,
    model,
    async generateDecisionText(request) {
      return JSON.stringify(payloadForPhase(id, request));
    }
  };
}

export function createMockProviderSet(): ModelProvider[] {
  return [
    createMockProvider("openai", "mock-gpt-seat"),
    createMockProvider("deepseek", "mock-deepseek-seat"),
    createMockProvider("gemini", "mock-gemini-seat")
  ];
}

function payloadForPhase(id: ImplementedProviderId, request: ProviderRequest): unknown {
  const isServiceDecomposition = isServiceDecompositionRequest(request);

  if (request.phase === "ranking") {
    return {
      rankedProposalIds: rankingForProvider(id),
      rationale: isServiceDecomposition
        ? `${id} mock ranking prefers a modular monolith before service extraction for the small Node.js team.`
        : `${id} mock ranking uses deterministic demo priorities.`,
      confidence: 0.82
    };
  }

  if (request.phase === "verdict") {
    if (isServiceDecomposition) {
      return {
        selectedProposalId: "gpt-balanced-proposal",
        finalRecommendation:
          "Keep the Node.js backend as a modular monolith for now. Do not do a broad microservice split with a 5-person team focused on six-month enterprise feature delivery; instead enforce module boundaries, add observability, and define explicit service-extraction triggers.",
        whyItWon: [
          "It preserves delivery speed while still creating a credible path to future service extraction.",
          "It avoids distributed-system operating cost before the team has enough ownership and scale pressure."
        ],
        remainingDissent: ["DeepSeek still wants strict extraction thresholds so the monolith does not keep accumulating coupling."],
        confidence: 0.86
      };
    }

    return {
      selectedProposalId: "gpt-balanced-proposal",
      finalRecommendation: "Use the balanced shared-table path with tenant-boundary tests and an explicit isolation upgrade trigger.",
      whyItWon: [
        "It has the strongest blend of time-to-market, team fit, and bounded security risk.",
        "The regret profile remains acceptable under stricter isolation scenarios."
      ],
      remainingDissent: ["DeepSeek still flags enterprise isolation as a future migration risk."],
      confidence: 0.84
    };
  }

  if (request.phase === "critique") {
    return {
      targetProposalId: "Proposal A",
      strongestArgument: isServiceDecomposition
        ? "The modular monolith path minimizes coordination overhead for the current team."
        : "The MVP path minimizes operational burden.",
      weakestAssumption: isServiceDecomposition
        ? "Module boundaries may erode unless CI and ownership rules enforce them."
        : "Enterprise isolation requirements may arrive earlier than expected.",
      hiddenRisks: isServiceDecomposition
        ? ["A poorly governed monolith can keep accumulating cross-domain coupling."]
        : ["Tenant-boundary tests might not cover ad hoc analytics paths."],
      missingConsiderations: isServiceDecomposition
        ? ["Explicit extraction trigger for domains that need independent scaling or release cadence."]
        : ["Explicit upgrade trigger for premium tenants."],
      improvementSuggestions: isServiceDecomposition
        ? ["Add module boundary checks, ownership rules, and extraction metrics."]
        : ["Add per-tenant metrics and a migration runbook."],
      scores: criteriaScores(76)
    };
  }

  return proposalPayload(id, request.phase === "revision", isServiceDecomposition);
}

function proposalPayload(id: ImplementedProviderId, revised: boolean, isServiceDecomposition: boolean) {
  const score = providerScores[id];
  const proposalId = proposalIds[id];

  if (isServiceDecomposition) {
    return {
      proposalId,
      title: revised ? `${proposalId} modular monolith revised` : `${proposalId} modular monolith initial`,
      recommendation:
        id === "deepseek"
          ? "Keep the Node.js monolith, but require measurable extraction triggers and module boundary checks."
          : "Use a modular monolith now, avoid a broad microservice split, and prepare selective extraction only after scale or ownership pressure is proven.",
      reasoning:
        "The mock provider returns stable structured JSON matched to the Node.js monolith versus microservices question so demos exercise live trace, schema validation, and aggregation without API keys.",
      alternatives: ["Modular monolith", "Selective service extraction", "Full microservices now"],
      strengths: ["Fast enterprise feature delivery", "Low operational overhead", "Clear extraction path"],
      weaknesses: ["Requires module governance"],
      assumptions: ["The 5-person team is delivery constrained", "Independent service scaling is not yet proven"],
      risks: [
        {
          category: "complexity",
          severity: "high",
          description: "A broad microservice split can consume delivery capacity and add distributed operations work.",
          mitigation: "Enforce module boundaries first and extract only when ownership, scale, or release cadence justifies it."
        }
      ],
      criteriaScores: criteriaScores(score),
      regretByScenario: {
        enterpriseFeatureRush: Math.max(4, 100 - score - 18),
        teamTurnover: 100 - score,
        trafficSpike: 100 - score + 8
      },
      confidence: 0.84
    };
  }

  return {
    proposalId,
    title: revised ? `${proposalId} revised` : `${proposalId} initial`,
    recommendation:
      id === "deepseek"
        ? "Prefer shared tables for MVP cost control, but define hard isolation upgrade thresholds."
        : "Use shared tables with tenant_id, tenant-aware repositories, and explicit isolation migration triggers.",
    reasoning:
      "The mock provider returns stable structured JSON so demos can exercise live trace, schema validation, and aggregation without API keys.",
    alternatives: ["Schema per tenant", "Database per tenant"],
    strengths: ["Fast MVP path", "Low operational overhead", "Clear migration option"],
    weaknesses: ["Requires strong tenant-boundary discipline"],
    assumptions: ["No strict regulatory isolation requirement at launch"],
    risks: [
      {
        category: "security",
        severity: "high",
        description: "A missing tenant filter can expose cross-tenant data.",
        mitigation: "Centralize tenant-aware repositories and test authorization boundaries."
      }
    ],
    criteriaScores: criteriaScores(score),
    regretByScenario: {
      strictSecurity: 100 - score + 10,
      budgetPressure: Math.max(4, 100 - score - 20),
      teamTurnover: 100 - score
    },
    confidence: 0.82
  };
}

function isServiceDecompositionRequest(request: ProviderRequest): boolean {
  const text = `${request.question} ${request.context.candidateOptions.join(" ")} ${request.context.teamProfile}`.toLowerCase();

  return (
    text.includes("microservice") ||
    text.includes("micro-service") ||
    text.includes("monolith") ||
    text.includes("node.js") ||
    text.includes("nodejs") ||
    text.includes("微服务") ||
    text.includes("单体")
  );
}

function rankingForProvider(id: ImplementedProviderId): string[] {
  if (id === "deepseek") {
    return ["deepseek-cost-risk-proposal", "gpt-balanced-proposal", "gemini-strategy-proposal"];
  }

  if (id === "gemini") {
    return ["gpt-balanced-proposal", "gemini-strategy-proposal", "deepseek-cost-risk-proposal"];
  }

  return ["gpt-balanced-proposal", "deepseek-cost-risk-proposal", "gemini-strategy-proposal"];
}

function criteriaScores(score: number) {
  return {
    scalability: score,
    reliability: score,
    security: score,
    costEfficiency: score,
    implementationComplexity: score,
    maintainability: score,
    migrationFlexibility: score,
    teamFit: score,
    timeToMarket: score,
    reversibility: score
  };
}
