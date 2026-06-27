import type { ReactNode } from "react";
import { HelpTooltip } from "./PanelTitle";

export function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  suffix,
  max = 100,
  help
}: {
  label: string;
  value: number;
  suffix?: string;
  max?: number;
  help?: ReactNode;
}) {
  const width = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className="metric-card">
      <div className="metric-label-row">
        <span>{label}</span>
        {typeof help === "string" ? <HelpTooltip label={label}>{help}</HelpTooltip> : help}
      </div>
      <strong>
        {value}
        {suffix && <small>{suffix}</small>}
      </strong>
      <div className="metric-bar">
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
