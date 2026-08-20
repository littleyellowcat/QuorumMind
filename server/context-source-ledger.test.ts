// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildContextSourceLedger } from "./context-source-ledger";
import type { DecisionContext } from "../src/lib/domain";

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

describe("buildContextSourceLedger", () => {
  it("records source provenance, fallback state, and a stable hash for a run", () => {
    const ledger = buildContextSourceLedger({
      question: "Should we use shared tables or schema-per-tenant?",
      context,
      knowledgeInjection: "Use tenant-boundary testing guidance.",
      reputationFeedback: [
        {
          agentId: "gpt",
          domain: "technical_architecture",
          outcome: "helpful",
          confidence: 1,
          createdAt: "2026-08-20T00:00:00.000Z"
        }
      ],
      providerTrace: [
        {
          id: "trace-1",
          provider: "openai",
          model: "gpt-test",
          phase: "proposal",
          status: "ok",
          text: "live proposal",
          durationMs: 42,
          jsonParsed: true,
          validationStatus: "valid"
        }
      ],
      fallbackReason: "none"
    });

    expect(ledger).toMatchObject({
      schemaVersion: 1,
      sourceCounts: {
        user_input: 1,
        structured_context: 1,
        knowledge_injection: 1,
        reputation_feedback: 1,
        provider_trace: 1,
        deterministic_fallback: 1
      },
      providerEvidence: {
        attempted: true,
        usableCalls: 1,
        failedCalls: 0
      },
      fallback: {
        used: false,
        reason: "none"
      }
    });
    expect(ledger.sources.map((source) => source.sourceType)).toEqual([
      "user_input",
      "structured_context",
      "knowledge_injection",
      "reputation_feedback",
      "provider_trace",
      "deterministic_fallback"
    ]);
    expect(ledger.contextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildContextSourceLedger({
      question: "Should we use shared tables or schema-per-tenant?",
      context,
      knowledgeInjection: "Use tenant-boundary testing guidance.",
      reputationFeedback: [
        {
          agentId: "gpt",
          domain: "technical_architecture",
          outcome: "helpful",
          confidence: 1,
          createdAt: "2026-08-20T00:00:00.000Z"
        }
      ],
      providerTrace: [
        {
          id: "trace-1",
          provider: "openai",
          model: "gpt-test",
          phase: "proposal",
          status: "ok",
          text: "live proposal",
          durationMs: 42,
          jsonParsed: true,
          validationStatus: "valid"
        }
      ],
      fallbackReason: "none"
    }).contextHash).toBe(ledger.contextHash);
  });
});
