import { createPermissionApprovalStore, type PermissionApprovalStore } from "./permission-approval-store";
import {
  createPermissionApprovalRecord,
  decideRoleToolPermission,
  type AgentCapabilityRole,
  type ToolPermissionApprovalRecord,
  type ToolPermissionDecision
} from "./tool-governance";

export type ExecuteGovernedToolInput<T> = {
  runId: string;
  role: AgentCapabilityRole;
  toolName: string;
  node: string;
  objective: string;
  locale?: "en" | "zh";
  liveModelPreapproved?: boolean;
  approvalStore?: PermissionApprovalStore;
  execute: () => Promise<T> | T;
};

export type ExecuteGovernedToolResult<T> =
  | {
      status: "executed";
      permission: ToolPermissionDecision;
      output: T;
    }
  | {
      status: "requires_human";
      permission: ToolPermissionDecision;
      approval: ToolPermissionApprovalRecord;
    }
  | {
      status: "blocked";
      permission: ToolPermissionDecision;
    };

export async function executeGovernedTool<T>(
  input: ExecuteGovernedToolInput<T>
): Promise<ExecuteGovernedToolResult<T>> {
  const approvalStore = input.approvalStore ?? createPermissionApprovalStore();
  const permission = decideRoleToolPermission({
    role: input.role,
    toolName: input.toolName,
    node: input.node,
    objective: input.objective,
    locale: input.locale,
    liveModelPreapproved: input.liveModelPreapproved,
    savedApprovals: approvalStore.savedApprovals()
  });

  if (permission.decision === "blocked") {
    return {
      status: "blocked",
      permission
    };
  }

  if (permission.decision === "requires_human") {
    const approval = createPermissionApprovalRecord(permission, {
      runId: input.runId,
      requestedBy: input.role,
      scope: "run"
    });
    approvalStore.add(approval);

    return {
      status: "requires_human",
      permission,
      approval
    };
  }

  return {
    status: "executed",
    permission,
    output: await input.execute()
  };
}
