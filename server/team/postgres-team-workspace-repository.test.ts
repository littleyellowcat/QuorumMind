// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createPostgresTeamWorkspaceRepository, type PostgresQueryClient } from "./postgres-team-workspace-repository";

describe("Postgres team workspace repository", () => {
  it("persists workspaces, members, ADR approvals, and approval replies through a query client", async () => {
    const client = createFakePostgresClient();
    const repository = createPostgresTeamWorkspaceRepository({
      client,
      schema: "quorummind",
      now: () => "2026-08-21T08:00:00.000Z"
    });

    await repository.initializeSchema();
    const workspace = await repository.saveWorkspace({
      id: "architecture",
      name: "Architecture Council",
      persistenceMode: "postgres",
      members: [
        { userId: "alice", role: "owner" },
        { userId: "bob", role: "reviewer" }
      ]
    });
    const approval = await repository.createAdrApproval({
      workspaceId: "architecture",
      adrId: "ADR-042",
      title: "Auth boundary",
      requestedBy: "alice",
      requiredApprovers: ["bob"]
    });
    const replied = await repository.replyAdrApproval(approval.id, {
      userId: "bob",
      decision: "approve",
      note: "Rollback and ownership are clear."
    });

    expect(workspace).toMatchObject({
      id: "architecture",
      persistenceMode: "postgres",
      members: [
        { userId: "alice", role: "owner" },
        { userId: "bob", role: "reviewer" }
      ]
    });
    await expect(repository.findWorkspace("architecture")).resolves.toMatchObject({
      id: "architecture",
      name: "Architecture Council"
    });
    await expect(repository.listWorkspaces()).resolves.toHaveLength(1);
    expect(replied).toMatchObject({
      id: approval.id,
      status: "approved",
      decisions: [
        expect.objectContaining({
          userId: "bob",
          decision: "approve"
        })
      ]
    });
    await expect(repository.listAdrApprovals("architecture")).resolves.toEqual([
      expect.objectContaining({ status: "approved" })
    ]);
    expect(client.sqlLog.join("\n")).toContain("CREATE TABLE IF NOT EXISTS quorummind.team_workspaces");
    expect(client.sqlLog.join("\n")).toContain("INSERT INTO quorummind.adr_approval_decisions");
  });
});

function createFakePostgresClient(): PostgresQueryClient & { sqlLog: string[] } {
  const sqlLog: string[] = [];
  const workspaces = new Map<string, any>();
  const members = new Map<string, any[]>();
  const approvals = new Map<string, any>();
  const decisions = new Map<string, any[]>();

  return {
    sqlLog,
    async query(sql, values = []) {
      sqlLog.push(sql.replace(/\s+/g, " ").trim());

      if (sql.includes("INSERT INTO") && sql.includes("team_workspaces")) {
        const [id, name, persistenceMode, createdAt, updatedAt] = values;
        const current = workspaces.get(id);
        workspaces.set(id, {
          id,
          name,
          persistence_mode: persistenceMode,
          created_at: current?.created_at ?? createdAt,
          updated_at: updatedAt
        });
        return { rows: [workspaces.get(id)] };
      }

      if (sql.includes("DELETE FROM") && sql.includes("team_members")) {
        members.set(String(values[0]), []);
        return { rows: [] };
      }

      if (sql.includes("INSERT INTO") && sql.includes("team_members")) {
        const [workspaceId, userId, role] = values;
        members.set(String(workspaceId), [
          ...(members.get(String(workspaceId)) ?? []),
          { workspace_id: workspaceId, user_id: userId, role }
        ]);
        return { rows: [] };
      }

      if (sql.includes("FROM") && sql.includes("team_workspaces") && sql.includes("WHERE id")) {
        const row = workspaces.get(values[0]);
        return { rows: row ? [row] : [] };
      }

      if (sql.includes("FROM") && sql.includes("team_workspaces") && !sql.includes("WHERE id")) {
        return { rows: [...workspaces.values()] };
      }

      if (sql.includes("FROM") && sql.includes("team_members")) {
        return { rows: members.get(String(values[0])) ?? [] };
      }

      if (sql.includes("INSERT INTO") && sql.includes("adr_approvals")) {
        const [id, workspaceId, adrId, title, requestedBy, requiredApprovers, status, createdAt, updatedAt] = values;
        const current = approvals.get(id);
        approvals.set(id, {
          id,
          workspace_id: workspaceId,
          adr_id: adrId,
          title,
          requested_by: requestedBy,
          required_approvers: requiredApprovers,
          status: current?.status ?? status,
          created_at: current?.created_at ?? createdAt,
          updated_at: updatedAt
        });
        return { rows: [approvals.get(id)] };
      }

      if (sql.includes("SELECT") && sql.includes("adr_approvals") && sql.includes("WHERE id")) {
        const row = approvals.get(values[0]);
        return { rows: row ? [row] : [] };
      }

      if (sql.includes("SELECT") && sql.includes("adr_approvals") && sql.includes("WHERE workspace_id")) {
        return { rows: [...approvals.values()].filter((approval) => approval.workspace_id === values[0]) };
      }

      if (sql.includes("SELECT") && sql.includes("adr_approvals")) {
        return { rows: [...approvals.values()] };
      }

      if (sql.includes("INSERT INTO") && sql.includes("adr_approval_decisions")) {
        const [approvalId, userId, decision, note, decidedAt] = values;
        decisions.set(String(approvalId), [
          ...(decisions.get(String(approvalId)) ?? []).filter((item) => item.user_id !== userId),
          { approval_id: approvalId, user_id: userId, decision, note, decided_at: decidedAt }
        ]);
        return { rows: [] };
      }

      if (sql.includes("UPDATE") && sql.includes("adr_approvals")) {
        const [status, updatedAt, id] = values;
        approvals.set(String(id), {
          ...approvals.get(String(id)),
          status,
          updated_at: updatedAt
        });
        return { rows: [approvals.get(String(id))] };
      }

      if (sql.includes("FROM") && sql.includes("adr_approval_decisions")) {
        return { rows: decisions.get(String(values[0])) ?? [] };
      }

      return { rows: [] };
    }
  };
}
