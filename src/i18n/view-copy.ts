import type { AgentRole, CriteriaScores, DecisionContext, DecisionMode, Risk } from "../lib/domain";
import type { BlueprintAgentRole } from "../lib/blueprint";
import type { Locale, WorkspaceMode } from "../types/app";

export const runProfiles: DecisionMode[] = ["fast", "deep", "red_team"];
export const DECISION_REVIEW_TARGET_SCORE = 80;
export const DECISION_REVIEW_MAX_ROUNDS = 2;
export const blueprintDefaultQuestions: Record<Locale, string> = {
  en: "I want to build a visual-novel style game with multiple agents. What should the workflow look like, how many agents should collaborate, and how should novel text, characters, scenes, dialogue, and assets be structured?",
  zh: "我想做一个视觉类游戏，使用多 agent 处理小说文本，完整工作流是什么样，应该设计多少个 agent 协同，人物字段和场景字段怎么设计？"
};

export const questionExamples: Record<WorkspaceMode, Record<Locale, string[]>> = {
  decision: {
    en: [
      "Should our small team rebuild the old admin system now, or keep shipping customer features first?",
      "For an AI support knowledge base, should we start with Elasticsearch, add vector search, or use a managed RAG service?",
      "Enterprise customers keep asking for private deployment. Should we support it now?",
      "Should our 5-person team split the Node.js monolith into microservices this year?",
      "For the MVP, should we build payments ourselves or integrate a third-party payment provider first?",
      "Should our analytics dashboard use real-time computation, or start with daily offline reports?"
    ],
    zh: [
      "我们现在要不要重构老后台系统？团队 4 人，但客户功能也还要继续交付。",
      "AI 客服知识库先用 Elasticsearch，还是上向量数据库，或者直接用托管 RAG 服务？",
      "企业客户一直要求私有化部署，我们现在要不要支持？",
      "我们 5 人团队今年要不要把 Node.js 单体后端拆成微服务？",
      "MVP 阶段支付系统应该自己做，还是先接第三方支付？",
      "数据看板应该先做实时计算，还是先做每天一次的离线报表？"
    ]
  },
  blueprint: {
    en: [
      "I want to build an AI support assistant for a small customer service team. Help me design the whole workflow.",
      "I want to build an AI sales lead assistant that reads CRM notes and suggests who to follow up with first.",
      "I want to build an AI course content workbench for internal training. How should the product be designed?",
      "I want to build an AI operations assistant for cross-border ecommerce stores. It should read orders, inventory, ads, and support chats.",
      "I want to build a small team project management agent that turns meetings into tasks, risks, and weekly summaries.",
      "I want to build an AI document review tool for contracts and policies. How should the agents, schemas, and review flow work?"
    ],
    zh: [
      "我想做一个给小客服团队用的 AI 客服助手，帮我设计一下整体流程。",
      "我想做一个 AI 销售线索助手，可以看 CRM 记录，然后告诉销售先跟进谁。",
      "我想做一个企业培训课程内容生成工具，帮我设计这个产品应该怎么做。",
      "我想做一个跨境电商 AI 运营助手，能看订单、库存、广告和客服对话，然后给运营建议。",
      "我想做一个小团队项目管理 Agent，把会议内容变成任务、风险和周报。",
      "我想做一个合同和制度文档的 AI 审查工具，帮我设计 Agent、Schema 和复审流程。"
    ]
  }
};

export const appCopy = {
  en: {
    productName: "QuorumMind",
    productKind: "Decision and Blueprint Studio",
    language: "Interface language",
    headline: "Use multi-model collaboration to make better decisions and plans.",
    sublead:
      "Enter a decision question or open-ended request. QuorumMind organizes models and agents to discuss, challenge, revise, and produce a clear conclusion, execution path, risks, and exportable reports.",
    landingNavDecision: "Decision room",
    landingNavBlueprint: "Blueprint",
    landingNavEval: "Evaluation",
    landingNavExport: "Export",
    landingKicker: "Multi-agent decision intelligence",
    landingHeadline: "Turn complex choices into reviewable decisions.",
    landingSublead:
      "QuorumMind lets models and agents draft independently, challenge each other, revise toward consensus, and produce traceable decisions, blueprints, risk ledgers, and final PDFs.",
    landingMetricAlgorithms: "9 lenses",
    landingMetricAlgorithmsLabel: "Borda / AHP / TOPSIS and risk lenses",
    landingMetricAgents: "5+ seats",
    landingMetricAgentsLabel: "Configurable agents and live providers",
    landingMetricThreshold: "80%",
    landingMetricThresholdLabel: "Configured gate, not the current score",
    landingVisualLabel: "Consensus engine",
    landingVisualCenter: "Quorum Engine",
    landingVisualScoreLabel: "Consensus gate",
    landingVisualInput: "Question",
    landingVisualOutput: "ADR / Blueprint",
    landingNodeProposal: "Propose",
    landingNodeCritique: "Critique",
    landingNodeRevision: "Revise",
    landingNodeScore: "Score",
    landingNodeRisk: "Risk",
    landingNodeExport: "Export",
    enterWorkbench: "Enter workbench",
    landingSecondary: "Try with a sample question",
    landingBadge: "Decision Room + Blueprint Room",
    landingProof: "Borda, Bayesian voting, minimax regret, TOPSIS, Monte Carlo, AHP, Decision Score, and Dissent Index are surfaced as explainable evidence.",
    landingDecision: "Decision questions",
    landingDecisionText: "Compare paths, surface disagreement, and export an ADR or simple final PDF.",
    landingBlueprint: "Open-ended blueprints",
    landingBlueprintText: "Turn broad requirements into agents, workflow, schemas, milestones, and risks.",
    landingTrace: "Transparent process",
    landingTraceText: "See source status, model traces, consensus rounds, and fallback labels.",
    workspaceLabel: "Workspace",
    workspaceDecision: "Decision Room",
    workspaceBlueprint: "Blueprint",
    questionLabel: "Architecture question",
    blueprintQuestionLabel: "Blueprint request",
    decisionModeLabel: "Run profile",
    runDecision: "Run decision room",
    runBlueprint: "Run Blueprint room",
    runAgent: "Run Agent platform",
    cancel: "Cancel",
    copied: "Copied.",
    settings: "Settings",
    setupReadiness: "Setup readiness",
    providerTest: "Test model connections",
    providerTesting: "Testing...",
    contextTitle: "Decision context",
    stagesTitle: "Workflow stages",
    historyTitle: "History",
    historyEmpty: "No saved runs yet.",
    finalVerdict: "Final Verdict",
    quorumScore: "Decision Score",
    dissentIndex: "Dissent Index",
    confidence: "Confidence",
    source: "Source",
    traceCalls: "Trace calls",
    schemaUsable: "Schema valid",
    agentCouncil: "Agent Council",
    tradeoffRanking: "Trade-off Ranking",
    riskRadar: "Risk Radar",
    preMortem: "Pre-Mortem",
    assumptionLedger: "Assumption Ledger",
    regretMap: "Regret Map",
    adr: "Architecture Decision Record",
    scoreTransparency: "Scoring transparency",
    stability: "Stability reading",
    spread: "Proposal distribution",
    dissentDrivers: "Why dissent is high",
    riskMatrix: "Risk matrix",
    delphi: "Delphi protocol",
    modelTrace: "Model trace",
    promptBundle: "Prompt bundle",
    readyTitle: "Workspace ready",
    readyText: "Enter a question and run. The center and right panels update from the current result.",
    exportAdr: "Export ADR",
    exportJson: "Export JSON",
    exportReport: "Export report",
    exportSimplePdf: "Export simple PDF",
    copyPrompt: "Copy Prompt bundle",
    feedbackHelpful: "Mark helpful",
    feedbackNeutral: "Neutral",
    feedbackUnhelpful: "Mark weak",
    blueprintTitle: "Blueprint result",
    blueprintSummary: "Final plan",
    consensus: "Consensus",
    threshold: "Threshold",
    recommendedAgents: "Agents",
    workflow: "Workflow",
    schemas: "Schemas",
    targetOutputs: "Target outputs",
    successCriteria: "Success criteria",
    systemAgents: "System agents",
    implementationPlan: "Implementation plan",
    evaluationMatrix: "Quality matrix",
    detailedRecommendations: "Detailed recommendations",
    adoptionLedger: "Critique adoption",
    implementationBacklog: "Implementation backlog",
    blueprintProcess: "Blueprint process map",
    blueprintModelCalls: "Blueprint model calls",
    blueprintHistoryComparison: "History comparison",
    exportBlueprint: "Export Blueprint",
    exportBlueprintPdf: "Export PDF report",
    copyBlueprint: "Copy Blueprint",
    fastDeterministic: "Fast deterministic",
    liveDeepBlueprint: "Live model deep Blueprint",
    agentRuntime: "Agent runtime",
    checkpointThread: "检查点线程",
    maxRounds: "Max discussion rounds",
    humanReviewNote: "Human review note",
    costEstimate: "Cost estimate",
    estimatedCalls: "Calls",
    estimatedTokens: "Tokens",
    timeoutWindow: "Timeout",
    agentPlatformRun: "Agent platform run",
    routeMap: "Route map",
    humanReviewPackage: "Human review package",
    copyReviewPackage: "Copy review package",
    noLiveModel:
      "Live providers were not used. This run is a deterministic local result.",
    liveFallback:
      "Live mode was requested, but valid model output was not available. The final answer is deterministic synthesis.",
    liveUsed:
      "Valid live model trace contributed to this result. The final output is still normalized by QuorumMind.",
    demoSource: "Deterministic local",
    liveSource: "Live model trace",
    fallbackSource: "Live fallback",
    modeFast: "Fast smoke test",
    modeDeep: "Deep Quorum",
    modeRedTeam: "Red-team adversarial",
    reportLanguageNote:
      "User-facing labels are localized; deterministic fallback may contain template-derived text, while live provider prompts request the selected language."
  },
  zh: {
    productName: "QuorumMind",
    productKind: "决策与方案蓝图工作台",
    language: "界面语言",
    headline: "用多模型协作生成更可靠的决策与方案。",
    sublead: "输入一个决策问题或开放式需求，QuorumMind 会组织多个模型/智能体进行讨论、质询和修订，最终给出清晰结论、执行路径、风险提醒和可导出的报告。",
    landingNavDecision: "决策室",
    landingNavBlueprint: "方案蓝图",
    landingNavEval: "评估",
    landingNavExport: "导出",
    landingKicker: "多智能体决策智能",
    landingHeadline: "让复杂决策形成可审查共识。",
    landingSublead:
      "QuorumMind 让多个模型和智能体先独立提案，再互评、挑刺、修订，最后把结论、蓝图、风险账本和可导出的最终方案沉淀下来。",
    landingMetricAlgorithms: "9 类",
    landingMetricAlgorithmsLabel: "Borda / AHP / TOPSIS 等透镜",
    landingMetricAgents: "5+ 席",
    landingMetricAgentsLabel: "可配置 Agent 与真实模型",
    landingMetricThreshold: "80%",
    landingMetricThresholdLabel: "配置阈值，不是本次分数",
    landingVisualLabel: "共识引擎",
    landingVisualCenter: "Quorum 引擎",
    landingVisualScoreLabel: "共识阈值",
    landingVisualInput: "问题输入",
    landingVisualOutput: "ADR / 蓝图",
    landingNodeProposal: "提案",
    landingNodeCritique: "质询",
    landingNodeRevision: "修订",
    landingNodeScore: "评分",
    landingNodeRisk: "风险",
    landingNodeExport: "导出",
    enterWorkbench: "进入工作台",
    landingSecondary: "用示例问题试用",
    landingBadge: "决策室 + 方案蓝图",
    landingProof: "Borda、贝叶斯投票、最小最大后悔、TOPSIS、蒙特卡洛、AHP、裁决综合分和分歧指数都会作为可解释证据展示。",
    landingDecision: "决策问题",
    landingDecisionText: "比较不同路径，暴露分歧，并导出 ADR 或简版最终 PDF。",
    landingBlueprint: "开放式蓝图",
    landingBlueprintText: "把宽泛需求拆成 Agent 分工、工作流、数据结构、里程碑和风险。",
    landingTrace: "过程透明",
    landingTraceText: "展示来源状态、模型轨迹、共识轮次和兜底标识。",
    workspaceLabel: "工作区",
    workspaceDecision: "决策室",
    workspaceBlueprint: "方案蓝图",
    questionLabel: "架构问题",
    blueprintQuestionLabel: "蓝图需求",
    decisionModeLabel: "运行配置",
    runDecision: "运行决策室",
    runBlueprint: "运行蓝图室",
    runAgent: "运行 Agent 平台",
    cancel: "取消",
    copied: "已复制。",
    settings: "设置",
    setupReadiness: "就绪检查",
    providerTest: "测试模型连接",
    providerTesting: "测试中...",
    contextTitle: "决策上下文",
    stagesTitle: "工作流阶段",
    historyTitle: "历史记录",
    historyEmpty: "暂无保存的运行记录。",
    finalVerdict: "最终裁决",
    quorumScore: "裁决综合分",
    dissentIndex: "分歧指数",
    confidence: "置信度",
    source: "结果来源",
    traceCalls: "调用记录",
    schemaUsable: "Schema 可用",
    agentCouncil: "专家委员会",
    tradeoffRanking: "方案排序",
    riskRadar: "风险雷达",
    preMortem: "失败预演",
    assumptionLedger: "假设账本",
    regretMap: "后悔地图",
    adr: "架构决策记录",
    scoreTransparency: "评分透明",
    stability: "稳定性解读",
    spread: "方案分布",
    dissentDrivers: "分歧来源",
    riskMatrix: "风险矩阵",
    delphi: "德尔菲协议",
    modelTrace: "模型调用链路",
    promptBundle: "Prompt 包",
    readyTitle: "工作区已就绪",
    readyText: "输入问题后运行，中间结果区和右侧分析区会按当前问题实时更新。",
    exportAdr: "导出 ADR",
    exportJson: "导出 JSON",
    exportReport: "导出报告",
    exportSimplePdf: "导出简版 PDF",
    copyPrompt: "复制 Prompt 包",
    feedbackHelpful: "标记有用",
    feedbackNeutral: "一般",
    feedbackUnhelpful: "标记较弱",
    blueprintTitle: "蓝图结果",
    blueprintSummary: "最终方案",
    consensus: "共识",
    threshold: "阈值",
    recommendedAgents: "建议 Agent 数",
    workflow: "工作流",
    schemas: "Schema",
    targetOutputs: "目标产物",
    successCriteria: "成功标准",
    systemAgents: "系统 Agent",
    implementationPlan: "实施计划",
    evaluationMatrix: "质量矩阵",
    detailedRecommendations: "详细建议",
    adoptionLedger: "质询采纳",
    implementationBacklog: "实施任务",
    blueprintProcess: "蓝图过程地图",
    blueprintModelCalls: "蓝图模型调用",
    blueprintHistoryComparison: "历史结果对比",
    exportBlueprint: "导出蓝图",
    exportBlueprintPdf: "导出 PDF 报告",
    copyBlueprint: "复制蓝图",
    fastDeterministic: "快速确定性",
    liveDeepBlueprint: "真实模型深度蓝图",
    agentRuntime: "Agent 运行时",
    checkpointThread: "检查点线程",
    maxRounds: "最多讨论轮次",
    humanReviewNote: "人工复审意见",
    costEstimate: "运行成本估算",
    estimatedCalls: "预计调用",
    estimatedTokens: "粗略 Token",
    timeoutWindow: "超时窗口",
    agentPlatformRun: "Agent 平台运行",
    routeMap: "路由路径图",
    humanReviewPackage: "人工复审包",
    copyReviewPackage: "复制复审包",
    noLiveModel: "未使用真实模型，本次为确定性本地结果。",
    liveFallback: "已请求真实模型，但没有可用结构化输出；最终结果来自确定性合成。",
    liveUsed: "真实模型轨迹已参与本次结果，最终内容仍经过 QuorumMind 结构化合成。",
    demoSource: "确定性本地结果",
    liveSource: "真实模型轨迹",
    fallbackSource: "真实模型兜底",
    modeFast: "快速冒烟测试",
    modeDeep: "深度评审",
    modeRedTeam: "红队对抗",
    reportLanguageNote:
      "界面已中文化；确定性兜底可能包含模板化内容，真实模型调用会要求按当前语言输出。"
  }
} satisfies Record<Locale, Record<string, string>>;

export const roleLabels: Record<Locale, Record<AgentRole, string>> = {
  en: {
    principal_architect: "Principal Architect",
    sre_reviewer: "SRE Reviewer",
    security_reviewer: "Security Reviewer",
    cost_engineer: "Cost Engineer",
    pragmatic_builder: "Pragmatic Builder"
  },
  zh: {
    principal_architect: "首席架构师",
    sre_reviewer: "SRE 评审",
    security_reviewer: "安全评审",
    cost_engineer: "成本工程师",
    pragmatic_builder: "务实构建者"
  }
};

export const blueprintRoleLabels: Record<Locale, Record<BlueprintAgentRole, string>> = {
  en: {
    product_strategist: "Product strategist",
    workflow_architect: "Workflow architect",
    schema_designer: "Schema designer",
    quality_reviewer: "Quality reviewer",
    delivery_planner: "Delivery planner"
  },
  zh: {
    product_strategist: "产品策略",
    workflow_architect: "流程架构",
    schema_designer: "Schema 设计",
    quality_reviewer: "质量评审",
    delivery_planner: "交付规划"
  }
};

export const criteriaLabels: Record<Locale, Record<keyof CriteriaScores, string>> = {
  en: {
    scalability: "Scalability",
    reliability: "Reliability",
    security: "Security",
    costEfficiency: "Cost efficiency",
    implementationComplexity: "Complexity",
    maintainability: "Maintainability",
    migrationFlexibility: "Migration flexibility",
    teamFit: "Team fit",
    timeToMarket: "Time to market",
    reversibility: "Reversibility"
  },
  zh: {
    scalability: "可扩展性",
    reliability: "可靠性",
    security: "安全性",
    costEfficiency: "成本效率",
    implementationComplexity: "实现复杂度",
    maintainability: "可维护性",
    migrationFlexibility: "迁移灵活性",
    teamFit: "团队适配",
    timeToMarket: "交付速度",
    reversibility: "可逆性"
  }
};

export const riskCategoryLabels: Record<Locale, Record<Risk["category"], string>> = {
  en: {
    performance: "Performance",
    reliability: "Reliability",
    security: "Security",
    cost: "Cost",
    complexity: "Complexity",
    migration: "Migration",
    vendor_lock_in: "Vendor lock-in"
  },
  zh: {
    performance: "性能",
    reliability: "可靠性",
    security: "安全",
    cost: "成本",
    complexity: "复杂度",
    migration: "迁移",
    vendor_lock_in: "供应商锁定"
  }
};

export const severityLabels: Record<Locale, Record<Risk["severity"], string>> = {
  en: { low: "Low", medium: "Medium", high: "High" },
  zh: { low: "低", medium: "中", high: "高" }
};

export const phaseLabels: Record<Locale, Record<string, string>> = {
	  en: {
	    proposal: "Proposal",
	    critique: "Critique",
	    revision: "Revision",
	    ranking: "Ranking",
	    final_verdict: "Final verdict",
	    blind_review: "Blind review",
	    cross_examination: "Cross-examination",
	    consensus: "Consensus",
	    draft: "Draft",
	    verification: "Verification",
	    final: "Final"
	  },
	  zh: {
	    proposal: "提案",
	    critique: "互评",
	    revision: "修订",
	    ranking: "排序",
	    final_verdict: "最终裁决",
	    blind_review: "匿名评审",
	    cross_examination: "交叉质询",
	    consensus: "共识聚合",
	    draft: "草案",
	    verification: "验证",
	    final: "最终"
	  }
	};

export const workflowStages: Record<WorkspaceMode, Record<Locale, string[]>> = {
  decision: {
    en: ["Intake", "Proposal", "Blind critique", "Revision", "Consensus", "ADR"],
    zh: ["需求输入", "独立提案", "匿名互评", "反驳修正", "共识聚合", "ADR"]
  },
  blueprint: {
    en: ["Request understanding", "Drafts", "Cross-review", "Revision loop", "Consensus threshold", "Blueprint export"],
    zh: ["需求理解", "多方草案", "交叉质询", "循环修订", "共识阈值", "蓝图导出"]
  }
};
