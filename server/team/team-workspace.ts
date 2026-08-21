import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultHarnessRootDir, safeSegment } from "../harness/run-event-store";

export type TeamRole = "owner" | "reviewer" | "viewer";
export type TeamAction = "view" | "comment" | "create_adr" | "approve_adr" | "admin";

export type TeamMember = {
  userId: string;
  role: TeamRole;
};

export type TeamWorkspace = {
  id: string;
  name: string;
  persistenceMode: "browser_local" | "sqlite" | "postgres";
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
};

export type AdrApprovalDecision = {
  userId: string;
  decision: "approve" | "request_changes" | "reject";
  note?: string;
  decidedAt: string;
};

export type AdrApprovalRecord = {
  id: string;
  workspaceId: string;
  adrId: string;
  title: string;
  requestedBy: string;
  requiredApprovers: string[];
  status: "pending" | "approved" | "changes_requested" | "rejected";
  createdAt: string;
  updatedAt: string;
  decisions: AdrApprovalDecision[];
};

export type TeamAccessDecision = {
  allowed: boolean;
  userId: string;
  action: TeamAction;
  role?: TeamRole;
  reason: string;
};

export type PostgresPersistenceContract = {
  mode: "postgres";
  configured: boolean;
  schema: string;
  sslMode: "disable" | "prefer" | "require";
  requiredTables: string[];
  repository: {
    available: boolean;
    driver: "external_query_client";
    migrationSafe: boolean;
  };
  notes: string[];
};

export type TeamWorkspaceStore = {
  saveWorkspace(input: {
    id: string;
    name: string;
    persistenceMode?: TeamWorkspace["persistenceMode"];
    members: TeamMember[];
  }): TeamWorkspace;
  findWorkspace(id: string): TeamWorkspace | undefined;
  listWorkspaces(): TeamWorkspace[];
  createAdrApproval(input: {
    workspaceId: string;
    adrId: string;
    title: string;
    requestedBy: string;
    requiredApprovers: string[];
  }): AdrApprovalRecord;
  replyAdrApproval(id: string, decision: Omit<AdrApprovalDecision, "decidedAt">): AdrApprovalRecord | undefined;
  listAdrApprovals(workspaceId?: string): AdrApprovalRecord[];
};

export function createTeamWorkspaceStore(options: { rootDir?: string } = {}): TeamWorkspaceStore {
  const rootDir = options.rootDir ?? defaultHarnessRootDir();

  function saveWorkspace(input: {
    id: string;
    name: string;
    persistenceMode?: TeamWorkspace["persistenceMode"];
    members: TeamMember[];
  }): TeamWorkspace {
    const current = findWorkspace(input.id);
    const now = new Date().toISOString();
    const workspace: TeamWorkspace = {
      id: safeId(input.id),
      name: input.name,
      persistenceMode: input.persistenceMode ?? "browser_local",
      members: dedupeMembers(input.members),
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    };
    const workspaces = [...listWorkspaces().filter((item) => item.id !== workspace.id), workspace]
      .sort((a, b) => a.id.localeCompare(b.id));
    writeJson(workspacesPath(), workspaces);
    return workspace;
  }

  function findWorkspace(id: string): TeamWorkspace | undefined {
    return listWorkspaces().find((workspace) => workspace.id === safeId(id));
  }

  function listWorkspaces(): TeamWorkspace[] {
    return readJson<TeamWorkspace[]>(workspacesPath(), []);
  }

  function createAdrApproval(input: {
    workspaceId: string;
    adrId: string;
    title: string;
    requestedBy: string;
    requiredApprovers: string[];
  }): AdrApprovalRecord {
    const now = new Date().toISOString();
    const id = `adr-${safeId(input.workspaceId)}-${safeId(input.adrId)}`;
    const current = listAdrApprovals().find((approval) => approval.id === id);
    const record: AdrApprovalRecord = {
      id,
      workspaceId: safeId(input.workspaceId),
      adrId: input.adrId,
      title: input.title,
      requestedBy: input.requestedBy,
      requiredApprovers: [...new Set(input.requiredApprovers)],
      status: current?.status ?? "pending",
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      decisions: current?.decisions ?? []
    };
    const approvals = [...listAdrApprovals().filter((approval) => approval.id !== id), record]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    writeJson(approvalsPath(), approvals);
    return record;
  }

  function replyAdrApproval(id: string, decision: Omit<AdrApprovalDecision, "decidedAt">): AdrApprovalRecord | undefined {
    const approvals = listAdrApprovals();
    const current = approvals.find((approval) => approval.id === id);
    if (!current) {
      return undefined;
    }

    const nextDecision: AdrApprovalDecision = {
      ...decision,
      decidedAt: new Date().toISOString()
    };
    const decisions = [
      ...current.decisions.filter((item) => item.userId !== decision.userId),
      nextDecision
    ];
    const next: AdrApprovalRecord = {
      ...current,
      decisions,
      updatedAt: nextDecision.decidedAt,
      status: adrStatus(current.requiredApprovers, decisions)
    };
    writeJson(approvalsPath(), approvals.map((approval) => approval.id === id ? next : approval));
    return next;
  }

  function listAdrApprovals(workspaceId?: string): AdrApprovalRecord[] {
    return readJson<AdrApprovalRecord[]>(approvalsPath(), [])
      .filter((approval) => !workspaceId || approval.workspaceId === safeId(workspaceId));
  }

  function teamDir(): string {
    return join(rootDir, "team");
  }

  function workspacesPath(): string {
    return join(teamDir(), "workspaces.json");
  }

  function approvalsPath(): string {
    return join(teamDir(), "adr-approvals.json");
  }

  return {
    saveWorkspace,
    findWorkspace,
    listWorkspaces,
    createAdrApproval,
    replyAdrApproval,
    listAdrApprovals
  };
}

export function evaluateTeamAccess(workspace: TeamWorkspace, userId: string, action: TeamAction): TeamAccessDecision {
  const member = workspace.members.find((item) => item.userId === userId);

  if (!member) {
    return {
      allowed: false,
      userId,
      action,
      reason: "User is not a member of this workspace."
    };
  }

  const allowed = allowedActionsForRole(member.role).includes(action);
  return {
    allowed,
    userId,
    action,
    role: member.role,
    reason: allowed
      ? `${member.role} can perform ${action}.`
      : `${member.role} cannot perform ${action}; request reviewer or owner approval.`
  };
}

export function summarizePostgresPersistenceContract(input: {
  connectionStringPresent?: boolean;
  schema?: string;
  sslMode?: "disable" | "prefer" | "require";
}): PostgresPersistenceContract {
  return {
    mode: "postgres",
    configured: Boolean(input.connectionStringPresent),
    schema: input.schema ?? "public",
    sslMode: input.sslMode ?? "prefer",
    requiredTables: [
      "team_workspaces",
      "team_members",
      "adr_approvals",
      "adr_approval_decisions",
      "run_audit_bundles",
      "quality_eval_trends"
    ],
    repository: {
      available: true,
      driver: "external_query_client",
      migrationSafe: true
    },
    notes: [
      "Postgres persistence has a query-client repository adapter and contract; local-first endpoints still avoid opening a database connection unless a deployment layer supplies a client.",
      "Connection strings are treated as secrets and must not be returned by API responses.",
      "SQLite/browser-local modes remain supported for single-user demos."
    ]
  };
}

function allowedActionsForRole(role: TeamRole): TeamAction[] {
  if (role === "owner") {
    return ["view", "comment", "create_adr", "approve_adr", "admin"];
  }
  if (role === "reviewer") {
    return ["view", "comment", "create_adr", "approve_adr"];
  }
  return ["view", "comment"];
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
  const byUser = new Map<string, TeamMember>();
  for (const member of members) {
    byUser.set(member.userId, member);
  }
  return [...byUser.values()].sort((a, b) => a.userId.localeCompare(b.userId));
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) {
    return fallback;
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeId(value: string): string {
  return safeSegment(value.trim());
}
