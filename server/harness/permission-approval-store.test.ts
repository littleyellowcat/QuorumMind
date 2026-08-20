// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPermissionApprovalStore } from "./permission-approval-store";
import { createPermissionApprovalRecord, decideToolPermission } from "./tool-governance";

describe("createPermissionApprovalStore", () => {
  it("persists, lists, approves, and removes permission records", () => {
    const store = createPermissionApprovalStore({ rootDir: mkdtempSync(join(tmpdir(), "quorummind-approvals-")) });
    const record = createPermissionApprovalRecord(
      decideToolPermission({
        toolName: "quorummind_live_blueprint_provider_trace",
        objective: "call model",
        node: "live_model_review"
      }),
      {
        runId: "run-1",
        requestedBy: "supervisor_agent",
        createdAt: "2026-08-20T12:00:00.000Z"
      }
    );

    store.add(record);
    store.approve(record.id, "2026-08-20T12:01:00.000Z");

    expect(store.list()).toEqual([
      expect.objectContaining({
        id: record.id,
        runId: "run-1",
        status: "approved",
        approvedAt: "2026-08-20T12:01:00.000Z"
      })
    ]);
    expect(store.savedApprovals()).toEqual([
      expect.objectContaining({ id: record.id, status: "approved" })
    ]);

    store.remove(record.id);
    expect(store.list()).toEqual([]);
  });

  it("records explicit approve, reject, and always replies for permission prompts", () => {
    const store = createPermissionApprovalStore({ rootDir: mkdtempSync(join(tmpdir(), "quorummind-approval-replies-")) });
    const pending = createPermissionApprovalRecord(
      decideToolPermission({
        toolName: "quorummind_live_blueprint_provider_trace",
        objective: "call model",
        node: "live_model_review"
      }),
      {
        runId: "run-1",
        requestedBy: "supervisor_agent",
        createdAt: "2026-08-20T12:00:00.000Z"
      }
    );

    store.add(pending);

    expect(store.reply(pending.id, { reply: "approve", repliedAt: "2026-08-20T12:01:00.000Z" })).toMatchObject({
      id: pending.id,
      status: "approved",
      scope: "run",
      approvedAt: "2026-08-20T12:01:00.000Z"
    });
    expect(store.reply(pending.id, { reply: "reject", message: "本轮不消耗真实模型", repliedAt: "2026-08-20T12:02:00.000Z" })).toMatchObject({
      id: pending.id,
      status: "denied",
      deniedAt: "2026-08-20T12:02:00.000Z",
      replyMessage: "本轮不消耗真实模型"
    });
    expect(store.reply(pending.id, { reply: "always", repliedAt: "2026-08-20T12:03:00.000Z" })).toMatchObject({
      id: pending.id,
      status: "approved",
      scope: "tool",
      approvedAt: "2026-08-20T12:03:00.000Z"
    });
    expect(store.savedApprovals()).toEqual([
      expect.objectContaining({
        id: pending.id,
        status: "approved",
        scope: "tool"
      })
    ]);
  });
});
