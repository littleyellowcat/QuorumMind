import { spawn as nodeSpawn } from "node:child_process";
import { createPermissionApprovalRecord, decideRoleToolPermission } from "../harness/tool-governance";
import type { PermissionApprovalStore } from "../harness/permission-approval-store";

export type McpClientLike = {
  request(method: string, params?: unknown): Promise<unknown>;
};

export type McpToolManifest = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type McpChildProcessLike = {
  stdin: {
    write(chunk: string): unknown;
  };
  stdout: {
    on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  };
  stderr?: {
    on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  };
  on(event: "exit" | "error", listener: (...args: unknown[]) => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
};

export type McpServerProcessInput = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  spawn?: (
    command: string,
    args: string[],
    options: { cwd?: string; env: NodeJS.ProcessEnv; stdio: "pipe" }
  ) => McpChildProcessLike;
};

export type McpServerSession = {
  client: McpClientLike;
  stop(): void;
};

export function startMcpServerProcess(input: McpServerProcessInput): McpServerSession {
  const spawnImpl = input.spawn ?? ((command, args, options) => nodeSpawn(command, args, options) as McpChildProcessLike);
  const child = spawnImpl(input.command, input.args ?? [], {
    ...(input.cwd ? { cwd: input.cwd } : {}),
    env: {
      ...process.env,
      ...input.env
    },
    stdio: "pipe"
  });
  let nextId = 1;
  let buffer = "";
  const pending = new Map<number, {
    resolve(value: unknown): void;
    reject(error: Error): void;
  }>();

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      handleJsonRpcLine(line);
    }
  });
  child.on("exit", () => rejectPending("MCP server process exited."));
  child.on("error", (error) => rejectPending(error instanceof Error ? error.message : "MCP server process failed."));

  return {
    client: {
      request(method: string, params?: unknown): Promise<unknown> {
        const id = nextId;
        nextId += 1;
        const message = {
          jsonrpc: "2.0",
          id,
          method,
          ...(params === undefined ? {} : { params })
        };

        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          child.stdin.write(`${JSON.stringify(message)}\n`);
        });
      }
    },
    stop() {
      child.kill();
      rejectPending("MCP server process stopped.");
    }
  };

  function handleJsonRpcLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    try {
      const response = JSON.parse(line) as { id?: unknown; result?: unknown; error?: unknown };
      if (typeof response.id !== "number") {
        return;
      }

      const callbacks = pending.get(response.id);
      if (!callbacks) {
        return;
      }

      pending.delete(response.id);
      if ("error" in response && response.error) {
        callbacks.reject(new Error(typeof response.error === "string" ? response.error : JSON.stringify(response.error)));
        return;
      }

      callbacks.resolve(response.result);
    } catch {
      // Ignore non-JSON stdout lines from MCP wrappers; JSON-RPC responses still resolve requests.
    }
  }

  function rejectPending(message: string): void {
    for (const [id, callbacks] of pending.entries()) {
      pending.delete(id);
      callbacks.reject(new Error(message));
    }
  }
}

export async function listMcpTools(client: McpClientLike): Promise<McpToolManifest[]> {
  const response = await client.request("tools/list");
  const tools = typeof response === "object" && response !== null && Array.isArray((response as { tools?: unknown }).tools)
    ? (response as { tools: unknown[] }).tools
    : [];

  return tools.flatMap((tool) => {
    if (typeof tool !== "object" || tool === null || typeof (tool as { name?: unknown }).name !== "string") {
      return [];
    }
    return [{
      name: (tool as { name: string }).name,
      ...(typeof (tool as { description?: unknown }).description === "string" ? { description: (tool as { description: string }).description } : {}),
      ...("inputSchema" in tool ? { inputSchema: (tool as { inputSchema?: unknown }).inputSchema } : {})
    }];
  });
}

export async function callMcpReadOnlyTool(input: {
  client: McpClientLike;
  runId: string;
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  approvalStore: PermissionApprovalStore;
}): Promise<
  | { status: "executed"; permission: ReturnType<typeof decideRoleToolPermission>; output: unknown }
  | { status: "blocked"; permission: ReturnType<typeof decideRoleToolPermission> }
  | { status: "requires_human"; permission: ReturnType<typeof decideRoleToolPermission>; approval: ReturnType<typeof createPermissionApprovalRecord> }
> {
  const permission = decideRoleToolPermission({
    role: "executor_agent",
    toolName: `mcp:${input.serverName}:${input.toolName}`,
    node: "mcp_read_only_tool",
    objective: "read-only MCP tool call",
    savedApprovals: input.approvalStore.savedApprovals()
  });

  if (!isReadOnlyMcpTool(input.toolName)) {
    return {
      status: "blocked",
      permission: {
        ...permission,
        decision: "blocked",
        reason: `MCP tool ${input.toolName} is not classified as read-only.`
      }
    };
  }

  if (permission.decision === "requires_human") {
    const approval = createPermissionApprovalRecord(permission, {
      runId: input.runId,
      requestedBy: "executor_agent"
    });
    input.approvalStore.add(approval);
    return { status: "requires_human", permission, approval };
  }

  input.approvalStore.add(createPermissionApprovalRecord(permission, {
    runId: input.runId,
    requestedBy: "executor_agent",
    status: "approved",
    scope: "run"
  }));

  return {
    status: "executed",
    permission,
    output: await input.client.request("tools/call", {
      name: input.toolName,
      arguments: input.arguments
    })
  };
}

function isReadOnlyMcpTool(toolName: string): boolean {
  return /(^|[._:-])(read|get|list|search|fetch|inspect|summary|summarize)([._:-]|$)/i.test(toolName);
}
