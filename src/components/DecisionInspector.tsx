import type { ManualProviderBundle } from "../lib/manual-provider";
import type { DecisionReviewLoopState, DecisionRoomResult, DecisionSnapshot, Locale } from "../types/app";
import { appCopy, phaseLabels } from "../i18n/view-copy";
import { MetricCard } from "./Metric";
import { CollapsibleSidePanel, PanelHeading } from "./PanelTitle";
import { ProviderTracePanel } from "./ProviderTracePanel";
import { SourceLedgerPanel } from "./SourceLedgerPanel";
import { AssumptionLedger, DecisionReviewLoopPanel, DelphiRounds, DissentDriversPanel, PromptInspector, ProposalSpreadPanel, RegretMap, RiskList, RiskMatrixPanel, SideEmpty, StabilityPanel, getDecisionScoreStatus, localizeText, traceValidationLabel } from "./WorkbenchShared";

export function DecisionInspector(props: {
  locale: Locale;
  result: DecisionRoomResult | null;
  snapshot: DecisionSnapshot | null;
  promptBundle?: ManualProviderBundle;
  reviewLoop: DecisionReviewLoopState | null;
  running: boolean;
  onDeepReview: () => void;
}) {
  const { locale, result, snapshot, promptBundle, reviewLoop, running, onDeepReview } = props;
  const t = appCopy[locale];

  if (!result) {
    return <SideEmpty locale={locale} />;
  }

  const verdict = snapshot?.liveVerdict ?? result.verdict;
  const ranked = snapshot?.liveVerdict?.rankedProposals.length
    ? snapshot.liveVerdict.rankedProposals
    : result.verdict.rankedProposals;
  const scoreStatus = getDecisionScoreStatus(verdict.quorumScore, verdict.dissentIndex, locale);

  return (
    <>
      <section className="score-panel">
        <PanelHeading
          title={t.scoreTransparency}
          help={
            locale === "zh"
              ? "裁决综合分来自排序、效用、置信度和后悔值等结构化指标，不是静态写死，也不是蓝图室的 80% 共识阈值。"
              : "Decision Score is derived from ranking, utility, confidence, and regret metrics; it is not static and is not the Blueprint 80% consensus gate."
          }
        />
        <div className="score-stack">
          <MetricCard label={t.quorumScore} value={verdict.quorumScore} max={100} help={locale === "zh" ? "这是赢家方案的综合裁决评分。80 以上可视为强裁决参考线；70-79 表示可采纳但建议复审。" : "This is the winning option's aggregate decision score. 80+ is a strong-decision reference line; 70-79 is review-ready but should be checked."} />
          <MetricCard label={t.dissentIndex} value={verdict.dissentIndex} suffix="%" max={100} help={locale === "zh" ? "越高表示模型/智能体之间仍有明显分歧。" : "Higher means the council still disagrees materially."} />
        </div>
        <div className={`decision-score-status ${scoreStatus.tone}`}>
          <strong>{scoreStatus.label}</strong>
          <span>{scoreStatus.detail}</span>
          {scoreStatus.tone !== "strong" && (
            <button className="decision-score-action" disabled={running} onClick={onDeepReview}>
              {locale === "zh" ? "基于当前结果复审到 80" : "Review current result to 80"}
            </button>
          )}
        </div>
        {reviewLoop && <DecisionReviewLoopPanel locale={locale} loop={reviewLoop} />}
      </section>

      <StabilityPanel locale={locale} result={result} verdict={verdict} />
      <ProposalSpreadPanel locale={locale} ranked={ranked} />
      <DissentDriversPanel locale={locale} result={result} verdict={verdict} />
      <RiskMatrixPanel locale={locale} risks={result.verdict.riskRadar} />

      <CollapsibleSidePanel title={t.riskRadar} kicker={locale === "zh" ? "风险" : "Risk"} defaultOpen>
        <RiskList locale={locale} risks={result.verdict.riskRadar} />
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={t.preMortem} kicker={locale === "zh" ? "失败模式" : "Failure modes"}>
        <ol className="risk-list numbered">
          {result.verdict.preMortem.map((item) => (
            <li key={item}>{localizeText(item, locale)}</li>
          ))}
        </ol>
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={t.assumptionLedger} kicker={locale === "zh" ? "验证" : "Validation"}>
        <AssumptionLedger locale={locale} assumptions={result.verdict.assumptionLedger} />
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={t.regretMap} kicker={locale === "zh" ? "低后悔值" : "Low regret"}>
        <RegretMap locale={locale} verdict={result.verdict} />
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={t.delphi} kicker={locale === "zh" ? "轮次" : "Rounds"}>
        <DelphiRounds locale={locale} verdict={result.verdict} />
      </CollapsibleSidePanel>

      <SourceLedgerPanel locale={locale} ledger={snapshot?.contextLedger} />
      <ProviderTracePanel
        locale={locale}
        trace={snapshot?.providerTrace ?? []}
        title={t.modelTrace}
        emptyLabel={t.noLiveModel}
        phaseLabels={phaseLabels[locale]}
        validationLabel={traceValidationLabel}
      />
      <PromptInspector locale={locale} promptBundle={promptBundle} />
    </>
  );
}
