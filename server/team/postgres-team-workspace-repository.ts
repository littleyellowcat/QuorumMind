import {
  type AdrApprovalDecision,
  type AdrApprovalRecord,
  type TeamMember,
  type TeamWorkspace,
  type TeamWorkspaceStore
} from "./team-workspace";

export type PostgresQueryResult<Row = Record<string, unknown>> = {
  rows: Row[];
};

export type PostgresQueryClient = {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<PostgresQueryResult<Row>>;
};

export type AsyncTeamWorkspaceRepository = {
  initializeSchema(): Promise<void>;
  saveWorkspace(input: {
    id: string;
    name: string;
    persistenceMode?: TeamWorkspace["persistenceMode"];
    members: TeamMember[];
  }): Promise<TeamWorkspace>;
  findWorkspace(id: string): Promise<TeamWorkspace | undefined>;
  listWorkspaces(): Promise<TeamWorkspace[]>;
  createAdrApproval(input: {
    workspaceId: string;
    adrId: string;
    title: string;
    requestedBy: string;
    requiredApprovers: string[];
  }): Promise<AdrApprovalRecord>;
  replyAdrApproval(id: string, decision: Omit<AdrApprovalDecision, "decidedAt">): Promise<AdrApprovalRecord | undefined>;
  listAdrApprovals(workspaceId?: string): Promise<AdrApprovalRecord[]>;
};

type WorkspaceRow = {
  id: string;
  name: string;
  persistence_mode: TeamWorkspace["persistenceMode"];
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  workspace_id: string;
  user_id: string;
  role: TeamMember["role"];
};

type AdrApprovalRow = {
  id: string;
  workspace_id: string;
  adr_id: string;
  title: string;
  requested_by: string;
  required_approvers: string[] | string;
  status: AdrApprovalRecord["status"];
  created_at: string;
  updated_at: string;
};

type AdrDecisionRow = {
  approval_id: string;
  user_id: string;
  decision: AdrApprovalDecision["decision"];
  note?: string | null;
  decided_at: string;
};

export function createPostgresTeamWorkspaceRepository(options: {
  client: PostgresQueryClient;
  schema?: string;
  now?: () => string;
}): AsyncTeamWorkspaceRepository {
  const client = options.client;
  const schema = safeSqlIdentifier(options.schema ?? "public");
  const table = (name: string) => `${schema}.${safeSqlIdentifier(name)}`;
  const now = options.now ?? (() => new Date().toISOString());

  async function initializeSchema(): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${table("team_workspaces")} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        persistence_mode TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${table("team_members")} (
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY (workspace_id, user_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${table("adr_approvals")} (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        adr_id TEXT NOT NULL,
        title TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        required_approvers JSONB NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${table("adr_approval_decisions")} (
        approval_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        note TEXT,
        decided_at TEXT NOT NULL,
        PRIMARY KEY (approval_id, user_id)
      )
    `);
  }

  async function saveWorkspace(input: {
    id: string;
    name: string;
    persistenceMode?: TeamWorkspace["persistenceMode"];
    members: TeamMember[];
  }): Promise<TeamWorkspace> {
    const id = safeSegment(input.id);
    const timestamp = now();
    const workspaceResult = await client.query<WorkspaceRow>(
      `
        INSERT INTO ${table("team_workspaces")} (id, name, persistence_mode, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id)
        DO UPDATE SET name = EXCLUDED.name, persistence_mode = EXCLUDED.persistence_mode, updated_at = EXCLUDED.updated_at
        RETURNING id, name, persistence_mode, created_at, updated_at
      `,
      [id, input.name, input.persistenceMode ?? "postgres", timestamp, timestamp]
    );
    await client.query(`DELETE FROM ${table("team_members")} WHERE workspace_id = $1`, [id]);
    for (const member of dedupeMembers(input.members)) {
      await client.query(
        `
          INSERT INTO ${table("team_members")} (workspace_id, user_id, role)
          VALUES ($1, $2, $3)
          ON CONFLICT (workspace_id, user_id)
          DO UPDATE SET role = EXCLUDED.role
        `,
        [id, member.userId, member.role]
      );
    }

    return workspaceFromRows(workspaceResult.rows[0], await membersForWorkspace(id));
  }

  async function findWorkspace(id: string): Promise<TeamWorkspace | undefined> {
    const safeId = safeSegment(id);
    const result = await client.query<WorkspaceRow>(
      `
        SELECT id, name, persistence_mode, created_at, updated_at
        FROM ${table("team_workspaces")}
        WHERE id = $1
      `,
      [safeId]
    );
    const row = result.rows[0];
    return row ? workspaceFromRows(row, await membersForWorkspace(safeId)) : undefined;
  }

  async function listWorkspaces(): Promise<TeamWorkspace[]> {
    const result = await client.query<WorkspaceRow>(`
      SELECT id, name, persistence_mode, created_at, updated_at
      FROM ${table("team_workspaces")}
      ORDER BY id ASC
    `);
    const workspaces: TeamWorkspace[] = [];
    for (const row of result.rows) {
      workspaces.push(workspaceFromRows(row, await membersForWorkspace(row.id)));
    }
    return workspaces;
  }

  async function createAdrApproval(input: {
    workspaceId: string;
    adrId: string;
    title: string;
    requestedBy: string;
    requiredApprovers: string[];
  }): Promise<AdrApprovalRecord> {
    const timestamp = now();
    const workspaceId = safeSegment(input.workspaceId);
    const id = `adr-${workspaceId}-${safeSegment(input.adrId)}`;
    const result = await client.query<AdrApprovalRow>(
      `
        INSERT INTO ${table("adr_approvals")}
          (id, workspace_id, adr_id, title, requested_by, required_approvers, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id)
        DO UPDATE SET title = EXCLUDED.title, requested_by = EXCLUDED.requested_by, required_approvers = EXCLUDED.required_approvers, updated_at = EXCLUDED.updated_at
        RETURNING id, workspace_id, adr_id, title, requested_by, required_approvers, status, created_at, updated_at
      `,
      [
        id,
        workspaceId,
        input.adrId,
        input.title,
        input.requestedBy,
        [...new Set(input.requiredApprovers)],
        "pending",
        timestamp,
        timestamp
      ]
    );
    return approvalFromRows(result.rows[0], await decisionsForApproval(id));
  }

  async function replyAdrApproval(
    id: string,
    decision: Omit<AdrApprovalDecision, "decidedAt">
  ): Promise<AdrApprovalRecord | undefined> {
    const current = await findApprovalById(id);
    if (!current) {
      return undefined;
    }

    const decidedAt = now();
    await client.query(
      `
        INSERT INTO ${table("adr_approval_decisions")} (approval_id, user_id, decision, note, decided_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (approval_id, user_id)
        DO UPDATE SET decision = EXCLUDED.decision, note = EXCLUDED.note, decided_at = EXCLUDED.decided_at
      `,
      [id, decision.userId, decision.decision, decision.note, decidedAt]
    );
    const decisions = await decisionsForApproval(id);
    const status = adrStatus(current.requiredApprovers, decisions);
    const updated = await client.query<AdrApprovalRow>(
      `
        UPDATE ${table("adr_approvals")}
        SET status = $1, updated_at = $2
        WHERE id = $3
        RETURNING id, workspace_id, adr_id, title, requested_by, required_approvers, status, created_at, updated_at
      `,
      [status, decidedAt, id]
    );
    return approvalFromRows(updated.rows[0], decisions);
  }

  async function listAdrApprovals(workspaceId?: string): Promise<AdrApprovalRecord[]> {
    const result = workspaceId
      ? await client.query<AdrApprovalRow>(
          `
            SELECT id, workspace_id, adr_id, title, requested_by, required_approvers, status, created_at, updated_at
            FROM ${table("adr_approvals")}
            WHERE workspace_id = $1
            ORDER BY created_at ASC
          `,
          [safeSegment(workspaceId)]
        )
      : await client.query<AdrApprovalRow>(`
          SELECT id, workspace_id, adr_id, title, requested_by, required_approvers, status, created_at, updated_at
          FROM ${table("adr_approvals")}
          ORDER BY created_at ASC
        `);

    const approvals: AdrApprovalRecord[] = [];
    for (const row of result.rows) {
      approvals.push(approvalFromRows(row, await decisionsForApproval(row.id)));
    }
    return approvals;
  }

  async function findApprovalById(id: string): Promise<AdrApprovalRecord | undefined> {
    const result = await client.query<AdrApprovalRow>(
      `
        SELECT id, workspace_id, adr_id, title, requested_by, required_approvers, status, created_at, updated_at
        FROM ${table("adr_approvals")}
        WHERE id = $1
      `,
      [id]
    );
    const row = result.rows[0];
    return row ? approvalFromRows(row, await decisionsForApproval(id)) : undefined;
  }

  async function membersForWorkspace(workspaceId: string): Promise<TeamMember[]> {
    const result = await client.query<MemberRow>(
      `
        SELECT workspace_id, user_id, role
        FROM ${table("team_members")}
        WHERE workspace_id = $1
        ORDER BY user_id ASC
      `,
      [workspaceId]
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      role: row.role
    }));
  }

  async function decisionsForApproval(approvalId: string): Promise<AdrApprovalDecision[]> {
    const result = await client.query<AdrDecisionRow>(
      `
        SELECT approval_id, user_id, decision, note, decided_at
        FROM ${table("adr_approval_decisions")}
        WHERE approval_id = $1
        ORDER BY decided_at ASC
      `,
      [approvalId]
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      decision: row.decision,
      ...(row.note ? { note: row.note } : {}),
      decidedAt: row.decided_at
    }));
  }

  return {
    initializeSchema,
    saveWorkspace,
    findWorkspace,
    listWorkspaces,
    createAdrApproval,
    replyAdrApproval,
    listAdrApprovals
  };
}

export function asAsyncTeamWorkspaceRepository(store: TeamWorkspaceStore): AsyncTeamWorkspaceRepository {
  return {
    async initializeSchema() {
      return undefined;
    },
    async saveWorkspace(input) {
      return store.saveWorkspace(input);
    },
    async findWorkspace(id) {
      return store.findWorkspace(id);
    },
    async listWorkspaces() {
      return store.listWorkspaces();
    },
    async createAdrApproval(input) {
      return store.createAdrApproval(input);
    },
    async replyAdrApproval(id, decision) {
      return store.replyAdrApproval(id, decision);
    },
    async listAdrApprovals(workspaceId) {
      return store.listAdrApprovals(workspaceId);
    }
  };
}

function workspaceFromRows(row: WorkspaceRow, members: TeamMember[]): TeamWorkspace {
  return {
    id: row.id,
    name: row.name,
    persistenceMode: row.persistence_mode,
    members,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function approvalFromRows(row: AdrApprovalRow, decisions: AdrApprovalDecision[]): AdrApprovalRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    adrId: row.adr_id,
    title: row.title,
    requestedBy: row.requested_by,
    requiredApprovers: parseRequiredApprovers(row.required_approvers),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decisions
  };
}

function parseRequiredApprovers(value: AdrApprovalRow["required_approvers"]): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function adrStatus(requiredApprovers: string[], decisions: AdrApprovalDecision[]): AdrApprovalRecord["status"] {
  if (decisions.some((decision) => decision.decision === "reject")) {
    return "rejected";
  }
  if (decisions.some((decision) => decision.decision === "request_changes")) {
    return "changes_requested";
  }
  const approved = new Set(decisions.filter((decision) => decision.decision === "approve").map((decision) => decision.userId));
  return requiredApprovers.every((userId) => approved.has(userId)) ? "approved" : "pending";
}

function dedupeMembers(members: TeamMember[]): TeamMember[] {
  return [...new Map(members.map((member) => [member.userId, member])).values()].sort((a, b) => a.userId.localeCompare(b.userId));
}

function safeSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "") || "workspace";
}

function safeSqlIdentifier(value: string): string {
  const normalized = value.trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(normalized)) {
    throw new Error(`Invalid Postgres identifier: ${value}`);
  }
  return normalized;
}
