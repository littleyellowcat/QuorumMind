import type { ContextSourceLedger } from "../lib/api-client";
import { CollapsibleSidePanel } from "./PanelTitle";

type Locale = "en" | "zh";

export function SourceLedgerPanel({ locale, ledger }: { locale: Locale; ledger?: ContextSourceLedger }) {
  const copy = sourceLedgerCopy[locale];

  return (
    <CollapsibleSidePanel title={copy.title} kicker={ledger ? String(ledger.sources.length) : "0"}>
      {!ledger ? (
        <p className="field-help">{copy.empty}</p>
      ) : (
        <div className="source-ledger-panel">
          <div className="source-ledger-grid">
            <article>
              <span>{copy.provider}</span>
              <strong>{ledger.providerEvidence.attempted ? copy.providerParticipated : copy.providerSkipped}</strong>
              <small>
                {copy.usable} {ledger.providerEvidence.usableCalls} · {copy.failed} {ledger.providerEvidence.failedCalls}
              </small>
            </article>
            <article>
              <span>{copy.fallback}</span>
              <strong>{ledger.fallback.used ? copy.fallbackUsed : copy.fallbackNotUsed}</strong>
              <small>{ledger.fallback.reason}</small>
            </article>
            <article>
              <span>{copy.hash}</span>
              <strong>{ledger.contextHash.slice(0, 12)}</strong>
              <small>{copy.hashDetail}</small>
            </article>
          </div>
          <p className="field-help">
            {copy.evidence}:{" "}
            <span>
              {copy.reputation} {ledger.sourceCounts.reputation_feedback} · {copy.providerCount}{" "}
              {ledger.sourceCounts.provider_trace} · {copy.context} {contextEvidenceCount(ledger)}
            </span>
          </p>
          <div className="source-ledger-list">
            {ledger.sources.map((source) => (
              <article key={source.id}>
                <span>{sourceTypeLabel(source.sourceType, locale)}</span>
                <strong>{source.label}</strong>
                <small>{source.summary}</small>
              </article>
            ))}
          </div>
        </div>
      )}
    </CollapsibleSidePanel>
  );
}

function contextEvidenceCount(ledger: ContextSourceLedger): number {
  return ledger.sourceCounts.user_input + ledger.sourceCounts.structured_context + ledger.sourceCounts.knowledge_injection;
}

function sourceTypeLabel(value: ContextSourceLedger["sources"][number]["sourceType"], locale: Locale): string {
  const labels = {
    en: {
      user_input: "User input",
      structured_context: "Context",
      knowledge_injection: "Knowledge",
      reputation_feedback: "Reputation",
      provider_trace: "Provider trace",
      deterministic_fallback: "Fallback"
    },
    zh: {
      user_input: "用户输入",
      structured_context: "结构化上下文",
      knowledge_injection: "知识注入",
      reputation_feedback: "信誉反馈",
      provider_trace: "模型轨迹",
      deterministic_fallback: "兜底状态"
    }
  };

  return labels[locale][value];
}

const sourceLedgerCopy = {
  en: {
    title: "Source ledger",
    empty: "Run a Decision or Blueprint to see source provenance.",
    provider: "Provider",
    providerParticipated: "Live providers participated",
    providerSkipped: "No live provider participation",
    usable: "usable",
    failed: "failed",
    fallback: "Fallback",
    fallbackUsed: "Deterministic fallback used",
    fallbackNotUsed: "No deterministic fallback",
    hash: "Context hash",
    hashDetail: "stable run context",
    evidence: "Evidence",
    reputation: "reputation",
    providerCount: "provider",
    context: "context"
  },
  zh: {
    title: "来源账本",
    empty: "运行决策或蓝图后会显示来源证据。",
    provider: "Provider",
    providerParticipated: "真实 provider 已参与",
    providerSkipped: "真实 provider 未参与",
    usable: "可用",
    failed: "失败",
    fallback: "兜底",
    fallbackUsed: "使用了确定性兜底",
    fallbackNotUsed: "未使用确定性兜底",
    hash: "Context hash",
    hashDetail: "稳定运行上下文",
    evidence: "证据",
    reputation: "信誉",
    providerCount: "provider",
    context: "context"
  }
};
