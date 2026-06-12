import type { ADR, Risk } from "./domain";

export function generateADR(adr: ADR): string {
  return [
    `# ADR: ${adr.title}`,
    "",
    `**Status:** ${adr.status}`,
    `**Review Date:** ${adr.reviewDate}`,
    "",
    "## Context",
    adr.context,
    "",
    "## Decision",
    adr.decision,
    "",
    "## Alternatives Considered",
    formatList(adr.alternatives),
    "",
    "## Consequences",
    formatList(adr.consequences),
    "",
    "## Risks",
    formatRisks(adr.risks),
    "",
    "## Rollback Plan",
    formatList(adr.rollbackPlan)
  ].join("\n");
}

export function formatList(items: string[]): string {
  if (items.length === 0) {
    return "- None";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function formatRisks(risks: Risk[]): string {
  if (risks.length === 0) {
    return "- No major risks identified.";
  }

  return risks
    .map(
      (risk) =>
        `- **${risk.category} (${risk.severity})**: ${risk.description}\n  - Mitigation: ${risk.mitigation}`
    )
    .join("\n");
}
