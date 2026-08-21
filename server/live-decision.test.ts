// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DecisionContext } from "../src/lib/domain";
import type { ManualProviderAgent } from "../src/lib/manual-provider";
import { runLiveDecisionTrace, runLiveDecisionTraceDetailed } from "./live-decision";
import type { ModelProvider, ProviderRequest } from "./providers";

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

function fakeProvider(id: ModelProvider["id"], requests: ProviderRequest[], model = `${id}-test-model`): ModelProvider {
  return {
    id,
    model,
    async generateDecisionText(request) {
      requests.push(request);
      return JSON.stringify({
        provider: id,
        phase: request.phase,
        payloadKeys: request.payload && typeof request.payload === "object" ? Object.keys(request.payload) : []
      });
    }
  };
}

describe("runLiveDecisionTrace", () => {
  it("runs proposal, critique, revision, ranking, and verdict phases across three providers", async () => {
    const requests: ProviderRequest[] = [];
    const trace = await runLiveDecisionTrace({
      providers: [
        fakeProvider("openai", requests),
        fakeProvider("deepseek", requests),
        fakeProvider("gemini", requests)
      ],
      question: "Should we use shared tables or schema-per-tenant?",
      locale: "en",
      context
    });

    expect(trace).toHaveLength(15);
    expect(trace.map((entry) => entry.phase)).toEqual([
      "proposal",
      "proposal",
      "proposal",
      "critique",
      "critique",
      "critique",
      "revision",
      "revision",
      "revision",
      "ranking",
      "ranking",
      "ranking",
      "verdict",
      "verdict",
      "verdict"
    ]);
    expect(trace.every((entry) => entry.status === "ok")).toBe(true);
    expect(trace.every((entry) => typeof entry.durationMs === "number")).toBe(true);
    expect(trace.every((entry) => entry.jsonParsed === true)).toBe(true);
    expect(trace[0].parsed).toMatchObject({ provider: "openai", phase: "proposal" });
    expect(requests.find((request) => request.phase === "critique")?.payload).toMatchObject({
      blindProposals: expect.arrayContaining([expect.objectContaining({ blindProposalId: "Proposal A" })])
    });
    expect(requests.find((request) => request.phase === "verdict")?.payload).toMatchObject({
      rankings: expect.arrayContaining([expect.objectContaining({ provider: "openai" })])
    });
  });

  it("anonymizes proposal authors during critique to support blind review", async () => {
    const requests: ProviderRequest[] = [];

    await runLiveDecisionTrace({
      providers: [
        fakeProvider("openai", requests),
        fakeProvider("deepseek", requests),
        fakeProvider("gemini", requests)
      ],
      question: "Should we use shared tables?",
      locale: "en",
      context
    });

    const critiquePayload = requests.find((request) => request.phase === "critique")?.payload;
    const serializedPayload = JSON.stringify(critiquePayload);

    expect(critiquePayload).toMatchObject({
      blindReview: true,
      blindProposals: [
        expect.objectContaining({ blindProposalId: "Proposal A" }),
        expect.objectContaining({ blindProposalId: "Proposal B" }),
        expect.objectContaining({ blindProposalId: "Proposal C" })
      ]
    });
    expect(serializedPayload).not.toContain("proposal-openai-0");
    expect(serializedPayload).not.toContain("openai-test-model");
    expect(serializedPayload).not.toContain("openai proposal agent");
    expect(serializedPayload).not.toContain('"provider":"openai"');
    expect(serializedPayload).not.toContain('"agentRole"');
  });

  it("uses a smaller phase profile in fast mode to reduce live provider calls", async () => {
    const requests: ProviderRequest[] = [];
    const trace = await runLiveDecisionTrace({
      providers: [
        fakeProvider("openai", requests),
        fakeProvider("deepseek", requests),
        fakeProvider("gemini", requests)
      ],
      question: "Should we use shared tables?",
      locale: "en",
      mode: "fast",
      context
    });

    expect(trace).toHaveLength(9);
    expect(trace.map((entry) => entry.phase)).toEqual([
      "proposal",
      "proposal",
      "proposal",
      "ranking",
      "ranking",
      "ranking",
      "verdict",
      "verdict",
      "verdict"
    ]);
    expect(requests.map((request) => request.phase)).not.toContain("critique");
    expect(requests.map((request) => request.phase)).not.toContain("revision");
  });

  it("uses custom agent configuration for live provider requests", async () => {
    const requests: ProviderRequest[] = [];
    const agentConfig: ManualProviderAgent[] = [
      {
        id: "gpt",
        name: "GPT Staff Platform Architect",
        providerLabel: "Unified gateway GPT seat",
        role: "security_reviewer",
        weight: 1.4,
        scoringFocus: ["security boundary", "platform evolution"]
      },
      {
        id: "deepseek",
        name: "DeepSeek Cost Sentinel",
        providerLabel: "Unified gateway DeepSeek seat",
        role: "cost_engineer",
        weight: 0.9,
        scoringFocus: ["cost ceiling"]
      },
      {
        id: "gemini",
        name: "Gemini Strategy Reviewer",
        providerLabel: "Unified gateway Gemini seat",
        role: "sre_reviewer",
        weight: 1.1,
        scoringFocus: ["migration timing"]
      }
    ];

    const trace = await runLiveDecisionTrace({
      providers: [
        fakeProvider("openai", requests),
        fakeProvider("deepseek", requests),
        fakeProvider("gemini", requests)
      ],
      question: "Should we use shared tables?",
      locale: "en",
      mode: "fast",
      agentConfig,
      context
    });

    expect(requests[0]).toMatchObject({
      agentName: "GPT Staff Platform Architect",
      agentRole: "security_reviewer",
      agentWeight: 1.4,
      scoringFocus: ["security boundary", "platform evolution"]
    });
    expect(trace[0]).toMatchObject({
      agentName: "GPT Staff Platform Architect",
      agentRole: "security_reviewer"
    });
  });

  it("extracts structured JSON from fenced or narrated provider responses", async () => {
    const fencedProvider: ModelProvider = {
      id: "openai",
      model: "fenced-model",
      async generateDecisionText() {
        return '```json\n{"provider":"openai","phase":"proposal","recommendation":"Use shared tables"}\n```';
      }
    };
    const narratedProvider: ModelProvider = {
      id: "deepseek",
      model: "narrated-model",
      async generateDecisionText() {
        return 'Here is the structured result:\n{"provider":"deepseek","phase":"proposal","recommendation":"Use schema per tenant"}\nEnd.';
      }
    };

    const trace = await runLiveDecisionTrace({
      providers: [fencedProvider, narratedProvider],
      question: "Should we use shared tables?",
      locale: "en",
      mode: "fast",
      context
    });

    expect(trace[0]).toMatchObject({
      provider: "openai",
      status: "ok",
      jsonParsed: true,
      parsed: {
        provider: "openai",
        recommendation: "Use shared tables"
      }
    });
    expect(trace[1]).toMatchObject({
      provider: "deepseek",
      status: "ok",
      jsonParsed: true,
      parsed: {
        provider: "deepseek",
        recommendation: "Use schema per tenant"
      }
    });
  });

  it("marks malformed provider JSON as unparsed without failing the live trace", async () => {
    const malformedProvider: ModelProvider = {
      id: "openai",
      model: "malformed-model",
      async generateDecisionText() {
        return '{"provider":"openai","recommendation":"missing closing brace"';
      }
    };

    const trace = await runLiveDecisionTrace({
      providers: [malformedProvider],
      question: "Should we use shared tables?",
      locale: "en",
      mode: "fast",
      context
    });

    expect(trace[0]).toMatchObject({
      status: "ok",
      text: '{"provider":"openai","recommendation":"missing closing brace"',
      jsonParsed: false,
      parsed: undefined,
      validationStatus: "unparsed",
      failureClass: "json_parse_error"
    });
  });

  it("adds run-level observability and schema validation metadata to trace entries", async () => {
    const validProvider: ModelProvider = {
      id: "openai",
      model: "valid-model",
      async generateDecisionText(request) {
        if (request.phase === "proposal") {
          return JSON.stringify({
            proposalId: "shared-table",
            recommendation: "Use shared tables.",
            criteriaScores: {
              scalability: 80,
              reliability: 80,
              security: 80,
              costEfficiency: 80,
              implementationComplexity: 80,
              maintainability: 80,
              migrationFlexibility: 80,
              teamFit: 80,
              timeToMarket: 80,
              reversibility: 80
            },
            regretByScenario: { strictSecurity: 30 },
            confidence: 0.82
          });
        }

        return JSON.stringify({
          rankedProposalIds: ["shared-table"],
          confidence: 0.75
        });
      }
    };

    const trace = await runLiveDecisionTrace({
      providers: [validProvider],
      question: "Should we use shared tables?",
      locale: "en",
      mode: "fast",
      context
    });

    expect(new Set(trace.map((entry) => entry.runId)).size).toBe(1);
    expect(trace[0]).toMatchObject({
      attempt: 1,
      validationStatus: "valid",
      validationIssues: [],
      normalized: expect.objectContaining({
        proposalId: "shared-table"
      })
    });
    expect(trace[1]).toMatchObject({
      phase: "ranking",
      validationStatus: "valid",
      failureClass: undefined
    });
  });

  it("keeps the trace usable when a provider fails", async () => {
    const failingProvider: ModelProvider = {
      id: "openai",
      model: "broken-model",
      async generateDecisionText() {
        throw new Error("provider unavailable");
      }
    };

    const trace = await runLiveDecisionTrace({
      providers: [failingProvider, fakeProvider("deepseek", []), fakeProvider("gemini", [])],
      question: "Should we use shared tables?",
      locale: "en",
      context
    });

    expect(trace).toHaveLength(15);
    expect(trace.find((entry) => entry.provider === "openai" && entry.phase === "proposal")).toMatchObject({
      status: "error",
      error: "provider unavailable",
      jsonParsed: false,
      failureClass: "provider_error",
      validationStatus: "unparsed"
    });
    expect(trace.find((entry) => entry.provider === "deepseek" && entry.phase === "proposal")).toMatchObject({
      status: "ok"
    });
  });

  it("retries transient provider failures when retry policy allows it", async () => {
    let calls = 0;
    const flakyProvider: ModelProvider = {
      id: "openai",
      model: "flaky-model",
      async generateDecisionText(request) {
        calls += 1;

        if (calls === 1) {
          throw new Error("temporary upstream timeout");
        }

        if (request.phase === "ranking") {
          return JSON.stringify({ rankedProposalIds: ["shared-table"], confidence: 0.8 });
        }

        if (request.phase === "verdict") {
          return JSON.stringify({
            selectedProposalId: "shared-table",
            finalRecommendation: "Recovered and selected shared tables.",
            whyItWon: ["Retry recovered a transient provider error."],
            remainingDissent: []
          });
        }

        return JSON.stringify({
          proposalId: "shared-table",
          recommendation: `Recovered during ${request.phase}.`,
          criteriaScores: {
            scalability: 80,
            reliability: 80,
            security: 80,
            costEfficiency: 80,
            implementationComplexity: 80,
            maintainability: 80,
            migrationFlexibility: 80,
            teamFit: 80,
            timeToMarket: 80,
            reversibility: 80
          },
          regretByScenario: { strictSecurity: 30 },
          confidence: 0.8
        });
      }
    };

    const trace = await runLiveDecisionTrace({
      providers: [flakyProvider],
      question: "Should we use shared tables?",
      locale: "en",
      mode: "fast",
      context,
      retryPolicy: { maxAttempts: 2 }
    });

    expect(calls).toBe(4);
    expect(trace[0]).toMatchObject({
      status: "ok",
      attempt: 2,
      maxAttempts: 2,
      retryCount: 1,
      failureClass: undefined,
      attempts: [
        expect.objectContaining({
          attempt: 1,
          status: "error",
          failureClass: "provider_error"
        }),
        expect.objectContaining({
          attempt: 2,
          status: "ok",
          validationStatus: "valid"
        })
      ]
    });
  });

  it("derives live agent names from configured model names", async () => {
    const requests: ProviderRequest[] = [];
    const trace = await runLiveDecisionTrace({
      providers: [
        fakeProvider("openai", requests, "gpt-5.5"),
        fakeProvider("deepseek", requests, "deepseek-v4-pro"),
        fakeProvider("anthropic", requests, "claude-sonnet-4-6")
      ],
      question: "Should we use shared tables?",
      locale: "en",
      mode: "fast",
      maxPhases: 1,
      context
    });

    expect(trace.map((entry) => entry.agentName)).toEqual([
      "GPT 5.5 Product Architect",
      "DeepSeek V4 Pro Cost/Risk Critic",
      "Claude Sonnet 4.6 Safety Reviewer"
    ]);
    expect(requests.map((request) => request.agentName)).toEqual([
      "GPT 5.5 Product Architect",
      "DeepSeek V4 Pro Cost/Risk Critic",
      "Claude Sonnet 4.6 Safety Reviewer"
    ]);
    expect(trace[2]).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      agentRole: "sre_reviewer"
    });
    expect(requests[2]).toMatchObject({
      scoringFocus: ["safety", "reliability", "migration flexibility"]
    });
  });

  it("uses configured model names for unknown provider families instead of stale fallback labels", async () => {
    const requests: ProviderRequest[] = [];
    const trace = await runLiveDecisionTrace({
      providers: [fakeProvider("openrouter", requests, "qwen3-max")],
      question: "Should we use shared tables?",
      locale: "en",
      mode: "fast",
      maxPhases: 1,
      context
    });

    expect(trace[0]).toMatchObject({
      provider: "openrouter",
      model: "qwen3-max",
      agentName: "Qwen3 Max Architecture Reviewer",
      agentRole: "principal_architect"
    });
    expect(requests[0]).toMatchObject({
      agentName: "Qwen3 Max Architecture Reviewer",
      scoringFocus: ["architecture coherence", "risk exposure", "team feasibility"]
    });
  });

  it("strips marketplace namespaces from model display names", async () => {
    const requests: ProviderRequest[] = [];
    const trace = await runLiveDecisionTrace({
      providers: [fakeProvider("openrouter", requests, "anthropic/claude-sonnet-4-6")],
      question: "Should we use shared tables?",
      locale: "en",
      mode: "fast",
      maxPhases: 1,
      context
    });

    expect(trace[0]).toMatchObject({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-6",
      agentName: "Claude Sonnet 4.6 Safety Reviewer",
      agentRole: "sre_reviewer"
    });
    expect(requests[0]).toMatchObject({
      agentName: "Claude Sonnet 4.6 Safety Reviewer"
    });
  });

  it("records standardized failures, ordered events, and bounded output refs", async () => {
    const longProvider: ModelProvider = {
      id: "openai",
      model: "long-output-model",
      async generateDecisionText() {
        return `not-json ${"x".repeat(3000)}`;
      }
    };

    const trace = await runLiveDecisionTrace({
      providers: [longProvider],
      question: "Should we use shared tables?",
      locale: "en",
      mode: "fast",
      maxPhases: 1,
      context
    });

    expect(trace[0]).toMatchObject({
      failureClass: "json_parse_error",
      failure: expect.objectContaining({
        category: "json_parse_error",
        retryability: "repairable"
      }),
      outputRef: expect.objectContaining({
        label: "openai:proposal:raw_output",
        truncated: true,
        originalChars: expect.any(Number),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    });
    expect(trace[0].text.length).toBeLessThan(1300);
    expect(trace[0].events?.map((event) => event.type)).toEqual([
      "provider_attempt_start",
      "provider_attempt_failure"
    ]);
    expect(trace[0].events?.map((event) => event.seq)).toEqual([2, 3]);
  });

  it("returns a detailed run-level event stream and summary when requested", async () => {
    const validProvider: ModelProvider = {
      id: "openai",
      model: "valid-detailed-model",
      async generateDecisionText() {
        return JSON.stringify({
          proposalId: "shared-table",
          recommendation: "Use shared tables.",
          criteriaScores: {
            scalability: 80,
            reliability: 80,
            security: 80,
            costEfficiency: 80,
            implementationComplexity: 80,
            maintainability: 80,
            migrationFlexibility: 80,
            teamFit: 80,
            timeToMarket: 80,
            reversibility: 80
          },
          confidence: 0.8
        });
      }
    };
    const detailed = await runLiveDecisionTraceDetailed({
      providers: [validProvider],
      question: "Should we use shared tables?",
      locale: "en",
      mode: "fast",
      maxPhases: 1,
      context
    });

    expect(detailed.trace).toHaveLength(1);
    expect(detailed.events.map((event) => event.type)).toEqual([
      "run_start",
      "provider_attempt_start",
      "provider_attempt_success",
      "run_complete"
    ]);
    expect(detailed.summary).toMatchObject({
      providerCount: 1,
      entryCount: 1,
      failureCount: 0,
      retryCount: 0
    });
  });
});
