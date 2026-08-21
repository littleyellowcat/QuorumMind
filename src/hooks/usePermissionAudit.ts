import { useCallback, useEffect, useState } from "react";
import {
  getPermissionAudit,
  getPermissionLifecycle,
  replyPermissionApproval,
  revokePermissionApproval,
  type AgentRunApprovalReplyRequest,
  type PermissionAuditReport,
  type PermissionLifecycleReport
} from "../lib/api-client";

export function usePermissionAudit() {
  const [audit, setAudit] = useState<PermissionAuditReport | null>(null);
  const [lifecycle, setLifecycle] = useState<PermissionLifecycleReport | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshPermissionAudit = useCallback(async () => {
    setLoading(true);
    try {
      const [nextAudit, nextLifecycle] = await Promise.all([
        getPermissionAudit(),
        getPermissionLifecycle()
      ]);
      setAudit(nextAudit);
      setLifecycle(nextLifecycle);
    } catch {
      setAudit(null);
      setLifecycle(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const replyToPermissionApproval = useCallback(async (
    approvalId: string,
    reply: AgentRunApprovalReplyRequest["reply"]
  ) => {
    await replyPermissionApproval(approvalId, { reply });
    await refreshPermissionAudit();
  }, [refreshPermissionAudit]);

  const revokeSavedPermissionApproval = useCallback(async (approvalId: string) => {
    await revokePermissionApproval(approvalId);
    await refreshPermissionAudit();
  }, [refreshPermissionAudit]);

  useEffect(() => {
    void refreshPermissionAudit();
  }, [refreshPermissionAudit]);

  return {
    audit,
    lifecycle,
    loading,
    refreshPermissionAudit,
    replyToPermissionApproval,
    revokeSavedPermissionApproval
  };
}
