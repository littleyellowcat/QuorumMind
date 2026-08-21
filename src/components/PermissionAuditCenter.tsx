import type { PermissionAuditReport, PermissionLifecycleReport } from "../lib/api-client";
import type { Locale } from "../types/app";
import { permissionCategoryLabel, permissionDecisionLabel, riskLabel } from "../lib/view-utils";

export function PermissionAuditCenter({
  locale,
  audit,
  lifecycle,
  loading,
  onCopyPackage,
  onReply,
  onRevoke
}: {
  locale: Locale;
  audit: PermissionAuditReport | null;
  lifecycle?: PermissionLifecycleReport | null;
  loading: boolean;
  onCopyPackage: () => void;
  onReply?: (approvalId: string, reply: "approve" | "reject" | "always") => void;
  onRevoke?: (approvalId: string) => void;
}) {
  const copy = permissionAuditCopy[locale];
  const topItems = audit?.items.slice(0, 4) ?? [];
  const topLifecycleTools = lifecycle?.byTool.slice(0, 3) ?? [];

  return (
    <section className="context-panel permission-audit-center">
      <header>
        <div>
          <span>{copy.kicker}</span>
          <strong>{copy.title}</strong>
        </div>
        <button className="secondary-action" disabled={!audit || loading} onClick={onCopyPackage}>
          {copy.copyPackage}
        </button>
      </header>
      <p className="field-help">{copy.help}</p>
      <div className="permission-audit-stats" aria-label={copy.statsLabel}>
        <span>{audit ? `${audit.summary.allowed} ${copy.allowed}` : "-"}</span>
        <span>{audit ? `${audit.summary.humanGated} ${copy.humanGated}` : "-"}</span>
        <span>{audit ? `${audit.summary.blocked} ${copy.blocked}` : "-"}</span>
        <span>{lifecycle ? `${lifecycle.summary.revoked} ${copy.revoked}` : "-"}</span>
        <span>{lifecycle ? `${lifecycle.summary.expired} ${copy.expired}` : "-"}</span>
      </div>
      {topLifecycleTools.length > 0 ? (
        <div className="permission-audit-stats" aria-label={copy.lifecycleLabel}>
          {topLifecycleTools.map((tool) => (
            <span key={tool.toolName}>
              {tool.toolName} · {tool.approved} {copy.approvedShort} · {tool.revoked} {copy.revoked}
            </span>
          ))}
        </div>
      ) : null}
      {topItems.length > 0 ? (
        <div className="permission-audit-list">
          {topItems.map((item) => (
            <article className={`permission-audit-item ${item.outcome}`} key={item.id}>
              <span>
                {permissionDecisionLabel(item.decision, locale)} · {permissionCategoryLabel(item.category, locale)} ·{" "}
                {riskLabel(item.risk, locale)}
              </span>
              <strong>{item.toolName}</strong>
              <small>
                {item.node} · {item.runId}
                {item.scope ? ` · ${item.scope} ${copy.scope}` : ""}
              </small>
              <p>{item.whyAllowedOrDenied}</p>
              <small>{item.outputHandling.redacted || item.outputHandling.truncated ? copy.redacted : copy.fullOutput}</small>
              {item.outcome === "human_gated" && item.status === "pending" && onReply ? (
                <div className="permission-reply-actions">
                  <button className="secondary-action" onClick={() => onReply(item.id, "approve")}>
                    {copy.approve}
                  </button>
                  <button className="secondary-action" onClick={() => onReply(item.id, "always")}>
                    {copy.always}
                  </button>
                  <button className="secondary-action danger-action" onClick={() => onReply(item.id, "reject")}>
                    {copy.reject}
                  </button>
                </div>
              ) : null}
              {item.scope === "tool" && item.status === "approved" && !item.revokedAt && onRevoke ? (
                <div className="permission-reply-actions">
                  <button className="secondary-action danger-action" onClick={() => onRevoke(item.id)}>
                    {copy.revoke}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="field-help">{loading ? copy.loading : copy.empty}</p>
      )}
    </section>
  );
}

const permissionAuditCopy = {
  en: {
    kicker: "Trust layer",
    title: "Permission audit center",
    help: "Read-only visibility into why tool calls were allowed, human-gated, blocked, redacted, or truncated.",
    statsLabel: "Permission audit stats",
    allowed: "allowed",
    humanGated: "needs human",
    blocked: "blocked",
    revoked: "revoked",
    expired: "expired",
    approvedShort: "approved",
    scope: "scope",
    lifecycleLabel: "Permission lifecycle by tool",
    copyPackage: "Copy approval package",
    approve: "Approve",
    always: "Always allow",
    reject: "Reject",
    revoke: "Revoke",
    redacted: "Output redacted or truncation-prone",
    fullOutput: "No output truncation flagged",
    loading: "Loading permission audit...",
    empty: "No tool permission records yet."
  },
  zh: {
    kicker: "信任层",
    title: "权限审计中心",
    help: "只读展示每次工具调用为什么允许、需人工确认、被阻止、被脱敏或可能被截断。",
    statsLabel: "权限审计统计",
    allowed: "已允许",
    humanGated: "需人工",
    blocked: "已阻止",
    revoked: "已撤销",
    expired: "已过期",
    approvedShort: "已批准",
    scope: "范围",
    lifecycleLabel: "按工具统计的权限生命周期",
    copyPackage: "复制审批包",
    approve: "批准",
    always: "始终允许",
    reject: "拒绝",
    revoke: "撤销",
    redacted: "输出已脱敏或可能截断",
    fullOutput: "未标记输出截断",
    loading: "正在加载权限审计...",
    empty: "暂无工具权限记录。"
  }
};
