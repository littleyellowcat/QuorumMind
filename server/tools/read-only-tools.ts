import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildRepoReviewEvidence } from "../repo/review-evidence";
import { createPermissionApprovalStore, type PermissionApprovalStore } from "../harness/permission-approval-store";
import { createPermissionApprovalRecord, decideRoleToolPermission } from "../harness/tool-governance";
import { loadQuorumMindConfig, summarizeQuorumMindConfig } from "../config/quorummind-config";

export type ReadOnlyToolInput = {
  diffText?: string;
  repoRoot?: string;
};

export type ExecuteReadOnlyToolInput = {
  rootDir: string;
  runId: string;
  agentId: string;
  toolName: string;
  input: ReadOnlyToolInput;
  approvalStore?: PermissionApprovalStore;
};

export type ReadOnlyToolExecutionResult =
  | {
      status: "executed";
      permission: ReturnType<typeof decideRoleToolPermission>;
      output: Record<string, unknown>;
    }
  | {
      status: "blocked";
      permission: ReturnType<typeof decideRoleToolPermission>;
    }
  | {
      status: "requires_human";
      permission: ReturnType<typeof decideRoleToolPermission>;
      approval: ReturnType<typeof createPermissionApprovalRecord>;
    };

export function listConfiguredToolManifests(rootDir: string): Array<{
  name: string;
  kind: "mcp_server" | "custom_tool";
  description: string;
  envKeys?: string[];
}> {
  const config = loadQuorumMindConfig(rootDir);
  const summary = summarizeQuorumMindConfig(config);

  return [
    ...summary.mcpServers.map((server) => ({
      name: `mcp:${server.name}`,
      kind: "mcp_server" as const,
      description: `Configured MCP server command: ${server.command}`,
      envKeys: server.configuredEnvKeys
    })),
    ...summary.customTools.map((tool) => ({
      name: tool.name,
      kind: "custom_tool" as const,
      description: tool.description
    }))
  ];
}

export async function executeReadOnlyTool(input: ExecuteReadOnlyToolInput): Promise<ReadOnlyToolExecutionResult> {
  const config = loadQuorumMindConfig(input.rootDir);
  const approvalStore = input.approvalStore ?? createPermissionApprovalStore({ rootDir: input.rootDir });
  const agentTools = config.agents[input.agentId]?.tools ?? [];
  const allowed = agentTools.includes(input.toolName);

  const permission = decideRoleToolPermission({
    role: "executor_agent",
    toolName: input.toolName,
    node: "read_only_tool",
    objective: "summarize supplied repository evidence",
    savedApprovals: approvalStore.savedApprovals()
  });

  if (!allowed) {
    return {
      status: "blocked",
      permission: {
        ...permission,
        decision: "blocked",
        reason: `Tool ${input.toolName} is not enabled for agent ${input.agentId}.`
      }
    };
  }

  if (permission.decision === "requires_human") {
    const approval = createPermissionApprovalRecord(permission, {
      runId: input.runId,
      requestedBy: "executor_agent"
    });
    approvalStore.add(approval);
    return {
      status: "requires_human",
      permission,
      approval
    };
  }

  const evidence = buildRepoReviewEvidence({
    repoRoot: input.input.repoRoot ?? input.rootDir,
    diffText: input.input.diffText
  });

  return {
    status: "executed",
    permission,
    output: {
      toolName: input.toolName,
      ...evidence
    }
  };
}
