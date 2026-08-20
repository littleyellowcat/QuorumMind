// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createPermissionApprovalRecord,
  decideRoleToolPermission,
  decideToolPermission
} from "./tool-governance";

describe("decideToolPermission", () => {
  it("allows read-only and local checkpoint tools", () => {
    expect(decideToolPermission({ toolName: "knowledge_index_read", objective: "inspect memory" })).toMatchObject({
      category: "read_only",
      risk: "low",
      decision: "auto"
    });
    expect(decideToolPermission({ toolName: "sqlite_checkpoint_write", objective: "write bounded checkpoint" })).toMatchObject({
      category: "local_file_write",
      risk: "medium",
      decision: "auto"
    });
  });

  it("allows preapproved live model calls but gates unapproved ones", () => {
    expect(
      decideToolPermission({
        toolName: "quorummind_live_blueprint_provider_trace",
        objective: "call model",
        liveModelPreapproved: true
      })
    ).toMatchObject({
      category: "live_model_call",
      risk: "medium",
      decision: "auto"
    });
    expect(
      decideToolPermission({
        toolName: "quorummind_live_blueprint_provider_trace",
        objective: "call model",
        liveModelPreapproved: false
      })
    ).toMatchObject({
      category: "live_model_call",
      risk: "medium",
      decision: "requires_human"
    });
  });

  it("blocks destructive production operations", () => {
    expect(
      decideToolPermission({
        toolName: "external_write_or_deploy",
        objective: "自动部署到生产并删除旧数据"
      })
    ).toMatchObject({
      category: "production_operation",
      risk: "high",
      decision: "blocked"
    });
  });

  it("requires human approval for paid operations", () => {
    expect(
      decideToolPermission({
        toolName: "provider_api_generate",
        objective: "paid image or model generation"
      })
    ).toMatchObject({
      category: "paid_operation",
      risk: "high",
      decision: "requires_human"
    });
  });

  it("records permission approval requests with stable run metadata", () => {
    const decision = decideToolPermission({
      toolName: "quorummind_live_blueprint_provider_trace",
      objective: "call model",
      node: "live_model_review",
      liveModelPreapproved: false
    });
    const record = createPermissionApprovalRecord(decision, {
      runId: "run-1",
      requestedBy: "executor_agent",
      createdAt: "2026-08-20T12:00:00.000Z"
    });

    expect(record).toMatchObject({
      runId: "run-1",
      toolName: "quorummind_live_blueprint_provider_trace",
      node: "live_model_review",
      status: "pending",
      requestedBy: "executor_agent",
      decision: "requires_human"
    });
    expect(record.id).toContain("run-1");
  });

  it("allows saved approvals to downgrade repeated human gates to auto", () => {
    const savedApproval = createPermissionApprovalRecord(
      decideToolPermission({
        toolName: "quorummind_live_blueprint_provider_trace",
        objective: "call model",
        node: "live_model_review"
      }),
      {
        runId: "old-run",
        requestedBy: "supervisor_agent",
        createdAt: "2026-08-20T12:00:00.000Z",
        status: "approved",
        scope: "tool"
      }
    );

    expect(
      decideToolPermission({
        toolName: "quorummind_live_blueprint_provider_trace",
        objective: "call model",
        node: "live_model_review",
        savedApprovals: [savedApproval]
      })
    ).toMatchObject({
      decision: "auto",
      reason: expect.stringContaining("saved approval")
    });
  });

  it("enforces role capability boundaries before generic tool risk decisions", () => {
    expect(
      decideRoleToolPermission({
        role: "planner_agent",
        toolName: "sqlite_checkpoint_write",
        objective: "write bounded checkpoint",
        node: "planner_agent"
      })
    ).toMatchObject({
      decision: "blocked",
      reason: expect.stringContaining("Planner")
    });
    expect(
      decideRoleToolPermission({
        role: "memory_agent",
        toolName: "sqlite_checkpoint_write",
        objective: "write bounded checkpoint",
        node: "memory_agent"
      })
    ).toMatchObject({
      decision: "auto"
    });
    expect(
      decideRoleToolPermission({
        role: "supervisor_agent",
        toolName: "quorummind_human_review_gate",
        objective: "pause for human review",
        node: "supervisor_agent"
      })
    ).toMatchObject({
      decision: "auto"
    });
  });
});
