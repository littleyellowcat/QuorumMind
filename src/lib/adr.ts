import type { ADR, Risk } from "./domain";
import { localizeKnownDecisionText } from "./localization";

export type ADRLocale = "en" | "zh";

export function generateADR(adr: ADR, locale: ADRLocale = "en"): string {
  const labels = adrLabels[locale];

  return [
    `# ${labels.adr}: ${localizeText(adr.title, locale)}`,
    "",
    `**${labels.status}:** ${localizeStatus(adr.status, locale)}`,
    `**${labels.reviewDate}:** ${adr.reviewDate}`,
    "",
    `## ${labels.context}`,
    localizeText(adr.context, locale),
    "",
    `## ${labels.decision}`,
    localizeText(adr.decision, locale),
    "",
    `## ${labels.alternatives}`,
    formatList(adr.alternatives.map((item) => localizeText(item, locale)), locale),
    "",
    `## ${labels.consequences}`,
    formatList(adr.consequences.map((item) => localizeText(item, locale)), locale),
    "",
    `## ${labels.delphi}`,
    formatDelphiRounds(adr.delphiRounds, locale),
    "",
    `## ${labels.assumptionLedger}`,
    formatAssumptionLedger(adr.assumptionLedger, locale),
    "",
    `## ${labels.regretMap}`,
    formatRegretMap(adr.regretMap, locale),
    "",
    `## ${labels.topsis}`,
    formatTopsisLens(adr.topsisLens, locale),
    "",
    `## ${labels.monteCarlo}`,
    formatMonteCarloStress(adr.monteCarloStress, locale),
    "",
    `## ${labels.ahp}`,
    formatAHPAnalysis(adr.ahpAnalysis, locale),
    "",
    `## ${labels.risks}`,
    formatRisks(adr.risks, locale),
    "",
    `## ${labels.rollback}`,
    formatList(adr.rollbackPlan.map((item) => localizeText(item, locale)), locale)
  ].join("\n");
}

export function formatList(items: string[], locale: ADRLocale = "en"): string {
  if (items.length === 0) {
    return locale === "zh" ? "- 无" : "- None";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function formatRisks(risks: Risk[], locale: ADRLocale): string {
  if (risks.length === 0) {
    return locale === "zh" ? "- 未识别到主要风险。" : "- No major risks identified.";
  }

  return risks
    .map(
      (risk) =>
        `- **${localizeRiskCategory(risk.category, locale)} (${localizeSeverity(risk.severity, locale)})**: ${localizeText(
          risk.description,
          locale
        )}\n  - ${adrLabels[locale].mitigation}: ${localizeText(risk.mitigation, locale)}`
    )
    .join("\n");
}

function formatAssumptionLedger(entries: ADR["assumptionLedger"] | undefined, locale: ADRLocale): string {
  if (!entries || entries.length === 0) {
    return locale === "zh" ? "- 未记录假设。" : "- No assumptions were recorded.";
  }

  return entries
    .map(
      (entry) =>
        `- **${localizeText(entry.assumption, locale)}** [${localizeSeverity(entry.riskLevel, locale)}] (${formatProposalId(
          entry.proposalId,
          locale
        )})\n  - ${adrLabels[locale].validationQuestion}: ${localizeText(
          entry.validationQuestion,
          locale
        )}\n  - ${adrLabels[locale].validationAction}: ${localizeText(entry.validationAction, locale)}`
    )
    .join("\n");
}

function formatDelphiRounds(rounds: ADR["delphiRounds"] | undefined, locale: ADRLocale): string {
  if (!rounds || rounds.length === 0) {
    return locale === "zh" ? "- 未记录 Delphi 轮次。" : "- No Delphi rounds were recorded.";
  }

  return rounds
    .map(
      (round) =>
        `- **${localizeDelphiTitle(round.title, locale)}** (${localizeStatus(round.status, locale)}, ${localizeAnonymity(
          round.anonymity,
          locale
        )})\n  - ${adrLabels[locale].inputs}: ${round.inputCount}; ${adrLabels[locale].outputs}: ${
          round.outputCount
        }\n  - ${localizeText(round.summary, locale)}`
    )
    .join("\n");
}

function formatRegretMap(entries: ADR["regretMap"] | undefined, locale: ADRLocale): string {
  if (!entries || entries.length === 0) {
    return locale === "zh" ? "- 未记录后悔场景。" : "- No regret scenarios were recorded.";
  }

  return entries
    .slice(0, 5)
    .map(
      (entry) =>
        locale === "zh"
          ? `- **#${entry.minimaxRank} ${formatProposalId(entry.proposalId, locale)}**：最坏后悔值 ${
              entry.worstRegret
            }，场景 ${localizeScenario(entry.worstScenario, locale)}；平均后悔值 ${entry.averageRegret}。`
          : `- **#${entry.minimaxRank} ${entry.proposalId}**: worst-case regret ${entry.worstRegret} in ${entry.worstScenario}; average regret ${entry.averageRegret}.`
    )
    .join("\n");
}

function formatTopsisLens(entries: ADR["topsisLens"] | undefined, locale: ADRLocale): string {
  if (!entries || entries.length === 0) {
    return locale === "zh" ? "- 未记录 TOPSIS 条目。" : "- No TOPSIS lens entries were recorded.";
  }

  return entries
    .slice(0, 5)
    .map(
      (entry) =>
        locale === "zh"
          ? `- **#${entry.topsisRank} ${formatProposalId(entry.proposalId, locale)}**：接近度 ${
              entry.closenessScore
            }/100；距理想解 ${entry.distanceToIdeal}；距负理想解 ${entry.distanceToAntiIdeal}。`
          : `- **#${entry.topsisRank} ${entry.proposalId}**: closeness ${entry.closenessScore}/100; distance to ideal ${entry.distanceToIdeal}; distance to anti-ideal ${entry.distanceToAntiIdeal}.`
    )
    .join("\n");
}

function formatMonteCarloStress(entries: ADR["monteCarloStress"] | undefined, locale: ADRLocale): string {
  if (!entries || entries.length === 0) {
    return locale === "zh" ? "- 未记录 Monte Carlo 压力条目。" : "- No Monte Carlo stress entries were recorded.";
  }

  return entries
    .slice(0, 5)
    .map(
      (entry) =>
        locale === "zh"
          ? `- **#${entry.monteCarloRank} ${formatProposalId(entry.proposalId, locale)}**：胜率 ${
              entry.winRate
            }%；平均模拟分 ${entry.averageScore}/100；下行 P10 ${entry.downsideP10}/100；最差模拟分 ${entry.worstScore}/100。`
          : `- **#${entry.monteCarloRank} ${entry.proposalId}**: win rate ${entry.winRate}%; average simulated score ${entry.averageScore}/100; downside P10 ${entry.downsideP10}/100; worst simulated score ${entry.worstScore}/100.`
    )
    .join("\n");
}

function formatAHPAnalysis(analysis: ADR["ahpAnalysis"] | undefined, locale: ADRLocale): string {
  if (!analysis) {
    return locale === "zh" ? "- 未记录 AHP 敏感性分析。" : "- No AHP sensitivity analysis was recorded.";
  }

  const scenarios = analysis.sensitivityScenarios
    .slice(0, 5)
    .map(
      (scenario) =>
        locale === "zh"
          ? `- **${localizeScenario(scenario.label, locale)}**：选择 ${formatProposalId(
              scenario.selectedProposalId,
              locale
            )}，裁决综合分 ${scenario.quorumScore}/100；${scenario.changedWinner ? "赢家发生变化" : "赢家稳定"}。`
          : `- **${scenario.label}**: selected ${scenario.selectedProposalId} with Decision Score ${scenario.quorumScore}/100; ${
              scenario.changedWinner ? "winner changed" : "winner stable"
            }.`
    )
    .join("\n");

  if (locale === "zh") {
    return [
      `- 一致性比率：${analysis.consistencyRatio}（${localizeConsistency(analysis.consistencyAssessment, locale)}）。`,
      `- 赢家稳定率：${analysis.stableWinnerRate}%。`,
      scenarios || "- 未记录敏感性场景。"
    ].join("\n");
  }

  return [
    `- Consistency ratio: ${analysis.consistencyRatio} (${analysis.consistencyAssessment}).`,
    `- stable winner rate: ${analysis.stableWinnerRate}%.`,
    scenarios || "- No sensitivity scenarios were recorded."
  ].join("\n");
}

const adrLabels = {
  en: {
    adr: "ADR",
    status: "Status",
    reviewDate: "Review Date",
    context: "Context",
    decision: "Decision",
    alternatives: "Alternatives Considered",
    consequences: "Consequences",
    delphi: "Delphi Consensus Protocol",
    assumptionLedger: "Assumption Ledger",
    regretMap: "Regret Map",
    topsis: "TOPSIS Decision Lens",
    monteCarlo: "Monte Carlo Stress Lens",
    ahp: "AHP Sensitivity Analysis",
    risks: "Risks",
    rollback: "Rollback Plan",
    mitigation: "Mitigation",
    validationQuestion: "Validation question",
    validationAction: "Validation action",
    inputs: "Inputs",
    outputs: "outputs"
  },
  zh: {
    adr: "ADR",
    status: "状态",
    reviewDate: "复审日期",
    context: "背景",
    decision: "决策",
    alternatives: "已考虑的替代方案",
    consequences: "影响",
    delphi: "德尔菲共识协议",
    assumptionLedger: "假设账本",
    regretMap: "后悔地图",
    topsis: "TOPSIS 决策视角",
    monteCarlo: "蒙特卡洛压力测试",
    ahp: "AHP 敏感性分析",
    risks: "风险",
    rollback: "回滚计划",
    mitigation: "缓解方式",
    validationQuestion: "验证问题",
    validationAction: "验证动作",
    inputs: "输入",
    outputs: "输出"
  }
} satisfies Record<ADRLocale, Record<string, string>>;

function localizeText(value: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return value;
  }

  const direct: Record<string, string> = {
    "Adopt shared-table tenancy with explicit tenant_id enforcement and upgrade triggers.": "采用共享表租户模型，并明确执行 tenant_id 边界与升级触发条件。",
    "Use shared-table tenancy for the SaaS MVP": "SaaS MVP 使用共享表租户模型",
    "Keep the Node.js backend as a modular monolith": "保持 Node.js 后端为模块化单体",
    "Use a small LangGraph workflow with typed validation checkpoints": "使用小型 LangGraph 工作流并设置类型化校验检查点",
    "A missing tenant boundary can expose cross-tenant data.": "租户边界缺失可能导致跨租户数据暴露。",
    "Centralize tenant-scoped data access and add authorization boundary tests.": "集中管理租户级数据访问，并补充授权边界测试。",
    "More isolated tenancy models increase migration, backup, and support operations.": "更强隔离的租户模型会增加迁移、备份和支持成本。",
    "Automate tenant lifecycle tasks before moving beyond shared tables.": "在超出共享表方案前，先自动化租户生命周期操作。",
    "Noisy tenants can stress shared indexes and connection pools.": "高负载租户可能压垮共享索引和连接池。",
    "Track per-tenant usage and add partitioning or premium isolation when needed.": "跟踪单租户用量，必要时增加分区或高级隔离。",
    "Splitting a small-team Node.js backend into services adds distributed debugging, deployment, and contract-management overhead.": "小团队把 Node.js 后端拆成多个服务，会增加分布式调试、部署和接口契约管理成本。",
    "Keep a modular monolith first, isolate bounded contexts in code, and extract only after ownership and scaling pressure are proven.": "先保持模块化单体，在代码中隔离边界上下文，只有在责任归属和扩展压力明确后再拆服务。",
    "Microservice infrastructure can consume the next six months of delivery capacity before customer-facing work ships.": "微服务基础设施可能在客户功能交付前消耗未来数月的研发产能。",
    "Use one deployable with strong module boundaries, CI checks, and explicit extraction triggers.": "保持单一部署单元，同时建立清晰模块边界、CI 检查和明确拆分触发条件。",
    "Network calls, partial failures, and version skew introduce reliability modes the current team may not be staffed to operate.": "网络调用、局部失败和版本不一致会引入当前团队未必有能力运维的可靠性问题。",
    "Add observability and background-job boundaries inside the monolith before introducing independent services.": "在引入独立服务前，先在单体内补齐可观测性和后台任务边界。",
    "A multi-agent content pipeline can drift if state, retries, and validation handoffs are implicit.": "如果状态、重试和校验交接不显式，多 Agent 内容流水线容易发生输出漂移。",
    "Use explicit graph state, typed intermediate artifacts, validation nodes, and human review checkpoints.": "使用显式图状态、类型化中间产物、校验节点和人工复审检查点。",
    "Choosing a graph framework too early can add ceremony before the production data schema is stable.": "在生产数据结构稳定前过早重度使用图框架，可能增加不必要的工程仪式。",
    "Start with a small LangGraph workflow and keep business transforms framework-light and testable.": "从小型 LangGraph 工作流开始，并让业务转换逻辑保持轻框架、可测试。",
    "Agents independently generated candidate decision paths before seeing peer arguments.": "智能体在看到同伴论点前，先独立生成候选决策路径。",
    "Proposal authorship was hidden so reviewers evaluated Proposal A/B/C-style content instead of model identity.": "提案作者身份被隐藏，评审者只评估 Proposal A/B/C 形式的内容，而不是模型身份。",
    "Agents challenged assumptions, hidden risks, and missing considerations in rival proposals.": "智能体质询竞争方案中的假设、隐藏风险和遗漏因素。",
    "Each proposal was revised after absorbing the strongest cross-agent objections.": "每个方案吸收跨智能体最强反对意见后完成修正。",
    "Rankings were aggregated with Borda count, weighted utility, confidence, and regret penalties.": "排序通过 Borda、加权效用、置信度和后悔惩罚进行聚合。",
    "The team has about 5 engineers.": "团队大约 5 名工程师。",
    "The next six months prioritize fast enterprise feature delivery.": "未来 6 个月优先快速交付企业客户功能。",
    "The current monolith can still be refactored without a rewrite.": "当前单体仍可通过重构演进，不需要重写。",
    "Can this assumption be validated before the next release gate?": "这个假设能否在下一个发布关口前验证？",
    "Review launch requirements with product and legal before implementation.": "实现前与产品和法务复核上线要求。",
    "Add the assumption to the ADR review checklist and owner it in the next design review.": "把该假设加入 ADR 评审清单，并在下一次设计评审中指定负责人。",
    "Capture an experiment or telemetry check that can retire this assumption.": "记录一个实验或遥测检查，用于验证并关闭该假设。"
  };

  return localizeKnownDecisionText(direct[value] ?? value, locale);
}

function formatProposalId(proposalId: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return proposalId;
  }

  const direct: Record<string, string> = {
    shared: "共享表方案",
    schema: "独立 Schema 方案",
    hybrid: "混合隔离方案",
    modular_monolith: "模块化单体",
    selective_extraction: "选择性拆分",
    microservices_now: "立即微服务化",
    langgraph: "LangGraph",
    langchain: "LangChain",
    custom_orchestration: "自研编排"
  };

  return direct[proposalId] ?? proposalId;
}

function localizeRiskCategory(category: Risk["category"], locale: ADRLocale): string {
  if (locale !== "zh") {
    return category;
  }

  return {
    performance: "性能",
    reliability: "可靠性",
    security: "安全",
    cost: "成本",
    complexity: "复杂度",
    migration: "迁移",
    vendor_lock_in: "供应商锁定"
  }[category];
}

function localizeSeverity(severity: Risk["severity"], locale: ADRLocale): string {
  if (locale !== "zh") {
    return severity;
  }

  return { low: "低", medium: "中", high: "高" }[severity];
}

function localizeStatus(status: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return status;
  }

  return status === "complete" ? "完成" : status === "accepted" ? "已接受" : status === "proposed" ? "已提议" : "已替代";
}

function localizeAnonymity(anonymity: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return anonymity;
  }

  return { open: "公开", blind: "匿名", "n/a": "不适用" }[anonymity] ?? anonymity;
}

function localizeDelphiTitle(title: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return title;
  }

  const direct: Record<string, string> = {
    "Proposal Round": "独立提案轮",
    "Blind Review": "匿名评审",
    "Cross-Examination": "交叉质询",
    "Revision Round": "修正轮",
    "Consensus Scoring": "裁决综合评分",
    "Final Verdict": "最终裁决"
  };

  return direct[title] ?? title;
}

function localizeScenario(value: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return value;
  }

  const direct: Record<string, string> = {
    launchPressure: "上线压力",
    complianceTightening: "合规收紧",
    enterpriseScale: "企业规模增长",
    budgetCut: "预算收缩",
    securityPriority: "安全优先",
    reliabilityPriority: "可靠性优先",
    deliveryPressure: "交付压力",
    capacityShock: "团队产能冲击",
    integrationDebt: "集成债务"
  };

  return direct[value] ?? value;
}

function localizeConsistency(value: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return value;
  }

  return { strong: "强", acceptable: "可接受", review: "需复核" }[value] ?? value;
}
