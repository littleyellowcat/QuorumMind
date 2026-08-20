// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPermissionApprovalStore } from "./permission-approval-store";
import { executeGovernedTool } from "./tool-execution-runner";

describe("executeGovernedTool", () => {
  it("executes auto-approved read-only tools and returns their output", async () => {
    const execute = vi.fn(async () => ({ answer: "ok" }));

    await expect(
      executeGovernedTool({
        runId: "run-1",
        role: "executor_agent",
        toolName: "knowledge_index_read",
        node: "executor_agent",
        objective: "read local knowledge",
        execute
      })
    ).resolves.toMatchObject({
      status: "executed",
      output: { answer: "ok" },
      permission: expect.objectContaining({ decision: "auto" })
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("creates an approval request and does not execute human-gated live model tools", async () => {
    const store = createPermissionApprovalStore({ rootDir: mkdtempSync(join(tmpdir(), "quorummind-approvals-runner-")) });
    const execute = vi.fn(async () => "should not run");

    const result = await executeGovernedTool({
      runId: "run-1",
      role: "executor_agent",
      toolName: "quorummind_live_blueprint_provider_trace",
      node: "live_model_review",
      objective: "call live model",
      locale: "zh",
      approvalStore: store,
      execute
    });

    expect(result).toMatchObject({
      status: "requires_human",
      approval: expect.objectContaining({
        runId: "run-1",
        toolName: "quorummind_live_blueprint_provider_trace",
        status: "pending"
      })
    });
    expect(store.list()).toHaveLength(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not execute blocked production operations", async () => {
    const execute = vi.fn(async () => "should not run");

    await expect(
      executeGovernedTool({
        runId: "run-1",
        role: "executor_agent",
        toolName: "external_write_or_deploy",
        node: "executor_agent",
        objective: "delete production records",
        execute
      })
    ).resolves.toMatchObject({
      status: "blocked",
      permission: expect.objectContaining({ decision: "blocked" })
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
