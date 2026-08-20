import type { Agent, CriteriaScores, ScoredProposal, Verdict } from "../../../lib/domain";
import type { DecisionApiResponse } from "../../../lib/api-client";
import { PanelHeading } from "../../PanelTitle";
import { appCopy, criteriaLabels, roleLabels } from "../../../i18n/view-copy";
import type { DecisionReviewLoopState, DecisionRoomResult, Locale } from "../../../types/app";
import { clampNumber, formatProposalId, localizeText } from "../../../lib/view-utils";

export function AgentCard({ locale, agent }: { locale: Locale; agent: Agent }) {
  return (
    <article className="agent-card">
      <span className="agent-avatar">{agent.name.slice(0, 2).toUpperCase()}</span>
      <div>
        <strong>{roleLabels[locale][agent.role]}</strong>
        <small>
          {agent.provider.toUpperCase()} · w{agent.weight}
        </small>
      </div>
    </article>
  );
}

export function ProposalRow({
  locale,
  proposal,
  rank,
  criteriaScores
}: {
  locale: Locale;
  proposal: ScoredProposal;
  rank: number;
  criteriaScores?: CriteriaScores;
}) {
  return (
    <article className="matrix-row">
      <div className="matrix-rank">
        <span>#{rank}</span>
        <strong>{proposal.quorumScore}</strong>
      </div>
      <div className="matrix-body">
        <header>
          <h3>{formatProposalId(proposal.proposalId, locale)}</h3>
          <span>{Math.round(proposal.confidence * 100)}%</span>
        </header>
        <div className="score-bar">
          <i style={{ width: `${clampNumber(proposal.quorumScore, 0, 100)}%` }} />
        </div>
        {criteriaScores && (
          <div className="criteria-grid">
            {Object.entries(criteriaScores).slice(0, 8).map(([key, value]) => (
              <div key={key}>
                <span>{criteriaLabels[locale][key as keyof CriteriaScores]}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function WinnerExplanation({
  locale,
  result,
  ranked,
  liveVerdict
}: {
  locale: Locale;
  result: DecisionRoomResult;
  ranked: ScoredProposal[];
  liveVerdict?: DecisionApiResponse["liveVerdict"];
}) {
  const winner = ranked[0];
  const proposal = result.revisedProposals.find((item) => item.id === winner?.proposalId);
  const liveReasons = !proposal && liveVerdict?.whyItWon?.length ? liveVerdict.whyItWon : [];

  if (!winner) return null;

  return (
    <div className="winner-explanation">
      <div className="winner-explanation-header">
        <div>
          <span>{locale === "zh" ? "为什么赢" : "Why it won"}</span>
          <h3>{formatProposalId(winner.proposalId, locale)}</h3>
        </div>
        <strong>{winner.quorumScore}/100</strong>
      </div>
      <p className="score-formula">
        {locale === "zh"
          ? "裁决综合分 = 排序分 + 加权效用 + 置信度 - 后悔惩罚。"
          : "Decision Score = Borda ranking + weighted utility + confidence - regret penalty."}
      </p>
      <div className="score-breakdown-grid">
        <BreakdownCard label={locale === "zh" ? "排序分" : "Borda"} value={winner.bordaScore} />
        <BreakdownCard label={locale === "zh" ? "效用" : "Utility"} value={winner.weightedUtility} />
        <BreakdownCard label={locale === "zh" ? "置信度" : "Confidence"} value={Math.round(winner.confidence * 100)} />
        <BreakdownCard label={locale === "zh" ? "后悔惩罚" : "Regret"} value={-winner.regretPenalty} negative />
      </div>
      {proposal ? (
        <ul className="compact-list">
          {proposal.strengths.slice(0, 3).map((item) => (
            <li key={item}>{localizeText(item, locale)}</li>
          ))}
        </ul>
      ) : liveReasons.length > 0 ? (
        <ul className="compact-list">
          {liveReasons.slice(0, 3).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function BreakdownCard({
  label,
  value,
  negative = false
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className={`score-breakdown-card ${negative ? "negative" : "positive"}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function StabilityPanel({
  locale,
  result,
  verdict
}: {
  locale: Locale;
  result: DecisionRoomResult;
  verdict: Verdict | DecisionApiResponse["liveVerdict"];
}) {
  const stableWinnerRate = result.verdict.ahpAnalysis.stableWinnerRate;
  const dissentIndex = verdict?.dissentIndex ?? result.verdict.dissentIndex;
  const state = stableWinnerRate >= 80 && dissentIndex < 45 ? "stable" : stableWinnerRate >= 60 ? "watch" : "fragile";

  return (
    <section className={`side-panel stability-panel ${state === "stable" ? "" : state}`}>
      <PanelHeading
        title={appCopy[locale].stability}
        help={
          locale === "zh"
            ? "稳定赢家率和分歧指数不是一回事：一个看权重扰动后赢家是否变化，一个看当前席位是否分歧。"
            : "Stable winner rate and dissent index differ: one tests weight perturbations, the other current council disagreement."
        }
      />
      <strong>
        {locale === "zh"
          ? stableWinnerRate >= 80 && dissentIndex >= 50
            ? "赢家在权重扰动下稳定，但当前讨论仍存在高分歧。"
            : stableWinnerRate >= 80
              ? "赢家路径较稳定。"
              : "赢家稳定性需要继续观察。"
          : stableWinnerRate >= 80 && dissentIndex >= 50
            ? "Winner is stable under weight perturbation, but current dissent remains high."
            : stableWinnerRate >= 80
              ? "Winner path is relatively stable."
              : "Winner stability still needs review."}
      </strong>
      <dl className="stability-grid">
        <div>
          <dt>{locale === "zh" ? "赢家稳定率" : "Stable winner rate"}</dt>
          <dd>{stableWinnerRate}%</dd>
        </div>
        <div>
          <dt>{appCopy[locale].dissentIndex}</dt>
          <dd>{dissentIndex}%</dd>
        </div>
      </dl>
      <div className="stability-callouts">
        <p>
          <span>{locale === "zh" ? "解读" : "Reading"}</span>
          {locale === "zh"
            ? "如果稳定率高但分歧也高，表示“最终赢家不容易变”，但不代表裁决综合分已经达到强裁决状态；反对意见仍值得进入风险账本。"
            : "If stability and dissent are both high, the winner is hard to dislodge, but objections still belong in the risk ledger."}
        </p>
      </div>
    </section>
  );
}

export function getDecisionScoreStatus(score: number, dissentIndex: number, locale: Locale): {
  tone: "strong" | "watch" | "fragile";
  label: string;
  detail: string;
} {
  if (score >= 80 && dissentIndex < 50) {
    return {
      tone: "strong",
      label: locale === "zh" ? "强裁决" : "Strong decision",
      detail:
        locale === "zh"
          ? "裁决综合分达到 80 以上，且分歧没有明显过高。仍建议查看风险账本和假设账本。"
          : "Decision Score is at least 80 and dissent is not materially high. Still review risks and assumptions."
    };
  }

  if (score >= 80) {
    return {
      tone: "watch",
      label: locale === "zh" ? "强裁决，但仍有争议" : "Strong score, contested",
      detail:
        locale === "zh"
          ? "裁决综合分达到 80 以上，但分歧指数偏高。操作：先看右侧分歧来源和风险矩阵；如需再压测，点“基于当前结果复审到 80”。"
          : "Decision Score is at least 80, but dissent is high. Next: inspect dissent drivers and risk matrix; use Review current result to 80 for another stress pass."
    };
  }

  if (score >= 70) {
    return {
      tone: "watch",
      label: locale === "zh" ? "可采纳，建议复审" : "Usable, review recommended",
      detail:
        locale === "zh"
          ? "这个分数低于 80 的强裁决参考线；它不是蓝图室共识阈值失败。操作：看右侧分歧来源、风险矩阵、后悔地图；点“基于当前结果复审到 80”做增量复审。"
          : "This is below the 80 strong-decision reference line. It is not a Blueprint consensus-gate failure. Next: inspect dissent, risk, and regret; use Review current result to 80 for incremental review."
    };
  }

  return {
    tone: "fragile",
    label: locale === "zh" ? "低信心，建议补充信息" : "Low confidence, add context",
    detail:
      locale === "zh"
        ? "裁决综合分偏低。操作：先在左侧问题里补充约束、候选方案或评价标准，再点“运行决策室”；如果仍偏低，点“基于当前结果复审到 80”。"
        : "Decision Score is low. Add constraints, options, or criteria in the prompt, then run Decision Room again; if it remains low, use Review current result to 80."
  };
}

export function DecisionReviewLoopPanel({ locale, loop }: { locale: Locale; loop: DecisionReviewLoopState }) {
  const statusLabel =
    locale === "zh"
      ? {
          running: "复审中",
          passed: "已达到阈值",
          needs_review: "仍需复审",
          cancelled: "已取消"
        }[loop.status]
      : {
          running: "Reviewing",
          passed: "Threshold met",
          needs_review: "Needs review",
          cancelled: "Cancelled"
        }[loop.status];

  return (
    <div className={`decision-review-loop ${loop.status}`}>
      <header>
        <div>
          <span>{locale === "zh" ? "深度复审" : "Deep review"}</span>
          <strong>{statusLabel}</strong>
        </div>
        <small>
          {locale === "zh"
            ? `基线 ${loop.baselineScore} / 当前最佳 ${loop.bestScore} / 目标 ${loop.targetScore}`
            : `Baseline ${loop.baselineScore} / best ${loop.bestScore} / target ${loop.targetScore}`}
        </small>
      </header>
      <p>{loop.finalMessage}</p>
      {loop.rounds.length > 0 && (
        <ol>
          {loop.rounds.map((round) => (
            <li className={round.accepted ? "accepted" : "rejected"} key={`${round.round}-${round.score}-${round.selectedProposalId}`}>
              <div>
                <span>
                  {locale === "zh" ? `第 ${round.round} 轮` : `Round ${round.round}`}
                </span>
                <strong>{round.score}</strong>
              </div>
              <small>
                {formatProposalId(round.selectedProposalId, locale)} ·{" "}
                {round.accepted
                  ? locale === "zh"
                    ? "已采用"
                    : "promoted"
                  : locale === "zh"
                    ? "仅记录风险"
                    : "risk evidence only"} ·{" "}
                {round.deltaFromBest >= 0 ? "+" : ""}
                {round.deltaFromBest} ·{" "}
                {locale === "zh" ? "分歧" : "dissent"} {round.dissentIndex}% ·{" "}
                {round.providerMode === "live" && round.traceCalls > 0
                  ? locale === "zh"
                    ? `真实模型 ${round.traceCalls} 次调用`
                    : `${round.traceCalls} live calls`
                  : locale === "zh"
                    ? "确定性兜底"
                    : "deterministic fallback"}
              </small>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ProposalSpreadPanel({ locale, ranked }: { locale: Locale; ranked: ScoredProposal[] }) {
  return (
    <section className="side-panel spread-panel">
      <PanelHeading title={appCopy[locale].spread} />
      <div className="spread-list">
        {ranked.map((proposal, index) => (
          <article key={proposal.proposalId}>
            <header>
              <span>{index + 1}</span>
              <strong>{formatProposalId(proposal.proposalId, locale)}</strong>
              <small>{proposal.quorumScore}</small>
            </header>
            <div className="spread-bar">
              <span style={{ width: `${clampNumber(proposal.quorumScore, 0, 100)}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DissentDriversPanel({
  locale,
  result,
  verdict
}: {
  locale: Locale;
  result: DecisionRoomResult;
  verdict: Verdict | DecisionApiResponse["liveVerdict"];
}) {
  const remaining = verdict && "remainingDissent" in verdict ? verdict.remainingDissent : result.verdict.preMortem.slice(0, 3);
  return (
    <section className="side-panel dissent-panel">
      <PanelHeading title={appCopy[locale].dissentDrivers} />
      <div className="dissent-driver-list">
        {remaining.slice(0, 4).map((item, index) => (
          <article key={`${item}-${index}`}>
            <header>
              <strong>{locale === "zh" ? `分歧 ${index + 1}` : `Dissent ${index + 1}`}</strong>
              <span>{verdict?.dissentIndex ?? result.verdict.dissentIndex}%</span>
            </header>
            <p>{localizeText(item, locale)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
