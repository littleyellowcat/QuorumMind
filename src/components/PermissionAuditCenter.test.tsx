import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PermissionAuditCenter } from "./PermissionAuditCenter";
import type { PermissionAuditReport, PermissionLifecycleReport } from "../lib/api-client";

const audit: PermissionAuditReport = {
  generatedAt: "2026-08-21T00:00:00.000Z",
  summary: {
    total: 3,
    allowed: 1,
    humanGated: 1,
    blocked: 1,
    redactedOrTruncated: 2
  },
  items: [
    {
      id: "approval-3",
      runId: "run-3",
      toolName: "repo_diff_summary",
      node: "tool_execution",
      category: "read_only",
      risk: "low",
      decision: "auto",
      status: "approved",
      scope: "tool",
      outcome: "allowed",
      requestedBy: "executor_agent",
      createdAt: "2026-08-21T00:10:00.000Z",
      requiresHumanConfirmation: false,
      whyAllowedOrDenied: "allowed by recorded approval",
      outputHandling: {
        redacted: true,
        truncated: false,
        reason: "metadata only"
      }
    },
    {
      id: "approval-1",
      runId: "run-1",
      toolName: "quorummind_live_blueprint_provider_trace",
      node: "live_model_review",
      category: "live_model_call",
      risk: "medium",
      decision: "requires_human",
      status: "pending",
      outcome: "human_gated",
      requestedBy: "executor_agent",
      createdAt: "2026-08-21T00:00:00.000Z",
      requiresHumanConfirmation: true,
      whyAllowedOrDenied: "requires human confirmation before execution",
      outputHandling: {
        redacted: true,
        truncated: true,
        reason: "summarized"
      }
    },
    {
      id: "approval-2",
      runId: "run-2",
      toolName: "external_write_or_deploy",
      node: "release_gate",
      category: "production_operation",
      risk: "high",
      decision: "blocked",
      status: "denied",
      outcome: "blocked",
      requestedBy: "supervisor_agent",
      createdAt: "2026-08-21T00:05:00.000Z",
      requiresHumanConfirmation: false,
      whyAllowedOrDenied: "blocked or denied by permission policy",
      outputHandling: {
        redacted: true,
        truncated: true,
        reason: "summarized"
      }
    }
  ],
  approvalPackage: "# Permission package"
};

const lifecycle: PermissionLifecycleReport = {
  generatedAt: "2026-08-21T00:30:00.000Z",
  summary: {
    total: 3,
    pending: 1,
    approved: 1,
    denied: 1,
    revoked: 1,
    expired: 0
  },
  byTool: [
    {
      toolName: "repo_diff_summary",
      pending: 0,
      approved: 1,
      denied: 0,
      revoked: 1,
      expired: 0
    }
  ],
  byProvider: [
    {
      providerId: "openrouter",
      pending: 1,
      approved: 0,
      denied: 0,
      revoked: 0,
      expired: 0
    }
  ]
};

describe("PermissionAuditCenter", () => {
  it("shows permission audit counts and copyable package action", () => {
    render(<PermissionAuditCenter locale="en" audit={audit} lifecycle={lifecycle} loading={false} onCopyPackage={vi.fn()} />);

    expect(screen.getByText("Permission audit center")).toBeInTheDocument();
    expect(screen.getByText("1 allowed")).toBeInTheDocument();
    expect(screen.getByText("1 needs human")).toBeInTheDocument();
    expect(screen.getByText("1 blocked")).toBeInTheDocument();
    expect(screen.getByText("1 revoked")).toBeInTheDocument();
    expect(screen.getByText("0 expired")).toBeInTheDocument();
    expect(screen.getAllByText(/repo_diff_summary/).length).toBeGreaterThan(0);
    expect(screen.getByText((text) => text.includes("tool scope"))).toBeInTheDocument();
    expect(screen.getByText("quorummind_live_blueprint_provider_trace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy approval package" })).toBeInTheDocument();
  });

  it("exposes approval actions for pending human-gated items", () => {
    const onReply = vi.fn();
    const onRevoke = vi.fn();

    render(
      <PermissionAuditCenter
        locale="en"
        audit={audit}
        lifecycle={lifecycle}
        loading={false}
        onCopyPackage={vi.fn()}
        onReply={onReply}
        onRevoke={onRevoke}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    expect(onReply).toHaveBeenCalledWith("approval-1", "approve");
    expect(onReply).toHaveBeenCalledWith("approval-1", "reject");
    expect(onRevoke).toHaveBeenCalledWith("approval-3");
  });
});
