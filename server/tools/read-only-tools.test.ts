// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPermissionApprovalStore } from "../harness/permission-approval-store";
import { executeReadOnlyTool, listConfiguredToolManifests } from "./read-only-tools";

describe("read-only tool execution", () => {
  it("executes a configured read-only custom tool through permission governance", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qm-tools-"));
    const approvalStore = createPermissionApprovalStore({ rootDir });
    writeFileSync(
      join(rootDir, "quorummind.config.json"),
      JSON.stringify({
        customTools: [
          {
            name: "repo_diff_summary",
            description: "Summarize provided diff",
            mode: "read_only",
            inputSchema: { type: "object" }
          }
        ],
        agents: {
          blueprint: {
            tools: ["repo_diff_summary"]
          }
        }
      }),
      "utf8"
    );

    const result = await executeReadOnlyTool({
      rootDir,
      runId: "run-tools-1",
      agentId: "blueprint",
      toolName: "repo_diff_summary",
      input: {
        diffText: "diff --git a/server/auth.ts b/server/auth.ts\n+token"
      },
      approvalStore
    });

    expect(result.status).toBe("executed");
    expect(result.permission).toMatchObject({
      category: "read_only",
      decision: "auto"
    });
    expect(result.output).toMatchObject({
      toolName: "repo_diff_summary",
      changedFiles: ["server/auth.ts"]
    });
    expect(approvalStore.list()).toEqual([]);
  });

  it("lists MCP and custom tool manifests without env values", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qm-tools-"));
    writeFileSync(
      join(rootDir, "quorummind.config.json"),
      JSON.stringify({
        mcpServers: {
          github: {
            command: "npx",
            env: { GITHUB_TOKEN: "secret" }
          }
        },
        customTools: [{ name: "repo_diff_summary", description: "Summarize diff" }]
      }),
      "utf8"
    );

    const manifests = listConfiguredToolManifests(rootDir);

    expect(manifests).toContainEqual({
      name: "mcp:github",
      kind: "mcp_server",
      description: "Configured MCP server command: npx",
      envKeys: ["GITHUB_TOKEN"]
    });
    expect(JSON.stringify(manifests)).not.toContain("secret");
  });
});
