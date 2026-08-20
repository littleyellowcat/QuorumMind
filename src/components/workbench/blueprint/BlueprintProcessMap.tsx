import type { BlueprintRoomResult } from "../../../lib/blueprint";
import { PanelHeading } from "../../PanelTitle";
import { appCopy } from "../../../i18n/view-copy";
import type { Locale, ProviderTraceEntry } from "../../../types/app";
import { adoptionLabel } from "../../../lib/view-utils";

export function BlueprintProcessMap({ locale, result, trace }: { locale: Locale; result: BlueprintRoomResult; trace: ProviderTraceEntry[] }) {
  const finalRound = result.consensusRounds.at(-1);
  const positions = finalRound?.agentPositions ?? [];
  const traceByProvider = trace.reduce<Record<string, number>>((acc, entry) => {
    const key = entry.agentName ?? entry.provider;
    acc[key] = (acc[key] ?? 0) + (entry.status === "ok" ? 1 : 0);
    return acc;
  }, {});
  const maxProviderCalls = Math.max(1, ...Object.values(traceByProvider));

  return (
    <article className="panel-block blueprint-process-panel">
      <PanelHeading
        title={appCopy[locale].blueprintProcess}
        help={
          locale === "zh"
            ? "这里把共识变化、模型观点差异、贡献来源和质询采纳可视化出来，避免多模型互评变成黑盒。"
            : "Visualizes consensus change, model differences, contribution sources, and critique adoption."
        }
      />
      <div className="blueprint-process-grid">
        <section className="blueprint-process-card">
          <header>
            <strong>{locale === "zh" ? "共识曲线" : "Consensus trend"}</strong>
            <span>{result.consensusThreshold}%</span>
          </header>
          <div
            className="blueprint-trend-chart"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, result.consensusRounds.length)}, minmax(36px, 1fr))` }}
          >
            {result.consensusRounds.map((round) => (
              <div key={round.round}>
                <span style={{ height: `${Math.max(8, round.consensusScore)}%` }} />
                <small>R{round.round}</small>
              </div>
            ))}
            <i style={{ bottom: `${result.consensusThreshold}%` }} />
          </div>
        </section>
        <section className="blueprint-process-card">
          <header>
            <strong>{locale === "zh" ? "模型观点差异" : "Model differences"}</strong>
            <span>{positions.length}</span>
          </header>
          <div className="blueprint-difference-list">
            {positions.slice(0, 5).map((position) => (
              <article key={position.agentId}>
                <div>
                  <strong>{position.agentId}</strong>
                  <small>{position.stance}</small>
                </div>
                <em>{position.confidence}%</em>
              </article>
            ))}
          </div>
        </section>
        <section className="blueprint-process-card">
          <header>
            <strong>{locale === "zh" ? "贡献来源" : "Contribution sources"}</strong>
            <span>{Object.keys(traceByProvider).length}</span>
          </header>
          <div className="blueprint-contribution-bars">
            {Object.entries(traceByProvider).slice(0, 5).map(([provider, count]) => (
              <div key={provider}>
                <span>{provider}</span>
                <div>
                  <i style={{ width: `${(count / maxProviderCalls) * 100}%` }} />
                </div>
                <strong>{count}</strong>
              </div>
            ))}
            {Object.keys(traceByProvider).length === 0 && (
              <div>
                <span>{appCopy[locale].demoSource}</span>
                <div>
                  <i style={{ width: "100%" }} />
                </div>
                <strong>1</strong>
              </div>
            )}
          </div>
        </section>
        <section className="blueprint-process-card">
          <header>
            <strong>{locale === "zh" ? "质询采纳" : "Critique adoption"}</strong>
            <span>{result.finalSpec.adoptionLedger.length}</span>
          </header>
          <div className="blueprint-adoption-flow">
            {["adopted", "partial", "deferred"].map((status) => {
              const count = result.finalSpec.adoptionLedger.filter((item) => item.adoptionStatus === status).length;
              const width = (count / Math.max(1, result.finalSpec.adoptionLedger.length)) * 100;
              return (
                <div className={status} key={status}>
                  <span>{adoptionLabel(status, locale)}</span>
                  <strong>{count}</strong>
                  <i style={{ width: `${width}%` }} />
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </article>
  );
}
