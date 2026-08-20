import {
  decideRoleToolPermission,
  type AgentCapabilityRole,
  type ToolPermissionApprovalRecord,
  type ToolPermissionCategory,
  type ToolPermissionRisk
} from "./tool-governance";

export type RegisteredToolDefinition = {
  name: string;
  description: string;
  ownerAgent: AgentCapabilityRole;
  permissionCategory: ToolPermissionCategory;
  risk: ToolPermissionRisk;
  schema: Record<string, unknown>;
};

export type MaterializedTool = RegisteredToolDefinition & {
  decision: "auto";
  reason: string;
};

export type MaterializeToolInput = {
  runId: string;
  role: AgentCapabilityRole;
  locale?: "en" | "zh";
  liveModelPreapproved?: boolean;
  savedApprovals?: ToolPermissionApprovalRecord[];
};

export type ToolRegistry = {
  register(tool: RegisteredToolDefinition): RegisteredToolDefinition;
  list(): RegisteredToolDefinition[];
  materialize(input: MaterializeToolInput): MaterializedTool[];
};

export function createToolRegistry(initialTools: RegisteredToolDefinition[] = []): ToolRegistry {
  const tools = new Map<string, RegisteredToolDefinition>();

  for (const tool of initialTools) {
    tools.set(tool.name, { ...tool });
  }

  function register(tool: RegisteredToolDefinition): RegisteredToolDefinition {
    const stored = { ...tool };
    tools.set(stored.name, stored);
    return stored;
  }

  function list(): RegisteredToolDefinition[] {
    return [...tools.values()].map((tool) => ({ ...tool }));
  }

  function materialize(input: MaterializeToolInput): MaterializedTool[] {
    return list().flatMap((tool) => {
      if (tool.ownerAgent !== input.role) {
        return [];
      }

      const decision = decideRoleToolPermission({
        role: input.role,
        toolName: tool.name,
        objective: tool.description,
        node: tool.ownerAgent,
        locale: input.locale,
        liveModelPreapproved: input.liveModelPreapproved,
        savedApprovals: input.savedApprovals
      });

      if (decision.decision !== "auto") {
        return [];
      }

      return [
        {
          ...tool,
          decision: "auto" as const,
          reason: decision.reason
        }
      ];
    });
  }

  return {
    register,
    list,
    materialize
  };
}
