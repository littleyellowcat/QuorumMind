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
    expect(markdown).toContain("## Risks");
    expect(markdown).toContain("## Rollback Plan");
    expect(markdown).toContain("2026-09-12");
  });
});
