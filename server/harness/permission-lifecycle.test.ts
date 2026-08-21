// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createPermissionApprovalStore } from "./permission-approval-store";
import { summarizePermissionApprovalLifecycle } from "./permission-lifecycle";
import { createPermissionApprovalRecord, decideToolPermission } from "./tool-governance";

describe("permission approval lifecycle", () => {
  it("summarizes approval scopes, expiry, revoked status, and risk by tool/provider", () => {
    const store = createPermissionApprovalStore({ rootDir: "/tmp/qm-permission-lifecycle" });
    const always = createPermissionApprovalRecord(
      decideToolPermission({ toolName: "quorummind_live_blueprint_provider_trace", node: "live_model_review" }),
      {
        runId: "run-1",
        requestedBy: "executor_agent",
        status: "approved",
        scope: "tool",
        createdAt: "2026-08-21T00:00:00.000Z"
      }
    );
    const pending = createPermissionApprovalRecord(
      decideToolPermission({ toolName: "openrouter_provider_probe", objective: "provider capability probe", node: "provider_probe" }),
      {
        runId: "run-2",
        requestedBy: "executor_agent",
        createdAt: "2026-08-21T00:05:00.000Z"
      }
    );

    store.add({ ...always, expiresAt: "2026-08-22T00:00:00.000Z" });
    store.add(pending);
    store.revoke(always.id, "2026-08-21T01:00:00.000Z");

    const lifecycle = summarizePermissionApprovalLifecycle(store.list(), "2026-08-21T02:00:00.000Z");

    expect(lifecycle.summary).toMatchObject({
      total: 2,
      pending: 1,
      approved: 1,
      revoked: 1,
      expired: 0
    });
    expect(lifecycle.byTool).toContainEqual(expect.objectContaining({
      toolName: "quorummind_live_blueprint_provider_trace",
      approved: 1,
      revoked: 1
    }));
    expect(lifecycle.byProvider).toContainEqual(expect.objectContaining({
      providerId: "openrouter",
      pending: 1
    }));
  });
});
