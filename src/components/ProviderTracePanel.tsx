import type { DecisionApiResponse } from "../lib/api-client";
import { CollapsibleSidePanel } from "./PanelTitle";

type Locale = "en" | "zh";
type ProviderTraceEntry = DecisionApiResponse["providerTrace"][number];

export function ProviderTracePanel({
  locale,
  trace,
  title,
  emptyLabel,
  phaseLabels,
  validationLabel
}: {
  locale: Locale;
  trace: ProviderTraceEntry[];
  title: string;
  emptyLabel: string;
  phaseLabels: Record<string, string>;
  validationLabel: (status: string, locale: Locale) => string;
}) {
  const groups = groupTraceByPhase(trace);

  return (
    <CollapsibleSidePanel title={title} kicker={String(trace.length)}>
      {trace.length === 0 ? (
        <p className="field-help">{emptyLabel}</p>
      ) : (
        <div className="trace-phase-list">
          {Object.entries(groups).map(([phase, entries]) => (
            <details className="trace-phase-group" key={phase} open={phase === "proposal"}>
              <summary>
                <span>{phaseLabels[phase] ?? phase}</span>
                <small>
                  {entries.length} {locale === "zh" ? "次调用" : "calls"}
                </small>
              </summary>
              <div className="trace-list">
                {entries.map((entry) => (
                  <TraceCard key={entry.id} locale={locale} entry={entry} validationLabel={validationLabel} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </CollapsibleSidePanel>
  );
}

function TraceCard({
  locale,
  entry,
  validationLabel
}: {
  locale: Locale;
  entry: ProviderTraceEntry;
  validationLabel: (status: string, locale: Locale) => string;
}) {
  return (
    <article className={`trace-card ${entry.status === "error" ? "error" : ""}`}>
      <header>
        <span>{entry.provider}</span>
        <strong>{entry.agentName ?? entry.model}</strong>
        <small>
          {entry.model} · {entry.durationMs}ms · JSON {entry.jsonParsed ? (locale === "zh" ? "是" : "yes") : locale === "zh" ? "否" : "no"}
        </small>
      </header>
      <span className="trace-diagnostic">
        {validationLabel(entry.validationStatus ?? (entry.jsonParsed ? "parsed" : "unparsed"), locale)}
        {entry.retryCount ? ` · ${locale === "zh" ? "重试" : "retry"} ${entry.retryCount}` : ""}
      </span>
      <p>{entry.error ?? entry.text}</p>
      <details className="trace-raw">
        <summary>{locale === "zh" ? "查看原始输出" : "View raw output"}</summary>
        <pre>{JSON.stringify(entry.normalized ?? entry.parsed ?? entry.text, null, 2)}</pre>
      </details>
    </article>
  );
}

function groupTraceByPhase(trace: ProviderTraceEntry[]): Record<string, ProviderTraceEntry[]> {
  return trace.reduce<Record<string, ProviderTraceEntry[]>>((acc, entry) => {
    acc[entry.phase] = [...(acc[entry.phase] ?? []), entry];
    return acc;
  }, {});
}
