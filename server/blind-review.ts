import type { LiveDecisionTraceEntry } from "./live-decision";

export type BlindProposal = {
  blindProposalId: string;
  title?: string;
  recommendation?: string;
  reasoning?: string;
  alternatives?: unknown;
  strengths?: unknown;
  weaknesses?: unknown;
  assumptions?: unknown;
  risks?: unknown;
  criteriaScores?: unknown;
  regretByScenario?: unknown;
  confidence?: unknown;
};

export type BlindReviewPayload = {
  blindReview: true;
  blindProposals: BlindProposal[];
};

const blindLabels = ["Proposal A", "Proposal B", "Proposal C", "Proposal D", "Proposal E"];

export function createBlindReviewPayload(proposals: LiveDecisionTraceEntry[]): BlindReviewPayload {
  return {
    blindReview: true,
    blindProposals: proposals.map((proposal, index) => anonymizeProposal(proposal, blindLabels[index] ?? `Proposal ${index + 1}`))
  };
}

function anonymizeProposal(proposal: LiveDecisionTraceEntry, blindProposalId: string): BlindProposal {
  const parsed = isRecord(proposal.parsed) ? proposal.parsed : {};

  return removeUndefined({
    blindProposalId,
    title: stringValue(parsed.title),
    recommendation: stringValue(parsed.recommendation),
    reasoning: stringValue(parsed.reasoning),
    alternatives: parsed.alternatives,
    strengths: parsed.strengths,
    weaknesses: parsed.weaknesses,
    assumptions: parsed.assumptions,
    risks: parsed.risks,
    criteriaScores: parsed.criteriaScores,
    regretByScenario: parsed.regretByScenario,
    confidence: parsed.confidence
  });
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
