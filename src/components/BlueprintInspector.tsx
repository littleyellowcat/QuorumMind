import type { AutonomousBlueprintRun } from "../lib/api-client";
import type { BlueprintRoomResult } from "../lib/blueprint";
import type { DecisionHistoryRecord } from "../lib/decision-history";
import type { BlueprintSnapshot, Locale } from "../types/app";
import { appCopy } from "../i18n/view-copy";
import { MetricCard } from "./Metric";
import { CollapsibleSidePanel, PanelHeading } from "./PanelTitle";
import { AgentRunMiniMap, BlueprintHistoryComparison, BlueprintModelCalls, PromptInspector, SideEmpty, traceStats } from "./WorkbenchShared";
import { SourceLedgerPanel } from "./SourceLedgerPanel";

export function BlueprintInspector(props: {
  locale: Locale;
  result: BlueprintRoomResult | null;
  snapshot: BlueprintSnapshot | null;
  agentRun: AutonomousBlueprintRun | null;
  records: DecisionHistoryRecord[];
  currentQuestion: string;
}) {
  const { locale, result, snapshot, agentRun, records, currentQuestion } = props;
  const t = appCopy[locale];

  if (!result) {
    return <SideEmpty locale={locale} />;
  }

  return (
    <>
      <section className="score-panel">
        <PanelHeading title={t.blueprintTitle} />
        <div className="score-stack">
          <MetricCard label={t.consensus} value={result.finalConsensusScore} suffix="%" max={100} help={locale === "zh" ? "最终蓝图是否达到 80% 共识阈值。" : "Whether the final Blueprint reached the 80% consensus threshold."} />
          <MetricCard label={t.schemaUsable} value={traceStats(snapshot?.providerTrace ?? []).schemaUsable} max={Math.max(1, traceStats(snapshot?.providerTrace ?? []).calls)} help={locale === "zh" ? "真实模型返回中通过 schema 或修复后可用的数量。" : "Live outputs that were schema-valid or repaired into valid shape."} />
        </div>
      </section>

      <CollapsibleSidePanel title={t.blueprintModelCalls} kicker="Trace" defaultOpen>
        <BlueprintModelCalls locale={locale} trace={snapshot?.providerTrace ?? []} execution={snapshot?.blueprintExecution} />
      </CollapsibleSidePanel>

      {agentRun && (
        <CollapsibleSidePanel title={t.agentPlatformRun} kicker="LangGraph" defaultOpen>
          <AgentRunMiniMap locale={locale} run={agentRun} />
        </CollapsibleSidePanel>
      )}

      <SourceLedgerPanel locale={locale} ledger={snapshot?.contextLedger} />

      <CollapsibleSidePanel title={t.blueprintHistoryComparison} kicker="Compare">
        <BlueprintHistoryComparison locale={locale} current={result} records={records} currentQuestion={currentQuestion} />
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={t.targetOutputs} kicker={String(result.finalSpec.targetOutputs.length)}>
        <ul className="compact-list">
          {result.finalSpec.targetOutputs.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={t.successCriteria} kicker={String(result.finalSpec.successCriteria.length)}>
        <ul className="compact-list">
          {result.finalSpec.successCriteria.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={locale === "zh" ? "风险与开放问题" : "Risks and open questions"} kicker="Review">
        <div className="blueprint-panel-grid">
          <section className="blueprint-list-panel risk">
            <PanelHeading title={locale === "zh" ? "风险" : "Risks"} />
            <ul className="compact-list">
              {result.finalSpec.risks.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </section>
          <section className="blueprint-list-panel">
            <PanelHeading title={locale === "zh" ? "开放问题" : "Open questions"} />
            <ul className="compact-list">
              {result.finalSpec.openQuestions.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      </CollapsibleSidePanel>

      <PromptInspector locale={locale} promptBundle={snapshot?.promptBundle} />
    </>
  );
}
