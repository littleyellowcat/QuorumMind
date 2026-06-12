import { describe, expect, it } from "vitest";
import { runDecisionRoom } from "./workflow";

describe("Decision Room workflow", () => {
  it("runs a complete Deep Quorum architecture decision", () => {
    const result = runDecisionRoom({
      question:
        "Should a B2B SaaS MVP use schema-per-tenant or shared tables with tenant_id in PostgreSQL?",
      mode: "deep",
      context: {
        productStage: "mvp",
        expectedScale: "First six months: 50 tenants and fewer than 10,000 daily active users.",
        teamProfile: "Small full-stack team with strong PostgreSQL experience.",
        budgetSensitivity: "high",
        reliabilityRequirement: "medium",
        securityRequirement: "high",
        existingConstraints: ["Use PostgreSQL", "Ship MVP in eight weeks"],
        candidateOptions: ["Shared tables with tenant_id", "Schema per tenant", "Database per tenant"],
        assumptions: ["No hard regulatory tenant isolation requirement at launch"]
      }
    });

    expect(result.agents.length).toBeGreaterThanOrEqual(3);
    expect(result.initialProposals.length).toBe(result.agents.length);
    expect(result.critiques.length).toBeGreaterThan(result.initialProposals.length);
    expect(result.revisedProposals.length).toBe(result.initialProposals.length);
    expect(result.verdict.quorumScore).toBeGreaterThan(0);
    expect(result.verdict.dissentIndex).toBeGreaterThanOrEqual(0);
    expect(result.verdict.adrMarkdown).toContain("# ADR:");
    expect(result.verdict.adrMarkdown).toContain("## Rollback Plan");
  });
});
