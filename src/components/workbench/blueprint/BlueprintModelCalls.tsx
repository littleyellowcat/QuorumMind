import type { BlueprintExecutionSummary } from "../../../lib/api-client";
import { appCopy, phaseLabels } from "../../../i18n/view-copy";
import type { Locale, ProviderTraceEntry } from "../../../types/app";
import { executionModeLabel, fallbackReasonLabel, statusValueLabel, traceStats, traceValidationLabel } from "../../../lib/view-utils";

export function BlueprintModelCalls({
  locale,
  trace,
  execution
}: {
  locale: Locale;
  trace: ProviderTraceEntry[];
  execution?: BlueprintExecutionSummary;
}) {
  const stats = traceStats(trace);
  return (
    <div className="blueprint-model-call-list">
      <article>
        <header>
          <span>{locale === "zh" ? "执行模式" : "Execution"}</span>
          <strong>{executionModeLabel(execution?.actual ?? "deterministic", locale)}</strong>
        </header>
        <small>
          {locale === "zh" ? "请求" : "requested"} {executionModeLabel(execution?.requested ?? "deterministic", locale)} ·{" "}
          {locale === "zh" ? "调用" : "calls"} {execution?.providerCalls ?? stats.calls} ·{" "}
          {locale === "zh" ? "可用" : "valid"} {execution?.usableCalls ?? stats.schemaUsable}
        </small>
        {execution?.fallbackReason && <small>{fallbackReasonLabel(execution.fallbackReason, locale)}</small>}
      </article>
      {trace.slice(0, 12).map((entry) => (
        <article key={entry.id}>
          <header>
            <span>{phaseLabels[locale][entry.phase] ?? entry.phase}</span>
            <strong>{entry.provider}</strong>
          </header>
          <small>
            {entry.model} · {statusValueLabel(entry.status, locale)} · {entry.durationMs}ms ·{" "}
            {traceValidationLabel(entry.validationStatus ?? "n/a", locale)}
          </small>
        </article>
      ))}
      {trace.length === 0 && <p className="field-help">{appCopy[locale].noLiveModel}</p>}
    </div>
  );
}
