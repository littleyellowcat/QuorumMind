import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TeamWorkspaceCenter } from "./TeamWorkspaceCenter";

describe("TeamWorkspaceCenter", () => {
  it("shows workspace access, ADR approval state, and approval actions", () => {
    const onApproveAdr = vi.fn();
    const onRequestChanges = vi.fn();

    render(
      <TeamWorkspaceCenter
        locale="en"
        workspace={{
          id: "architecture",
          name: "Architecture Council",
          persistenceMode: "postgres",
          members: [
            { userId: "alice", role: "owner" },
            { userId: "bob", role: "reviewer" }
          ],
          createdAt: "2026-08-21T08:00:00.000Z",
          updatedAt: "2026-08-21T08:00:00.000Z"
        }}
        access={{
          allowed: true,
          userId: "bob",
          action: "approve_adr",
          role: "reviewer",
          reason: "reviewer can perform approve_adr."
        }}
        approvals={[
          {
            id: "adr-architecture-ADR-042",
            workspaceId: "architecture",
            adrId: "ADR-042",
            title: "Auth boundary",
            requestedBy: "alice",
            requiredApprovers: ["bob"],
            status: "pending",
            createdAt: "2026-08-21T08:00:00.000Z",
            updatedAt: "2026-08-21T08:00:00.000Z",
            decisions: []
          }
        ]}
        persistence={{
          mode: "postgres",
          configured: true,
          schema: "quorummind",
          sslMode: "require",
          requiredTables: ["team_workspaces", "adr_approvals"],
          notes: ["Connection string is configured and redacted."]
        }}
        onApproveAdr={onApproveAdr}
        onRequestChanges={onRequestChanges}
      />
    );

    expect(screen.getByText("Team workspace")).toBeInTheDocument();
    expect(screen.getByText("Architecture Council")).toBeInTheDocument();
    expect(screen.getByText("postgres · quorummind")).toBeInTheDocument();
    expect(screen.getAllByText("bob · reviewer").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Auth boundary")).toBeInTheDocument();
    expect(screen.getAllByText(/pending/).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Approve ADR" }));
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));

    expect(onApproveAdr).toHaveBeenCalledWith("adr-architecture-ADR-042");
    expect(onRequestChanges).toHaveBeenCalledWith("adr-architecture-ADR-042");
  });
});
