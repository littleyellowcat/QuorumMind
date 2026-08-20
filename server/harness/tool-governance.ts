export type ToolPermissionCategory =
  | "read_only"
  | "local_file_write"
  | "external_api_call"
  | "live_model_call"
  | "production_operation"
  | "paid_operation";

export type ToolPermissionRisk = "low" | "medium" | "high";
export type ToolPermissionDecisionValue = "auto" | "requires_human" | "blocked";
export type ToolPermissionApprovalStatus = "pending" | "approved" | "denied";
export type ToolPermissionApprovalScope = "run" | "tool";
export type AgentCapabilityRole =
  | "planner_agent"
  | "executor_agent"
  | "critic_agent"
  | "memory_agent"
  | "supervisor_agent";

export type ToolPermissionDecision = {
  toolName: string;
  node: string;
  category: ToolPermissionCategory;
  risk: ToolPermissionRisk;
  decision: ToolPermissionDecisionValue;
  reason: string;
};

export type DecideToolPermissionInput = {
  toolName: string;
  objective?: string;
  node?: string;
  locale?: "en" | "zh";
  liveModelPreapproved?: boolean;
  savedApprovals?: ToolPermissionApprovalRecord[];
};

export type DecideRoleToolPermissionInput = DecideToolPermissionInput & {
  role: AgentCapabilityRole;
};

export type ToolPermissionApprovalRecord = {
  id: string;
  runId: string;
  toolName: string;
  node: string;
  category: ToolPermissionCategory;
  risk: ToolPermissionRisk;
  decision: ToolPermissionDecisionValue;
  status: ToolPermissionApprovalStatus;
  scope: ToolPermissionApprovalScope;
  requestedBy: AgentCapabilityRole;
  createdAt: string;
  reason: string;
};

export type CreatePermissionApprovalRecordOptions = {
  runId: string;
  requestedBy: AgentCapabilityRole;
  createdAt?: string;
  status?: ToolPermissionApprovalStatus;
  scope?: ToolPermissionApprovalScope;
};

export function decideToolPermission(input: DecideToolPermissionInput): ToolPermissionDecision {
  const category = classifyToolCategory(input);
  const risk = riskForCategory(category);
  const savedApproval = matchingSavedApproval(input, category);
  const decision = decisionForCategory(category, input);
  const finalDecision = savedApproval && decision === "requires_human" ? "auto" : decision;

  return {
    toolName: input.toolName,
    node: input.node ?? "unknown",
    category,
    risk,
    decision: finalDecision,
    reason: savedApproval && decision === "requires_human"
      ? `Allowed by saved approval ${savedApproval.id}.`
      : reasonFor({ ...input, category, risk, decision: finalDecision })
  };
}

export function decideRoleToolPermission(input: DecideRoleToolPermissionInput): ToolPermissionDecision {
  const base = decideToolPermission(input);
  const roleBlockReason = roleBlockReasonFor(input.role, base.category, input.locale);

  if (roleBlockReason) {
    return {
      ...base,
      risk: base.risk === "low" ? "medium" : base.risk,
      decision: "blocked",
      reason: roleBlockReason
    };
  }

  return base;
}

export function createPermissionApprovalRecord(
  decision: ToolPermissionDecision,
  options: CreatePermissionApprovalRecordOptions
): ToolPermissionApprovalRecord {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const status = options.status ?? "pending";
  const scope = options.scope ?? "run";
  const id = [
    options.runId,
    decision.node,
    decision.toolName,
    createdAt
  ]
    .map(safeIdSegment)
    .join(":");

  return {
    id,
    runId: options.runId,
    toolName: decision.toolName,
    node: decision.node,
    category: decision.category,
    risk: decision.risk,
    decision: decision.decision,
    status,
    scope,
    requestedBy: options.requestedBy,
    createdAt,
    reason: decision.reason
  };
}

function classifyToolCategory(input: DecideToolPermissionInput): ToolPermissionCategory {
  const text = `${input.toolName} ${input.objective ?? ""}`.toLowerCase();

  if (/delete|deploy|production|prod|drop|truncate|destroy|删除|部署|生产|清空|销毁/.test(text)) {
    return "production_operation";
  }

  if (/paid|billing|charge|costly|generate image|image generation|api_generate|付费|扣费|生图|生成图片/.test(text)) {
    return "paid_operation";
  }

  if (/live|provider|model|llm|openai|deepseek|gemini|模型/.test(text)) {
    return "live_model_call";
  }

  if (/http|external|webhook|email|send|notify|api|外部|邮件|通知/.test(text)) {
    return "external_api_call";
  }

  if (input.toolName.includes("memory_agent")) {
    return "local_file_write";
  }

  if (/write|save|sqlite|checkpoint|persist|local_file|pdf|export|写入|保存|持久化|导出/.test(text)) {
    return "local_file_write";
  }

  return "read_only";
}

function matchingSavedApproval(
  input: DecideToolPermissionInput,
  category: ToolPermissionCategory
): ToolPermissionApprovalRecord | undefined {
  return input.savedApprovals?.find(
    (approval) =>
      approval.status === "approved" &&
      approval.toolName === input.toolName &&
      approval.category === category &&
      (approval.scope === "tool" || approval.node === (input.node ?? "unknown"))
  );
}

function roleBlockReasonFor(
  role: AgentCapabilityRole,
  category: ToolPermissionCategory,
  locale: "en" | "zh" | undefined
): string | undefined {
  const zh = locale === "zh";

  if (role === "planner_agent" && category !== "read_only") {
    return zh
      ? "Planner Agent 只能规划和读取上下文，不能写入状态、调用外部服务或执行高成本工具。"
      : "Planner Agent can only plan and read context; it cannot write state, call external services, or execute high-cost tools.";
  }

  if (role === "critic_agent" && category !== "read_only") {
    return zh
      ? "Critic Agent 只能验收和提出问题，不能执行会改变状态或产生外部副作用的工具。"
      : "Critic Agent can only review and raise findings; it cannot execute state-changing or external side-effect tools.";
  }

  if (role === "memory_agent" && category !== "read_only" && category !== "local_file_write") {
    return zh
      ? "Memory Agent 只能读写受控记忆和 checkpoint，不能调用真实模型、外部 API 或生产操作。"
      : "Memory Agent can only read/write bounded memory and checkpoints; it cannot call live models, external APIs, or production operations.";
  }

  if (role === "supervisor_agent" && category !== "read_only" && category !== "production_operation") {
    return zh
      ? "Supervisor Agent 只能暂停、终止或升级人工复审，不能直接执行普通工具调用。"
      : "Supervisor Agent can pause, stop, or escalate human review; it cannot directly execute normal tool calls.";
  }

  return undefined;
}

function riskForCategory(category: ToolPermissionCategory): ToolPermissionRisk {
  if (category === "read_only") {
    return "low";
  }

  if (category === "local_file_write" || category === "live_model_call" || category === "external_api_call") {
    return "medium";
  }

  return "high";
}

function decisionForCategory(
  category: ToolPermissionCategory,
  input: DecideToolPermissionInput
): ToolPermissionDecisionValue {
  if (category === "production_operation") {
    return "blocked";
  }

  if (category === "paid_operation") {
    return "requires_human";
  }

  if (category === "live_model_call") {
    return input.liveModelPreapproved ? "auto" : "requires_human";
  }

  if (category === "external_api_call") {
    return "requires_human";
  }

  return "auto";
}

function reasonFor(input: DecideToolPermissionInput & {
  category: ToolPermissionCategory;
  risk: ToolPermissionRisk;
  decision: ToolPermissionDecisionValue;
}): string {
  const zh = input.locale === "zh";

  if (input.category === "production_operation") {
    return zh
      ? "该动作可能影响生产环境或删除数据，QuorumMind 只生成建议，不自动执行。"
      : "This action may affect production or delete data, so QuorumMind blocks automatic execution.";
  }

  if (input.category === "paid_operation") {
    return zh
      ? "该动作可能产生费用，需要人工确认后才能执行。"
      : "This action may spend money and requires human approval.";
  }

  if (input.category === "live_model_call") {
    return input.liveModelPreapproved
      ? zh
        ? "用户本轮已选择真实模型流程，调用仍受阶段预算、重试和 Schema 校验约束。"
        : "The user selected live model mode for this run; the call remains bounded by phase budget, retry, and schema gates."
      : zh
        ? "真实模型调用需要人工确认，避免无依据消耗 API。"
        : "Live model calls require approval to avoid ungrounded API spend.";
  }

  if (input.category === "external_api_call") {
    return zh
      ? "外部 API 或通知动作会产生系统外副作用，需要人工确认。"
      : "External API or notification actions can cause side effects and require approval.";
  }

  if (input.category === "local_file_write") {
    return zh
      ? "该动作只写入本地有界 checkpoint、记忆或审计状态，可以自动执行。"
      : "This action writes only bounded local checkpoint, memory, or audit state, so it can run automatically.";
  }

  return zh
    ? "只读分析动作不会修改外部状态，可以自动执行。"
    : "Read-only analysis does not mutate external state and can run automatically.";
}

function safeIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "value";
}
