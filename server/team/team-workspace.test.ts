// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTeamWorkspaceStore,
  evaluateTeamAccess,
  summarizePostgresPersistenceContract
} from "./team-workspace";

describe("team workspace persistence", () => {
  it("stores team workspace records and enforces role-based access", () => {
    const store = createTeamWorkspaceStore({ rootDir: mkdtempSync(join(tmpdir(), "qm-team-")) });
    const workspace = store.saveWorkspace({
      id: "team-architecture",
      name: "Architecture Council",
      persistenceMode: "postgres",
      members: [
        { userId: "alice", role: "owner" },
        { userId: "bob", role: "reviewer" },
        { userId: "eve", role: "viewer" }
      ]
    });

    expect(workspace).toMatchObject({
      id: "team-architecture",
      persistenceMode: "postgres"
    });
    expect(evaluateTeamAccess(workspace, "alice", "approve_adr")).toMatchObject({ allowed: true });
    expect(evaluateTeamAccess(workspace, "bob", "approve_adr")).toMatchObject({ allowed: true });
    expect(evaluateTeamAccess(workspace, "eve", "approve_adr")).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("viewer")
    });
  });

  it("tracks ADR approval lifecycle and preserves audit records", () => {
    const store = createTeamWorkspaceStore({ rootDir: mkdtempSync(join(tmpdir(), "qm-adr-")) });
    store.saveWorkspace({
      id: "team-architecture",
      name: "Architecture Council",
      persistenceMode: "sqlite",
      members: [
        { userId: "alice", role: "owner" },
        { userId: "bob", role: "reviewer" }
      ]
    });
    const adr = store.createAdrApproval({
      workspaceId: "team-architecture",
      adrId: "ADR-042",
      title: "Auth boundary",
      requestedBy: "alice",
      requiredApprovers: ["bob"]
    });
    const approved = store.replyAdrApproval(adr.id, {
      userId: "bob",
      decision: "approve",
      note: "Boundary and rollback plan are clear."
    });

    expect(approved).toMatchObject({
      id: adr.id,
      status: "approved",
      decisions: [
        expect.objectContaining({
          userId: "bob",
          decision: "approve"
        })
      ]
    });
    expect(store.listAdrApprovals("team-architecture")).toHaveLength(1);
  });

  it("summarizes the Postgres persistence contract without requiring a database dependency", () => {
    const contract = summarizePostgresPersistenceContract({
      connectionStringPresent: true,
      schema: "quorummind",
      sslMode: "require"
    });

    expect(contract).toMatchObject({
      mode: "postgres",
      configured: true,
      schema: "quorummind",
      sslMode: "require",
      requiredTables: expect.arrayContaining(["team_workspaces", "adr_approvals", "run_audit_bundles"])
    });
    expect(contract.notes.join(" ")).toContain("contract");
  });
});
