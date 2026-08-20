import type { DecisionContext, DecisionMode } from "./domain";
import type { AutonomousBlueprintRun, DecisionApiHealth } from "./api-client";
import { localizeKnownDecisionText } from "./localization";
import { appCopy } from "../i18n/view-copy";
import type { Locale, ProviderTraceEntry, TraceStats } from "../types/app";

export function traceStats(trace: ProviderTraceEntry[]): TraceStats {
  return trace.reduce<TraceStats>(
    (acc, entry) => {
      acc.calls += 1;
      acc.totalMs += entry.durationMs;
      if (entry.status === "ok") acc.ok += 1;
      if (entry.status === "error") acc.failed += 1;
      if (entry.jsonParsed) acc.jsonParsed += 1;
      if (entry.validationStatus === "valid" || entry.validationStatus === "repaired") acc.schemaUsable += 1;
      if (entry.validationStatus === "repaired") acc.repaired += 1;
      return acc;
    },
    { calls: 0, ok: 0, failed: 0, jsonParsed: 0, schemaUsable: 0, repaired: 0, totalMs: 0 }
  );
}

export function modeLabel(mode: DecisionMode, locale: Locale): string {
  if (mode === "fast") return appCopy[locale].modeFast;
  if (mode === "red_team") return appCopy[locale].modeRedTeam;
  return appCopy[locale].modeDeep;
}

export function formatProposalId(proposalId: string, locale: Locale): string {
  const normalized = proposalId
    .replace("-proposal-revised", "")
    .replace("-proposal", "")
    .replaceAll("_", " ")
    .replaceAll("-", " ");
  return localizeText(toTitleCase(normalized), locale);
}

export function localizeText(value: string, locale: Locale): string {
  return localizeKnownDecisionText(value, locale);
}

export function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function statusLabel(status: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { strong: "Strong", watch: "Watch", weak: "Weak" },
    zh: { strong: "强", watch: "观察", weak: "偏弱" }
  };
  return labels[locale][status] ?? status;
}

export function priorityLabel(priority: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { high: "High priority", medium: "Medium priority", low: "Low priority" },
    zh: { high: "高优先级", medium: "中优先级", low: "低优先级" }
  };
  return labels[locale][priority] ?? priority;
}

export function adoptionLabel(status: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { adopted: "Adopted", partial: "Partial", deferred: "Deferred" },
    zh: { adopted: "已采纳", partial: "部分采纳", deferred: "延后" }
  };
  return labels[locale][status] ?? status;
}

export function statusValueLabel(status: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      complete: "complete",
      needs_review: "needs review",
      executed: "executed",
      requires_human: "requires human",
      pending: "pending",
      ready: "ready",
      blocked: "blocked",
      skipped: "skipped",
      ok: "ok",
      error: "error"
    },
    zh: {
      complete: "已完成",
      needs_review: "需复审",
      executed: "已执行",
      requires_human: "需人工确认",
      pending: "等待中",
      ready: "就绪",
      blocked: "已阻止",
      skipped: "已跳过",
      ok: "正常",
      error: "错误"
    }
  };
  return labels[locale][status] ?? status;
}

export function taskStatusLabel(status: string, locale: Locale): string {
  return statusValueLabel(status, locale);
}

export function executorStatusLabel(status: string, locale: Locale): string {
  return statusValueLabel(status, locale);
}

export function permissionDecisionLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      auto: "auto",
      requires_human: "requires human",
      blocked: "blocked"
    },
    zh: {
      auto: "自动执行",
      requires_human: "人工确认",
      blocked: "已阻止"
    }
  };
  return labels[locale][value] ?? value;
}

export function riskLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { low: "low risk", medium: "medium risk", high: "high risk" },
    zh: { low: "低风险", medium: "中风险", high: "高风险" }
  };
  return labels[locale][value] ?? value;
}

export function permissionCategoryLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      read_only: "read-only tool",
      local_file_write: "local file write",
      external_api_call: "external API call",
      live_model_call: "live model call",
      production_operation: "production operation",
      paid_operation: "paid operation"
    },
    zh: {
      read_only: "只读工具",
      local_file_write: "本地文件写入",
      external_api_call: "外部 API 调用",
      live_model_call: "真实模型调用",
      production_operation: "生产环境操作",
      paid_operation: "付费操作"
    }
  };
  return labels[locale][value] ?? value;
}

export function memoryActionLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { read: "read", write: "write", summarize: "summarize", inject: "inject", profile: "profile", compare: "compare", backlog: "backlog" },
    zh: { read: "读取", write: "写入", summarize: "摘要", inject: "注入", profile: "画像", compare: "对比", backlog: "回流" }
  };
  return labels[locale][value] ?? value;
}

export function supervisorDecisionLabelUi(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { continue: "continue", pause_for_human: "pause for human", finalize: "finalize" },
    zh: { continue: "继续", pause_for_human: "暂停人工复审", finalize: "收敛" }
  };
  return labels[locale][value] ?? value;
}

export function traceValidationLabel(status: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      valid: "valid",
      repaired: "repaired",
      invalid: "invalid",
      unparsed: "unparsed",
      parsed: "parsed",
      not_configured: "not configured",
      error: "error",
      "n/a": "n/a"
    },
    zh: {
      valid: "有效",
      repaired: "已修复",
      invalid: "无效",
      unparsed: "未解析",
      parsed: "已解析",
      not_configured: "未配置",
      error: "错误",
      "n/a": "无"
    }
  };
  return labels[locale][status] ?? status;
}

export function anonymityLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { blind: "blind", open: "open", "n/a": "n/a" },
    zh: { blind: "匿名", open: "公开", "n/a": "不适用" }
  };
  return labels[locale][value] ?? value;
}

export function productStageLabel(value: DecisionContext["productStage"], locale: Locale): string {
  const labels: Record<Locale, Record<DecisionContext["productStage"], string>> = {
    en: { prototype: "prototype", mvp: "mvp", growth: "growth", scale: "scale", enterprise: "enterprise" },
    zh: { prototype: "原型", mvp: "MVP", growth: "增长期", scale: "规模化", enterprise: "企业级" }
  };
  return labels[locale][value];
}

export function sensitivityLabel(value: DecisionContext["securityRequirement"], locale: Locale): string {
  const labels: Record<Locale, Record<DecisionContext["securityRequirement"], string>> = {
    en: { low: "low", medium: "medium", high: "high" },
    zh: { low: "低", medium: "中", high: "高" }
  };
  return labels[locale][value];
}

export function domainLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      technical_architecture: "technical architecture",
      product_strategy: "product strategy",
      career_strategy: "career strategy",
      portfolio_packaging: "portfolio packaging"
    },
    zh: {
      technical_architecture: "技术架构",
      product_strategy: "产品策略",
      career_strategy: "职业策略",
      portfolio_packaging: "作品集包装"
    }
  };
  return labels[locale][value] ?? value;
}

export function agentSourceLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      deterministic_tools: "deterministic tools",
      live_model_trace_with_deterministic_synthesis: "live trace + deterministic synthesis"
    },
    zh: {
      deterministic_tools: "确定性本地工具",
      live_model_trace_with_deterministic_synthesis: "真实模型轨迹 + 确定性合成"
    }
  };
  return labels[locale][value] ?? value;
}

export function toolSourceLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { langchain_tool: "LangChain tool", live_model_provider: "live model provider" },
    zh: { langchain_tool: "LangChain 工具", live_model_provider: "真实模型提供方" }
  };
  return labels[locale][value] ?? value;
}

export function executionModeLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { deterministic: "deterministic", live: "live" },
    zh: { deterministic: "确定性", live: "真实模型" }
  };
  return labels[locale][value] ?? value;
}

export function fallbackReasonLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      deterministic_mode: "deterministic mode",
      provider_mode_demo: "provider mode is demo",
      no_configured_providers: "no configured providers",
      no_usable_live_trace: "no valid live trace",
      live_trace_error: "live trace error"
    },
    zh: {
      deterministic_mode: "确定性模式",
      provider_mode_demo: "当前是演示模式",
      no_configured_providers: "没有已配置的模型提供方",
      no_usable_live_trace: "没有可用真实模型轨迹",
      live_trace_error: "真实模型轨迹出错"
    }
  };
  return labels[locale][value] ?? value;
}

export function terminationReasonLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      threshold_met: "threshold met",
      round_budget_exhausted: "round budget exhausted",
      human_review_required: "human review required"
    },
    zh: {
      threshold_met: "达到阈值",
      round_budget_exhausted: "轮次预算耗尽",
      human_review_required: "需要人工复审"
    }
  };
  return labels[locale][value] ?? value;
}

export function routeReasonLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      threshold_met: "threshold met",
      round_budget_exhausted: "round budget exhausted",
      human_review_required: "human review required",
      below_threshold_can_revise: "below threshold, can revise"
    },
    zh: {
      threshold_met: "达到阈值",
      round_budget_exhausted: "轮次预算耗尽",
      human_review_required: "需要人工复审",
      below_threshold_can_revise: "低于阈值，可继续修订"
    }
  };
  return labels[locale][value] ?? value;
}

export function nodeLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      route_intent: "route intent",
      understand_request: "understand request",
      react_toolbox: "ReAct toolbox",
      planner_agent: "planner agent",
      memory_agent: "memory agent",
      executor_agent: "executor agent",
      draft_blueprint: "draft blueprint",
      live_model_review: "live model review",
      cross_review: "cross review",
      critic_agent: "critic agent",
      supervisor_agent: "supervisor agent",
      validate_result: "validate result",
      revise_discussion: "revise discussion",
      human_review_gate: "human review gate",
      finalize: "finalize"
    },
    zh: {
      route_intent: "意图路由",
      understand_request: "理解需求",
      react_toolbox: "ReAct 工具箱",
      planner_agent: "Planner 规划 Agent",
      memory_agent: "Memory 记忆 Agent",
      executor_agent: "Executor 执行 Agent",
      draft_blueprint: "起草蓝图",
      live_model_review: "真实模型评审",
      cross_review: "交叉评审",
      critic_agent: "Critic 批判 Agent",
      supervisor_agent: "Supervisor 主管 Agent",
      validate_result: "验证结果",
      revise_discussion: "修订讨论",
      human_review_gate: "人工复审门禁",
      finalize: "最终收敛"
    }
  };
  return labels[locale][value] ?? value;
}

export function agentPatternLabel(value: string | undefined, locale: Locale): string {
  if (value === "langgraph_workflow_agent") {
    return locale === "zh" ? "LangGraph 工作流 Agent" : "LangGraph Workflow Agent";
  }
  return value ?? (locale === "zh" ? "未记录" : "Not recorded");
}

export function agentLayerLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      intent_router: "Intent Router",
      clarifier_agent: "Clarifier Agent",
      multi_agent_debate: "Multi-Agent Debate",
      critique_revision: "Critique/Revision",
      evaluator_optimizer: "Evaluator-Optimizer",
      bounded_react_tools: "Bounded ReAct Tools",
      planner_executor_critic: "Planner/Executor/Critic",
      memory_agent: "Memory Agent",
      supervisor_agent: "Supervisor Agent",
      tool_permission_policy: "Tool Permission Policy",
      human_in_the_loop: "Human-in-the-loop"
    },
    zh: {
      intent_router: "意图路由",
      clarifier_agent: "澄清 Agent",
      multi_agent_debate: "多 Agent 互评",
      critique_revision: "质询修订",
      evaluator_optimizer: "评估优化器",
      bounded_react_tools: "受控 ReAct 工具",
      planner_executor_critic: "规划/执行/批判",
      memory_agent: "记忆 Agent",
      supervisor_agent: "主管 Agent",
      tool_permission_policy: "工具权限策略",
      human_in_the_loop: "人工复审"
    }
  };
  return labels[locale][value] ?? value;
}

export function intentCategoryLabelUi(value: string | undefined, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      decision: "Decision",
      blueprint: "Blueprint",
      agent_design: "Agent design",
      evaluation: "Evaluation",
      report_export: "Report export",
      localization: "Localization",
      security: "Security",
      general: "General"
    },
    zh: {
      decision: "决策取舍",
      blueprint: "方案蓝图",
      agent_design: "Agent 设计",
      evaluation: "评估",
      report_export: "报告导出",
      localization: "中文体验",
      security: "安全策略",
      general: "通用问题"
    }
  };
  return labels[locale][value ?? ""] ?? (locale === "zh" ? "未识别" : "Unknown");
}

export function intentRouteLabelUi(value: string | undefined, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      blueprint_graph: "Blueprint graph",
      decision_room_recommended: "Decision Room recommended",
      agent_eval_blueprint: "AgentEval blueprint",
      report_export_blueprint: "Report export blueprint",
      security_review_blueprint: "Security review blueprint"
    },
    zh: {
      blueprint_graph: "蓝图图编排",
      decision_room_recommended: "建议使用决策室",
      agent_eval_blueprint: "AgentEval 蓝图",
      report_export_blueprint: "报告导出蓝图",
      security_review_blueprint: "安全审查蓝图"
    }
  };
  return labels[locale][value ?? ""] ?? (locale === "zh" ? "默认蓝图路径" : "Default Blueprint route");
}

export function clarificationStrategyLabel(value: string | undefined, locale: Locale): string {
  if (value === "ask_before_running") return locale === "zh" ? "先澄清再运行" : "Ask before running";
  if (value === "answer_with_assumptions") return locale === "zh" ? "带假设继续" : "Continue with assumptions";
  return locale === "zh" ? "未记录" : "Not recorded";
}

export function evaluatorActionLabel(value: string | undefined, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { finalize: "finalize", revise: "revise", human_review: "human review" },
    zh: { finalize: "最终输出", revise: "继续修订", human_review: "人工复审" }
  };
  return labels[locale][value ?? ""] ?? (locale === "zh" ? "未记录" : "Not recorded");
}

export function gateStatusLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { pass: "Pass", warn: "Watch", fail: "Fail" },
    zh: { pass: "通过", warn: "关注", fail: "失败" }
  };
  return labels[locale][value] ?? value;
}

export function evaluatorCheckLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: {
      consensus_threshold: "Consensus threshold",
      actionable_backlog: "Actionable backlog",
      evaluation_matrix: "Evaluation matrix",
      critique_adoption: "Critique adoption",
      source_transparency: "Source transparency"
    },
    zh: {
      consensus_threshold: "共识阈值",
      actionable_backlog: "可执行 Backlog",
      evaluation_matrix: "评估矩阵",
      critique_adoption: "质询采纳",
      source_transparency: "来源透明"
    }
  };
  return labels[locale][value] ?? value;
}

export function yesNo(value: boolean, locale: Locale): string {
  return value ? (locale === "zh" ? "是" : "Yes") : locale === "zh" ? "否" : "No";
}

export function formatDuration(ms: number, locale: Locale): string {
  if (ms % 60_000 === 0) {
    const minutes = ms / 60_000;
    return locale === "zh" ? `${minutes} 分钟` : `${minutes}m`;
  }

  if (ms % 1000 === 0) {
    const seconds = ms / 1000;
    return locale === "zh" ? `${seconds} 秒` : `${seconds}s`;
  }

  return locale === "zh" ? `${ms} 毫秒` : `${ms}ms`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MiB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KiB`;
  }

  return `${bytes} B`;
}

export function connectionBadgeLabel(
  locale: Locale,
  health: DecisionApiHealth | null,
  currentProviderMode?: "demo" | "live"
): string {
  if (!health) {
    return locale === "zh" ? "API 未连接 · 本地兜底" : "API offline · local fallback";
  }

  const providerMode = currentProviderMode ?? health.providerMode;

  if (locale === "zh") {
    return `API 已连接 · ${providerMode === "live" ? "真实模型模式" : "演示模式"}`;
  }

  return `API connected · ${providerMode === "live" ? "live mode" : "demo mode"}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function estimateProviderCalls(maxProviderRounds: number): number {
  return Math.max(1, maxProviderRounds) * 3;
}

export function estimateTokens(maxProviderRounds: number): number {
  return Math.max(1, maxProviderRounds) * 18;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function shortId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `qm-${shortId()}`;
}

export function preferredLocale(): Locale {
  if (typeof navigator === "undefined") {
    return "zh";
  }

  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function readStoredValue<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

export function readStoredNumber(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function uniquePreviewItems(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function compactPreviewText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function renderHumanReviewPackage(run: AutonomousBlueprintRun, locale: Locale): string {
  const lines = [
    `# ${locale === "zh" ? "QuorumMind 人工复审包" : "QuorumMind Human Review Package"}`,
    "",
    `- ${locale === "zh" ? "线程" : "Thread"}: ${run.checkpoint.threadId}`,
    `- ${locale === "zh" ? "终止原因" : "Termination"}: ${terminationReasonLabel(run.summary.terminationReason, locale)}`,
    `- ${locale === "zh" ? "共识分" : "Consensus"}: ${run.summary.consensusScore}%`,
    `- ${locale === "zh" ? "最多轮次" : "Max rounds"}: ${run.runtimeLimits.maxConsensusRounds}`,
    "",
    `## ${locale === "zh" ? "路由历史" : "Route history"}`,
    ...run.routeDecisions.map(
      (decision) =>
        `- R${decision.round}: ${nodeLabel(decision.fromNode, locale)} -> ${nodeLabel(decision.toNode, locale)}; ${routeReasonLabel(
          decision.reason,
          locale
        )}; ${decision.consensusScore}/${decision.threshold}`
    ),
    "",
    `## ${locale === "zh" ? "阻塞项" : "Blocking issues"}`,
    ...(run.validation.blockingIssues.length
      ? run.validation.blockingIssues.map((item) => `- ${localizeText(item, locale)}`)
      : [`- ${locale === "zh" ? "无" : "None"}`]),
    "",
    `## ${locale === "zh" ? "剩余分歧" : "Remaining disagreements"}`,
    ...run.consensusLoop.slice(-1).flatMap((round) => round.remainingDisagreements.map((item) => `- ${localizeText(item, locale)}`)),
    "",
    `## ${locale === "zh" ? "下一步行动" : "Next actions"}`,
    ...run.summary.nextActions.map((item) => `- ${localizeText(item, locale)}`)
  ];
  return lines.join("\n");
}
