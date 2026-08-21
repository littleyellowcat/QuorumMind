// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createPermissionApprovalRecord, decideToolPermission } from "./tool-governance";
import { createPermissionAuditReport } from "./permission-audit";

describe("createPermissionAuditReport", () => {
  it("summarizes approval records into allowed, human-gated, blocked, and packageable audit items", () => {
    const pendingLiveModel = createPermissionApprovalRecord(
      decideToolPermission({
        toolName: "quorummind_live_blueprint_provider_trace",
        objective: "call provider",
        node: "live_model_review"
      }),
      {
        runId: "run-1",
        requestedBy: "executor_agent",
        createdAt: "2026-08-20T12:00:00.000Z"
      }
    );
    const approvedPaidTool = createPermissionApprovalRecord(
      decideToolPermission({
        toolName: "provider_api_generate",
        objective: "paid image generation",
        node: "asset_generation"
      }),
      {
        runId: "run-2",
        requestedBy: "supervisor_agent",
        createdAt: "2026-08-20T12:05:00.000Z",
        status: "approved"
      }
    );
    const blockedDeploy = createPermissionApprovalRecord(
      decideToolPermission({
        toolName: "external_write_or_deploy",
        objective: "deploy to production and delete stale data",
        node: "release_gate"
      }),
      {
        runId: "run-3",
        requestedBy: "supervisor_agent",
        createdAt: "2026-08-20T12:10:00.000Z",
        status: "denied"
      }
    );

    const report = createPermissionAuditReport([pendingLiveModel, approvedPaidTool, blockedDeploy]);

    expect(report.summary).toMatchObject({
      total: 3,
      allowed: 1,
      humanGated: 1,
      blocked: 1,
      redactedOrTruncated: 3
    });
    expect(report.items.map((item) => item.outcome)).toEqual(["allowed", "human_gated", "blocked"]);
    expect(report.items[0]).toMatchObject({
      toolName: "provider_api_generate",
      whyAllowedOrDenied: expect.stringContaining("approval")
    });
    expect(report.items[1]).toMatchObject({
      toolName: "quorummind_live_blueprint_provider_trace",
      requiresHumanConfirmation: true,
      whyAllowedOrDenied: expect.stringContaining("human")
    });
    expect(report.items[2]).toMatchObject({
      toolName: "external_write_or_deploy",
      outcome: "blocked",
      whyAllowedOrDenied: expect.stringContaining("blocked")
    });
    expect(report.approvalPackage).toContain("run-1");
    expect(report.approvalPackage).toContain("quorummind_live_blueprint_provider_trace");
  });
});
