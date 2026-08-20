import type { BlueprintExecutionSummary, DecisionApiResponse } from "../../../lib/api-client";
import { appCopy } from "../../../i18n/view-copy";
import type { Locale, ProviderTraceEntry } from "../../../types/app";
import { traceStats } from "../../../lib/view-utils";

export function SourceQualityBanner({
  locale,
  providerMode,
  trace,
  liveVerdict,
  blueprintExecution
}: {
  locale: Locale;
  providerMode: "demo" | "live";
  trace: ProviderTraceEntry[];
  liveVerdict?: DecisionApiResponse["liveVerdict"];
  blueprintExecution?: BlueprintExecutionSummary;
}) {
  const stats = traceStats(trace);
  const actualLive =
    providerMode === "live" &&
    (Boolean(liveVerdict) || Boolean(blueprintExecution?.liveTraceUsable) || stats.schemaUsable > 0);
  const className = actualLive ? "live" : providerMode === "live" ? "fallback" : "demo";
  const message = actualLive
    ? appCopy[locale].liveUsed
    : providerMode === "live"
      ? appCopy[locale].liveFallback
      : appCopy[locale].noLiveModel;

  return (
    <div className={`source-quality-banner ${className}`}>
      <strong>{actualLive ? appCopy[locale].liveSource : providerMode === "live" ? appCopy[locale].fallbackSource : appCopy[locale].demoSource}</strong>
      <p>{message}</p>
      <div className={`effective-models-badge ${stats.schemaUsable > 0 ? "good" : providerMode === "live" ? "partial" : "demo"}`}>
        {appCopy[locale].traceCalls}: {stats.calls} · {appCopy[locale].schemaUsable}: {stats.schemaUsable}
      </div>
    </div>
  );
}
