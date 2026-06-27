import { describe, expect, it } from "vitest";
import type { ADR } from "./domain";
import { generateADR } from "./adr";

describe("ADR generation", () => {
  it("generates complete architecture decision markdown", () => {
    const adr: ADR = {
      title: "Use shared-table tenancy for the SaaS MVP",
      status: "accepted",
      context: "The team is building a B2B SaaS MVP with a small team and moderate isolation needs.",
      decision: "Use PostgreSQL shared tables with tenant_id and row-level access patterns.",
      alternatives: ["Schema-per-tenant PostgreSQL", "Database-per-tenant PostgreSQL"],
      consequences: [
        "Fastest implementation path for the MVP",
        "Requires disciplined tenant filtering in every data access path"
      ],
      delphiRounds: [
        {
          phase: "proposal",
          title: "Proposal Round",
          status: "complete",
          anonymity: "open",
          inputCount: 3,
          outputCount: 3,
          summary: "Agents independently generated proposals."
        },
        {
          phase: "blind_review",
          title: "Blind Review",
          status: "complete",
          anonymity: "blind",
          inputCount: 3,
          outputCount: 6,
          summary: "Proposal authorship was hidden during review."
        }
      ],
      assumptionLedger: [
        {
          id: "shared-assumption-0",
          proposalId: "shared-table-proposal",
          assumption: "No hard regulatory tenant isolation requirement at launch",
          riskLevel: "high",
          validationQuestion: "Can we confirm the launch requirements do not mandate stronger isolation?",
          validationAction: "Review launch requirements with product and legal before implementation."
        }
      ],
      regretMap: [
        {
          proposalId: "shared-table-proposal",
          minimaxRank: 1,
          worstScenario: "strictSecurity",
          worstRegret: 42,
          averageRegret: 18,
          scenarioRegrets: {
            strictSecurity: 42,
            budgetPressure: 12
          }
        }
      ],
      topsisLens: [
        {
          proposalId: "shared-table-proposal",
          topsisRank: 1,
          closenessScore: 88,
          distanceToIdeal: 0.04,
          distanceToAntiIdeal: 0.29
        }
      ],
      monteCarloStress: [
        {
          proposalId: "shared-table-proposal",
          monteCarloRank: 1,
          winRate: 82,
          averageScore: 84,
          downsideP10: 75,
          worstScore: 68
        }
      ],
      ahpAnalysis: {
        priorityWeights: {
          scalability: 0.08,
          reliability: 0.08,
          security: 0.16,
          costEfficiency: 0.14,
          implementationComplexity: 0.1,
          maintainability: 0.08,
          migrationFlexibility: 0.08,
          teamFit: 0.12,
          timeToMarket: 0.12,
          reversibility: 0.04
        },
        consistencyRatio: 0.04,
        consistencyAssessment: "strong",
        stableWinnerRate: 75,
        sensitivityScenarios: [
          {
            scenarioId: "security-first",
            label: "Security-first",
            selectedProposalId: "shared-table-proposal",
            quorumScore: 84,
            changedWinner: false,
            weightDelta: { security: 0.1 }
          }
        ]
      },
      risks: [
        {
          category: "security",
          severity: "high",
          description: "A missing tenant filter can expose cross-tenant data.",
          mitigation: "Centralize tenant-aware repository helpers and test authorization boundaries."
        }
      ],
      rollbackPlan: ["Introduce schema-per-tenant for enterprise tenants if isolation requirements increase."],
      reviewDate: "2026-09-12"
    };

    const markdown = generateADR(adr);

    expect(markdown).toContain("# ADR: Use shared-table tenancy for the SaaS MVP");
    expect(markdown).toContain("**Status:** accepted");
    expect(markdown).toContain("## Context");
    expect(markdown).toContain("## Decision");
    expect(markdown).toContain("## Alternatives Considered");
    expect(markdown).toContain("## Consequences");
    expect(markdown).toContain("## Delphi Consensus Protocol");
    expect(markdown).toContain("Blind Review");
    expect(markdown).toContain("## Assumption Ledger");
    expect(markdown).toContain("Validation question");
    expect(markdown).toContain("## Regret Map");
    expect(markdown).toContain("worst-case regret");
    expect(markdown).toContain("## TOPSIS Decision Lens");
    expect(markdown).toContain("closeness");
    expect(markdown).toContain("## Monte Carlo Stress Lens");
    expect(markdown).toContain("win rate");
    expect(markdown).toContain("## AHP Sensitivity Analysis");
    expect(markdown).toContain("stable winner rate");
    expect(markdown).toContain("## Risks");
    expect(markdown).toContain("## Rollback Plan");
    expect(markdown).toContain("2026-09-12");
  });
});
