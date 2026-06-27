import type { DecisionRoomResult } from "../src/lib/workflow";
import { writeDecisionSummary } from "./knowledge-store";
import { resolveDataDir } from "./knowledge-index";
import { rebuildIndex } from "./knowledge-index";
import { inferDecisionDomain } from "../src/lib/model-reputation";

export type DecisionSummary = {
  date: string;
  question: string;
  verdict: string;
  quorumScore: number;
  domain: string;
  locale: string;
  body: string;
};

export function summarizeDecision(
  result: DecisionRoomResult,
  question: string,
  locale: string
): DecisionSummary {
  const verdict = result.verdict;
  const winner = verdict.rankedProposals[0];
  const selectedProposal = result.revisedProposals.find(
    (p) => p.id === verdict.selectedProposalId
  );

  const body = [
    `# Decision: ${verdict.finalRecommendation.split(".")[0]}`,
    "",
    "## Choice",
    verdict.finalRecommendation,
    "",
    "## Key Trade-offs",
    ...verdict.rankedProposals.slice(0, 3).map(
      (p) => `- ${p.proposalId}: Quorum ${p.quorumScore}`
    ),
    "",
    "## Unresolved Disagreements",
    ...(verdict.preMortem?.slice(0, 3).map((p) => `- ${p}`) ?? [
      "- No significant disagreements",
    ]),
    "",
    "## Assumption Ledger",
    ...verdict.assumptionLedger.map(
      (a) => `- [${a.riskLevel.toUpperCase()}] ${a.assumption}`
    ),
  ].join("\n");

  return {
    date: new Date().toISOString(),
    question,
    verdict: selectedProposal?.id ?? "unknown",
    quorumScore: winner?.quorumScore ?? 0,
    domain: inferDecisionDomain(question, result.context),
    locale,
    body,
  };
}

export function persistDecisionSummary(
  result: DecisionRoomResult,
  question: string,
  locale: string
): string {
  const summary = summarizeDecision(result, question, locale);
  const dir = resolveDataDir();
  const path = writeDecisionSummary(summary, dir);
  rebuildIndex(dir);
  return path;
}
