import type { StoredPermissionApprovalRecord } from "./permission-approval-store";

export type PermissionAuditOutcome = "allowed" | "human_gated" | "blocked";

export type PermissionAuditItem = {
  id: string;
  runId: string;
  toolName: string;
  node: string;
  category: StoredPermissionApprovalRecord["category"];
  risk: StoredPermissionApprovalRecord["risk"];
  decision: StoredPermissionApprovalRecord["decision"];
  status: StoredPermissionApprovalRecord["status"];
  scope: StoredPermissionApprovalRecord["scope"];
  outcome: PermissionAuditOutcome;
  requestedBy: StoredPermissionApprovalRecord["requestedBy"];
  createdAt: string;
  approvedAt?: string;
  deniedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  requiresHumanConfirmation: boolean;
  whyAllowedOrDenied: string;
  outputHandling: {
    redacted: boolean;
    truncated: boolean;
    reason: string;
  };
};

export type PermissionAuditReport = {
  generatedAt: string;
  summary: {
    total: number;
    allowed: number;
    humanGated: number;
    blocked: number;
    redactedOrTruncated: number;
  };
  items: PermissionAuditItem[];
  approvalPackage: string;
};

export function createPermissionAuditReport(
  records: StoredPermissionApprovalRecord[],
  generatedAt = new Date().toISOString()
): PermissionAuditReport {
  const items = records
    .map(toAuditItem)
    .sort((a, b) => outcomeSort(a.outcome) - outcomeSort(b.outcome) || b.createdAt.localeCompare(a.createdAt));

  const summary = {
    total: items.length,
    allowed: items.filter((item) => item.outcome === "allowed").length,
    humanGated: items.filter((item) => item.outcome === "human_gated").length,
    blocked: items.filter((item) => item.outcome === "blocked").length,
    redactedOrTruncated: items.filter((item) => item.outputHandling.redacted || item.outputHandling.truncated).length
  };

  return {
    generatedAt,
    summary,
    items,
    approvalPackage: renderApprovalPackage(items, summary)
  };
}

function toAuditItem(record: StoredPermissionApprovalRecord): PermissionAuditItem {
  const outcome = outcomeForRecord(record);
  const requiresHumanConfirmation = outcome === "human_gated";

  return {
    id: record.id,
    runId: record.runId,
    toolName: record.toolName,
    node: record.node,
    category: record.category,
    risk: record.risk,
    decision: record.decision,
    status: record.status,
    scope: record.scope,
    outcome,
    requestedBy: record.requestedBy,
    createdAt: record.createdAt,
    ...(record.approvedAt ? { approvedAt: record.approvedAt } : {}),
    ...(record.deniedAt ? { deniedAt: record.deniedAt } : {}),
    ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
    requiresHumanConfirmation,
    whyAllowedOrDenied: reasonForRecord(record, outcome),
    outputHandling: {
      redacted: true,
      truncated: record.risk !== "low",
      reason:
        record.risk === "low"
          ? "Permission audit stores metadata only and redacts raw tool input/output."
          : "High or medium risk tool output is summarized, redacted, and treated as truncation-prone."
    }
  };
}

function outcomeForRecord(record: StoredPermissionApprovalRecord): PermissionAuditOutcome {
  if (record.decision === "blocked" || record.status === "denied") {
    return "blocked";
  }

  if (record.status === "approved" || record.decision === "auto") {
    return "allowed";
  }

  return "human_gated";
}

function reasonForRecord(record: StoredPermissionApprovalRecord, outcome: PermissionAuditOutcome): string {
  if (outcome === "allowed") {
    return record.status === "approved"
      ? `allowed by recorded approval ${record.id}.`
      : `allowed automatically by permission policy: ${record.reason}`;
  }

  if (outcome === "blocked") {
    return `blocked or denied by permission policy: ${record.reason}`;
  }

  return `requires human confirmation before execution: ${record.reason}`;
}

function renderApprovalPackage(
  items: PermissionAuditItem[],
  summary: PermissionAuditReport["summary"]
): string {
  const gated = items.filter((item) => item.outcome === "human_gated");
  const blocked = items.filter((item) => item.outcome === "blocked");

  return [
    "# QuorumMind Permission Approval Package",
    "",
    `Total: ${summary.total}`,
    `Allowed: ${summary.allowed}`,
    `Needs human confirmation: ${summary.humanGated}`,
    `Blocked: ${summary.blocked}`,
    "",
    "## Human confirmation queue",
    ...(gated.length > 0 ? gated.map(packageLineForItem) : ["No pending human-gated operations."]),
    "",
    "## Blocked or denied",
    ...(blocked.length > 0 ? blocked.map(packageLineForItem) : ["No blocked operations."])
  ].join("\n");
}

function packageLineForItem(item: PermissionAuditItem): string {
  return `- ${item.runId} / ${item.toolName} / ${item.node}: ${item.whyAllowedOrDenied}`;
}

function outcomeSort(outcome: PermissionAuditOutcome): number {
  if (outcome === "allowed") {
    return 0;
  }
  if (outcome === "human_gated") {
    return 1;
  }
  return 2;
}
