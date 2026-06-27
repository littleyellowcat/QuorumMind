// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { DecisionContext } from "../../src/lib/domain";
import { createManualProviderBundle } from "../../src/lib/manual-provider";
import { runDecisionRoom } from "../../src/lib/workflow";
import { createSqliteDecisionRepository } from "./sqlite-repository";

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

function databasePath(name: string): string {
  return join(mkdtempSync(join(tmpdir(), "quorummind-sqlite-")), name);
}

describe("sqlite decision repository", () => {
  it("persists decision room summaries and full snapshots", () => {
    const repository = createSqliteDecisionRepository({ databasePath: databasePath("rooms.db") });
    const result = runDecisionRoom({
      question: "Should we use shared tables or schema-per-tenant?",
      mode: "fast",
      context
    });
    const promptBundle = createManualProviderBundle({
      question: "Should we use shared tables or schema-per-tenant?",
      locale: "en",
      context
    });

    repository.saveDecisionRoom({
      id: "room-1",
      question: "Should we use shared tables or schema-per-tenant?",
      locale: "en",
      mode: "fast",
      providerMode: "demo",
      selectedProposalId: result.verdict.selectedProposalId,
      recommendation: result.verdict.finalRecommendation,
      quorumScore: result.verdict.quorumScore,
      dissentIndex: result.verdict.dissentIndex,
      providerTrace: [],
      liveVerdict: null,
      promptBundle,
      result,
      createdAt: "2026-06-15T00:00:00.000Z"
    });

    expect(repository.listDecisionRooms()).toEqual([
      {
        id: "room-1",
        question: "Should we use shared tables or schema-per-tenant?",
        locale: "en",
        mode: "fast",
        providerMode: "demo",
        selectedProposalId: result.verdict.selectedProposalId,
        recommendation: result.verdict.finalRecommendation,
        quorumScore: result.verdict.quorumScore,
        dissentIndex: result.verdict.dissentIndex,
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:00.000Z"
      }
    ]);
    expect(repository.findDecisionRoom("room-1")?.result.roomId).toBe(result.roomId);
    expect(repository.findDecisionRoom("missing")).toBeUndefined();

    repository.close();
  });

  it("persists reputation feedback with newest-first lookup", () => {
    const repository = createSqliteDecisionRepository({ databasePath: databasePath("feedback.db") });

    repository.saveReputationFeedback(
      [
        {
          agentId: "gpt",
          domain: "technical_architecture",
          outcome: "helpful",
          confidence: 1,
          createdAt: "2026-06-15T00:00:00.000Z"
        },
        {
          agentId: "deepseek",
          domain: "technical_architecture",
          outcome: "unhelpful",
          confidence: 0.5,
          createdAt: "2026-06-15T00:01:00.000Z"
        }
      ]
    );

    expect(repository.listReputationFeedback()).toEqual([
      {
        agentId: "deepseek",
        domain: "technical_architecture",
        outcome: "unhelpful",
        confidence: 0.5,
        createdAt: "2026-06-15T00:01:00.000Z"
      },
      {
        agentId: "gpt",
        domain: "technical_architecture",
        outcome: "helpful",
        confidence: 1,
        createdAt: "2026-06-15T00:00:00.000Z"
      }
    ]);

    repository.close();
  });
});
