import type { StoredPermissionApprovalRecord } from "./permission-approval-store";

export type PermissionApprovalLifecycleSummary = {
  generatedAt: string;
  summary: {
    total: number;
    pending: number;
    approved: number;
    denied: number;
    revoked: number;
    expired: number;
  };
  byTool: Array<{
    toolName: string;
    pending: number;
    approved: number;
    denied: number;
    revoked: number;
    expired: number;
  }>;
  byProvider: Array<{
    providerId: string;
    pending: number;
    approved: number;
    denied: number;
    revoked: number;
    expired: number;
  }>;
};

export function summarizePermissionApprovalLifecycle(
  records: StoredPermissionApprovalRecord[],
  generatedAt = new Date().toISOString()
): PermissionApprovalLifecycleSummary {
  const summary = {
    total: records.length,
    pending: records.filter((record) => record.status === "pending").length,
    approved: records.filter((record) => record.status === "approved").length,
    denied: records.filter((record) => record.status === "denied").length,
    revoked: records.filter((record) => Boolean(record.revokedAt)).length,
    expired: records.filter((record) => isExpired(record, generatedAt)).length
  };

  return {
    generatedAt,
    summary,
    byTool: groupLifecycle(records, generatedAt, (record) => record.toolName).map(([toolName, counts]) => ({ toolName, ...counts })),
    byProvider: groupLifecycle(records, generatedAt, providerIdForRecord).map(([providerId, counts]) => ({ providerId, ...counts }))
  };
}

function groupLifecycle(
  records: StoredPermissionApprovalRecord[],
  generatedAt: string,
  keyForRecord: (record: StoredPermissionApprovalRecord) => string
): Array<[string, Omit<PermissionApprovalLifecycleSummary["byTool"][number], "toolName">]> {
  const groups = new Map<string, StoredPermissionApprovalRecord[]>();

  for (const record of records) {
    const key = keyForRecord(record);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  return [...groups.entries()].map(([key, items]) => [
    key,
    {
      pending: items.filter((record) => record.status === "pending").length,
      approved: items.filter((record) => record.status === "approved").length,
      denied: items.filter((record) => record.status === "denied").length,
      revoked: items.filter((record) => Boolean(record.revokedAt)).length,
      expired: items.filter((record) => isExpired(record, generatedAt)).length
    }
  ]);
}

function providerIdForRecord(record: StoredPermissionApprovalRecord): string {
  const text = `${record.toolName} ${record.node}`.toLowerCase();
  const known = ["openrouter", "anthropic", "openai", "deepseek", "gemini", "ollama", "lmstudio", "model_gateway"];
  return known.find((provider) => text.includes(provider)) ?? "unknown";
}

function isExpired(record: StoredPermissionApprovalRecord, now = new Date().toISOString()): boolean {
  return Boolean(record.expiresAt && record.expiresAt <= now);
}
