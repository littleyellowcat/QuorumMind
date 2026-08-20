import type { Proposal } from "../lib/domain";
import type { DecisionApiResponse } from "../lib/api-client";
import type { DecisionRoomResult, DecisionSnapshot, Locale, ProviderTraceEntry } from "../types/app";
import { appCopy } from "../i18n/view-copy";
import { PanelHeading } from "./PanelTitle";
import { AgentCard, ProposalRow, SourceQualityBanner, WinnerExplanation, formatProposalId, localizeText } from "./WorkbenchShared";

export function DecisionResultView(props: {
  locale: Locale;
  question: string;
  result: DecisionRoomResult;
  snapshot: DecisionSnapshot | null;
  onExport: (kind: "adr" | "json" | "report" | "simplePdf") => void;
  onCopyPrompt: () => void;
  onFeedback: (outcome: "helpful" | "neutral" | "unhelpful") => void;
  feedbackNotice: string | null;
}) {
  const { locale, question, result, snapshot, onExport, onCopyPrompt, onFeedback, feedbackNotice } = props;
  const t = appCopy[locale];
  const verdict = snapshot?.liveVerdict ?? result.verdict;
  const ranked = snapshot?.liveVerdict?.rankedProposals.length
    ? snapshot.liveVerdict.rankedProposals
    : result.verdict.rankedProposals;
  const winningProposal = result.revisedProposals.find((proposal) => proposal.id === verdict.selectedProposalId);
  const verdictExplanation = decisionVerdictExplanation({
    locale,
    question,
    winningProposal,
    liveVerdict: snapshot?.liveVerdict,
    trace: snapshot?.providerTrace ?? []
  });

  return (
    <>
      <article className="panel-block verdict-panel">
        <div className="panel-heading-row">
          <PanelHeading
            title={t.finalVerdict}
            kicker={snapshot?.providerMode === "live" ? t.liveSource : t.demoSource}
            help={
              locale === "zh"
                ? "最终裁决会优先展示可用的真实模型聚合结果；如果没有可用 trace，则展示确定性裁决。"
                : "The final verdict prefers valid live aggregation, then falls back to deterministic scoring."
            }
          />
          <span className="state-pill">{formatProposalId(verdict.selectedProposalId, locale)}</span>
        </div>
        <h2>{localizeText(verdict.finalRecommendation, locale)}</h2>
        <p>{verdictExplanation}</p>
        <SourceQualityBanner locale={locale} providerMode={snapshot?.providerMode ?? "demo"} trace={snapshot?.providerTrace ?? []} liveVerdict={snapshot?.liveVerdict} />
        <div className="action-row">
          <button onClick={() => onExport("adr")}>{t.exportAdr}</button>
          <button onClick={() => onExport("json")}>{t.exportJson}</button>
          <button onClick={() => onExport("report")}>{t.exportReport}</button>
          <button onClick={() => onExport("simplePdf")}>{t.exportSimplePdf}</button>
          <button onClick={onCopyPrompt}>{t.copyPrompt}</button>
        </div>
        <div className="feedback-panel">
          <strong>{locale === "zh" ? "模型表现反馈" : "Model quality feedback"}</strong>
          <p>
            {locale === "zh"
              ? "这些反馈只用于下次运行的轻量权重校准，不会伪造真实模型能力。"
              : "Feedback only calibrates lightweight future weights; it does not fabricate live model capability."}
          </p>
          <div className="feedback-actions">
            <button onClick={() => onFeedback("helpful")}>{t.feedbackHelpful}</button>
            <button onClick={() => onFeedback("neutral")}>{t.feedbackNeutral}</button>
            <button onClick={() => onFeedback("unhelpful")}>{t.feedbackUnhelpful}</button>
          </div>
          {feedbackNotice && <p className="runtime-notice">{feedbackNotice}</p>}
        </div>
      </article>

      <article className="panel-block">
        <PanelHeading title={t.agentCouncil} kicker={String(result.agents.length)} />
        <div className="agent-grid">
          {result.agents.map((agent) => (
            <AgentCard key={agent.id} locale={locale} agent={agent} />
          ))}
        </div>
      </article>

      <article className="panel-block">
        <PanelHeading title={t.tradeoffRanking} kicker={t.scoreTransparency} />
        <div className="matrix-list">
          {ranked.map((proposal, index) => (
            <ProposalRow
              key={proposal.proposalId}
              locale={locale}
              proposal={proposal}
              rank={index + 1}
              criteriaScores={result.revisedProposals.find((item) => item.id === proposal.proposalId)?.criteriaScores}
            />
          ))}
        </div>
      </article>

      <article className="panel-block live-verdict-panel">
        <PanelHeading title={t.scoreTransparency} kicker={locale === "zh" ? "排序分 + 效用 + 后悔值" : "Borda + Utility + Regret"} />
        <WinnerExplanation locale={locale} result={result} ranked={ranked} liveVerdict={snapshot?.liveVerdict} />
      </article>
    </>
  );
}

function decisionVerdictExplanation({
  locale,
  question,
  winningProposal,
  liveVerdict,
  trace
}: {
  locale: Locale;
  question: string;
  winningProposal?: Proposal;
  liveVerdict?: DecisionApiResponse["liveVerdict"];
  trace: ProviderTraceEntry[];
}): string {
  if (winningProposal) {
    return localizeText(winningProposal.reasoning, locale);
  }

  const selectedProposalId = liveVerdict?.selectedProposalId;
  const traceRecommendation = selectedProposalId ? recommendationFromTrace(trace, selectedProposalId) : undefined;

  if (traceRecommendation) {
    return traceRecommendation;
  }

  if (liveVerdict?.whyItWon?.length) {
    return liveVerdict.whyItWon.join(" ");
  }

  return locale === "zh"
    ? `本次 live 裁决选择了外部模型方案，但没有返回可匹配的方案解释。原问题：${question}`
    : `This live verdict selected an external model proposal, but no matching rationale was returned. Original question: ${question}`;
}

function recommendationFromTrace(trace: ProviderTraceEntry[], selectedProposalId: string): string | undefined {
  const candidate = trace.find((entry) => {
    if (entry.phase !== "revision" && entry.phase !== "proposal") {
      return false;
    }

    const payload = tracePayload(entry);
    return appRecordString(payload, "proposalId") === selectedProposalId || appRecordString(payload, "id") === selectedProposalId;
  });

  return candidate ? appRecordString(tracePayload(candidate), "recommendation") : undefined;
}

function tracePayload(entry: ProviderTraceEntry): unknown {
  return entry.normalized ?? entry.parsed;
}

function appRecordString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}
