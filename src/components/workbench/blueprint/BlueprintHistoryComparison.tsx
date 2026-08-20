import type { BlueprintRoomResult } from "../../../lib/blueprint";
import type { DecisionHistoryRecord } from "../../../lib/decision-history";
import type { Locale } from "../../../types/app";
import { normalizeText } from "../../../lib/view-utils";

export function BlueprintHistoryComparison({
  locale,
  current,
  records,
  currentQuestion
}: {
  locale: Locale;
  current: BlueprintRoomResult;
  records: DecisionHistoryRecord[];
  currentQuestion: string;
}) {
  const previous = records.find(
    (record) =>
      record.kind === "blueprint" &&
      record.blueprintResult &&
      record.blueprintResult.roomId !== current.roomId &&
      normalizeText(record.question) === normalizeText(currentQuestion)
  );
  const comparison = previous?.blueprintResult;

  if (!comparison) {
    return <p className="field-help">{locale === "zh" ? "同一问题再次运行后，这里会显示真实模型与确定性结果，或本次与上次结果的差异。" : "Run the same question again to compare live vs deterministic or current vs previous output."}</p>;
  }

  const currentRisks = new Set(current.finalSpec.risks);
  const previousRisks = new Set(comparison.finalSpec.risks);
  const addedRisks = [...currentRisks].filter((risk) => !previousRisks.has(risk));

  return (
    <div className="blueprint-comparison-grid">
      <article>
        <span>{locale === "zh" ? "上次共识" : "Previous consensus"}</span>
        <strong>{comparison.finalConsensusScore}%</strong>
      </article>
      <article>
        <span>{locale === "zh" ? "本次共识" : "Current consensus"}</span>
        <strong>{current.finalConsensusScore}%</strong>
      </article>
      <article>
        <span>{locale === "zh" ? "变化" : "Delta"}</span>
        <strong>{current.finalConsensusScore - comparison.finalConsensusScore}</strong>
      </article>
      <section>
        <span>{locale === "zh" ? "新增风险/建议变化" : "Changed risks/suggestions"}</span>
        <small>{addedRisks.slice(0, 5).join(" / ") || (locale === "zh" ? "未发现明显新增风险" : "No obvious new risks")}</small>
      </section>
    </div>
  );
}
