// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createPermissionApprovalStore } from "../harness/permission-approval-store";
import { callMcpReadOnlyTool, listMcpTools, startMcpServerProcess } from "./mcp-runtime";

describe("MCP read-only runtime", () => {
  it("starts an MCP server process and sends JSON-RPC requests over stdio", async () => {
    const stdout = new EventEmitter();
    const stdinWrites: string[] = [];
    let killed = false;
    const spawnCalls: unknown[] = [];
    const session = startMcpServerProcess({
      command: "node",
      args: ["server.js"],
      cwd: "/repo",
      env: { MCP_TOKEN: "secret" },
      spawn: (command, args, options) => {
        spawnCalls.push({ command, args, options });
        return {
          stdin: {
            write(chunk: string) {
              stdinWrites.push(chunk);
              return true;
            }
          },
          stdout,
          stderr: new EventEmitter(),
          on() {
            return undefined;
          },
          kill() {
            killed = true;
            return true;
          }
        };
      }
    });

    const responsePromise = session.client.request("tools/list");
    const request = JSON.parse(stdinWrites[0]) as { id: number; method: string };
    stdout.emit("data", `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { tools: [] } })}\n`);
    const response = await responsePromise;
    session.stop();

    expect(spawnCalls).toContainEqual(expect.objectContaining({
      command: "node",
      args: ["server.js"],
      options: expect.objectContaining({
        cwd: "/repo",
        stdio: "pipe"
      })
    }));
    expect(request.method).toBe("tools/list");
    expect(response).toEqual({ tools: [] });
    expect(killed).toBe(true);
  });

  it("lists MCP tools and executes read-only calls through permission audit", async () => {
    const calls: unknown[] = [];
    const client = {
      async request(method: string, params?: unknown) {
        calls.push({ method, params });
        if (method === "tools/list") {
          return {
            tools: [
              { name: "repo.read_file", description: "Read a file", inputSchema: { type: "object" } },
              { name: "repo.write_file", description: "Write a file", inputSchema: { type: "object" } }
            ]
          };
        }
        if (method === "tools/call") {
          return { content: [{ type: "text", text: "file contents" }] };
        }
        return {};
      }
    };
    const approvalStore = createPermissionApprovalStore({ rootDir: "/tmp/qm-mcp-runtime-test" });

    const tools = await listMcpTools(client);
    const result = await callMcpReadOnlyTool({
      client,
      runId: "run-mcp-1",
      serverName: "repo",
      toolName: "repo.read_file",
      arguments: { path: "README.md" },
      approvalStore
    });

    expect(tools.map((tool) => tool.name)).toEqual(["repo.read_file", "repo.write_file"]);
    expect(result.status).toBe("executed");
    expect(result.permission).toMatchObject({
      category: "read_only",
      decision: "auto"
    });
    expect(approvalStore.list()).toContainEqual(expect.objectContaining({
      toolName: "mcp:repo:repo.read_file",
      status: "approved"
    }));
    expect(result.output).toMatchObject({ content: [{ type: "text", text: "file contents" }] });
    expect(calls).toContainEqual({
      method: "tools/call",
      params: {
        name: "repo.read_file",
        arguments: { path: "README.md" }
      }
    });
  });

  it("blocks non-read-only MCP tools before calling the server", async () => {
    const client = {
      async request() {
        throw new Error("should not call MCP server");
      }
    };

    const result = await callMcpReadOnlyTool({
      client,
      runId: "run-mcp-2",
      serverName: "repo",
      toolName: "repo.write_file",
      arguments: { path: "README.md", content: "bad" },
      approvalStore: createPermissionApprovalStore({ rootDir: "/tmp/qm-mcp-runtime-test-block" })
    });

    expect(result.status).toBe("blocked");
    expect(result.permission.reason).toContain("read-only");
  });
});
