import type { AdrApprovalRecord, PostgresPersistenceContract, TeamAccessDecision, TeamWorkspace } from "../lib/api-client";
import type { Locale } from "../types/app";

export function TeamWorkspaceCenter({
  locale,
  workspace,
  access,
  approvals,
  persistence,
  loading = false,
  onRefresh,
  onApproveAdr,
  onRequestChanges
}: {
  locale: Locale;
  workspace: TeamWorkspace | null;
  access: TeamAccessDecision | null;
  approvals: AdrApprovalRecord[];
  persistence?: PostgresPersistenceContract | { mode: string; configured: boolean } | null;
  loading?: boolean;
  onRefresh?: () => void;
  onApproveAdr: (approvalId: string) => void;
  onRequestChanges: (approvalId: string) => void;
}) {
  const copy = teamCopy[locale];
  const primaryApproval = approvals[0];

  return (
    <section className="context-panel team-workspace-center">
      <header>
        <div>
          <span>{copy.kicker}</span>
          <strong>{copy.title}</strong>
        </div>
        {onRefresh ? (
          <button className="secondary-action" disabled={loading} onClick={onRefresh}>
            {loading ? copy.loading : copy.refresh}
          </button>
        ) : null}
      </header>

      {workspace ? (
        <>
          <div className="team-workspace-summary">
            <article>
              <span>{copy.workspace}</span>
              <strong>{workspace.name}</strong>
              <small>{workspace.id}</small>
            </article>
            <article>
              <span>{copy.persistence}</span>
              <strong>{persistenceLabel(workspace, persistence)}</strong>
              <small>{persistence?.configured ? copy.configured : copy.localFirst}</small>
            </article>
            <article>
              <span>{copy.access}</span>
              <strong>{access ? `${access.userId} · ${access.role ?? copy.none}` : copy.none}</strong>
              <small>{access?.reason ?? copy.noAccess}</small>
            </article>
          </div>

          <div className="team-member-list" aria-label={copy.membersLabel}>
            {workspace.members.map((member) => (
              <span key={member.userId}>
                {member.userId} · {member.role}
              </span>
            ))}
          </div>

          <div className="team-approval-list" aria-label={copy.approvalsLabel}>
            {approvals.length > 0 ? approvals.map((approval) => (
              <article className={`team-approval-item ${approval.status}`} key={approval.id}>
                <span>{approval.adrId}</span>
                <strong>{approval.title}</strong>
                <small>
                  {approval.status} · {copy.required}: {approval.requiredApprovers.join(", ") || copy.none}
                </small>
                {approval.decisions.length > 0 ? (
                  <p>{approval.decisions.map((decision) => `${decision.userId}: ${decision.decision}`).join(" · ")}</p>
                ) : null}
                <div className="permission-reply-actions">
                  <button className="secondary-action" onClick={() => onApproveAdr(approval.id)}>
                    {copy.approve}
                  </button>
                  <button className="secondary-action" onClick={() => onRequestChanges(approval.id)}>
                    {copy.requestChanges}
                  </button>
                </div>
              </article>
            )) : (
              <p className="field-help">{copy.noApprovals}</p>
            )}
          </div>

          {primaryApproval ? (
            <p className="field-help">
              {copy.currentApproval}: {primaryApproval.id}
            </p>
          ) : null}
        </>
      ) : (
        <p className="field-help">{loading ? copy.loading : copy.empty}</p>
      )}
    </section>
  );
}

const teamCopy = {
  en: {
    kicker: "Team",
    title: "Team workspace",
    refresh: "Refresh",
    loading: "Loading...",
    workspace: "Workspace",
    persistence: "Persistence",
    access: "Access",
    membersLabel: "Team members",
    approvalsLabel: "ADR approvals",
    configured: "configured",
    localFirst: "local-first",
    required: "required",
    approve: "Approve ADR",
    requestChanges: "Request changes",
    currentApproval: "Current approval",
    noApprovals: "No ADR approvals yet.",
    noAccess: "No access decision loaded.",
    none: "none",
    empty: "No team workspace loaded yet."
  },
  zh: {
    kicker: "团队",
    title: "团队工作区",
    refresh: "刷新",
    loading: "加载中...",
    workspace: "工作区",
    persistence: "持久化",
    access: "访问",
    membersLabel: "团队成员",
    approvalsLabel: "ADR 审批",
    configured: "已配置",
    localFirst: "本地优先",
    required: "必需审批人",
    approve: "批准 ADR",
    requestChanges: "请求修改",
    currentApproval: "当前审批",
    noApprovals: "暂无 ADR 审批。",
    noAccess: "尚未加载访问判断。",
    none: "无",
    empty: "尚未加载团队工作区。"
  }
};

function persistenceLabel(
  workspace: TeamWorkspace,
  persistence?: PostgresPersistenceContract | { mode: string; configured: boolean } | null
): string {
  if (persistence && "schema" in persistence) {
    return `${persistence.mode} · ${persistence.schema}`;
  }
  return workspace.persistenceMode;
}
