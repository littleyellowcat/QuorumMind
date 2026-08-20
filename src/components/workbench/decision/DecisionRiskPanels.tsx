import type { AssumptionLedgerEntry, Risk, Verdict } from "../../../lib/domain";
import { PanelHeading } from "../../PanelTitle";
import { appCopy, riskCategoryLabels, severityLabels } from "../../../i18n/view-copy";
import type { Locale } from "../../../types/app";
import { anonymityLabel, formatProposalId, localizeText, statusValueLabel } from "../../../lib/view-utils";

export function RiskMatrixPanel({ locale, risks }: { locale: Locale; risks: Risk[] }) {
  const counts = {
    high: risks.filter((risk) => risk.severity === "high").length,
    medium: risks.filter((risk) => risk.severity === "medium").length,
    low: risks.filter((risk) => risk.severity === "low").length
  };

  return (
    <section className="side-panel risk-matrix-panel">
      <PanelHeading title={appCopy[locale].riskMatrix} />
      <div className="risk-matrix-grid">
        {Object.entries(counts).map(([severity, count]) => (
          <div className="risk-matrix-row" key={severity}>
            <span>{severityLabels[locale][severity as Risk["severity"]]}</span>
            <strong>{count}</strong>
            <small className={severity}>{severityLabels[locale][severity as Risk["severity"]]}</small>
            <small>{locale === "zh" ? "发生概率" : "Likelihood"}</small>
            <small>{locale === "zh" ? "影响" : "Impact"}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RiskList({ locale, risks }: { locale: Locale; risks: Risk[] }) {
  return (
    <ul className="risk-list">
      {risks.map((risk, index) => (
        <li key={`${risk.category}-${risk.description}-${index}`}>
          <span className={`severity ${risk.severity}`}>{severityLabels[locale][risk.severity]}</span>
          <strong>{riskCategoryLabels[locale][risk.category]}</strong>
          <p>{localizeText(risk.description, locale)}</p>
          <small>{localizeText(risk.mitigation, locale)}</small>
        </li>
      ))}
    </ul>
  );
}

export function AssumptionLedger({ locale, assumptions }: { locale: Locale; assumptions: AssumptionLedgerEntry[] }) {
  const priority = assumptions
    .map((item) => ({ ...item, score: item.riskLevel === "high" ? 100 : item.riskLevel === "medium" ? 66 : 33 }))
    .sort((a, b) => b.score - a.score);
  return (
    <>
      <div className="assumption-priority-chart">
        <header>
          <strong>{locale === "zh" ? "假设验证优先级" : "Assumption validation priority"}</strong>
          <span>{locale === "zh" ? "优先处理高风险、影响范围大的假设。" : "Validate high-risk assumptions first."}</span>
        </header>
        {priority.map((item) => (
          <div className="assumption-priority-row" key={item.id}>
            <span>{severityLabels[locale][item.riskLevel]}</span>
            <div>
              <i style={{ width: `${item.score}%` }} />
            </div>
            <strong>{item.score}</strong>
          </div>
        ))}
      </div>
      <div className="assumption-list">
        {assumptions.map((item) => (
          <article className="assumption-card" key={item.id}>
            <header>
              <span className={`severity ${item.riskLevel}`}>{severityLabels[locale][item.riskLevel]}</span>
              <strong>{localizeText(item.assumption, locale)}</strong>
            </header>
            <dl>
              <div>
                <dt>{locale === "zh" ? "验证问题" : "Question"}</dt>
                <dd>{localizeText(item.validationQuestion, locale)}</dd>
              </div>
              <div>
                <dt>{locale === "zh" ? "验证动作" : "Action"}</dt>
                <dd>{localizeText(item.validationAction, locale)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

export function RegretMap({ locale, verdict }: { locale: Locale; verdict: Verdict }) {
  return (
    <div className="regret-map-list">
      {verdict.regretMap.slice(0, 5).map((entry) => (
        <article className="regret-card" key={entry.proposalId}>
          <header>
            <span>#{entry.minimaxRank}</span>
            <strong>{formatProposalId(entry.proposalId, locale)}</strong>
          </header>
          <dl>
            <div>
              <dt>{locale === "zh" ? "最坏场景" : "Worst scenario"}</dt>
              <dd>{localizeText(entry.worstScenario, locale)}</dd>
            </div>
            <div>
              <dt>{locale === "zh" ? "最坏后悔值" : "Worst regret"}</dt>
              <dd>{entry.worstRegret}</dd>
            </div>
            <div>
              <dt>{locale === "zh" ? "平均后悔值" : "Average regret"}</dt>
              <dd>{entry.averageRegret}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

export function DelphiRounds({ locale, verdict }: { locale: Locale; verdict: Verdict }) {
  return (
    <ol className="delphi-round-list">
      {verdict.delphiRounds.map((round) => (
        <li key={round.phase}>
          <header>
            <span>{statusValueLabel(round.status, locale)}</span>
            <strong>{localizeText(round.title, locale)}</strong>
          </header>
          <p>{localizeText(round.summary, locale)}</p>
          <dl>
            <div>
              <dt>{locale === "zh" ? "匿名性" : "Anonymity"}</dt>
              <dd>{anonymityLabel(round.anonymity, locale)}</dd>
            </div>
            <div>
              <dt>{locale === "zh" ? "输入" : "Inputs"}</dt>
              <dd>{round.inputCount}</dd>
            </div>
            <div>
              <dt>{locale === "zh" ? "输出" : "Outputs"}</dt>
              <dd>{round.outputCount}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}
