// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DecisionContext } from "../src/lib/domain";
import { aggregateLiveVerdict } from "./live-aggregation";
import type { LiveDecisionTraceEntry } from "./live-decision";

const context: DecisionContext = {
  productStage: "mvp",
  expectedScale: "50 tenants",
  teamProfile: "Small full-stack team",
  budgetSensitivity: "high",
  reliabilityRequirement: "medium",
  securityRequirement: "high",
  existingConstraints: ["Use PostgreSQL"],
  candidateOptions: ["Shared tables", "Schema per tenant"],
  assumptions: ["No strict compliance need at launch"]
};

function traceEntry(input: {
  provider: LiveDecisionTraceEntry["provider"];
  phase: LiveDecisionTraceEntry["phase"];
  parsed: unknown;
  normalized?: LiveDecisionTraceEntry["normalized"];
}): LiveDecisionTraceEntry {
  return {
    runId: "test-run",
    id: `${input.phase}-${input.provider}`,
    provider: input.provider,
    model: `${input.provider}-model`,
    phase: input.phase,
    attempt: 1,
    maxAttempts: 1,
    retryCount: 0,
    attempts: [
      {
        attempt: 1,
        status: "ok",
        durationMs: 1,
        jsonParsed: true,
        validationStatus: input.normalized ? "valid" : "repaired",
        validationIssues: []
      }
    ],
    agentName: `${input.provider} agent`,
    agentRole: "principal_architect",
    status: "ok",
    text: JSON.stringify(input.parsed),
    durationMs: 1,
    jsonParsed: true,
    validationStatus: input.normalized ? "valid" : "repaired",
    validationIssues: [],
    normalized: input.normalized,
    parsed: input.parsed
  };
}

function proposal(proposalId: string, recommendation: string, score: number) {
  return {
    proposalId,
    title: recommendation,
    recommendation,
    reasoning: `${recommendation} reasoning`,
    alternatives: ["Alternative"],
    strengths: ["Strength"],
    weaknesses: ["Weakness"],
    assumptions: ["Assumption"],
    risks: [],
    criteriaScores: {
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
    },
    regretByScenario: {
      scaleSpike: 100 - score,
      securityIncident: 100 - score
    },
    confidence: 0.9
  };
}

describe("aggregateLiveVerdict", () => {
  it("scores parsed live proposals with parsed model rankings", () => {
    const trace: LiveDecisionTraceEntry[] = [
      traceEntry({ provider: "openai", phase: "revision", parsed: proposal("shared", "Use shared tables", 86) }),
      traceEntry({ provider: "deepseek", phase: "revision", parsed: proposal("schema", "Use schema per tenant", 74) }),
      traceEntry({ provider: "gemini", phase: "revision", parsed: proposal("database", "Use database per tenant", 62) }),
      traceEntry({
        provider: "openai",
        phase: "ranking",
        parsed: { rankedProposalIds: ["shared", "schema", "database"], rationale: "Fastest MVP path", confidence: 0.9 }
      }),
      traceEntry({
        provider: "deepseek",
        phase: "ranking",
        parsed: { rankedProposalIds: ["shared", "schema", "database"], rationale: "Cheapest option", confidence: 0.82 }
      }),
      traceEntry({
        provider: "gemini",
        phase: "ranking",
        parsed: { rankedProposalIds: ["schema", "shared", "database"], rationale: "Cleaner isolation", confidence: 0.78 }
      }),
      traceEntry({
        provider: "openai",
        phase: "verdict",
        parsed: {
          selectedProposalId: "shared",
          finalRecommendation: "Ship shared tables with tenant-boundary tests.",
          whyItWon: ["Highest weighted score", "Best time-to-market"],
          remainingDissent: ["Gemini prefers stronger isolation"]
        }
      })
    ];

    const verdict = aggregateLiveVerdict({ trace, context });

    expect(verdict).toMatchObject({
      source: "live",
      selectedProposalId: "shared",
      finalRecommendation: "Ship shared tables with tenant-boundary tests.",
      usedProposalPhase: "revision"
    });
    expect(verdict?.rankedProposals[0].proposalId).toBe("shared");
    expect(verdict?.dissentIndex).toBeGreaterThan(0);
    expect(verdict?.whyItWon).toContain("Highest weighted score");
    expect(verdict?.remainingDissent).toContain("Gemini prefers stronger isolation");
  });

  it("returns null when live trace does not contain usable proposals and rankings", () => {
    expect(aggregateLiveVerdict({ trace: [], context })).toBeNull();
  });

  it("prefers schema-normalized live payloads over raw parsed provider output", () => {
    const trace: LiveDecisionTraceEntry[] = [
      traceEntry({
        provider: "openai",
        phase: "proposal",
        parsed: proposal("shared", "Raw weak shared option", 20),
        normalized: proposal("shared", "Normalized strong shared option", 90)
      }),
      traceEntry({
        provider: "deepseek",
        phase: "proposal",
        parsed: proposal("schema", "Raw strong schema option", 95),
        normalized: proposal("schema", "Normalized weaker schema option", 60)
      }),
      traceEntry({
        provider: "openai",
        phase: "ranking",
        parsed: { rankedProposalIds: ["schema", "shared"], confidence: 0.7 },
        normalized: { rankedProposalIds: ["shared", "schema"], confidence: 0.9 }
      })
    ];

    const verdict = aggregateLiveVerdict({ trace, context });

    expect(verdict?.selectedProposalId).toBe("shared");
    expect(verdict?.finalRecommendation).toBe("Normalized strong shared option");
  });

  it("maps common provider-index proposal aliases in rankings and verdicts", () => {
    const trace: LiveDecisionTraceEntry[] = [
      traceEntry({
        provider: "openai",
        phase: "proposal",
        parsed: proposal("langgraph-vs-langchain-mvp-001", "Use LangGraph as the main orchestrator.", 88)
      }),
      traceEntry({
        provider: "deepseek",
        phase: "proposal",
        parsed: proposal("cost-risk-001", "Use LangGraph with strict implementation guardrails.", 82)
      }),
      traceEntry({
        provider: "gemini",
        phase: "proposal",
        parsed: proposal("langgraph-agentic-workflow", "Use LangGraph for stateful multi-agent workflow.", 86)
      }),
      traceEntry({
        provider: "openai",
        phase: "ranking",
        parsed: {
          rankedProposalIds: ["proposal-openai-0", "proposal-gemini-2", "proposal-deepseek-1"],
          confidence: 0.88
        }
      }),
      traceEntry({
        provider: "gemini",
        phase: "verdict",
        parsed: {
          selectedProposalId: "proposal-openai-0",
          finalRecommendation: "MVP 阶段优先使用 LangGraph，LangChain 作为工具层补充。",
          whyItWon: ["LangGraph 更适合显式状态和多 Agent 复审回路。"],
          remainingDissent: []
        }
      })
    ];

    const verdict = aggregateLiveVerdict({ trace, context });

    expect(verdict).toMatchObject({
      selectedProposalId: "langgraph-vs-langchain-mvp-001",
      finalRecommendation: "MVP 阶段优先使用 LangGraph，LangChain 作为工具层补充。"
    });
  });
});
