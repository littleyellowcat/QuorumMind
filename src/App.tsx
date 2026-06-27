import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type {
  Agent,
  AgentRole,
  AssumptionLedgerEntry,
  CriteriaScores,
  DecisionContext,
  DecisionMode,
  Proposal,
  Risk,
  ScoredProposal,
  Verdict
} from "./lib/domain";
import type {
  BlueprintAgentRole,
  BlueprintConsensusRound,
  BlueprintRoomResult
} from "./lib/blueprint";
import { runDecisionRoom } from "./lib/workflow";
import { contextForQuestion, defaultQuestions } from "./lib/question-context";
import {
  createManualProviderBundle,
  defaultManualProviderAgents,
  type ManualProviderAgent,
  type ManualProviderBundle
} from "./lib/manual-provider";
import {
  addDecisionHistoryRecord,
  hasBlueprintHistorySnapshot,
  hasDecisionHistorySnapshot,
  readDecisionHistoryRecords,
  type DecisionHistoryRecord
} from "./lib/decision-history";
import {
  getApiHealth,
  getApiSecurityPosture,
  downloadRenderedPdf,
  requestAutonomousBlueprintRun,
  requestBlueprintRoom,
  requestDecisionRoom,
  testProviderConnections,
  type AgentBlueprintApiResponse,
  type AutonomousBlueprintRun,
  type BlueprintApiResponse,
  type BlueprintExecutionMode,
  type BlueprintExecutionSummary,
  type DecisionApiHealth,
  type DecisionApiResponse,
  type ProviderConnectionTestResponse
} from "./lib/api-client";
import { applyModelReputation, inferDecisionDomain } from "./lib/model-reputation";
import {
  addModelReputationFeedback,
  createModelReputationFeedbackForAgents,
  readModelReputationFeedback
} from "./lib/reputation-feedback";
import { localizeKnownDecisionText } from "./lib/localization";
import { MetricCard } from "./components/Metric";
import {
  BlueprintCollapsiblePanel,
  CollapsibleSidePanel,
  HelpTooltip,
  PanelHeading
} from "./components/PanelTitle";
import "./styles.css";

gsap.registerPlugin(useGSAP);

type Locale = "en" | "zh";
type WorkspaceMode = "decision" | "blueprint";
type AppSurface = "landing" | "workbench";
type DecisionRoomResult = ReturnType<typeof runDecisionRoom>;
type ProviderTraceEntry = DecisionApiResponse["providerTrace"][number];
type ProviderStatus = DecisionApiResponse["providerStatus"];
type ApiSecurityPosture = Awaited<ReturnType<typeof getApiSecurityPosture>>;
type RunKind = "decision" | "decision-review" | "blueprint" | "agent" | "provider-test";

type RunProgress = {
  kind: RunKind;
  stage: string;
  progress: number;
  message: string;
  modelCall?: string;
};

type DecisionSnapshot = Pick<
  DecisionApiResponse,
  "providerMode" | "providerStatus" | "providerTrace" | "liveVerdict" | "promptBundle" | "persistence"
>;

type DecisionRunResponse = {
  response: DecisionApiResponse;
  fallbackError?: string;
};

type DecisionReviewRound = {
  round: number;
  mode: DecisionMode;
  score: number;
  deltaFromBest: number;
  dissentIndex: number;
  selectedProposalId: string;
  providerMode: DecisionApiResponse["providerMode"];
  traceCalls: number;
  reachedTarget: boolean;
  fallbackUsed: boolean;
  accepted: boolean;
};

type DecisionReviewLoopState = {
  targetScore: number;
  maxRounds: number;
  baselineScore: number;
  bestScore: number;
  status: "running" | "passed" | "needs_review" | "cancelled";
  rounds: DecisionReviewRound[];
  finalMessage: string;
};

type BlueprintSnapshot = Pick<
  BlueprintApiResponse,
  "providerMode" | "providerStatus" | "providerTrace" | "promptBundle" | "blueprintExecution"
>;

type TraceStats = {
  calls: number;
  ok: number;
  failed: number;
  jsonParsed: number;
  schemaUsable: number;
  repaired: number;
  totalMs: number;
};

const runProfiles: DecisionMode[] = ["fast", "deep", "red_team"];
const DECISION_REVIEW_TARGET_SCORE = 80;
const DECISION_REVIEW_MAX_ROUNDS = 2;
const blueprintDefaultQuestions: Record<Locale, string> = {
  en: "I want to build a visual-novel style game with multiple agents. What should the workflow look like, how many agents should collaborate, and how should novel text, characters, scenes, dialogue, and assets be structured?",
  zh: "我想做一个视觉类游戏，使用多 agent 处理小说文本，完整工作流是什么样，应该设计多少个 agent 协同，人物字段和场景字段怎么设计？"
};

const questionExamples: Record<WorkspaceMode, Record<Locale, string[]>> = {
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

const appCopy = {
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

const roleLabels: Record<Locale, Record<AgentRole, string>> = {
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

const blueprintRoleLabels: Record<Locale, Record<BlueprintAgentRole, string>> = {
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

const criteriaLabels: Record<Locale, Record<keyof CriteriaScores, string>> = {
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

const riskCategoryLabels: Record<Locale, Record<Risk["category"], string>> = {
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

const severityLabels: Record<Locale, Record<Risk["severity"], string>> = {
  en: { low: "Low", medium: "Medium", high: "High" },
  zh: { low: "低", medium: "中", high: "高" }
};

const phaseLabels: Record<Locale, Record<string, string>> = {
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

const workflowStages: Record<WorkspaceMode, Record<Locale, string[]>> = {
  decision: {
    en: ["Intake", "Proposal", "Blind critique", "Revision", "Consensus", "ADR"],
    zh: ["需求输入", "独立提案", "匿名互评", "反驳修正", "共识聚合", "ADR"]
  },
  blueprint: {
    en: ["Request understanding", "Drafts", "Cross-review", "Revision loop", "Consensus threshold", "Blueprint export"],
    zh: ["需求理解", "多方草案", "交叉质询", "循环修订", "共识阈值", "蓝图导出"]
  }
};

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => readStoredValue("quorummind.locale", preferredLocale()));
  const [appSurface, setAppSurface] = useState<AppSurface>("landing");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("decision");
  const [decisionMode, setDecisionMode] = useState<DecisionMode>("deep");
  const [decisionQuestions, setDecisionQuestions] = useState(defaultQuestions);
  const [blueprintQuestions, setBlueprintQuestions] = useState(blueprintDefaultQuestions);
  const [blueprintExecutionMode, setBlueprintExecutionMode] = useState<BlueprintExecutionMode>(() =>
    readStoredValue("quorummind.blueprint.executionMode", "live")
  );
  const [maxProviderRounds, setMaxProviderRounds] = useState(() =>
    readStoredNumber("quorummind.blueprint.maxProviderRounds", 5)
  );
  const [agentThreadId, setAgentThreadId] = useState<string>(() =>
    readStoredValue("quorummind.agent.threadId", `qm-${shortId()}`)
  );
  const [maxConsensusRounds, setMaxConsensusRounds] = useState(() =>
    readStoredNumber("quorummind.agent.maxConsensusRounds", 4)
  );
  const [humanReviewNote, setHumanReviewNote] = useState("");
  const [decisionResult, setDecisionResult] = useState<DecisionRoomResult | null>(null);
  const [decisionSnapshot, setDecisionSnapshot] = useState<DecisionSnapshot | null>(null);
  const [decisionReviewLoop, setDecisionReviewLoop] = useState<DecisionReviewLoopState | null>(null);
  const [blueprintResult, setBlueprintResult] = useState<BlueprintRoomResult | null>(null);
  const [blueprintSnapshot, setBlueprintSnapshot] = useState<BlueprintSnapshot | null>(null);
  const [agentRun, setAgentRun] = useState<AutonomousBlueprintRun | null>(null);
  const [health, setHealth] = useState<DecisionApiHealth | null>(null);
  const [securityPosture, setSecurityPosture] = useState<ApiSecurityPosture | null>(null);
  const [providerTest, setProviderTest] = useState<ProviderConnectionTestResponse | null>(null);
  const [historyRecords, setHistoryRecords] = useState<DecisionHistoryRecord[]>(() => readDecisionHistoryRecords());
  const [reputationFeedback, setReputationFeedback] = useState(() => readModelReputationFeedback());
  const [running, setRunning] = useState<RunProgress | null>(null);
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const t = appCopy[locale];
  const activeQuestion = workspaceMode === "decision" ? decisionQuestions[locale] : blueprintQuestions[locale];
  const activeContext = useMemo(() => contextForQuestion(activeQuestion), [activeQuestion]);
  const effectiveAgents = useMemo(
    () => applyModelReputation(defaultManualProviderAgents, { question: activeQuestion, context: activeContext }, reputationFeedback),
    [activeContext, activeQuestion, reputationFeedback]
  );
  const decisionTrace = decisionSnapshot?.providerTrace ?? [];
  const blueprintTrace = blueprintSnapshot?.providerTrace ?? agentRun?.providerTrace ?? [];
  const activePromptBundle =
    workspaceMode === "decision" ? decisionSnapshot?.promptBundle : blueprintSnapshot?.promptBundle;

  function updateCurrentQuestion(value: string) {
    setRuntimeNotice(null);

    if (workspaceMode === "decision") {
      setDecisionQuestions((current) => ({ ...current, [locale]: value }));
      setDecisionResult(null);
      setDecisionSnapshot(null);
      setDecisionReviewLoop(null);
    } else {
      setBlueprintQuestions((current) => ({ ...current, [locale]: value }));
      setBlueprintResult(null);
      setBlueprintSnapshot(null);
      setAgentRun(null);
    }
  }

  useEffect(() => {
    void refreshApiStatus();
  }, []);

  useEffect(() => {
    localStorage.setItem("quorummind.locale", locale);
  }, [locale]);

  useEffect(() => {
    localStorage.setItem("quorummind.blueprint.executionMode", blueprintExecutionMode);
  }, [blueprintExecutionMode]);

  useEffect(() => {
    localStorage.setItem("quorummind.blueprint.maxProviderRounds", String(maxProviderRounds));
  }, [maxProviderRounds]);

  useEffect(() => {
    localStorage.setItem("quorummind.agent.threadId", agentThreadId);
  }, [agentThreadId]);

  useEffect(() => {
    localStorage.setItem("quorummind.agent.maxConsensusRounds", String(maxConsensusRounds));
  }, [maxConsensusRounds]);

  useEffect(() => {
    if (!running) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRunning((current) => advanceRunProgress(current, locale));
    }, 900);

    return () => window.clearInterval(intervalId);
  }, [running?.kind, locale]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (workspaceMode === "decision") {
          handleRunDecision();
        } else {
          handleRunBlueprint();
        }
      }
      if (event.key === "Escape" && running) {
        cancelRun();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [workspaceMode, running, locale, decisionMode, decisionQuestions, blueprintExecutionMode]);

  async function refreshApiStatus() {
    try {
      const [healthResponse, securityResponse] = await Promise.all([
        getApiHealth(),
        getApiSecurityPosture()
      ]);
      setHealth(healthResponse);
      setSecurityPosture(securityResponse);
    } catch (error) {
      setRuntimeNotice(
        locale === "zh"
          ? `API 状态不可用：${errorMessage(error)}。仍可使用本地确定性结果。`
          : `API status unavailable: ${errorMessage(error)}. Deterministic local mode is still available.`
      );
    }
  }

  function cancelRun() {
    abortRef.current?.abort();
    abortRef.current = null;
    setDecisionReviewLoop((current) =>
      current?.status === "running"
        ? {
            ...current,
            status: "cancelled",
            finalMessage: locale === "zh" ? "深度复审已取消。" : "Deep review was cancelled."
          }
        : current
    );
    setRunning(null);
    setRuntimeNotice(locale === "zh" ? "已取消当前运行。" : "Current run cancelled.");
  }

  async function runDecisionOnce(input: {
    question: string;
    mode: DecisionMode;
    context?: DecisionContext;
    signal: AbortSignal;
  }): Promise<DecisionRunResponse> {
    const runContext = input.context ?? activeContext;

    try {
      const response = await requestDecisionRoom(
        {
          question: input.question,
          mode: input.mode,
          locale,
          context: runContext,
          agentConfig: effectiveAgents,
          reputationFeedback
        },
        fetch,
        { signal: input.signal }
      );

      return { response };
    } catch (error) {
      if (input.signal.aborted) {
        throw error;
      }

      const fallback = runDecisionRoom({ question: input.question, mode: input.mode, context: runContext });
      const promptBundle = createManualProviderBundle({
        question: input.question,
        locale,
        context: runContext,
        agents: effectiveAgents
      });

      return {
        fallbackError: errorMessage(error),
        response: {
          providerMode: "demo",
          providerStatus: health?.providerStatus ?? {},
          providerTrace: [],
          liveVerdict: null,
          promptBundle,
          result: fallback,
          persistence: { mode: "browser_local", configured: true, saved: true }
        }
      };
    }
  }

  async function handleRunDecision() {
    const question = decisionQuestions[locale].trim();
    if (!question) {
      setRuntimeNotice(locale === "zh" ? "请先输入问题。" : "Enter a question first.");
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    setWorkspaceMode("decision");
    setRuntimeNotice(null);
    setFeedbackNotice(null);
    setDecisionReviewLoop(null);
    setRunning({
      kind: "decision",
      stage: locale === "zh" ? "调用决策室" : "Calling Decision Room",
      progress: 28,
      message:
        locale === "zh"
          ? "正在请求服务端；如果真实模型不可用，会透明回退到本地确定性结果。"
          : "Requesting the server; if live providers are unavailable, the UI will show deterministic fallback.",
      modelCall: modelCallHint(decisionMode, locale)
    });

    try {
      const { response, fallbackError } = await runDecisionOnce({
        question,
        mode: decisionMode,
        signal: abortController.signal
      });
      if (abortController.signal.aborted) return;

      setRunning({
        kind: "decision",
        stage: locale === "zh" ? "聚合结果" : "Aggregating result",
        progress: 82,
        message: locale === "zh" ? "正在更新中间预览和右侧分析。" : "Updating the center preview and right inspector.",
        modelCall: traceStats(response.providerTrace).calls ? "provider trace" : undefined
      });
      setDecisionResult(response.result);
      setDecisionSnapshot(response);
      persistDecisionRecord({
        question,
        response,
        result: response.result
      });
      if (fallbackError) {
        setRuntimeNotice(
          locale === "zh"
            ? `服务端或真实模型调用不可用：${fallbackError}。已显示确定性本地结果。`
            : `Server or live provider unavailable: ${fallbackError}. Showing deterministic local result.`
        );
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        setRuntimeNotice(
          locale === "zh"
            ? `决策室运行失败：${errorMessage(error)}。`
            : `Decision Room run failed: ${errorMessage(error)}.`
        );
      }
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  }

  async function handleRunDecisionReviewToThreshold() {
    const question = decisionQuestions[locale].trim();
    if (!question) {
      setRuntimeNotice(locale === "zh" ? "请先输入问题。" : "Enter a question first.");
      return;
    }

    const baselineResponse: DecisionApiResponse | null = decisionResult
      ? {
          providerMode: decisionSnapshot?.providerMode ?? "demo",
          providerStatus: decisionSnapshot?.providerStatus ?? health?.providerStatus ?? {},
          providerTrace: decisionSnapshot?.providerTrace ?? [],
          liveVerdict: decisionSnapshot?.liveVerdict ?? null,
          promptBundle:
            decisionSnapshot?.promptBundle ??
            createManualProviderBundle({
              question,
              locale,
              context: activeContext,
              agents: effectiveAgents
            }),
          result: decisionResult,
          persistence: decisionSnapshot?.persistence ?? { mode: "browser_local", configured: true, saved: true }
        }
      : null;
    const currentScore = baselineResponse ? scoreFromDecisionResponse(baselineResponse) : undefined;

    if (typeof currentScore === "number" && currentScore >= DECISION_REVIEW_TARGET_SCORE) {
      setRuntimeNotice(
        locale === "zh"
          ? `当前裁决综合分已经达到 ${DECISION_REVIEW_TARGET_SCORE}，无需启动深度复审。`
          : `Current Decision Score already reaches ${DECISION_REVIEW_TARGET_SCORE}; deep review is not needed.`
      );
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    setWorkspaceMode("decision");
    setRuntimeNotice(null);
    setFeedbackNotice(null);
    setDecisionReviewLoop({
      targetScore: DECISION_REVIEW_TARGET_SCORE,
      maxRounds: DECISION_REVIEW_MAX_ROUNDS,
      baselineScore: currentScore ?? 0,
      bestScore: currentScore ?? 0,
      status: "running",
      rounds: [],
      finalMessage:
        locale === "zh"
          ? `正在基于当前最佳结果继续复审，达到 ${DECISION_REVIEW_TARGET_SCORE} 即停止；低于当前最佳的复审只记录风险，不覆盖结果。`
          : `Continuing from the current best result until ${DECISION_REVIEW_TARGET_SCORE}; lower-scoring reviews are recorded as risk evidence, not promoted.`
    });
    setRunning({
      kind: "decision-review",
      stage: locale === "zh" ? "基于当前结果复审到 80" : "Review current result to 80",
      progress: 18,
      message:
        locale === "zh"
          ? `最多 ${DECISION_REVIEW_MAX_ROUNDS} 轮增量复审；只采用比当前最佳更高的裁决结果。`
          : `Up to ${DECISION_REVIEW_MAX_ROUNDS} incremental review rounds; only better decisions are promoted.`,
      modelCall: modelCallHint("red_team", locale)
    });

    const rounds: DecisionReviewRound[] = [];
    let bestResponse: DecisionApiResponse | null = baselineResponse;
    let bestScore = currentScore ?? 0;
    let promoted = false;
    let fallbackError: string | undefined;
    let stopReason: "target_met" | "round_budget" | "deterministic_repeated" | "no_improvement" = "round_budget";

    try {
      for (let index = 0; index < DECISION_REVIEW_MAX_ROUNDS; index += 1) {
        setRunning({
          kind: "decision-review",
          stage:
            locale === "zh"
              ? `深度复审第 ${index + 1}/${DECISION_REVIEW_MAX_ROUNDS} 轮`
              : `Deep review round ${index + 1}/${DECISION_REVIEW_MAX_ROUNDS}`,
          progress: Math.min(78, 24 + index * 28),
          message:
            locale === "zh"
              ? "正在基于当前最佳结果继续质询、补强和复审。"
              : "Continuing from the current best result with critique, strengthening, and review.",
          modelCall: modelCallHint("red_team", locale)
        });

        const reviewContext = buildDecisionReviewContext({
          context: activeContext,
          bestResponse,
          targetScore: DECISION_REVIEW_TARGET_SCORE,
          locale
        });
        const run = await runDecisionOnce({
          question,
          mode: "red_team",
          context: reviewContext,
          signal: abortController.signal
        });
        if (abortController.signal.aborted) return;

        fallbackError = run.fallbackError;
        const candidateScore = scoreFromDecisionResponse(run.response);
        const candidateDissent = dissentFromDecisionResponse(run.response);
        const bestDissent = bestResponse ? dissentFromDecisionResponse(bestResponse) : 101;
        const accepted = !bestResponse || candidateScore > bestScore || (candidateScore === bestScore && candidateDissent < bestDissent);
        const round = decisionReviewRoundFromResponse({
          response: run.response,
          round: index + 1,
          mode: "red_team",
          targetScore: DECISION_REVIEW_TARGET_SCORE,
          fallbackUsed: Boolean(run.fallbackError),
          bestScoreBeforeRound: bestScore,
          accepted
        });
        rounds.push(round);

        if (accepted) {
          bestResponse = run.response;
          bestScore = candidateScore;
          promoted = true;
          setDecisionResult(run.response.result);
          setDecisionSnapshot(run.response);
        }

        setDecisionReviewLoop({
          targetScore: DECISION_REVIEW_TARGET_SCORE,
          maxRounds: DECISION_REVIEW_MAX_ROUNDS,
          baselineScore: currentScore ?? 0,
          bestScore,
          status: "running",
          rounds: [...rounds],
          finalMessage:
            locale === "zh"
              ? accepted
                ? `第 ${round.round} 轮成为当前最佳：${round.score}/${DECISION_REVIEW_TARGET_SCORE}，已采用。`
                : `第 ${round.round} 轮为 ${round.score}，低于当前最佳 ${bestScore}，已仅记录为风险证据。`
              : accepted
                ? `Round ${round.round} became the current best at ${round.score}/${DECISION_REVIEW_TARGET_SCORE}; promoted.`
                : `Round ${round.round} scored ${round.score}, below current best ${bestScore}; recorded as risk evidence only.`
        });

        if (accepted && round.reachedTarget) {
          stopReason = "target_met";
          break;
        }

        if (!accepted) {
          stopReason = "no_improvement";
          break;
        }

        if (round.traceCalls === 0 || round.providerMode === "demo") {
          stopReason = "deterministic_repeated";
          break;
        }
      }

      if (!bestResponse) {
        return;
      }

      setRunning({
        kind: "decision-review",
        stage: locale === "zh" ? "复审收敛" : "Review convergence",
        progress: 92,
        message: locale === "zh" ? "正在写入当前最佳复审结果。" : "Writing the current best review result.",
        modelCall: modelCallHint("red_team", locale)
      });

      if (promoted || !baselineResponse) {
        persistDecisionRecord({
          question,
          response: bestResponse,
          result: bestResponse.result
        });
      }

      const finalRound = rounds.at(-1);
      const passed = bestScore >= DECISION_REVIEW_TARGET_SCORE;
      const finalMessage = decisionReviewFinalMessage({
        locale,
        stopReason,
        targetScore: DECISION_REVIEW_TARGET_SCORE,
        finalRound,
        bestScore,
        promoted,
        fallbackError
      });

      setDecisionReviewLoop({
        targetScore: DECISION_REVIEW_TARGET_SCORE,
        maxRounds: DECISION_REVIEW_MAX_ROUNDS,
        baselineScore: currentScore ?? 0,
        bestScore,
        status: passed ? "passed" : "needs_review",
        rounds,
        finalMessage
      });
      setRuntimeNotice(finalMessage);
    } catch (error) {
      if (!abortController.signal.aborted) {
        const message =
          locale === "zh"
            ? `深度复审失败：${errorMessage(error)}。`
            : `Deep review failed: ${errorMessage(error)}.`;
        setRuntimeNotice(message);
        setDecisionReviewLoop((current) =>
          current
            ? {
                ...current,
                status: "needs_review",
                finalMessage: message
              }
            : current
        );
      }
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  }

  async function handleRunBlueprint() {
    const question = blueprintQuestions[locale].trim();
    if (!question) {
      setRuntimeNotice(locale === "zh" ? "请先输入蓝图需求。" : "Enter a Blueprint request first.");
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    setWorkspaceMode("blueprint");
    setRuntimeNotice(null);
    setAgentRun(null);
    setRunning({
      kind: "blueprint",
      stage: locale === "zh" ? "运行蓝图室" : "Running Blueprint Room",
      progress: blueprintExecutionMode === "live" ? 22 : 45,
      message:
        blueprintExecutionMode === "live"
          ? locale === "zh"
            ? "正在尝试真实模型深度蓝图，并记录每一轮 provider trace。"
            : "Attempting live deep Blueprint and recording provider trace."
          : locale === "zh"
            ? "快速确定性模式不会调用真实模型。"
            : "Fast deterministic mode will not call live providers.",
      modelCall:
        blueprintExecutionMode === "live"
          ? `${Math.max(1, maxProviderRounds)} phase provider trace`
          : locale === "zh"
            ? "不调用真实模型"
            : "no live model calls"
    });

    try {
      let result: BlueprintRoomResult;
      let snapshot: BlueprintSnapshot;

      if (blueprintExecutionMode === "deterministic") {
        result = await runLocalBlueprint(question, locale, decisionMode, activeContext);
        snapshot = {
          providerMode: "demo",
          providerStatus: health?.providerStatus ?? {},
          providerTrace: [],
          promptBundle: createManualProviderBundle({
            question,
            locale,
            context: activeContext,
            agents: effectiveAgents
          }),
          blueprintExecution: {
            requested: "deterministic",
            actual: "deterministic",
            liveTraceRequired: false,
            liveTraceAttempted: false,
            liveTraceUsable: false,
            providerCalls: 0,
            usableCalls: 0,
            fallbackReason: "deterministic_mode"
          }
        };
      } else {
        const response = await requestBlueprintRoom(
          {
            question,
            mode: decisionMode,
            locale,
            context: activeContext,
            agentConfig: effectiveAgents,
            reputationFeedback,
            blueprintRuntime: {
              executionMode: blueprintExecutionMode,
              maxProviderRounds
            }
          },
          fetch,
          { signal: abortController.signal }
        );
        if (abortController.signal.aborted) return;
        result = response.result;
        snapshot = response;
      }

      setRunning({
        kind: "blueprint",
        stage: locale === "zh" ? "合成最终方案" : "Synthesizing final plan",
        progress: 88,
        message: locale === "zh" ? "正在更新蓝图过程地图和右侧模型透明度。" : "Updating process map and model transparency.",
        modelCall: traceStats(snapshot.providerTrace).calls ? "provider trace" : undefined
      });
      setBlueprintResult(result);
      setBlueprintSnapshot(snapshot);
      persistBlueprintRecord({ question, response: snapshot, result });
    } catch (error) {
      if (abortController.signal.aborted) return;
      const result = await runLocalBlueprint(question, locale, decisionMode, activeContext);
      const snapshot: BlueprintSnapshot = {
        providerMode: "demo",
        providerStatus: health?.providerStatus ?? {},
        providerTrace: [],
        promptBundle: createManualProviderBundle({
          question,
          locale,
          context: activeContext,
          agents: effectiveAgents
        }),
        blueprintExecution: {
          requested: blueprintExecutionMode,
          actual: "deterministic",
          liveTraceRequired: blueprintExecutionMode === "live",
          liveTraceAttempted: blueprintExecutionMode === "live",
          liveTraceUsable: false,
          providerCalls: 0,
          usableCalls: 0,
          fallbackReason: blueprintExecutionMode === "live" ? "live_trace_error" : "deterministic_mode"
        }
      };
      setBlueprintResult(result);
      setBlueprintSnapshot(snapshot);
      persistBlueprintRecord({ question, response: snapshot, result });
      setRuntimeNotice(
        locale === "zh"
          ? `蓝图 API 不可用：${errorMessage(error)}。已显示确定性本地蓝图。`
          : `Blueprint API unavailable: ${errorMessage(error)}. Showing deterministic local Blueprint.`
      );
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  }

  async function handleRunAgentPlatform() {
    const question = blueprintQuestions[locale].trim();
    if (!question) {
      setRuntimeNotice(locale === "zh" ? "请先输入蓝图需求。" : "Enter a Blueprint request first.");
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    setWorkspaceMode("blueprint");
    setRuntimeNotice(null);
    setRunning({
      kind: "agent",
      stage: locale === "zh" ? "运行 LangGraph Agent 平台" : "Running LangGraph Agent platform",
      progress: 20,
      message:
        locale === "zh"
          ? "正在执行 understand_request -> review -> validate -> revise 的有界循环。"
          : "Executing bounded understand -> review -> validate -> revise loop.",
      modelCall:
        blueprintExecutionMode === "live"
          ? `${Math.max(1, maxProviderRounds)} phase provider trace`
          : locale === "zh"
            ? "确定性 LangChain 工具"
            : "deterministic LangChain tools"
    });

    try {
      const response: AgentBlueprintApiResponse = await requestAutonomousBlueprintRun(
        {
          question,
          mode: decisionMode,
          locale,
          context: activeContext,
          agentConfig: effectiveAgents,
          reputationFeedback,
          blueprintRuntime: {
            executionMode: blueprintExecutionMode,
            maxProviderRounds
          },
          agentRuntime: {
            threadId: agentThreadId,
            maxConsensusRounds,
            humanReviewNote: humanReviewNote.trim() || undefined
          }
        },
        fetch,
        { signal: abortController.signal }
      );
      if (abortController.signal.aborted) return;

      setRunning({
        kind: "agent",
        stage: locale === "zh" ? "写入运行轨迹" : "Rendering run trace",
        progress: 90,
        message: locale === "zh" ? "正在渲染路由图、工具调用和终止原因。" : "Rendering route map, tool calls, and termination reason.",
        modelCall: response.run.liveModel.liveTraceUsable ? "live provider trace" : undefined
      });
      setAgentRun(response.run);
      setBlueprintResult(response.run.result);
      setBlueprintSnapshot({
        providerMode: response.providerMode,
        providerStatus: response.providerStatus,
        providerTrace: response.run.providerTrace,
        promptBundle: createManualProviderBundle({
          question,
          locale,
          context: activeContext,
          agents: effectiveAgents
        }),
        blueprintExecution: response.run.liveModel
      });
      persistBlueprintRecord({
        question,
        response: {
          providerMode: response.providerMode,
          providerStatus: response.providerStatus,
          providerTrace: response.run.providerTrace,
          promptBundle: createManualProviderBundle({
            question,
            locale,
            context: activeContext,
            agents: effectiveAgents
          }),
          blueprintExecution: response.run.liveModel
        },
        result: response.run.result,
        agentRun: response.run
      });
    } catch (error) {
      if (abortController.signal.aborted) return;
      setRuntimeNotice(
        locale === "zh"
          ? `Agent 平台运行失败：${errorMessage(error)}。请检查 API Token、CORS、限流和请求体配置。`
          : `Agent platform run failed: ${errorMessage(error)}. Check API token, CORS, rate limit, and request body limits.`
      );
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  }

  async function handleProviderTest() {
    setRunning({
      kind: "provider-test",
      stage: locale === "zh" ? "测试模型连接" : "Testing model connections",
      progress: 45,
      message: locale === "zh" ? "正在检查 API key、模型响应和 schema 可用性。" : "Checking API keys, model response, and schema usability."
    });
    setRuntimeNotice(null);

    try {
      const response = await testProviderConnections();
      setProviderTest(response);
      setHealth((current) =>
        current
          ? {
              ...current,
              providerMode: response.providerMode,
              providerStatus: response.providerStatus
            }
          : current
      );
    } catch (error) {
      setRuntimeNotice(
        locale === "zh"
          ? `模型连接测试失败：${errorMessage(error)}。`
          : `Provider connection test failed: ${errorMessage(error)}.`
      );
    } finally {
      setRunning(null);
    }
  }

  function persistDecisionRecord(input: {
    question: string;
    response: DecisionSnapshot;
    result: DecisionRoomResult;
  }) {
    const record: DecisionHistoryRecord = {
      id: newId(),
      kind: "decision",
      question: input.question,
      createdAt: new Date().toISOString(),
      providerMode: input.response.providerMode,
      recommendation: input.response.liveVerdict?.finalRecommendation ?? input.result.verdict.finalRecommendation,
      quorumScore: input.response.liveVerdict?.quorumScore ?? input.result.verdict.quorumScore,
      providerTrace: input.response.providerTrace,
      liveVerdict: input.response.liveVerdict,
      promptBundle: input.response.promptBundle,
      result: input.result
    };
    setHistoryRecords(addDecisionHistoryRecord(record));
  }

  function persistBlueprintRecord(input: {
    question: string;
    response: BlueprintSnapshot;
    result: BlueprintRoomResult;
    agentRun?: AutonomousBlueprintRun;
  }) {
    const record: DecisionHistoryRecord = {
      id: newId(),
      kind: "blueprint",
      question: input.question,
      createdAt: new Date().toISOString(),
      providerMode: input.response.providerMode,
      recommendation: input.result.finalSpec.title,
      quorumScore: input.result.finalConsensusScore,
      providerTrace: input.response.providerTrace,
      promptBundle: input.response.promptBundle,
      blueprintResult: input.result,
      blueprintExecution: input.response.blueprintExecution,
      agentRun: input.agentRun
    };
    setHistoryRecords(addDecisionHistoryRecord(record));
  }

  function handleRestoreHistory(record: DecisionHistoryRecord) {
    if (hasDecisionHistorySnapshot(record)) {
      setWorkspaceMode("decision");
      setDecisionResult(record.result);
      setDecisionSnapshot({
        providerMode: record.providerMode,
        providerStatus: health?.providerStatus ?? {},
        providerTrace: record.providerTrace,
        liveVerdict: record.liveVerdict ?? null,
        promptBundle: record.promptBundle,
        persistence: { mode: "browser_local", configured: true, saved: true }
      });
      setDecisionQuestions((current) => ({ ...current, [locale]: record.question }));
      return;
    }

    if (hasBlueprintHistorySnapshot(record)) {
      setWorkspaceMode("blueprint");
      setBlueprintResult(record.blueprintResult);
      setBlueprintSnapshot({
        providerMode: record.providerMode,
        providerStatus: health?.providerStatus ?? {},
        providerTrace: record.providerTrace,
        promptBundle: record.promptBundle,
        blueprintExecution: record.blueprintExecution
      });
      setAgentRun(record.agentRun ?? null);
      setBlueprintQuestions((current) => ({ ...current, [locale]: record.question }));
    }
  }

  async function handleDecisionExport(kind: "adr" | "json" | "report" | "simplePdf") {
    if (!decisionResult || !decisionSnapshot) return;
    const exporters = await import("./lib/exporters");

    if (kind === "adr") {
      exporters.downloadArtifact(exporters.createAdrMarkdownExport(decisionResult, locale));
      return;
    }

    if (kind === "json") {
      exporters.downloadArtifact(
        exporters.createJsonTraceExport({
          question: decisionQuestions[locale],
          locale,
          providerMode: decisionSnapshot.providerMode,
          providerTrace: decisionSnapshot.providerTrace,
          liveVerdict: decisionSnapshot.liveVerdict,
          promptBundle: decisionSnapshot.promptBundle,
          result: decisionResult
        })
      );
      return;
    }

    if (kind === "simplePdf") {
      await downloadSimplePdfArtifact(
        exporters.createDecisionFinalPdfExport({
          question: decisionQuestions[locale],
          locale,
          providerMode: decisionSnapshot.providerMode,
          providerTrace: decisionSnapshot.providerTrace,
          liveVerdict: decisionSnapshot.liveVerdict,
          promptBundle: decisionSnapshot.promptBundle,
          result: decisionResult
        }),
        exporters.downloadArtifact
      );
      return;
    }

    exporters.downloadArtifact(
      exporters.createPdfReportExport({
        question: decisionQuestions[locale],
        locale,
        providerMode: decisionSnapshot.providerMode,
        providerTrace: decisionSnapshot.providerTrace,
        liveVerdict: decisionSnapshot.liveVerdict,
        promptBundle: decisionSnapshot.promptBundle,
        result: decisionResult
      })
    );
  }

  async function handleBlueprintExport(kind: "markdown" | "report" | "backlog" | "simplePdf") {
    if (!blueprintResult || !blueprintSnapshot) return;
    const exporters = await import("./lib/exporters");

    if (kind === "markdown") {
      exporters.downloadArtifact({
        filename: `quorummind-blueprint-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
        mimeType: "text/markdown;charset=utf-8",
        contents: blueprintResult.finalSpec.markdown
      });
      return;
    }

    if (kind === "backlog") {
      exporters.downloadArtifact(
        exporters.createBlueprintBacklogExport({
          question: blueprintQuestions[locale],
          locale,
          result: blueprintResult
        })
      );
      return;
    }

    if (kind === "simplePdf") {
      await downloadSimplePdfArtifact(
        exporters.createBlueprintFinalPdfExport({
          question: blueprintQuestions[locale],
          locale,
          providerMode: blueprintSnapshot.providerMode,
          providerTrace: blueprintSnapshot.providerTrace,
          result: blueprintResult
        }),
        exporters.downloadArtifact
      );
      return;
    }

    exporters.downloadArtifact(
      exporters.createBlueprintReportExport({
        question: blueprintQuestions[locale],
        locale,
        providerMode: blueprintSnapshot.providerMode,
        providerTrace: blueprintSnapshot.providerTrace,
        result: blueprintResult
      })
    );
  }

  async function downloadSimplePdfArtifact(
    artifact: { filename: string; mimeType: string; contents: string },
    downloadArtifact: (artifact: { filename: string; mimeType: string; contents: string }) => void
  ) {
    try {
      await downloadRenderedPdf(
        {
          html: artifact.contents,
          filename: artifact.filename
        },
        fetch
      );
    } catch (error) {
      downloadArtifact({
        ...artifact,
        filename: artifact.filename.replace(/\.pdf$/i, ".html")
      });
      setRuntimeNotice(
        locale === "zh"
          ? `PDF 生成失败：${errorMessage(error)}。已改为下载可打印的简版 HTML。`
          : `PDF generation failed: ${errorMessage(error)}. Downloaded a printable simple HTML instead.`
      );
    }
  }

  async function copyText(value: string, notice = t.copied) {
    try {
      await navigator.clipboard.writeText(value);
      setRuntimeNotice(notice);
    } catch {
      setRuntimeNotice(
        locale === "zh"
          ? "浏览器剪贴板不可用，请使用导出按钮获取内容。"
          : "Clipboard is unavailable. Use the export buttons instead."
      );
    }
  }

  function handleFeedback(outcome: "helpful" | "neutral" | "unhelpful") {
    const domain = inferDecisionDomain(activeQuestion, activeContext);
    const next = addModelReputationFeedback(
      createModelReputationFeedbackForAgents(effectiveAgents, domain, outcome, new Date().toISOString())
    );
    setReputationFeedback(next);
    setFeedbackNotice(
      locale === "zh"
        ? "已记录模型表现反馈，下次运行会轻微调整模型权重。"
        : "Model feedback recorded. Future runs will lightly adjust model weights."
    );
  }

  const sourceProviderMode =
    workspaceMode === "decision"
      ? decisionSnapshot?.providerMode
      : blueprintSnapshot?.providerMode ?? (agentRun?.platform.source === "live_model_trace_with_deterministic_synthesis" ? "live" : "demo");
  const sourceProviderStatus =
    workspaceMode === "decision" ? decisionSnapshot?.providerStatus : blueprintSnapshot?.providerStatus ?? health?.providerStatus;
  const activeWorkspaceLabel = workspaceMode === "decision" ? t.workspaceDecision : t.workspaceBlueprint;
  const workbenchHint =
    workspaceMode === "decision"
      ? locale === "zh"
        ? "输入取舍问题，运行后查看共识、分歧、风险和可导出的 ADR。"
        : "Enter a trade-off question, then review consensus, dissent, risks, and an exportable ADR."
      : locale === "zh"
        ? "输入开放式需求，运行后查看 Agent 分工、工作流、风险和最终方案。"
        : "Enter an open-ended request, then review agents, workflow, risks, and the final blueprint.";
  const workbenchSourceLabel = sourceProviderMode === "live" ? t.liveSource : sourceProviderMode === "demo" ? t.demoSource : locale === "zh" ? "等待连接" : "Waiting";

  if (appSurface === "landing") {
    return (
      <LandingPage
        locale={locale}
        health={health}
        sourceProviderMode={sourceProviderMode}
        onLocaleChange={setLocale}
        onEnterWorkbench={() => setAppSurface("workbench")}
        onTrySample={() => {
          setWorkspaceMode("blueprint");
          setAppSurface("workbench");
        }}
      />
    );
  }

  return (
    <main className="product-shell">
      <header className="topbar">
        <button className="brand-lockup brand-button" onClick={() => setAppSurface("landing")}>
          <span className="brand-mark">QM</span>
          <div>
            <strong>{t.productName}</strong>
            <small>{t.productKind}</small>
          </div>
        </button>
        <div className="topbar-actions">
          <span className="demo-badge">{connectionBadgeLabel(locale, health, sourceProviderMode)}</span>
          <div className="language-switch" aria-label={t.language}>
            <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>
              EN
            </button>
            <button className={locale === "zh" ? "active" : ""} onClick={() => setLocale("zh")}>
              中文
            </button>
          </div>
        </div>
      </header>

      <section className="intro-strip">
        <div>
          <span>{activeWorkspaceLabel}</span>
          <h1>{t.productKind}</h1>
          <p>{workbenchHint}</p>
        </div>
        <dl className="intro-status" aria-label={locale === "zh" ? "当前工作台状态" : "Current workspace status"}>
          <div>
            <dt>{locale === "zh" ? "当前模式" : "Mode"}</dt>
            <dd>{activeWorkspaceLabel}</dd>
          </div>
          <div>
            <dt>{t.source}</dt>
            <dd>{workbenchSourceLabel}</dd>
          </div>
        </dl>
      </section>

      <div className="workspace-grid">
        <aside className="setup-column" aria-label={locale === "zh" ? "运行设置" : "Run setup"}>
          <OnboardingPanel locale={locale} workspaceMode={workspaceMode} />

          <section className="settings-panel context-panel">
            <PanelHeading title={t.workspaceLabel} />
            <div className="profile-switch workspace-switch">
              <button
                className={workspaceMode === "decision" ? "active" : ""}
                onClick={() => setWorkspaceMode("decision")}
              >
                {t.workspaceDecision}
              </button>
              <button
                className={workspaceMode === "blueprint" ? "active" : ""}
                onClick={() => setWorkspaceMode("blueprint")}
              >
                {t.workspaceBlueprint}
              </button>
            </div>
          </section>

          <section className="panel-block">
            <label className="field-label" htmlFor="question">
              {workspaceMode === "decision" ? t.questionLabel : t.blueprintQuestionLabel}
            </label>
            <textarea
              id="question"
              aria-label={workspaceMode === "decision" ? t.questionLabel : t.blueprintQuestionLabel}
              value={workspaceMode === "decision" ? decisionQuestions[locale] : blueprintQuestions[locale]}
              onChange={(event) => updateCurrentQuestion(event.target.value)}
            />
            <p className="field-help">
              {locale === "zh"
                ? "可以问二选一决策，也可以在方案蓝图里问开放式需求。结果会按当前问题重新生成。"
                : "Ask either a trade-off decision or an open-ended Blueprint request. Results regenerate from the current question."}
            </p>
            <QuestionExamplesPanel
              locale={locale}
              workspaceMode={workspaceMode}
              examples={questionExamples[workspaceMode][locale]}
              onSelect={updateCurrentQuestion}
            />
          </section>

          <section className="context-panel">
            <PanelHeading title={t.decisionModeLabel} />
            <div className="profile-switch">
              {runProfiles.map((profile) => (
                <button
                  key={profile}
                  className={decisionMode === profile ? "active" : ""}
                  onClick={() => setDecisionMode(profile)}
                >
                  {modeLabel(profile, locale)}
                </button>
              ))}
            </div>
          </section>

          {workspaceMode === "blueprint" && (
            <section className="context-panel blueprint-execution-panel">
              <PanelHeading
                title={locale === "zh" ? "蓝图运行模式" : "Blueprint execution"}
                help={
                  locale === "zh"
                    ? "快速确定性不会调用真实模型；真实模型深度蓝图会请求 provider trace，如果不可用会明确显示兜底。"
                    : "Fast deterministic mode skips live models. Live deep Blueprint requests provider trace and shows fallback when unavailable."
                }
              />
              <div className="profile-switch">
                <button
                  className={blueprintExecutionMode === "deterministic" ? "active" : ""}
                  onClick={() => setBlueprintExecutionMode("deterministic")}
                >
                  {t.fastDeterministic}
                </button>
                <button
                  className={blueprintExecutionMode === "live" ? "active" : ""}
                  onClick={() => setBlueprintExecutionMode("live")}
                >
                  {t.liveDeepBlueprint}
                </button>
              </div>
              <div className="blueprint-cost-estimate">
                <strong>{t.costEstimate}</strong>
                <dl>
                  <div>
                    <dt>{t.estimatedCalls}</dt>
                    <dd>{blueprintExecutionMode === "live" ? estimateProviderCalls(maxProviderRounds) : 0}</dd>
                  </div>
                  <div>
                    <dt>{t.estimatedTokens}</dt>
                    <dd>{blueprintExecutionMode === "live" ? `${estimateTokens(maxProviderRounds)}k` : "0"}</dd>
                  </div>
                  <div>
                    <dt>{t.timeoutWindow}</dt>
                    <dd>{blueprintExecutionMode === "live" ? `${Math.max(1, maxProviderRounds) * 20}s` : "<1s"}</dd>
                  </div>
                </dl>
                <label>
                  <span className="field-label">{locale === "zh" ? "最多 provider 阶段" : "Max provider phases"}</span>
                  <input
                    min={1}
                    max={5}
                    type="number"
                    value={maxProviderRounds}
                    onChange={(event) => setMaxProviderRounds(clampNumber(event.target.valueAsNumber, 1, 5))}
                  />
                </label>
              </div>
            </section>
          )}

          <div className="run-control-row">
            <button
              className="primary-action"
              disabled={Boolean(running)}
              onClick={workspaceMode === "decision" ? handleRunDecision : handleRunBlueprint}
            >
              {running?.kind === workspaceMode ? "..." : workspaceMode === "decision" ? t.runDecision : t.runBlueprint}
            </button>
            {workspaceMode === "decision" ? (
              <button
                className="review-action"
                disabled={Boolean(running)}
                onClick={handleRunDecisionReviewToThreshold}
              >
                {running?.kind === "decision-review"
                  ? "..."
                  : locale === "zh"
                    ? "基于当前结果复审到 80"
                    : "Review current result to 80"}
              </button>
            ) : null}
            {running ? (
              <button className="secondary-action" onClick={cancelRun}>
                {t.cancel}
              </button>
            ) : null}
          </div>

          {workspaceMode === "blueprint" && (
            <SidebarDisclosure
              title={t.agentRuntime}
              summary={
                locale === "zh"
                  ? "线程、共识轮次和人工复审入口。"
                  : "Thread, consensus rounds, and human-review controls."
              }
            >
              <div className="agent-runtime-panel">
                <label>
                  <span>{t.checkpointThread}</span>
                  <input value={agentThreadId} onChange={(event) => setAgentThreadId(event.target.value)} />
                  <small>
                    {locale === "zh"
                      ? "保持相同 thread 可复用 MemorySaver checkpoint。"
                      : "Keep the same thread to reuse MemorySaver checkpoint state."}
                  </small>
                </label>
                <label>
                  <span>{t.maxRounds}</span>
                  <input
                    min={1}
                    max={6}
                    type="number"
                    value={maxConsensusRounds}
                    onChange={(event) => setMaxConsensusRounds(clampNumber(event.target.valueAsNumber, 1, 6))}
                  />
                </label>
                <label>
                  <span>{t.humanReviewNote}</span>
                  <textarea
                    className="compact-textarea"
                    value={humanReviewNote}
                    onChange={(event) => setHumanReviewNote(event.target.value)}
                  />
                </label>
                <button className="agent-platform-action" disabled={Boolean(running)} onClick={handleRunAgentPlatform}>
                  {t.runAgent}
                </button>
              </div>
            </SidebarDisclosure>
          )}

          {runtimeNotice && <p className="runtime-notice">{runtimeNotice}</p>}

          <SidebarDisclosure
            title={locale === "zh" ? "设置页" : "Settings"}
            summary={
              locale === "zh"
                ? "API、模型连接、安全策略和对外使用状态。"
                : "API, model connections, security policy, and sharing readiness."
            }
            defaultOpen
          >
            <ReadinessPanel
              locale={locale}
              health={health}
              securityPosture={securityPosture}
              providerStatus={sourceProviderStatus}
              providerTest={providerTest}
              running={running}
              onProviderTest={handleProviderTest}
            />
          </SidebarDisclosure>

          <SidebarDisclosure
            title={t.agentCouncil}
            summary={
              locale === "zh"
                ? "查看当前专家权重和声誉修正。"
                : "Review current expert weights and reputation adjustments."
            }
          >
            <AgentConfigPanel locale={locale} agents={effectiveAgents} />
          </SidebarDisclosure>

          <SidebarDisclosure
            title={locale === "zh" ? "上下文与流程" : "Context and workflow"}
            summary={
              locale === "zh"
                ? "问题类型、候选方案和阶段路径。"
                : "Question type, candidate paths, and stage flow."
            }
          >
            <ContextPanel locale={locale} context={activeContext} />
            <WorkflowPanel locale={locale} workspaceMode={workspaceMode} hasResult={Boolean(decisionResult || blueprintResult)} />
          </SidebarDisclosure>

          <SidebarDisclosure
            title={t.historyTitle}
            summary={
              locale === "zh"
                ? "恢复之前的决策或蓝图运行。"
                : "Restore previous decision or Blueprint runs."
            }
          >
            <HistoryPanel locale={locale} records={historyRecords} onRestore={handleRestoreHistory} />
          </SidebarDisclosure>
        </aside>

        <section className="room-column" aria-live="polite">
          {running && <RunProgressPanel locale={locale} running={running} />}

          {workspaceMode === "decision" ? (
            decisionResult ? (
              <DecisionResultView
                locale={locale}
                question={decisionQuestions[locale]}
                result={decisionResult}
                snapshot={decisionSnapshot}
                onExport={handleDecisionExport}
                onCopyPrompt={() =>
                  copyText(JSON.stringify(decisionSnapshot?.promptBundle ?? {}, null, 2), t.copied)
                }
                onFeedback={handleFeedback}
                feedbackNotice={feedbackNotice}
              />
            ) : (
              <EmptyState
                locale={locale}
                workspaceMode="decision"
                question={decisionQuestions[locale]}
                context={activeContext}
              />
            )
          ) : blueprintResult ? (
            <BlueprintResultView
              locale={locale}
              question={blueprintQuestions[locale]}
              result={blueprintResult}
              snapshot={blueprintSnapshot}
              agentRun={agentRun}
              onExport={handleBlueprintExport}
              onCopyBlueprint={() => copyText(blueprintResult.finalSpec.markdown, t.copied)}
              onCopyPrompt={() => copyText(JSON.stringify(blueprintSnapshot?.promptBundle ?? {}, null, 2), t.copied)}
              onCopyReviewPackage={() => agentRun && copyText(renderHumanReviewPackage(agentRun, locale), t.copied)}
            />
          ) : (
            <EmptyState
              locale={locale}
              workspaceMode="blueprint"
              question={blueprintQuestions[locale]}
              context={activeContext}
            />
          )}
        </section>

        <aside className="inspector-column" aria-label={locale === "zh" ? "结果分析" : "Result inspector"}>
          {workspaceMode === "decision" ? (
            <DecisionInspector
              locale={locale}
              result={decisionResult}
              snapshot={decisionSnapshot}
              promptBundle={activePromptBundle}
              reviewLoop={decisionReviewLoop}
              running={Boolean(running)}
              onDeepReview={handleRunDecisionReviewToThreshold}
            />
          ) : (
            <BlueprintInspector
              locale={locale}
              result={blueprintResult}
              snapshot={blueprintSnapshot}
              agentRun={agentRun}
              records={historyRecords}
              currentQuestion={blueprintQuestions[locale]}
            />
          )}
        </aside>
      </div>

      {workspaceMode === "decision" && decisionResult ? (
        <section className="adr-board">
          <div>
            <PanelHeading title={t.adr} kicker="Markdown" />
            <p>{locale === "zh" ? "ADR 预览来自当前结果，可直接导出或用于团队评审。" : "ADR preview from the current result, ready for review or export."}</p>
          </div>
          <pre>{localizeText(decisionResult.verdict.adrMarkdown, locale)}</pre>
        </section>
      ) : null}
    </main>
  );
}

function LandingPage(props: {
  locale: Locale;
  health: DecisionApiHealth | null;
  sourceProviderMode: DecisionApiResponse["providerMode"] | undefined;
  onLocaleChange: (locale: Locale) => void;
  onEnterWorkbench: () => void;
  onTrySample: () => void;
}) {
  const { locale, health, sourceProviderMode, onLocaleChange, onEnterWorkbench, onTrySample } = props;
  const t = appCopy[locale];
  const landingRef = useRef<HTMLElement | null>(null);
  const featureCards = [
    {
      title: t.landingDecision,
      body: t.landingDecisionText,
      stat: locale === "zh" ? "问题" : "Question"
    },
    {
      title: t.landingBlueprint,
      body: t.landingBlueprintText,
      stat: locale === "zh" ? "蓝图" : "Blueprint"
    },
    {
      title: t.landingTrace,
      body: t.landingTraceText,
      stat: locale === "zh" ? "证据" : "Evidence"
    }
  ];
  const orbitNodes = [
    { className: "node-proposal", label: t.landingNodeProposal },
    { className: "node-critique", label: t.landingNodeCritique },
    { className: "node-revision", label: t.landingNodeRevision },
    { className: "node-score", label: t.landingNodeScore },
    { className: "node-risk", label: t.landingNodeRisk },
    { className: "node-export", label: t.landingNodeExport }
  ];

  useGSAP(
    () => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return;
      }

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const timeline = gsap.timeline({ defaults: { duration: 0.62, ease: "power3.out" } });
        timeline
          .from(".landing-topbar", { y: -12 })
          .from(".landing-copy h1, .landing-copy p, .landing-actions, .landing-proof", {
            y: 18,
            stagger: 0.055
          }, "-=0.22")
          .from(".landing-stat, .landing-feature-grid article", {
            y: 14,
            stagger: 0.045
          }, "-=0.22")
          .from(".decision-orbit", { scale: 0.96, rotation: -4 }, "-=0.48");

        gsap.to(".orbit-ring", {
          rotation: 360,
          duration: 34,
          repeat: -1,
          ease: "none",
          transformOrigin: "50% 50%"
        });
        gsap.to(".network-node", {
          y: (index) => (index % 2 === 0 ? -7 : 7),
          duration: 2.8,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          stagger: 0.18
        });
        gsap.to(".flow-line", {
          backgroundPosition: "240px 0",
          duration: 5.4,
          repeat: -1,
          ease: "none"
        });
      });

      return () => mm.revert();
    },
    { scope: landingRef }
  );

  return (
    <main className="landing-shell" ref={landingRef}>
      <header className="landing-topbar">
        <div className="brand-lockup">
          <span className="brand-mark">QM</span>
          <div>
            <strong>{t.productName}</strong>
            <small>{t.productKind}</small>
          </div>
        </div>
        <nav className="landing-nav" aria-label={locale === "zh" ? "首页导航" : "Landing navigation"}>
          <a href="#landing-decision">{t.landingNavDecision}</a>
          <a href="#landing-blueprint">{t.landingNavBlueprint}</a>
          <a href="#landing-eval">{t.landingNavEval}</a>
          <a href="#landing-export">{t.landingNavExport}</a>
        </nav>
        <div className="topbar-actions">
          <span className="demo-badge">{connectionBadgeLabel(locale, health, sourceProviderMode)}</span>
          <div className="language-switch" aria-label={t.language}>
            <button className={locale === "en" ? "active" : ""} onClick={() => onLocaleChange("en")}>
              EN
            </button>
            <button className={locale === "zh" ? "active" : ""} onClick={() => onLocaleChange("zh")}>
              中文
            </button>
          </div>
        </div>
      </header>

      <section className="landing-hero" aria-label={locale === "zh" ? "产品首页" : "Product landing page"}>
        <div className="landing-copy">
          <h1>{t.landingHeadline}</h1>
          <p>{t.landingSublead}</p>
          <div className="landing-actions">
            <button className="primary-action landing-primary" onClick={onEnterWorkbench}>
              {t.enterWorkbench}
            </button>
            <button className="secondary-action landing-secondary" onClick={onTrySample}>
              {t.landingSecondary}
            </button>
          </div>
          <p className="landing-proof">{t.landingProof}</p>
          <dl className="landing-stats" aria-label={locale === "zh" ? "产品能力指标" : "Product capability metrics"}>
            <div className="landing-stat">
              <dt>{t.landingMetricAlgorithms}</dt>
              <dd>{t.landingMetricAlgorithmsLabel}</dd>
            </div>
            <div className="landing-stat">
              <dt>{t.landingMetricAgents}</dt>
              <dd>{t.landingMetricAgentsLabel}</dd>
            </div>
            <div className="landing-stat">
              <dt>{t.landingMetricThreshold}</dt>
              <dd>{t.landingMetricThresholdLabel}</dd>
            </div>
          </dl>
        </div>
        <div className="landing-visual" aria-label={t.landingVisualLabel}>
          <div className="decision-orbit" aria-hidden="true">
            <div className="orbit-ring ring-outer" />
            <div className="orbit-ring ring-inner" />
            <div className="flow-line line-input" />
            <div className="flow-line line-output" />
            <div className="decision-core">
              <span>{t.landingVisualCenter}</span>
              <strong>{t.landingMetricThreshold}</strong>
              <small>{t.landingVisualScoreLabel}</small>
            </div>
            <div className="flow-chip chip-input">{t.landingVisualInput}</div>
            <div className="flow-chip chip-output">{t.landingVisualOutput}</div>
            {orbitNodes.map((node) => (
              <div className={`network-node ${node.className}`} key={node.className}>
                <span>{node.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-feature-grid" id="landing-capabilities" aria-label={locale === "zh" ? "核心能力" : "Core capabilities"}>
        {featureCards.map((card, index) => (
          <article
            id={index === 0 ? "landing-decision" : index === 1 ? "landing-blueprint" : "landing-eval"}
            key={card.title}
          >
            <span>{card.stat}</span>
            <strong>{card.title}</strong>
            <p>{card.body}</p>
          </article>
        ))}
        <article id="landing-export">
          <span>{locale === "zh" ? "交付" : "Delivery"}</span>
          <strong>{locale === "zh" ? "面向交付的报告" : "Delivery-ready reports"}</strong>
          <p>
            {locale === "zh"
              ? "复杂审查报告和简版最终方案 PDF 并存，既能给专业人员复盘，也能给非技术用户直接阅读。"
              : "Full audit reports and simple final-plan PDFs coexist, so experts can review the trace while non-technical readers get the answer."}
          </p>
        </article>
      </section>
    </main>
  );
}

function DecisionResultView(props: {
  locale: Locale;
  question: string;
  result: DecisionRoomResult;
  snapshot: DecisionSnapshot | null;
  onExport: (kind: "adr" | "json" | "report" | "simplePdf") => void;
  onCopyPrompt: () => void;
  onFeedback: (outcome: "helpful" | "neutral" | "unhelpful") => void;
  feedbackNotice: string | null;
}) {
  const { locale, question, result, snapshot, onExport, onCopyPrompt, onFeedback, feedbackNotice } = props;
  const t = appCopy[locale];
  const verdict = snapshot?.liveVerdict ?? result.verdict;
  const ranked = snapshot?.liveVerdict?.rankedProposals.length
    ? snapshot.liveVerdict.rankedProposals
    : result.verdict.rankedProposals;
  const winningProposal = result.revisedProposals.find((proposal) => proposal.id === verdict.selectedProposalId);
  const verdictExplanation = decisionVerdictExplanation({
    locale,
    question,
    winningProposal,
    liveVerdict: snapshot?.liveVerdict,
    trace: snapshot?.providerTrace ?? []
  });

  return (
    <>
      <article className="panel-block verdict-panel">
        <div className="panel-heading-row">
          <PanelHeading
            title={t.finalVerdict}
            kicker={snapshot?.providerMode === "live" ? t.liveSource : t.demoSource}
            help={
              locale === "zh"
                ? "最终裁决会优先展示可用的真实模型聚合结果；如果没有可用 trace，则展示确定性裁决。"
                : "The final verdict prefers valid live aggregation, then falls back to deterministic scoring."
            }
          />
          <span className="state-pill">{formatProposalId(verdict.selectedProposalId, locale)}</span>
        </div>
        <h2>{localizeText(verdict.finalRecommendation, locale)}</h2>
        <p>{verdictExplanation}</p>
        <SourceQualityBanner locale={locale} providerMode={snapshot?.providerMode ?? "demo"} trace={snapshot?.providerTrace ?? []} liveVerdict={snapshot?.liveVerdict} />
        <div className="action-row">
          <button onClick={() => onExport("adr")}>{t.exportAdr}</button>
          <button onClick={() => onExport("json")}>{t.exportJson}</button>
          <button onClick={() => onExport("report")}>{t.exportReport}</button>
          <button onClick={() => onExport("simplePdf")}>{t.exportSimplePdf}</button>
          <button onClick={onCopyPrompt}>{t.copyPrompt}</button>
        </div>
        <div className="feedback-panel">
          <strong>{locale === "zh" ? "模型表现反馈" : "Model quality feedback"}</strong>
          <p>
            {locale === "zh"
              ? "这些反馈只用于下次运行的轻量权重校准，不会伪造真实模型能力。"
              : "Feedback only calibrates lightweight future weights; it does not fabricate live model capability."}
          </p>
          <div className="feedback-actions">
            <button onClick={() => onFeedback("helpful")}>{t.feedbackHelpful}</button>
            <button onClick={() => onFeedback("neutral")}>{t.feedbackNeutral}</button>
            <button onClick={() => onFeedback("unhelpful")}>{t.feedbackUnhelpful}</button>
          </div>
          {feedbackNotice && <p className="runtime-notice">{feedbackNotice}</p>}
        </div>
      </article>

      <article className="panel-block">
        <PanelHeading title={t.agentCouncil} kicker={String(result.agents.length)} />
        <div className="agent-grid">
          {result.agents.map((agent) => (
            <AgentCard key={agent.id} locale={locale} agent={agent} />
          ))}
        </div>
      </article>

      <article className="panel-block">
        <PanelHeading title={t.tradeoffRanking} kicker={t.scoreTransparency} />
        <div className="matrix-list">
          {ranked.map((proposal, index) => (
            <ProposalRow
              key={proposal.proposalId}
              locale={locale}
              proposal={proposal}
              rank={index + 1}
              criteriaScores={result.revisedProposals.find((item) => item.id === proposal.proposalId)?.criteriaScores}
            />
          ))}
        </div>
      </article>

      <article className="panel-block live-verdict-panel">
        <PanelHeading title={t.scoreTransparency} kicker={locale === "zh" ? "排序分 + 效用 + 后悔值" : "Borda + Utility + Regret"} />
        <WinnerExplanation locale={locale} result={result} ranked={ranked} liveVerdict={snapshot?.liveVerdict} />
      </article>
    </>
  );
}

function decisionVerdictExplanation({
  locale,
  question,
  winningProposal,
  liveVerdict,
  trace
}: {
  locale: Locale;
  question: string;
  winningProposal?: Proposal;
  liveVerdict?: DecisionApiResponse["liveVerdict"];
  trace: ProviderTraceEntry[];
}): string {
  if (winningProposal) {
    return localizeText(winningProposal.reasoning, locale);
  }

  const selectedProposalId = liveVerdict?.selectedProposalId;
  const traceRecommendation = selectedProposalId ? recommendationFromTrace(trace, selectedProposalId) : undefined;

  if (traceRecommendation) {
    return traceRecommendation;
  }

  if (liveVerdict?.whyItWon?.length) {
    return liveVerdict.whyItWon.join(" ");
  }

  return locale === "zh"
    ? `本次 live 裁决选择了外部模型方案，但没有返回可匹配的方案解释。原问题：${question}`
    : `This live verdict selected an external model proposal, but no matching rationale was returned. Original question: ${question}`;
}

function recommendationFromTrace(trace: ProviderTraceEntry[], selectedProposalId: string): string | undefined {
  const candidate = trace.find((entry) => {
    if (entry.phase !== "revision" && entry.phase !== "proposal") {
      return false;
    }

    const payload = tracePayload(entry);
    return appRecordString(payload, "proposalId") === selectedProposalId || appRecordString(payload, "id") === selectedProposalId;
  });

  return candidate ? appRecordString(tracePayload(candidate), "recommendation") : undefined;
}

function tracePayload(entry: ProviderTraceEntry): unknown {
  return entry.normalized ?? entry.parsed;
}

function appRecordString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function BlueprintResultView(props: {
  locale: Locale;
  question: string;
  result: BlueprintRoomResult;
  snapshot: BlueprintSnapshot | null;
  agentRun: AutonomousBlueprintRun | null;
  onExport: (kind: "markdown" | "report" | "backlog" | "simplePdf") => void;
  onCopyBlueprint: () => void;
  onCopyPrompt: () => void;
  onCopyReviewPackage: () => void;
}) {
  const { locale, question, result, snapshot, agentRun, onExport, onCopyBlueprint, onCopyPrompt, onCopyReviewPackage } = props;
  const t = appCopy[locale];
  const spec = result.finalSpec;

  return (
    <>
      <article className="panel-block verdict-panel blueprint-hero">
        <PanelHeading
          title={t.blueprintTitle}
          kicker={snapshot?.providerMode === "live" ? t.liveSource : t.demoSource}
          help={
            locale === "zh"
              ? "蓝图可以处理开放式需求：各 Agent 先出草案，互评后逐轮修订，直到共识达到阈值或进入人工复审。"
              : "Blueprint handles open-ended requests: agents draft, cross-review, revise, and stop at threshold or human review."
          }
        />
        <h2>{spec.title}</h2>
        <p>{spec.executiveSummary}</p>
        <SourceQualityBanner
          locale={locale}
          providerMode={snapshot?.providerMode ?? "demo"}
          trace={snapshot?.providerTrace ?? []}
          blueprintExecution={snapshot?.blueprintExecution}
        />
        <div className="blueprint-stat-grid">
          <div>
            <span>{t.consensus}</span>
            <strong>{result.finalConsensusScore}%</strong>
          </div>
          <div>
            <span>{t.threshold}</span>
            <strong>{result.consensusThreshold}%</strong>
          </div>
          <div>
            <span>{t.recommendedAgents}</span>
            <strong>{spec.recommendedAgentCount}</strong>
          </div>
          <div>
            <span>{t.workflow}</span>
            <strong>{spec.workflowStages.length}</strong>
          </div>
        </div>
        <div className="action-row">
          <button onClick={() => onExport("markdown")}>{t.exportBlueprint}</button>
          <button onClick={() => onExport("report")}>{t.exportBlueprintPdf}</button>
          <button onClick={() => onExport("simplePdf")}>{t.exportSimplePdf}</button>
          <button onClick={onCopyBlueprint}>{t.copyBlueprint}</button>
          <button onClick={onCopyPrompt}>{t.copyPrompt}</button>
        </div>
      </article>

      {agentRun && <AgentPlatformRunPanel locale={locale} run={agentRun} onCopyReviewPackage={onCopyReviewPackage} />}

      <BlueprintProcessMap locale={locale} result={result} trace={snapshot?.providerTrace ?? []} />

      <article className="panel-block blueprint-evaluation-panel">
        <PanelHeading title={t.evaluationMatrix} kicker={String(spec.evaluationMatrix.length)} />
        <div className="blueprint-evaluation-grid">
          {spec.evaluationMatrix.map((item) => (
            <article key={item.id} className={`blueprint-evaluation-card ${item.status}`}>
              <header>
                <div>
                  <span>{statusLabel(item.status, locale)}</span>
                  <strong>{item.label}</strong>
                </div>
                <em>{item.score}/100</em>
              </header>
              <div className="blueprint-evaluation-bar">
                <span style={{ width: `${clampNumber(item.score, 0, 100)}%` }} />
              </div>
              <p>{item.rationale}</p>
              <dl>
                <div>
                  <dt>{locale === "zh" ? "证据" : "Evidence"}</dt>
                  <dd>{item.evidence.join(" / ")}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "改进动作" : "Improvement actions"}</dt>
                  <dd>{item.improvementActions.join(" / ")}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </article>

      <article className="panel-block blueprint-recommendation-panel">
        <PanelHeading title={t.detailedRecommendations} kicker={String(spec.detailedRecommendations.length)} />
        <div className="blueprint-recommendation-list">
          {spec.detailedRecommendations.map((item) => (
            <article key={item.id} className={`blueprint-recommendation-card ${item.priority}`}>
              <header>
                <div>
                  <span>{priorityLabel(item.priority, locale)}</span>
                  <strong>{item.title}</strong>
                  <small>{locale === "zh" ? "负责方" : "Owner"}: {item.ownerAgentId}</small>
                </div>
              </header>
              <p>{item.reason}</p>
              <dl>
                <div>
                  <dt>{locale === "zh" ? "建议动作" : "Actions"}</dt>
                  <dd>{item.actions.join(" / ")}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "预期影响" : "Expected impact"}</dt>
                  <dd>{item.expectedImpact}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "验收检查" : "Acceptance check"}</dt>
                  <dd>{item.acceptanceCheck}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </article>

      <BlueprintCollapsiblePanel index={1} title={t.systemAgents} summary={locale === "zh" ? "每个 Agent 的职责、输入、输出和失败模式。" : "Responsibilities, inputs, outputs, and failure modes."}>
        <div className="blueprint-system-agent-list">
          {spec.systemAgents.map((agent, index) => (
            <article className="blueprint-system-agent-card" key={agent.id}>
              <span className="agent-avatar">{index + 1}</span>
              <div>
                <strong>{agent.name}</strong>
                <p>{agent.responsibility}</p>
                <dl>
                  <div>
                    <dt>{locale === "zh" ? "输入" : "Inputs"}</dt>
                    <dd>{agent.inputs.join(" / ")}</dd>
                  </div>
                  <div>
                    <dt>{locale === "zh" ? "输出" : "Outputs"}</dt>
                    <dd>{agent.outputs.join(" / ")}</dd>
                  </div>
                  <div>
                    <dt>{locale === "zh" ? "评审问题" : "Review questions"}</dt>
                    <dd>{agent.reviewQuestions.join(" / ")}</dd>
                  </div>
                  <div>
                    <dt>{locale === "zh" ? "失败模式" : "Failure mode"}</dt>
                    <dd>{agent.failureMode}</dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      </BlueprintCollapsiblePanel>

      <BlueprintCollapsiblePanel index={2} title={t.workflow} summary={locale === "zh" ? "可回放、可重试的蓝图工作流。" : "Replayable and retryable Blueprint workflow."} defaultOpen>
        <div className="blueprint-stage-list">
          {spec.workflowStages.map((stage, index) => (
            <article className="blueprint-stage-card" key={stage.id}>
              <header>
                <span>{index + 1}</span>
                <div>
                  <strong>{stage.title}</strong>
                  <small>{locale === "zh" ? "负责方" : "Owner"}: {stage.ownerAgentId}</small>
                </div>
              </header>
              <dl>
                <div>
                  <dt>{locale === "zh" ? "输入" : "Input"}</dt>
                  <dd>{stage.input}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "输出" : "Output"}</dt>
                  <dd>{stage.output}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "校验" : "Validation"}</dt>
                  <dd>{stage.validation}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </BlueprintCollapsiblePanel>

      <BlueprintCollapsiblePanel
        index={3}
        title={t.schemas}
        summary={
          spec.schemas.some((schema) => ["CharacterCard", "SceneBeat", "DialogueLine", "AssetRequest"].includes(schema.name))
            ? locale === "zh"
              ? "字段级结构，用于拆解小说、角色、场景和资产。"
              : "Field-level structures for story, character, scene, and asset handoff."
            : locale === "zh"
              ? "字段级结构，用于承接当前问题的数据源、建议、风险和评估。"
              : "Field-level structures for this request's data sources, recommendations, risks, and evaluation."
        }
      >
        <div className="blueprint-schema-list">
          {spec.schemas.map((schema) => (
            <article className="blueprint-schema-card" key={schema.name}>
              <header>
                <div>
                  <span>{schema.fields.length} {locale === "zh" ? "个字段" : "fields"}</span>
                  <strong>{schema.name}</strong>
                  <small>{schema.purpose}</small>
                </div>
              </header>
              <div className="blueprint-field-list">
                {schema.fields.map((field) => (
                  <div key={`${schema.name}-${field.name}`}>
                    <strong>{field.name}</strong>
                    <span>{field.required ? (locale === "zh" ? "必填" : "required") : locale === "zh" ? "可选" : "optional"}</span>
                    <small>{field.type}</small>
                    <p>{field.description}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </BlueprintCollapsiblePanel>

      <article className="panel-block blueprint-backlog-panel">
        <PanelHeading title={t.implementationBacklog} kicker={String(spec.implementationBacklog.length)} />
        <div className="blueprint-backlog-list">
          {spec.implementationBacklog.map((item) => (
            <article key={item.id} className={`blueprint-backlog-card ${item.priority.toLowerCase()}`}>
              <header>
                <span>{priorityLabel(item.priority.toLowerCase(), locale)}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.phaseName} · {item.ownerAgentId} · {item.effort}</small>
                </div>
              </header>
              <dl>
                <div>
                  <dt>{locale === "zh" ? "交付物" : "Deliverables"}</dt>
                  <dd>{item.deliverables.join(" / ")}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "验收标准" : "Acceptance"}</dt>
                  <dd>{item.acceptanceCriteria.join(" / ")}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "依赖" : "Dependencies"}</dt>
                  <dd>{item.dependencies.join(" / ") || (locale === "zh" ? "无" : "None")}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "跳过风险" : "Risk if skipped"}</dt>
                  <dd>{item.riskIfSkipped}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <div className="action-row">
          <button onClick={() => onExport("backlog")}>{locale === "zh" ? "导出任务清单" : "Export backlog"}</button>
        </div>
      </article>

      <BlueprintCollapsiblePanel index={4} title={t.blueprintSummary} summary={locale === "zh" ? "完整 Markdown 方案正文。" : "Full Markdown plan body."}>
        <pre>{spec.markdown}</pre>
      </BlueprintCollapsiblePanel>
    </>
  );
}

function DecisionInspector(props: {
  locale: Locale;
  result: DecisionRoomResult | null;
  snapshot: DecisionSnapshot | null;
  promptBundle?: ManualProviderBundle;
  reviewLoop: DecisionReviewLoopState | null;
  running: boolean;
  onDeepReview: () => void;
}) {
  const { locale, result, snapshot, promptBundle, reviewLoop, running, onDeepReview } = props;
  const t = appCopy[locale];

  if (!result) {
    return <SideEmpty locale={locale} />;
  }

  const verdict = snapshot?.liveVerdict ?? result.verdict;
  const ranked = snapshot?.liveVerdict?.rankedProposals.length
    ? snapshot.liveVerdict.rankedProposals
    : result.verdict.rankedProposals;
  const scoreStatus = getDecisionScoreStatus(verdict.quorumScore, verdict.dissentIndex, locale);

  return (
    <>
      <section className="score-panel">
        <PanelHeading
          title={t.scoreTransparency}
          help={
            locale === "zh"
              ? "裁决综合分来自排序、效用、置信度和后悔值等结构化指标，不是静态写死，也不是蓝图室的 80% 共识阈值。"
              : "Decision Score is derived from ranking, utility, confidence, and regret metrics; it is not static and is not the Blueprint 80% consensus gate."
          }
        />
        <div className="score-stack">
          <MetricCard label={t.quorumScore} value={verdict.quorumScore} max={100} help={locale === "zh" ? "这是赢家方案的综合裁决评分。80 以上可视为强裁决参考线；70-79 表示可采纳但建议复审。" : "This is the winning option's aggregate decision score. 80+ is a strong-decision reference line; 70-79 is review-ready but should be checked."} />
          <MetricCard label={t.dissentIndex} value={verdict.dissentIndex} suffix="%" max={100} help={locale === "zh" ? "越高表示模型/智能体之间仍有明显分歧。" : "Higher means the council still disagrees materially."} />
        </div>
        <div className={`decision-score-status ${scoreStatus.tone}`}>
          <strong>{scoreStatus.label}</strong>
          <span>{scoreStatus.detail}</span>
          {scoreStatus.tone !== "strong" && (
            <button className="decision-score-action" disabled={running} onClick={onDeepReview}>
              {locale === "zh" ? "基于当前结果复审到 80" : "Review current result to 80"}
            </button>
          )}
        </div>
        {reviewLoop && <DecisionReviewLoopPanel locale={locale} loop={reviewLoop} />}
      </section>

      <StabilityPanel locale={locale} result={result} verdict={verdict} />
      <ProposalSpreadPanel locale={locale} ranked={ranked} />
      <DissentDriversPanel locale={locale} result={result} verdict={verdict} />
      <RiskMatrixPanel locale={locale} risks={result.verdict.riskRadar} />

      <CollapsibleSidePanel title={t.riskRadar} kicker={locale === "zh" ? "风险" : "Risk"} defaultOpen>
        <RiskList locale={locale} risks={result.verdict.riskRadar} />
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={t.preMortem} kicker={locale === "zh" ? "失败模式" : "Failure modes"}>
        <ol className="risk-list numbered">
          {result.verdict.preMortem.map((item) => (
            <li key={item}>{localizeText(item, locale)}</li>
          ))}
        </ol>
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={t.assumptionLedger} kicker={locale === "zh" ? "验证" : "Validation"}>
        <AssumptionLedger locale={locale} assumptions={result.verdict.assumptionLedger} />
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={t.regretMap} kicker={locale === "zh" ? "低后悔值" : "Low regret"}>
        <RegretMap locale={locale} verdict={result.verdict} />
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={t.delphi} kicker={locale === "zh" ? "轮次" : "Rounds"}>
        <DelphiRounds locale={locale} verdict={result.verdict} />
      </CollapsibleSidePanel>

      <ProviderTracePanel locale={locale} trace={snapshot?.providerTrace ?? []} />
      <PromptInspector locale={locale} promptBundle={promptBundle} />
    </>
  );
}

function BlueprintInspector(props: {
  locale: Locale;
  result: BlueprintRoomResult | null;
  snapshot: BlueprintSnapshot | null;
  agentRun: AutonomousBlueprintRun | null;
  records: DecisionHistoryRecord[];
  currentQuestion: string;
}) {
  const { locale, result, snapshot, agentRun, records, currentQuestion } = props;
  const t = appCopy[locale];

  if (!result) {
    return <SideEmpty locale={locale} />;
  }

  return (
    <>
      <section className="score-panel">
        <PanelHeading title={t.blueprintTitle} />
        <div className="score-stack">
          <MetricCard label={t.consensus} value={result.finalConsensusScore} suffix="%" max={100} help={locale === "zh" ? "最终蓝图是否达到 80% 共识阈值。" : "Whether the final Blueprint reached the 80% consensus threshold."} />
          <MetricCard label={t.schemaUsable} value={traceStats(snapshot?.providerTrace ?? []).schemaUsable} max={Math.max(1, traceStats(snapshot?.providerTrace ?? []).calls)} help={locale === "zh" ? "真实模型返回中通过 schema 或修复后可用的数量。" : "Live outputs that were schema-valid or repaired into valid shape."} />
        </div>
      </section>

      <CollapsibleSidePanel title={t.blueprintModelCalls} kicker="Trace" defaultOpen>
        <BlueprintModelCalls locale={locale} trace={snapshot?.providerTrace ?? []} execution={snapshot?.blueprintExecution} />
      </CollapsibleSidePanel>

      {agentRun && (
        <CollapsibleSidePanel title={t.agentPlatformRun} kicker="LangGraph" defaultOpen>
          <AgentRunMiniMap locale={locale} run={agentRun} />
        </CollapsibleSidePanel>
      )}

      <CollapsibleSidePanel title={t.blueprintHistoryComparison} kicker="Compare">
        <BlueprintHistoryComparison locale={locale} current={result} records={records} currentQuestion={currentQuestion} />
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={t.targetOutputs} kicker={String(result.finalSpec.targetOutputs.length)}>
        <ul className="compact-list">
          {result.finalSpec.targetOutputs.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={t.successCriteria} kicker={String(result.finalSpec.successCriteria.length)}>
        <ul className="compact-list">
          {result.finalSpec.successCriteria.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      </CollapsibleSidePanel>

      <CollapsibleSidePanel title={locale === "zh" ? "风险与开放问题" : "Risks and open questions"} kicker="Review">
        <div className="blueprint-panel-grid">
          <section className="blueprint-list-panel risk">
            <PanelHeading title={locale === "zh" ? "风险" : "Risks"} />
            <ul className="compact-list">
              {result.finalSpec.risks.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </section>
          <section className="blueprint-list-panel">
            <PanelHeading title={locale === "zh" ? "开放问题" : "Open questions"} />
            <ul className="compact-list">
              {result.finalSpec.openQuestions.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      </CollapsibleSidePanel>

      <PromptInspector locale={locale} promptBundle={snapshot?.promptBundle} />
    </>
  );
}

function ReadinessPanel(props: {
  locale: Locale;
  health: DecisionApiHealth | null;
  securityPosture: ApiSecurityPosture | null;
  providerStatus?: ProviderStatus;
  providerTest: ProviderConnectionTestResponse | null;
  running: RunProgress | null;
  onProviderTest: () => void;
}) {
  const { locale, health, securityPosture, providerStatus, providerTest, running, onProviderTest } = props;
  const t = appCopy[locale];
  const configuredProviders = Object.values(providerStatus ?? {}).filter((provider) => provider.configured).length;
  const rateLimit = securityPosture?.policy?.rateLimit;
  const providerMode = health?.providerMode ?? "demo";
  const sharingReady = Boolean(
    securityPosture?.controls.securityHeaders &&
      securityPosture.controls.corsAllowlist &&
      !securityPosture.controls.wildcardCors &&
      securityPosture.controls.authenticationRequired &&
      securityPosture.controls.rateLimiting &&
      securityPosture.controls.hstsEnabled
  );

  return (
    <section className="context-panel settings-panel">
      <PanelHeading
        title={t.setupReadiness}
        help={
          locale === "zh"
            ? "这里显示 API、CORS、Token、限流和模型 key 是否准备好。真实模型不可用时，系统会明确标识兜底。"
            : "Shows whether API, CORS, token, rate limit, and model keys are ready. Fallback is always labeled."
        }
      />
      <div className="settings-summary-grid">
        <article>
          <span>{locale === "zh" ? "当前用途" : "Current use"}</span>
          <strong>{sharingReady ? (locale === "zh" ? "可小范围分享" : "Shareable") : locale === "zh" ? "本地自用优先" : "Local use first"}</strong>
          <p>
            {sharingReady
              ? locale === "zh"
                ? "核心安全开关已开启，仍建议先用小范围用户验证真实模型质量。"
                : "Core security controls are enabled. Validate live-model quality with a small group first."
              : locale === "zh"
                ? "适合自己测试。给别人使用前，先补 Token、精确 CORS、限流、请求体限制和 HTTPS/HSTS。"
                : "Good for personal testing. Before sharing, add token, exact CORS, rate limits, body caps, and HTTPS/HSTS."}
          </p>
        </article>
        <article>
          <span>{locale === "zh" ? "模型模式" : "Model mode"}</span>
          <strong>{providerMode === "live" ? t.liveSource : t.demoSource}</strong>
          <p>
            {configuredProviders > 0
              ? locale === "zh"
                ? `已配置 ${configuredProviders} 个真实模型提供方；点击下方按钮可测试连接和 Schema。`
                : `${configuredProviders} live providers configured. Use the button below to test connectivity and schema.`
              : locale === "zh"
                ? "未检测到真实模型 key；结果会使用确定性或 mock 路径，并在结果来源里标识。"
                : "No live provider keys detected. Results use deterministic or mock paths and are labeled as such."}
          </p>
        </article>
      </div>
      <div className="readiness-list">
        <ReadinessItem
          locale={locale}
          label="API"
          status={health ? "good" : "watch"}
          value={health ? health.providerMode : locale === "zh" ? "未连接" : "Unavailable"}
          detail={health ? (locale === "zh" ? "服务端健康检查通过" : "Health check passed") : (locale === "zh" ? "仍可本地确定性运行" : "Local deterministic run remains available")}
        />
        <ReadinessItem
          locale={locale}
          label="CORS"
          status={securityPosture?.controls.corsAllowlist ? "good" : "watch"}
          value={securityPosture?.controls.corsAllowlist ? (locale === "zh" ? "白名单" : "Allowlist") : (locale === "zh" ? "待检查" : "Check")}
          detail={
            securityPosture
              ? securityPosture.controls.wildcardCors
                ? locale === "zh"
                  ? "检测到通配 CORS"
                  : "Wildcard CORS detected"
                : locale === "zh"
                  ? "当前来源应由服务端 allowlist 控制"
                  : "Current origin should be controlled by server allowlist"
              : locale === "zh"
                ? "服务端状态未知"
                : "Server status unknown"
          }
        />
        <ReadinessItem
          locale={locale}
          label="Token"
          status={securityPosture?.controls.authenticationRequired ? "good" : "watch"}
          value={securityPosture?.controls.authenticationRequired ? (locale === "zh" ? "已启用" : "Enabled") : (locale === "zh" ? "未强制" : "Not enforced")}
          detail={locale === "zh" ? "自用可放宽；对外建议强制 Token。" : "Acceptable for self-use; enforce token before sharing."}
        />
        <ReadinessItem
          locale={locale}
          label={locale === "zh" ? "限流" : "Rate limit"}
          status={securityPosture?.controls.rateLimiting ? "good" : "poor"}
          value={
            rateLimit
              ? `${rateLimit.maxRequests}/${formatDuration(rateLimit.windowMs, locale)}`
              : securityPosture?.controls.rateLimiting
                ? locale === "zh"
                  ? "已启用"
                  : "Enabled"
                : locale === "zh"
                  ? "未启用"
                  : "Disabled"
          }
          detail={locale === "zh" ? "防止误触发高频模型调用和浏览器脚本滥用。" : "Prevents accidental high-frequency model calls and browser abuse."}
        />
        <ReadinessItem
          locale={locale}
          label={locale === "zh" ? "请求体" : "Body size"}
          status={securityPosture ? (securityPosture.controls.maxBodyBytes <= 1024 * 1024 ? "good" : "watch") : "watch"}
          value={securityPosture ? formatBytes(securityPosture.controls.maxBodyBytes) : locale === "zh" ? "未知" : "Unknown"}
          detail={locale === "zh" ? "限制单次输入大小；长文建议分段进入蓝图室。" : "Caps one request; split long documents before Blueprint runs."}
        />
        <ReadinessItem
          locale={locale}
          label="HSTS"
          status={securityPosture?.controls.hstsEnabled ? "good" : "watch"}
          value={securityPosture?.controls.hstsEnabled ? (locale === "zh" ? "已启用" : "Enabled") : (locale === "zh" ? "未启用" : "Disabled")}
          detail={locale === "zh" ? "本地 HTTP 可关闭；对外 HTTPS 部署建议开启。" : "Fine off for local HTTP; enable for public HTTPS deployments."}
        />
        <ReadinessItem
          locale={locale}
          label={locale === "zh" ? "模型提供方" : "Providers"}
          status={configuredProviders > 0 ? "good" : "watch"}
          value={String(configuredProviders)}
          detail={locale === "zh" ? "已配置真实模型提供方数量；0 表示会走确定性或 mock 路径。" : "Configured live model providers; 0 means deterministic or mock paths."}
        />
        <ReadinessItem
          locale={locale}
          label={locale === "zh" ? "对外发布" : "Sharing"}
          status={sharingReady ? "good" : "watch"}
          value={sharingReady ? (locale === "zh" ? "基本就绪" : "Ready") : locale === "zh" ? "需加固" : "Harden first"}
          detail={
            locale === "zh"
              ? "给别人用前至少启用 Token、精确 CORS、限流、请求体限制，并在 HTTPS 后启用 HSTS。"
              : "Before sharing, require token, exact CORS, rate limit, body cap, and HSTS behind HTTPS."
          }
        />
      </div>
      <div className="provider-test-panel">
        <div>
          <strong>{t.providerTest}</strong>
          <small>{locale === "zh" ? "返回 key 是否配置、模型是否响应、schema 是否可用。" : "Returns key configuration, model response, and schema usability."}</small>
        </div>
        <button className="secondary-action" disabled={running?.kind === "provider-test"} onClick={onProviderTest}>
          {running?.kind === "provider-test" ? t.providerTesting : t.providerTest}
        </button>
        {providerTest && (
          <div className="provider-test-results">
            {providerTest.results.map((result) => (
              <article
                key={result.provider}
                className={`provider-test-item ${result.schemaUsable ? "good" : result.configured ? "watch" : "poor"}`}
              >
                <span>{result.provider}</span>
                <strong>{result.model}</strong>
                <small>
                  {locale === "zh" ? "配置" : "Configured"}: {yesNo(result.configured, locale)} ·{" "}
                  {locale === "zh" ? "响应" : "Responded"}: {yesNo(result.responded, locale)} · Schema:{" "}
                  {result.validationStatus}
                </small>
                {result.failureReason && <small>{result.failureReason}</small>}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AgentConfigPanel({ locale, agents }: { locale: Locale; agents: ManualProviderAgent[] }) {
  return (
    <section className="agent-config-panel context-panel">
      <PanelHeading
        title={appCopy[locale].agentCouncil}
        kicker={String(agents.length)}
        help={
          locale === "zh"
            ? "这里是模型席位配置。权重会根据历史反馈轻微调整，但真实调用状态仍以 provider trace 为准。"
            : "Model council seats. Historical feedback can adjust weights, but live status still comes from provider trace."
        }
      />
      <div className="agent-config-list">
        {agents.map((agent) => (
          <article className="agent-config-card" key={agent.id}>
            <header>
              <strong>{agent.name}</strong>
              <span>{agent.providerLabel}</span>
            </header>
            <div className="agent-config-row">
              <label>
                <span>{locale === "zh" ? "角色" : "Role"}</span>
                <input value={roleLabels[locale][agent.role]} readOnly />
              </label>
              <label>
                <span>{locale === "zh" ? "权重" : "Weight"}</span>
                <input value={agent.effectiveWeight ?? agent.weight} readOnly />
              </label>
            </div>
            {agent.reputation && (
              <div className="agent-reputation-note">
                <span>{locale === "zh" ? "信誉权重" : "Reputation"}</span>
                <strong>{agent.reputation.score}/100 · {domainLabel(agent.reputation.domain, locale)}</strong>
                <small>{locale === "zh" ? "倍率" : "Multiplier"} {agent.reputation.weightMultiplier}</small>
                <p>{agent.reputation.reasons.slice(0, 2).map((reason) => localizeText(reason, locale)).join(" / ")}</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ContextPanel({ locale, context }: { locale: Locale; context: DecisionContext }) {
  return (
    <section className="context-panel">
      <PanelHeading title={appCopy[locale].contextTitle} />
      <dl className="context-grid">
        <div>
          <dt>{locale === "zh" ? "阶段" : "Stage"}</dt>
          <dd>{productStageLabel(context.productStage, locale)}</dd>
        </div>
        <div>
          <dt>{locale === "zh" ? "团队" : "Team"}</dt>
          <dd>{localizeText(context.teamProfile, locale)}</dd>
        </div>
        <div>
          <dt>{locale === "zh" ? "可靠性" : "Reliability"}</dt>
          <dd>{sensitivityLabel(context.reliabilityRequirement, locale)}</dd>
        </div>
        <div>
          <dt>{locale === "zh" ? "安全" : "Security"}</dt>
          <dd>{sensitivityLabel(context.securityRequirement, locale)}</dd>
        </div>
      </dl>
      <div className="token-list" aria-label={locale === "zh" ? "候选方案" : "Candidate options"}>
        {context.candidateOptions.map((option) => (
          <span key={option}>{localizeText(option, locale)}</span>
        ))}
      </div>
    </section>
  );
}

function WorkflowPanel({ locale, workspaceMode, hasResult }: { locale: Locale; workspaceMode: WorkspaceMode; hasResult: boolean }) {
  const steps = workflowStages[workspaceMode][locale];
  return (
    <section className="workflow-panel">
      <PanelHeading title={appCopy[locale].stagesTitle} />
      <ol>
        {steps.map((step, index) => (
          <li key={step} className={hasResult || index === 0 ? "complete" : ""}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}

function HistoryPanel({
  locale,
  records,
  onRestore
}: {
  locale: Locale;
  records: DecisionHistoryRecord[];
  onRestore: (record: DecisionHistoryRecord) => void;
}) {
  return (
    <section className="context-panel">
      <PanelHeading title={appCopy[locale].historyTitle} />
      {records.length === 0 ? (
        <p className="field-help">{appCopy[locale].historyEmpty}</p>
      ) : (
        <ul className="history-list">
          {records.slice(0, 8).map((record) => (
            <li key={record.id}>
              <button onClick={() => onRestore(record)}>
                <strong>{record.question}</strong>
                <span>
                  {record.kind === "blueprint" ? appCopy[locale].workspaceBlueprint : appCopy[locale].workspaceDecision} ·{" "}
                  {record.providerMode} · {record.quorumScore}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RunProgressPanel({ locale, running }: { locale: Locale; running: RunProgress }) {
  return (
    <article className="run-progress-panel">
      <header>
        <span>{running.stage}</span>
        <strong>{running.progress}%</strong>
      </header>
      <div className="run-progress-bar">
        <span style={{ transform: `scaleX(${clampNumber(running.progress, 0, 100) / 100})` }} />
      </div>
      <p>{running.message}</p>
      {running.modelCall && (
        <div className="model-call-progress">
          {locale === "zh" ? "当前模型/阶段：" : "Current model/stage: "}
          {running.modelCall}
        </div>
      )}
    </article>
  );
}

function QuestionExamplesPanel({
  locale,
  workspaceMode,
  examples,
  onSelect
}: {
  locale: Locale;
  workspaceMode: WorkspaceMode;
  examples: string[];
  onSelect: (question: string) => void;
}) {
  return (
    <section className="question-examples" aria-label={locale === "zh" ? "参考问题" : "Reference questions"}>
      <div>
        <strong>{locale === "zh" ? "参考问题" : "Reference questions"}</strong>
        <span>
          {workspaceMode === "blueprint"
            ? locale === "zh"
              ? "点一个普通说法，再按你的真实情况改。"
              : "Pick a plain-language request, then adapt it."
            : locale === "zh"
              ? "点一个取舍问题，再补团队、时间和约束。"
              : "Pick a trade-off question, then add team, timing, and constraints."}
        </span>
      </div>
      <div className="question-example-list">
        {examples.map((example) => (
          <button type="button" key={example} onClick={() => onSelect(example)}>
            {example}
          </button>
        ))}
      </div>
    </section>
  );
}

type LiveQuestionPreview = {
  label: string;
  title: string;
  description: string;
  tags: string[];
};

function buildLiveQuestionPreview(input: {
  locale: Locale;
  workspaceMode: WorkspaceMode;
  question: string;
  context: DecisionContext;
}): LiveQuestionPreview {
  const { locale, workspaceMode, question, context } = input;
  const zh = locale === "zh";
  const normalizedQuestion = question.replace(/\s+/g, " ").trim();
  const fallbackQuestion = workspaceMode === "blueprint" ? blueprintDefaultQuestions[locale] : defaultQuestions[locale];
  const sourceQuestion = normalizedQuestion || fallbackQuestion;
  const tags =
    workspaceMode === "blueprint"
      ? blueprintQuestionPreviewTags(sourceQuestion, locale)
      : decisionQuestionPreviewTags(sourceQuestion, locale, context);
  const visibleTags = uniquePreviewItems(tags).slice(0, 8);

  if (workspaceMode === "blueprint") {
    return {
      label: normalizedQuestion ? (zh ? "当前需求" : "Current request") : zh ? "示例" : "Example",
      title: compactPreviewText(sourceQuestion, zh ? 92 : 150),
      description:
        visibleTags.length > 0
          ? zh
            ? `已识别：${visibleTags.slice(0, 6).join("、")}。运行后会围绕这些内容生成 Agent 分工、工作流、Schema、风险和最终方案。`
            : `Detected: ${visibleTags.slice(0, 6).join(", ")}. The run will use these to generate agents, workflow, schemas, risks, and the final plan.`
          : zh
            ? "运行后会根据当前需求生成 Agent 分工、工作流、Schema、风险和最终方案。"
            : "The run will generate agents, workflow, schemas, risks, and the final plan from the current request.",
      tags: visibleTags
    };
  }

  return {
    label: normalizedQuestion ? (zh ? "当前问题" : "Current question") : zh ? "示例" : "Example",
    title: compactPreviewText(sourceQuestion, zh ? 92 : 150),
    description:
      context.candidateOptions.length > 0
        ? zh
          ? `已识别候选路径：${context.candidateOptions.slice(0, 3).join("、")}。运行后会比较收益、风险、成本、复杂度和可逆性。`
          : `Detected options: ${context.candidateOptions.slice(0, 3).join(", ")}. The run will compare value, risk, cost, complexity, and reversibility.`
        : zh
          ? "运行后会根据当前问题生成候选方案、风险、分歧和 ADR。"
          : "The run will generate options, risks, disagreement, and an ADR from the current question.",
    tags: visibleTags
  };
}

function blueprintQuestionPreviewTags(question: string, locale: Locale): string[] {
  const zh = locale === "zh";
  const text = question.toLowerCase();
  const candidates: Array<[RegExp, string]> = zh
    ? [
        [/订单|order/, "订单数据"],
        [/库存|inventory|stock|sku/, "库存数据"],
        [/广告|投放|预算|campaign|ad/, "广告投放"],
        [/客服|对话|support|conversation/, "客服对话"],
        [/简报|brief/, "每日运营简报"],
        [/补货|replenishment/, "补货建议"],
        [/差评|评价|review/, "差评处理"],
        [/话术|回复|reply/, "客服话术"],
        [/agent|智能体|多 agent|多agent/, "Agent 分工"],
        [/数据流|数据从|workflow|工作流/, "数据流与工作流"],
        [/schema|字段|json/, "JSON Schema"],
        [/风险|错误建议|积压|浪费|误回复/, "风险控制"],
        [/mvp|迭代|版本/, "MVP 路线"],
        [/评估|准确|延迟|成本|采纳率|效果/, "评估指标"]
      ]
    : [
        [/order/, "order data"],
        [/inventory|stock|sku/, "inventory data"],
        [/ad|campaign|budget/, "ad campaigns"],
        [/support|conversation/, "support conversations"],
        [/brief/, "daily brief"],
        [/replenishment/, "replenishment advice"],
        [/review|rating/, "review handling"],
        [/reply|script/, "support scripts"],
        [/agent|multi-agent/, "agent responsibilities"],
        [/workflow|data flow/, "workflow"],
        [/schema|field|json/, "JSON Schema"],
        [/risk|wrong|waste|overstock/, "risk controls"],
        [/mvp|iteration|version/, "MVP roadmap"],
        [/evaluation|accuracy|latency|cost|adoption/, "evaluation metrics"]
      ];

  return candidates.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
}

function decisionQuestionPreviewTags(question: string, locale: Locale, context: DecisionContext): string[] {
  const zh = locale === "zh";
  const text = question.toLowerCase();
  const keywordTags: Array<[RegExp, string]> = zh
    ? [
        [/微服务|microservice/, "微服务"],
        [/单体|monolith/, "单体架构"],
        [/postgres|tenant|租户/, "租户隔离"],
        [/成本|预算|cost/, "成本"],
        [/可靠|稳定|reliability/, "可靠性"],
        [/安全|security/, "安全"],
        [/交付|速度|time/, "交付速度"]
      ]
    : [
        [/microservice/, "microservices"],
        [/monolith/, "monolith"],
        [/postgres|tenant/, "tenant isolation"],
        [/cost|budget/, "cost"],
        [/reliability|stable/, "reliability"],
        [/security/, "security"],
        [/delivery|speed|time/, "delivery speed"]
      ];

  return [
    ...keywordTags.filter(([pattern]) => pattern.test(text)).map(([, label]) => label),
    ...context.candidateOptions.slice(0, 4)
  ];
}

function uniquePreviewItems(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function compactPreviewText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function EmptyState({
  locale,
  workspaceMode,
  question,
  context
}: {
  locale: Locale;
  workspaceMode: WorkspaceMode;
  question: string;
  context: DecisionContext;
}) {
  const preview = buildLiveQuestionPreview({ locale, workspaceMode, question, context });

  return (
    <article className="empty-state">
      <PanelHeading
        title={appCopy[locale].readyTitle}
        kicker={workspaceMode === "blueprint" ? appCopy[locale].workspaceBlueprint : appCopy[locale].workspaceDecision}
      />
      <p>{appCopy[locale].readyText}</p>
      <div className="live-question-preview">
        <span>{preview.label}</span>
        <strong>{preview.title}</strong>
        <p>{preview.description}</p>
        {preview.tags.length > 0 && (
          <div className="live-question-tags" aria-label={locale === "zh" ? "识别到的关注点" : "Detected focus areas"}>
            {preview.tags.map((tag) => (
              <small key={tag}>{tag}</small>
            ))}
          </div>
        )}
      </div>
      <div className="empty-preview">
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

function SideEmpty({ locale }: { locale: Locale }) {
  return (
    <section className="empty-state">
      <PanelHeading title={appCopy[locale].readyTitle} />
      <p>{locale === "zh" ? "运行后这里会展示指标解释、分歧来源、风险矩阵、模型 trace 和 Prompt 包。" : "After a run this panel shows metrics, dissent drivers, risk matrix, model trace, and prompt bundle."}</p>
    </section>
  );
}

function SidebarDisclosure({
  title,
  summary,
  children,
  defaultOpen = false
}: {
  title: string;
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="sidebar-disclosure" open={defaultOpen}>
      <summary>
        <strong>{title}</strong>
        <small>{summary}</small>
      </summary>
      <div className="sidebar-disclosure-body">{children}</div>
    </details>
  );
}

function AgentCard({ locale, agent }: { locale: Locale; agent: Agent }) {
  return (
    <article className="agent-card">
      <span className="agent-avatar">{agent.name.slice(0, 2).toUpperCase()}</span>
      <div>
        <strong>{roleLabels[locale][agent.role]}</strong>
        <small>
          {agent.provider.toUpperCase()} · w{agent.weight}
        </small>
      </div>
    </article>
  );
}

function ProposalRow({
  locale,
  proposal,
  rank,
  criteriaScores
}: {
  locale: Locale;
  proposal: ScoredProposal;
  rank: number;
  criteriaScores?: CriteriaScores;
}) {
  return (
    <article className="matrix-row">
      <div className="matrix-rank">
        <span>#{rank}</span>
        <strong>{proposal.quorumScore}</strong>
      </div>
      <div className="matrix-body">
        <header>
          <h3>{formatProposalId(proposal.proposalId, locale)}</h3>
          <span>{Math.round(proposal.confidence * 100)}%</span>
        </header>
        <div className="score-bar">
          <i style={{ width: `${clampNumber(proposal.quorumScore, 0, 100)}%` }} />
        </div>
        {criteriaScores && (
          <div className="criteria-grid">
            {Object.entries(criteriaScores).slice(0, 8).map(([key, value]) => (
              <div key={key}>
                <span>{criteriaLabels[locale][key as keyof CriteriaScores]}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function WinnerExplanation({
  locale,
  result,
  ranked,
  liveVerdict
}: {
  locale: Locale;
  result: DecisionRoomResult;
  ranked: ScoredProposal[];
  liveVerdict?: DecisionApiResponse["liveVerdict"];
}) {
  const winner = ranked[0];
  const proposal = result.revisedProposals.find((item) => item.id === winner?.proposalId);
  const liveReasons = !proposal && liveVerdict?.whyItWon?.length ? liveVerdict.whyItWon : [];

  if (!winner) return null;

  return (
    <div className="winner-explanation">
      <div className="winner-explanation-header">
        <div>
          <span>{locale === "zh" ? "为什么赢" : "Why it won"}</span>
          <h3>{formatProposalId(winner.proposalId, locale)}</h3>
        </div>
        <strong>{winner.quorumScore}/100</strong>
      </div>
      <p className="score-formula">
        {locale === "zh"
          ? "裁决综合分 = 排序分 + 加权效用 + 置信度 - 后悔惩罚。"
          : "Decision Score = Borda ranking + weighted utility + confidence - regret penalty."}
      </p>
      <div className="score-breakdown-grid">
        <BreakdownCard label={locale === "zh" ? "排序分" : "Borda"} value={winner.bordaScore} />
        <BreakdownCard label={locale === "zh" ? "效用" : "Utility"} value={winner.weightedUtility} />
        <BreakdownCard label={locale === "zh" ? "置信度" : "Confidence"} value={Math.round(winner.confidence * 100)} />
        <BreakdownCard label={locale === "zh" ? "后悔惩罚" : "Regret"} value={-winner.regretPenalty} negative />
      </div>
      {proposal ? (
        <ul className="compact-list">
          {proposal.strengths.slice(0, 3).map((item) => (
            <li key={item}>{localizeText(item, locale)}</li>
          ))}
        </ul>
      ) : liveReasons.length > 0 ? (
        <ul className="compact-list">
          {liveReasons.slice(0, 3).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BreakdownCard({
  label,
  value,
  negative = false
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className={`score-breakdown-card ${negative ? "negative" : "positive"}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StabilityPanel({
  locale,
  result,
  verdict
}: {
  locale: Locale;
  result: DecisionRoomResult;
  verdict: Verdict | DecisionApiResponse["liveVerdict"];
}) {
  const stableWinnerRate = result.verdict.ahpAnalysis.stableWinnerRate;
  const dissentIndex = verdict?.dissentIndex ?? result.verdict.dissentIndex;
  const state = stableWinnerRate >= 80 && dissentIndex < 45 ? "stable" : stableWinnerRate >= 60 ? "watch" : "fragile";

  return (
    <section className={`side-panel stability-panel ${state === "stable" ? "" : state}`}>
      <PanelHeading
        title={appCopy[locale].stability}
        help={
          locale === "zh"
            ? "稳定赢家率和分歧指数不是一回事：一个看权重扰动后赢家是否变化，一个看当前席位是否分歧。"
            : "Stable winner rate and dissent index differ: one tests weight perturbations, the other current council disagreement."
        }
      />
      <strong>
        {locale === "zh"
          ? stableWinnerRate >= 80 && dissentIndex >= 50
            ? "赢家在权重扰动下稳定，但当前讨论仍存在高分歧。"
            : stableWinnerRate >= 80
              ? "赢家路径较稳定。"
              : "赢家稳定性需要继续观察。"
          : stableWinnerRate >= 80 && dissentIndex >= 50
            ? "Winner is stable under weight perturbation, but current dissent remains high."
            : stableWinnerRate >= 80
              ? "Winner path is relatively stable."
              : "Winner stability still needs review."}
      </strong>
      <dl className="stability-grid">
        <div>
          <dt>{locale === "zh" ? "赢家稳定率" : "Stable winner rate"}</dt>
          <dd>{stableWinnerRate}%</dd>
        </div>
        <div>
          <dt>{appCopy[locale].dissentIndex}</dt>
          <dd>{dissentIndex}%</dd>
        </div>
      </dl>
      <div className="stability-callouts">
        <p>
          <span>{locale === "zh" ? "解读" : "Reading"}</span>
          {locale === "zh"
            ? "如果稳定率高但分歧也高，表示“最终赢家不容易变”，但不代表裁决综合分已经达到强裁决状态；反对意见仍值得进入风险账本。"
            : "If stability and dissent are both high, the winner is hard to dislodge, but objections still belong in the risk ledger."}
        </p>
      </div>
    </section>
  );
}

function getDecisionScoreStatus(score: number, dissentIndex: number, locale: Locale): {
  tone: "strong" | "watch" | "fragile";
  label: string;
  detail: string;
} {
  if (score >= 80 && dissentIndex < 50) {
    return {
      tone: "strong",
      label: locale === "zh" ? "强裁决" : "Strong decision",
      detail:
        locale === "zh"
          ? "裁决综合分达到 80 以上，且分歧没有明显过高。仍建议查看风险账本和假设账本。"
          : "Decision Score is at least 80 and dissent is not materially high. Still review risks and assumptions."
    };
  }

  if (score >= 80) {
    return {
      tone: "watch",
      label: locale === "zh" ? "强裁决，但仍有争议" : "Strong score, contested",
      detail:
        locale === "zh"
          ? "裁决综合分达到 80 以上，但分歧指数偏高。操作：先看右侧分歧来源和风险矩阵；如需再压测，点“基于当前结果复审到 80”。"
          : "Decision Score is at least 80, but dissent is high. Next: inspect dissent drivers and risk matrix; use Review current result to 80 for another stress pass."
    };
  }

  if (score >= 70) {
    return {
      tone: "watch",
      label: locale === "zh" ? "可采纳，建议复审" : "Usable, review recommended",
      detail:
        locale === "zh"
          ? "这个分数低于 80 的强裁决参考线；它不是蓝图室共识阈值失败。操作：看右侧分歧来源、风险矩阵、后悔地图；点“基于当前结果复审到 80”做增量复审。"
          : "This is below the 80 strong-decision reference line. It is not a Blueprint consensus-gate failure. Next: inspect dissent, risk, and regret; use Review current result to 80 for incremental review."
    };
  }

  return {
    tone: "fragile",
    label: locale === "zh" ? "低信心，建议补充信息" : "Low confidence, add context",
    detail:
      locale === "zh"
        ? "裁决综合分偏低。操作：先在左侧问题里补充约束、候选方案或评价标准，再点“运行决策室”；如果仍偏低，点“基于当前结果复审到 80”。"
        : "Decision Score is low. Add constraints, options, or criteria in the prompt, then run Decision Room again; if it remains low, use Review current result to 80."
  };
}

function DecisionReviewLoopPanel({ locale, loop }: { locale: Locale; loop: DecisionReviewLoopState }) {
  const statusLabel =
    locale === "zh"
      ? {
          running: "复审中",
          passed: "已达到阈值",
          needs_review: "仍需复审",
          cancelled: "已取消"
        }[loop.status]
      : {
          running: "Reviewing",
          passed: "Threshold met",
          needs_review: "Needs review",
          cancelled: "Cancelled"
        }[loop.status];

  return (
    <div className={`decision-review-loop ${loop.status}`}>
      <header>
        <div>
          <span>{locale === "zh" ? "深度复审" : "Deep review"}</span>
          <strong>{statusLabel}</strong>
        </div>
        <small>
          {locale === "zh"
            ? `基线 ${loop.baselineScore} / 当前最佳 ${loop.bestScore} / 目标 ${loop.targetScore}`
            : `Baseline ${loop.baselineScore} / best ${loop.bestScore} / target ${loop.targetScore}`}
        </small>
      </header>
      <p>{loop.finalMessage}</p>
      {loop.rounds.length > 0 && (
        <ol>
          {loop.rounds.map((round) => (
            <li className={round.accepted ? "accepted" : "rejected"} key={`${round.round}-${round.score}-${round.selectedProposalId}`}>
              <div>
                <span>
                  {locale === "zh" ? `第 ${round.round} 轮` : `Round ${round.round}`}
                </span>
                <strong>{round.score}</strong>
              </div>
              <small>
                {formatProposalId(round.selectedProposalId, locale)} ·{" "}
                {round.accepted
                  ? locale === "zh"
                    ? "已采用"
                    : "promoted"
                  : locale === "zh"
                    ? "仅记录风险"
                    : "risk evidence only"} ·{" "}
                {round.deltaFromBest >= 0 ? "+" : ""}
                {round.deltaFromBest} ·{" "}
                {locale === "zh" ? "分歧" : "dissent"} {round.dissentIndex}% ·{" "}
                {round.providerMode === "live" && round.traceCalls > 0
                  ? locale === "zh"
                    ? `真实模型 ${round.traceCalls} 次调用`
                    : `${round.traceCalls} live calls`
                  : locale === "zh"
                    ? "确定性兜底"
                    : "deterministic fallback"}
              </small>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function scoreFromDecisionResponse(response: {
  liveVerdict: DecisionApiResponse["liveVerdict"];
  result: DecisionRoomResult;
}): number {
  return response.liveVerdict?.quorumScore ?? response.result.verdict.quorumScore;
}

function dissentFromDecisionResponse(response: {
  liveVerdict: DecisionApiResponse["liveVerdict"];
  result: DecisionRoomResult;
}): number {
  return response.liveVerdict?.dissentIndex ?? response.result.verdict.dissentIndex;
}

function buildDecisionReviewContext(input: {
  context: DecisionContext;
  bestResponse: DecisionApiResponse | null;
  targetScore: number;
  locale: Locale;
}): DecisionContext {
  if (!input.bestResponse) {
    return input.context;
  }

  const verdict = input.bestResponse.liveVerdict ?? input.bestResponse.result.verdict;
  const currentBest = formatProposalId(verdict.selectedProposalId, input.locale);
  const continuationConstraint =
    input.locale === "zh"
      ? `深度复审续跑：必须基于当前最佳裁决继续改进，不要从零开始重选。当前最佳是 ${currentBest}，裁决综合分 ${verdict.quorumScore}/100，分歧指数 ${verdict.dissentIndex}%。目标是补齐质询、风险缓解、迁移路径和回滚条件后，让结果更稳健地接近 ${input.targetScore}+。`
      : `Deep review continuation: improve from the current best decision instead of restarting from scratch. Current best is ${currentBest}, Decision Score ${verdict.quorumScore}/100, dissent ${verdict.dissentIndex}%. The goal is to strengthen critiques, mitigations, migration path, and rollback conditions toward ${input.targetScore}+.`;
  const guardrailAssumption =
    input.locale === "zh"
      ? "如果新复审结果低于当前最佳，只把它作为风险证据，不替换当前最佳裁决。"
      : "If a new review scores below the current best, treat it as risk evidence rather than replacing the current best decision.";

  return {
    ...input.context,
    existingConstraints: uniquePreviewItems([...input.context.existingConstraints, continuationConstraint]).slice(-8),
    assumptions: uniquePreviewItems([...input.context.assumptions, guardrailAssumption]).slice(-8)
  };
}

function decisionReviewRoundFromResponse(input: {
  response: DecisionApiResponse;
  round: number;
  mode: DecisionMode;
  targetScore: number;
  fallbackUsed: boolean;
  bestScoreBeforeRound: number;
  accepted: boolean;
}): DecisionReviewRound {
  const verdict = input.response.liveVerdict ?? input.response.result.verdict;
  const stats = traceStats(input.response.providerTrace);

  return {
    round: input.round,
    mode: input.mode,
    score: verdict.quorumScore,
    deltaFromBest: verdict.quorumScore - input.bestScoreBeforeRound,
    dissentIndex: verdict.dissentIndex,
    selectedProposalId: verdict.selectedProposalId,
    providerMode: input.response.providerMode,
    traceCalls: stats.calls,
    reachedTarget: verdict.quorumScore >= input.targetScore,
    fallbackUsed: input.fallbackUsed || input.response.providerMode === "demo" || stats.calls === 0,
    accepted: input.accepted
  };
}

function decisionReviewFinalMessage(input: {
  locale: Locale;
  stopReason: "target_met" | "round_budget" | "deterministic_repeated" | "no_improvement";
  targetScore: number;
  finalRound?: DecisionReviewRound;
  bestScore: number;
  promoted: boolean;
  fallbackError?: string;
}): string {
  const { locale, stopReason, targetScore, finalRound, bestScore, promoted, fallbackError } = input;
  const finalScore = bestScore;

  if (stopReason === "target_met") {
    return locale === "zh"
      ? `深度复审已达到 ${targetScore}：当前最佳裁决综合分 ${finalScore}。可以继续查看分歧来源和风险矩阵后导出结果。`
      : `Deep review reached ${targetScore}: final Decision Score is ${finalScore}. Review dissent and risks before exporting.`;
  }

  if (stopReason === "no_improvement") {
    const challengedScore = finalRound?.score ?? 0;
    return locale === "zh"
      ? `复审没有超过当前最佳：挑战轮得分 ${challengedScore}，当前最佳仍保留为 ${finalScore}。低分复审已作为风险证据记录，没有覆盖原结果。`
      : `Review did not beat the current best: challenger scored ${challengedScore}, current best remains ${finalScore}. The lower score was recorded as risk evidence and did not replace the result.`;
  }

  if (stopReason === "deterministic_repeated") {
    const fallbackNote = fallbackError ? ` ${fallbackError}` : "";
    return locale === "zh"
      ? `本次未达到 ${targetScore}，当前最佳裁决综合分 ${finalScore}。当前没有可用真实模型复审证据，继续重复确定性结果不会产生新分歧；请补充约束、候选方案，或配置真实模型后再复审。${fallbackNote}`
      : `The run did not reach ${targetScore}; final Decision Score is ${finalScore}. No valid live review evidence was available, so repeating deterministic output would not add new disagreement. Add constraints/options or configure live models before reviewing again.${fallbackNote}`;
  }

  return locale === "zh"
    ? `${promoted ? "复审已有改进，但" : ""}最多复审轮次已用完，当前最佳裁决综合分 ${finalScore}，仍低于 ${targetScore}。建议进入人工复审：补充关键约束、不可接受风险、候选方案边界后再运行。`
    : `The review round budget was exhausted. Current best Decision Score is ${finalScore}, still below ${targetScore}. Add constraints, unacceptable risks, or option boundaries before running again.`;
}

function ProposalSpreadPanel({ locale, ranked }: { locale: Locale; ranked: ScoredProposal[] }) {
  return (
    <section className="side-panel spread-panel">
      <PanelHeading title={appCopy[locale].spread} />
      <div className="spread-list">
        {ranked.map((proposal, index) => (
          <article key={proposal.proposalId}>
            <header>
              <span>{index + 1}</span>
              <strong>{formatProposalId(proposal.proposalId, locale)}</strong>
              <small>{proposal.quorumScore}</small>
            </header>
            <div className="spread-bar">
              <span style={{ width: `${clampNumber(proposal.quorumScore, 0, 100)}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DissentDriversPanel({
  locale,
  result,
  verdict
}: {
  locale: Locale;
  result: DecisionRoomResult;
  verdict: Verdict | DecisionApiResponse["liveVerdict"];
}) {
  const remaining = verdict && "remainingDissent" in verdict ? verdict.remainingDissent : result.verdict.preMortem.slice(0, 3);
  return (
    <section className="side-panel dissent-panel">
      <PanelHeading title={appCopy[locale].dissentDrivers} />
      <div className="dissent-driver-list">
        {remaining.slice(0, 4).map((item, index) => (
          <article key={`${item}-${index}`}>
            <header>
              <strong>{locale === "zh" ? `分歧 ${index + 1}` : `Dissent ${index + 1}`}</strong>
              <span>{verdict?.dissentIndex ?? result.verdict.dissentIndex}%</span>
            </header>
            <p>{localizeText(item, locale)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function RiskMatrixPanel({ locale, risks }: { locale: Locale; risks: Risk[] }) {
  const counts = {
    high: risks.filter((risk) => risk.severity === "high").length,
    medium: risks.filter((risk) => risk.severity === "medium").length,
    low: risks.filter((risk) => risk.severity === "low").length
  };

  return (
    <section className="side-panel risk-matrix-panel">
      <PanelHeading title={appCopy[locale].riskMatrix} />
      <div className="risk-matrix-grid">
        {Object.entries(counts).map(([severity, count]) => (
          <div className="risk-matrix-row" key={severity}>
            <span>{severityLabels[locale][severity as Risk["severity"]]}</span>
            <strong>{count}</strong>
            <small className={severity}>{severityLabels[locale][severity as Risk["severity"]]}</small>
            <small>{locale === "zh" ? "发生概率" : "Likelihood"}</small>
            <small>{locale === "zh" ? "影响" : "Impact"}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function RiskList({ locale, risks }: { locale: Locale; risks: Risk[] }) {
  return (
    <ul className="risk-list">
      {risks.map((risk, index) => (
        <li key={`${risk.category}-${risk.description}-${index}`}>
          <span className={`severity ${risk.severity}`}>{severityLabels[locale][risk.severity]}</span>
          <strong>{riskCategoryLabels[locale][risk.category]}</strong>
          <p>{localizeText(risk.description, locale)}</p>
          <small>{localizeText(risk.mitigation, locale)}</small>
        </li>
      ))}
    </ul>
  );
}

function AssumptionLedger({ locale, assumptions }: { locale: Locale; assumptions: AssumptionLedgerEntry[] }) {
  const priority = assumptions
    .map((item) => ({ ...item, score: item.riskLevel === "high" ? 100 : item.riskLevel === "medium" ? 66 : 33 }))
    .sort((a, b) => b.score - a.score);
  return (
    <>
      <div className="assumption-priority-chart">
        <header>
          <strong>{locale === "zh" ? "假设验证优先级" : "Assumption validation priority"}</strong>
          <span>{locale === "zh" ? "优先处理高风险、影响范围大的假设。" : "Validate high-risk assumptions first."}</span>
        </header>
        {priority.map((item) => (
          <div className="assumption-priority-row" key={item.id}>
            <span>{severityLabels[locale][item.riskLevel]}</span>
            <div>
              <i style={{ width: `${item.score}%` }} />
            </div>
            <strong>{item.score}</strong>
          </div>
        ))}
      </div>
      <div className="assumption-list">
        {assumptions.map((item) => (
          <article className="assumption-card" key={item.id}>
            <header>
              <span className={`severity ${item.riskLevel}`}>{severityLabels[locale][item.riskLevel]}</span>
              <strong>{localizeText(item.assumption, locale)}</strong>
            </header>
            <dl>
              <div>
                <dt>{locale === "zh" ? "验证问题" : "Question"}</dt>
                <dd>{localizeText(item.validationQuestion, locale)}</dd>
              </div>
              <div>
                <dt>{locale === "zh" ? "验证动作" : "Action"}</dt>
                <dd>{localizeText(item.validationAction, locale)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

function RegretMap({ locale, verdict }: { locale: Locale; verdict: Verdict }) {
  return (
    <div className="regret-map-list">
      {verdict.regretMap.slice(0, 5).map((entry) => (
        <article className="regret-card" key={entry.proposalId}>
          <header>
            <span>#{entry.minimaxRank}</span>
            <strong>{formatProposalId(entry.proposalId, locale)}</strong>
          </header>
          <dl>
            <div>
              <dt>{locale === "zh" ? "最坏场景" : "Worst scenario"}</dt>
              <dd>{localizeText(entry.worstScenario, locale)}</dd>
            </div>
            <div>
              <dt>{locale === "zh" ? "最坏后悔值" : "Worst regret"}</dt>
              <dd>{entry.worstRegret}</dd>
            </div>
            <div>
              <dt>{locale === "zh" ? "平均后悔值" : "Average regret"}</dt>
              <dd>{entry.averageRegret}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function DelphiRounds({ locale, verdict }: { locale: Locale; verdict: Verdict }) {
  return (
    <ol className="delphi-round-list">
      {verdict.delphiRounds.map((round) => (
        <li key={round.phase}>
          <header>
              <span>{statusValueLabel(round.status, locale)}</span>
            <strong>{localizeText(round.title, locale)}</strong>
          </header>
          <p>{localizeText(round.summary, locale)}</p>
          <dl>
            <div>
              <dt>{locale === "zh" ? "匿名性" : "Anonymity"}</dt>
              <dd>{anonymityLabel(round.anonymity, locale)}</dd>
            </div>
            <div>
              <dt>{locale === "zh" ? "输入" : "Inputs"}</dt>
              <dd>{round.inputCount}</dd>
            </div>
            <div>
              <dt>{locale === "zh" ? "输出" : "Outputs"}</dt>
              <dd>{round.outputCount}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}

function ProviderTracePanel({ locale, trace }: { locale: Locale; trace: ProviderTraceEntry[] }) {
  const groups = groupTraceByPhase(trace);
  return (
    <CollapsibleSidePanel title={appCopy[locale].modelTrace} kicker={String(trace.length)}>
      {trace.length === 0 ? (
        <p className="field-help">{appCopy[locale].noLiveModel}</p>
      ) : (
        <div className="trace-phase-list">
          {Object.entries(groups).map(([phase, entries]) => (
            <details className="trace-phase-group" key={phase} open={phase === "proposal"}>
              <summary>
                <span>{phaseLabels[locale][phase] ?? phase}</span>
                <small>{entries.length} {locale === "zh" ? "次调用" : "calls"}</small>
              </summary>
              <div className="trace-list">
                {entries.map((entry) => (
                  <TraceCard key={entry.id} locale={locale} entry={entry} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </CollapsibleSidePanel>
  );
}

function TraceCard({ locale, entry }: { locale: Locale; entry: ProviderTraceEntry }) {
  return (
    <article className={`trace-card ${entry.status === "error" ? "error" : ""}`}>
      <header>
        <span>{entry.provider}</span>
        <strong>{entry.agentName ?? entry.model}</strong>
        <small>
          {entry.model} · {entry.durationMs}ms · JSON {yesNo(entry.jsonParsed, locale)}
        </small>
      </header>
      <span className="trace-diagnostic">
        {traceValidationLabel(entry.validationStatus ?? (entry.jsonParsed ? "parsed" : "unparsed"), locale)}
        {entry.retryCount ? ` · ${locale === "zh" ? "重试" : "retry"} ${entry.retryCount}` : ""}
      </span>
      <p>{entry.error ?? entry.text}</p>
      <details className="trace-raw">
        <summary>{locale === "zh" ? "查看原始输出" : "View raw output"}</summary>
        <pre>{JSON.stringify(entry.normalized ?? entry.parsed ?? entry.text, null, 2)}</pre>
      </details>
    </article>
  );
}

function PromptInspector({ locale, promptBundle }: { locale: Locale; promptBundle?: ManualProviderBundle }) {
  if (!promptBundle) {
    return (
      <CollapsibleSidePanel title={appCopy[locale].promptBundle} kicker="0">
        <p className="field-help">{locale === "zh" ? "运行后会显示 Prompt 包。" : "Prompt bundle appears after a run."}</p>
      </CollapsibleSidePanel>
    );
  }

  const groups = promptBundle.prompts.reduce<Record<string, typeof promptBundle.prompts>>((acc, prompt) => {
    acc[prompt.phase] = [...(acc[prompt.phase] ?? []), prompt];
    return acc;
  }, {});

  return (
    <CollapsibleSidePanel title={appCopy[locale].promptBundle} kicker={String(promptBundle.prompts.length)}>
      <div className="prompt-phase-list">
        {Object.entries(groups).map(([phase, prompts]) => (
          <details className="prompt-phase-group" key={phase}>
            <summary>
              <span>{phaseLabels[locale][phase] ?? phase}</span>
              <small>{prompts.length} {locale === "zh" ? "个 Prompt" : "prompts"}</small>
            </summary>
            <div className="prompt-card-list">
              {prompts.map((prompt) => (
                <article className="prompt-card" key={prompt.id}>
                  <header>
                    <div>
                      <span>{prompt.agentName}</span>
                      <strong>{prompt.title}</strong>
                    </div>
                    <button onClick={() => navigator.clipboard?.writeText(prompt.prompt)}>
                      {locale === "zh" ? "复制" : "Copy"}
                    </button>
                  </header>
                  <pre>{prompt.prompt}</pre>
                </article>
              ))}
            </div>
          </details>
        ))}
      </div>
    </CollapsibleSidePanel>
  );
}

function SourceQualityBanner({
  locale,
  providerMode,
  trace,
  liveVerdict,
  blueprintExecution
}: {
  locale: Locale;
  providerMode: "demo" | "live";
  trace: ProviderTraceEntry[];
  liveVerdict?: DecisionApiResponse["liveVerdict"];
  blueprintExecution?: BlueprintExecutionSummary;
}) {
  const stats = traceStats(trace);
  const actualLive =
    providerMode === "live" &&
    (Boolean(liveVerdict) || Boolean(blueprintExecution?.liveTraceUsable) || stats.schemaUsable > 0);
  const className = actualLive ? "live" : providerMode === "live" ? "fallback" : "demo";
  const message = actualLive
    ? appCopy[locale].liveUsed
    : providerMode === "live"
      ? appCopy[locale].liveFallback
      : appCopy[locale].noLiveModel;

  return (
    <div className={`source-quality-banner ${className}`}>
      <strong>{actualLive ? appCopy[locale].liveSource : providerMode === "live" ? appCopy[locale].fallbackSource : appCopy[locale].demoSource}</strong>
      <p>{message}</p>
      <div className={`effective-models-badge ${stats.schemaUsable > 0 ? "good" : providerMode === "live" ? "partial" : "demo"}`}>
        {appCopy[locale].traceCalls}: {stats.calls} · {appCopy[locale].schemaUsable}: {stats.schemaUsable}
      </div>
    </div>
  );
}

function BlueprintProcessMap({ locale, result, trace }: { locale: Locale; result: BlueprintRoomResult; trace: ProviderTraceEntry[] }) {
  const finalRound = result.consensusRounds.at(-1);
  const positions = finalRound?.agentPositions ?? [];
  const traceByProvider = trace.reduce<Record<string, number>>((acc, entry) => {
    const key = entry.agentName ?? entry.provider;
    acc[key] = (acc[key] ?? 0) + (entry.status === "ok" ? 1 : 0);
    return acc;
  }, {});
  const maxProviderCalls = Math.max(1, ...Object.values(traceByProvider));

  return (
    <article className="panel-block blueprint-process-panel">
      <PanelHeading
        title={appCopy[locale].blueprintProcess}
        help={
          locale === "zh"
            ? "这里把共识变化、模型观点差异、贡献来源和质询采纳可视化出来，避免多模型互评变成黑盒。"
            : "Visualizes consensus change, model differences, contribution sources, and critique adoption."
        }
      />
      <div className="blueprint-process-grid">
        <section className="blueprint-process-card">
          <header>
            <strong>{locale === "zh" ? "共识曲线" : "Consensus trend"}</strong>
            <span>{result.consensusThreshold}%</span>
          </header>
          <div
            className="blueprint-trend-chart"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, result.consensusRounds.length)}, minmax(36px, 1fr))` }}
          >
            {result.consensusRounds.map((round) => (
              <div key={round.round}>
                <span style={{ height: `${Math.max(8, round.consensusScore)}%` }} />
                <small>R{round.round}</small>
              </div>
            ))}
            <i style={{ bottom: `${result.consensusThreshold}%` }} />
          </div>
        </section>
        <section className="blueprint-process-card">
          <header>
            <strong>{locale === "zh" ? "模型观点差异" : "Model differences"}</strong>
            <span>{positions.length}</span>
          </header>
          <div className="blueprint-difference-list">
            {positions.slice(0, 5).map((position) => (
              <article key={position.agentId}>
                <div>
                  <strong>{position.agentId}</strong>
                  <small>{position.stance}</small>
                </div>
                <em>{position.confidence}%</em>
              </article>
            ))}
          </div>
        </section>
        <section className="blueprint-process-card">
          <header>
            <strong>{locale === "zh" ? "贡献来源" : "Contribution sources"}</strong>
            <span>{Object.keys(traceByProvider).length}</span>
          </header>
          <div className="blueprint-contribution-bars">
            {Object.entries(traceByProvider).slice(0, 5).map(([provider, count]) => (
              <div key={provider}>
                <span>{provider}</span>
                <div>
                  <i style={{ width: `${(count / maxProviderCalls) * 100}%` }} />
                </div>
                <strong>{count}</strong>
              </div>
            ))}
            {Object.keys(traceByProvider).length === 0 && (
              <div>
                <span>{appCopy[locale].demoSource}</span>
                <div>
                  <i style={{ width: "100%" }} />
                </div>
                <strong>1</strong>
              </div>
            )}
          </div>
        </section>
        <section className="blueprint-process-card">
          <header>
            <strong>{locale === "zh" ? "质询采纳" : "Critique adoption"}</strong>
            <span>{result.finalSpec.adoptionLedger.length}</span>
          </header>
          <div className="blueprint-adoption-flow">
            {["adopted", "partial", "deferred"].map((status) => {
              const count = result.finalSpec.adoptionLedger.filter((item) => item.adoptionStatus === status).length;
              const width = (count / Math.max(1, result.finalSpec.adoptionLedger.length)) * 100;
              return (
                <div className={status} key={status}>
                  <span>{adoptionLabel(status, locale)}</span>
                  <strong>{count}</strong>
                  <i style={{ width: `${width}%` }} />
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </article>
  );
}

function AgentPlatformRunPanel({
  locale,
  run,
  onCopyReviewPackage
}: {
  locale: Locale;
  run: AutonomousBlueprintRun;
  onCopyReviewPackage: () => void;
}) {
  const t = appCopy[locale];
  return (
    <article className={`panel-block agent-platform-panel ${run.summary.humanReviewRequired ? "needs-review" : ""}`}>
      <PanelHeading title={t.agentPlatformRun} kicker={run.platform.orchestrator} />
      <div className="agent-platform-summary-grid">
        <div>
          <span>{locale === "zh" ? "检查点" : "checkpoint"}</span>
          <strong>{run.checkpoint.saver}</strong>
          <small>{run.checkpoint.threadId}</small>
        </div>
        <div>
          <span>{locale === "zh" ? "来源" : "Source"}</span>
          <strong>{agentSourceLabel(run.platform.source, locale)}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "轮次预算" : "Round budget"}</span>
          <strong>{run.runtimeLimits.maxConsensusRounds}</strong>
          <small>{locale === "zh" ? "递归上限" : "recursion"} {run.runtimeLimits.recursionLimit}</small>
        </div>
        <div>
          <span>{locale === "zh" ? "终止原因" : "Termination"}</span>
          <strong>{terminationReasonLabel(run.summary.terminationReason, locale)}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "Agent 范式" : "Agent pattern"}</span>
          <strong>{agentPatternLabel(run.agentPattern?.primary, locale)}</strong>
          <small>{run.agentPattern?.reactScope === "node_local_bounded_tools" ? (locale === "zh" ? "局部 ReAct 工具" : "local ReAct tools") : ""}</small>
        </div>
        <div>
          <span>{locale === "zh" ? "意图路由" : "Intent route"}</span>
          <strong>{intentCategoryLabelUi(run.intent?.category, locale)}</strong>
          <small>{intentRouteLabelUi(run.intent?.route, locale)} · {Math.round((run.intent?.confidence ?? 0) * 100)}%</small>
        </div>
        <div>
          <span>{locale === "zh" ? "质量门" : "Quality gate"}</span>
          <strong>{run.evaluatorGate?.score ?? run.validation.consensusScore}/{run.evaluatorGate?.threshold ?? run.validation.threshold}</strong>
          <small>{evaluatorActionLabel(run.evaluatorGate?.action, locale)}</small>
        </div>
      </div>
      {run.summary.humanReviewRequired && (
        <div className="agent-review-package">
          <div>
            <strong>{t.humanReviewPackage}</strong>
            <p>{locale === "zh" ? "本次未达到共识阈值，建议复制复审包进行人工补充后用同一线程继续。" : "Threshold was not met. Copy the review package, add human evidence, then rerun with the same thread."}</p>
          </div>
          <button onClick={onCopyReviewPackage}>{t.copyReviewPackage}</button>
        </div>
      )}
      <AgentRunMiniMap locale={locale} run={run} />
    </article>
  );
}

function AgentRunMiniMap({ locale, run }: { locale: Locale; run: AutonomousBlueprintRun }) {
  return (
    <>
      <details className="agent-platform-section" open>
        <summary>
          <strong>{locale === "zh" ? "混合 Agent 范式" : "Hybrid Agent pattern"}</strong>
          <small>{run.agentPattern?.layers?.length ?? 0}</small>
        </summary>
        <div className="agent-pattern-grid">
          <p>{run.agentPattern?.description}</p>
          <div>
            {(run.agentPattern?.layers ?? []).map((layer) => (
              <span key={layer}>{agentLayerLabel(layer, locale)}</span>
            ))}
          </div>
        </div>
      </details>
      <details className="agent-platform-section" open={Boolean(run.clarification?.required)}>
        <summary>
          <strong>{locale === "zh" ? "意图与澄清" : "Intent and clarification"}</strong>
          <small>{intentCategoryLabelUi(run.intent?.category, locale)}</small>
        </summary>
        <div className="agent-intent-grid">
          <article>
            <span>{locale === "zh" ? "路由" : "Route"}</span>
            <strong>{intentRouteLabelUi(run.intent?.route, locale)}</strong>
            <p>{run.intent?.normalizedRequest}</p>
          </article>
          <article>
            <span>{locale === "zh" ? "策略" : "Strategy"}</span>
            <strong>{clarificationStrategyLabel(run.clarification?.strategy, locale)}</strong>
            <p>{run.clarification?.required ? (locale === "zh" ? "有信息缺口，本轮带假设继续。" : "Some details are missing; continuing with assumptions.") : locale === "zh" ? "信息足够，直接继续。" : "Enough context to continue."}</p>
          </article>
        </div>
        {run.clarification?.questions?.length > 0 && (
          <ul className="agent-question-list">
            {run.clarification.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        )}
      </details>
      {(run.reactToolSteps ?? []).length > 0 && (
        <details className="agent-platform-section" open>
          <summary>
            <strong>{locale === "zh" ? "局部 ReAct 工具步骤" : "Local ReAct tool steps"}</strong>
            <small>{(run.reactToolSteps ?? []).length}</small>
          </summary>
          <div className="agent-tool-list react-tool-steps">
            {(run.reactToolSteps ?? []).map((step, index) => (
              <article key={`${step.toolName}-${step.action}-${index}`}>
                <span>{step.action}</span>
                <strong>{step.toolName}</strong>
                <small>{localizeText(step.thought, locale)}</small>
                <p>{localizeText(step.observation, locale)}</p>
              </article>
            ))}
          </div>
        </details>
      )}
      {(run.taskTree ?? []).length > 0 && (
        <details className="agent-platform-section" open>
          <summary>
            <strong>{locale === "zh" ? "Planner 任务树" : "Planner task tree"}</strong>
            <small>{run.taskTree.length}</small>
          </summary>
          <div className="agent-tool-list">
            {run.taskTree.map((task) => (
              <article key={task.id}>
                <span>{taskStatusLabel(task.status, locale)}</span>
                <strong>{task.title}</strong>
                <small>{nodeLabel(task.ownerAgent, locale)} · {task.toolName}</small>
                <p>{task.acceptanceCriteria.map((item) => localizeText(item, locale)).join(" / ")}</p>
              </article>
            ))}
          </div>
        </details>
      )}
      {(run.toolPermissions ?? []).length > 0 && (
        <details className="agent-platform-section" open>
          <summary>
            <strong>{locale === "zh" ? "工具权限系统" : "Tool permission policy"}</strong>
            <small>{run.toolPermissions.length}</small>
          </summary>
          <div className="agent-gate-list">
            {run.toolPermissions.map((permission, index) => (
              <article className={permission.decision === "auto" ? "pass" : permission.decision === "blocked" ? "fail" : "warn"} key={`${permission.toolName}-${permission.node}-${index}`}>
                <span>{permissionDecisionLabel(permission.decision, locale)} · {permissionCategoryLabel(permission.category, locale)} · {riskLabel(permission.risk, locale)}</span>
                <strong>{permission.toolName}</strong>
                <small>{localizeText(permission.reason, locale)}</small>
              </article>
            ))}
          </div>
        </details>
      )}
      {(run.executorActions ?? []).length > 0 && (
        <details className="agent-platform-section">
          <summary>
            <strong>{locale === "zh" ? "Executor 执行记录" : "Executor actions"}</strong>
            <small>{run.executorActions.length}</small>
          </summary>
          <div className="agent-tool-list">
            {run.executorActions.map((action) => (
              <article key={`${action.taskId}-${action.toolName}`}>
                <span>{executorStatusLabel(action.status, locale)}</span>
                <strong>{action.toolName}</strong>
                <small>{action.taskId} · {permissionDecisionLabel(action.permission, locale)}</small>
                <p>{localizeText(action.outputSummary, locale)}</p>
              </article>
            ))}
          </div>
        </details>
      )}
      {(run.criticReviews ?? []).length > 0 && (
        <details className="agent-platform-section" open>
          <summary>
            <strong>{locale === "zh" ? "Critic 审查" : "Critic reviews"}</strong>
            <small>{run.criticReviews.length}</small>
          </summary>
          <div className="agent-gate-list">
            {run.criticReviews.map((review, index) => (
              <article className={review.status} key={`${review.targetTaskId}-${index}`}>
                <span>{gateStatusLabel(review.status, locale)}</span>
                <strong>{review.targetTaskId}</strong>
                <small>{localizeText(review.finding, locale)}</small>
                <p>{localizeText(review.recommendation, locale)}</p>
              </article>
            ))}
          </div>
        </details>
      )}
      {(run.memoryEvents ?? []).length > 0 && (
        <details className="agent-platform-section">
          <summary>
            <strong>{locale === "zh" ? "Memory Agent 事件" : "Memory Agent events"}</strong>
            <small>{run.memoryEvents.length}</small>
          </summary>
          <div className="agent-tool-list">
            {run.memoryEvents.map((event, index) => (
              <article key={`${event.key}-${event.action}-${index}`}>
                <span>{memoryActionLabel(event.action, locale)} · {event.persistence}</span>
                <strong>{event.key}</strong>
                <small>{event.scope}</small>
                <p>{localizeText(event.detail, locale)}</p>
              </article>
            ))}
          </div>
        </details>
      )}
      {(run.supervisorDecisions ?? []).length > 0 && (
        <details className="agent-platform-section" open>
          <summary>
            <strong>{locale === "zh" ? "Supervisor 决策" : "Supervisor decisions"}</strong>
            <small>{run.supervisorDecisions.length}</small>
          </summary>
          <div className="agent-tool-list">
            {run.supervisorDecisions.map((decision, index) => (
              <article key={`${decision.decision}-${index}`}>
                <span>{supervisorDecisionLabelUi(decision.decision, locale)}</span>
                <strong>{nodeLabel(decision.nextNode, locale)}</strong>
                <small>{localizeText(decision.reason, locale)}</small>
                {decision.requiredHumanInputs.length > 0 && <p>{decision.requiredHumanInputs.map((item) => localizeText(item, locale)).join(" / ")}</p>}
              </article>
            ))}
          </div>
        </details>
      )}
      {run.evaluatorGate && (
        <details className="agent-platform-section" open>
          <summary>
            <strong>{locale === "zh" ? "Evaluator Gate" : "Evaluator Gate"}</strong>
            <small>{run.evaluatorGate.score}/{run.evaluatorGate.threshold}</small>
          </summary>
          <div className="agent-gate-list">
            {run.evaluatorGate.checks.map((check) => (
              <article className={check.status} key={check.name}>
                <span>{gateStatusLabel(check.status, locale)}</span>
                <strong>{evaluatorCheckLabel(check.name, locale)}</strong>
                <small>{check.detail}</small>
              </article>
            ))}
          </div>
        </details>
      )}
      <div className="agent-route-map">
        <header>
          <strong>{appCopy[locale].routeMap}</strong>
          <small>{locale === "zh" ? "每次 validate_result 后为什么继续、终止或进入人工复审。" : "Why each validate_result routed to revise, finalize, or human review."}</small>
        </header>
        <div>
          {run.routeDecisions.map((decision, index) => (
            <article className={decision.toNode} key={`${decision.round}-${decision.toNode}-${index}`}>
              <span>{decision.round}</span>
              <div>
                <strong>
                  {nodeLabel(decision.fromNode, locale)} {"->"} {nodeLabel(decision.toNode, locale)}
                </strong>
                <small>{routeReasonLabel(decision.reason, locale)}</small>
              </div>
              <em>{decision.consensusScore}/{decision.threshold}</em>
            </article>
          ))}
        </div>
      </div>
      <details className="agent-platform-section" open>
        <summary>
          <strong>{locale === "zh" ? "共识循环" : "Consensus loop"}</strong>
          <small>{run.consensusLoop.length}</small>
        </summary>
        <div className="agent-consensus-list">
          {run.consensusLoop.map((round) => (
            <article key={round.round} className={round.passed ? "passed" : ""}>
              <header>
                <div>
                  <span>{phaseLabels[locale][round.phase] ?? round.phase}</span>
                  <strong>{localizeText(round.summary, locale)}</strong>
                </div>
                <em>{round.consensusScore}/{round.threshold}</em>
              </header>
              <small>{round.improvements.map((item) => localizeText(item, locale)).join(" / ")}</small>
            </article>
          ))}
        </div>
      </details>
      <details className="agent-platform-section">
        <summary>
          <strong>{locale === "zh" ? "工具调用" : "Tool calls"}</strong>
          <small>{run.toolCalls.length}</small>
        </summary>
        <div className="agent-tool-list">
          {run.toolCalls.map((call, index) => (
            <article key={`${call.toolName}-${index}`}>
              <span>{toolSourceLabel(call.source, locale)}</span>
              <strong>{call.toolName}</strong>
              <small>{nodeLabel(call.node, locale)}</small>
              <p>{localizeText(call.outputSummary, locale)}</p>
            </article>
          ))}
        </div>
      </details>
      <details className="agent-platform-section">
        <summary>
          <strong>{locale === "zh" ? "节点轨迹" : "Node trace"}</strong>
          <small>{run.trace.length}</small>
        </summary>
        <div className="agent-trace-list">
          {run.trace.map((entry, index) => (
            <article key={`${entry.node}-${index}`} className={entry.status}>
              <span>{entry.agentId}</span>
              <strong>{nodeLabel(entry.node, locale)}</strong>
              <small>{statusValueLabel(entry.status, locale)}</small>
              <p>{localizeText(entry.summary, locale)}</p>
            </article>
          ))}
        </div>
      </details>
    </>
  );
}

function BlueprintModelCalls({
  locale,
  trace,
  execution
}: {
  locale: Locale;
  trace: ProviderTraceEntry[];
  execution?: BlueprintExecutionSummary;
}) {
  const stats = traceStats(trace);
  return (
    <div className="blueprint-model-call-list">
      <article>
        <header>
          <span>{locale === "zh" ? "执行模式" : "Execution"}</span>
          <strong>{executionModeLabel(execution?.actual ?? "deterministic", locale)}</strong>
        </header>
        <small>
          {locale === "zh" ? "请求" : "requested"} {executionModeLabel(execution?.requested ?? "deterministic", locale)} ·{" "}
          {locale === "zh" ? "调用" : "calls"} {execution?.providerCalls ?? stats.calls} ·{" "}
          {locale === "zh" ? "可用" : "valid"} {execution?.usableCalls ?? stats.schemaUsable}
        </small>
        {execution?.fallbackReason && <small>{fallbackReasonLabel(execution.fallbackReason, locale)}</small>}
      </article>
      {trace.slice(0, 12).map((entry) => (
        <article key={entry.id}>
          <header>
            <span>{phaseLabels[locale][entry.phase] ?? entry.phase}</span>
            <strong>{entry.provider}</strong>
          </header>
          <small>
            {entry.model} · {statusValueLabel(entry.status, locale)} · {entry.durationMs}ms ·{" "}
            {traceValidationLabel(entry.validationStatus ?? "n/a", locale)}
          </small>
        </article>
      ))}
      {trace.length === 0 && <p className="field-help">{appCopy[locale].noLiveModel}</p>}
    </div>
  );
}

function BlueprintHistoryComparison({
  locale,
  current,
  records,
  currentQuestion
}: {
  locale: Locale;
  current: BlueprintRoomResult;
  records: DecisionHistoryRecord[];
  currentQuestion: string;
}) {
  const previous = records.find(
    (record) =>
      record.kind === "blueprint" &&
      record.blueprintResult &&
      record.blueprintResult.roomId !== current.roomId &&
      normalizeText(record.question) === normalizeText(currentQuestion)
  );
  const comparison = previous?.blueprintResult;

  if (!comparison) {
    return <p className="field-help">{locale === "zh" ? "同一问题再次运行后，这里会显示真实模型与确定性结果，或本次与上次结果的差异。" : "Run the same question again to compare live vs deterministic or current vs previous output."}</p>;
  }

  const currentRisks = new Set(current.finalSpec.risks);
  const previousRisks = new Set(comparison.finalSpec.risks);
  const addedRisks = [...currentRisks].filter((risk) => !previousRisks.has(risk));

  return (
    <div className="blueprint-comparison-grid">
      <article>
        <span>{locale === "zh" ? "上次共识" : "Previous consensus"}</span>
        <strong>{comparison.finalConsensusScore}%</strong>
      </article>
      <article>
        <span>{locale === "zh" ? "本次共识" : "Current consensus"}</span>
        <strong>{current.finalConsensusScore}%</strong>
      </article>
      <article>
        <span>{locale === "zh" ? "变化" : "Delta"}</span>
        <strong>{current.finalConsensusScore - comparison.finalConsensusScore}</strong>
      </article>
      <section>
        <span>{locale === "zh" ? "新增风险/建议变化" : "Changed risks/suggestions"}</span>
        <small>{addedRisks.slice(0, 5).join(" / ") || (locale === "zh" ? "未发现明显新增风险" : "No obvious new risks")}</small>
      </section>
    </div>
  );
}

function OnboardingPanel({ locale, workspaceMode }: { locale: Locale; workspaceMode: WorkspaceMode }) {
  return (
    <details className="onboarding-panel">
      <summary>
        <span>{locale === "zh" ? "新手引导" : "Quick start"}</span>
        <strong>{locale === "zh" ? "应该怎么用？" : "How to use this workspace"}</strong>
        <small>
          {workspaceMode === "blueprint"
            ? locale === "zh"
              ? "开放式问题用蓝图室；决策取舍用决策室。"
              : "Use Blueprint for open-ended plans and Decision Room for trade-offs."
            : locale === "zh"
              ? "输入一个需要取舍的问题，运行后看共识、分歧和风险。"
              : "Enter a trade-off question, then inspect consensus, dissent, and risks."}
        </small>
      </summary>
      <ol>
        <li>{locale === "zh" ? "先选择工作区：决策室或方案蓝图。" : "Choose a workspace: Decision Room or Blueprint."}</li>
        <li>{locale === "zh" ? "输入当前真实问题，不需要手动改候选方案。" : "Enter the real question; no need to manually edit candidate options."}</li>
        <li>{locale === "zh" ? "看结果来源：真实模型、确定性兜底和 schema 修复都会显示。" : "Check the source badge: live, deterministic, and schema repair are labeled."}</li>
        <li>{locale === "zh" ? "指标旁的小问号可以解释裁决综合分、分歧、稳定率和 schema 可用性。" : "Use the small help markers to read Decision Score, dissent, stability, and schema usability."}</li>
        <li>{locale === "zh" ? "给别人使用前，先看就绪检查里的 Token、CORS、限流、请求体和 HSTS。" : "Before sharing, check token, CORS, rate limit, body size, and HSTS in setup readiness."}</li>
      </ol>
      <div className="onboarding-tip-grid">
        <span>{locale === "zh" ? "指标速读" : "Metric cheat sheet"}</span>
        <p>
          {locale === "zh"
            ? "裁决综合分高代表排序、效用、置信度和后悔惩罚后的综合结果更强；分歧高代表仍有明显争议；赢家稳定率高只说明权重扰动下赢家不易变，不代表风险低。"
            : "A high Decision Score means ranking, utility, confidence, and regret produce a stronger aggregate result; high dissent means material disagreement remains; winner stability means the winner survives weight changes, not that risk is low."}
        </p>
      </div>
      <div className="onboarding-example">
        <span>{locale === "zh" ? "适合测试的问题" : "Good test question"}</span>
        <p>
          {workspaceMode === "blueprint"
            ? blueprintDefaultQuestions[locale]
            : locale === "zh"
              ? "我们是否应该把当前单体 Node.js 后端拆成微服务？团队 5 人，未来 6 个月主要目标是快速交付企业客户功能。"
              : "Should our 5-person team split the current Node.js monolith into microservices while the next six months focus on enterprise feature delivery?"}
        </p>
      </div>
    </details>
  );
}

function ReadinessItem({
  locale,
  label,
  status,
  value,
  detail
}: {
  locale: Locale;
  label: string;
  status: "good" | "watch" | "poor";
  value: string;
  detail: string;
}) {
  return (
    <div className={`readiness-item ${status}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      <span className="sr-only">{locale}</span>
    </div>
  );
}

async function runLocalBlueprint(question: string, locale: Locale, mode?: DecisionMode, context?: DecisionContext): Promise<BlueprintRoomResult>;
async function runLocalBlueprint(question: string): Promise<BlueprintRoomResult>;
async function runLocalBlueprint(question: string, locale: Locale = "zh", mode: DecisionMode = "deep", context?: DecisionContext) {
  const { runBlueprintRoom } = await import("./lib/blueprint");
  return runBlueprintRoom({
    question,
    mode,
    locale,
    context: context ?? contextForQuestion(question)
  });
}

function traceStats(trace: ProviderTraceEntry[]): TraceStats {
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

function groupTraceByPhase(trace: ProviderTraceEntry[]): Record<string, ProviderTraceEntry[]> {
  return trace.reduce<Record<string, ProviderTraceEntry[]>>((acc, entry) => {
    acc[entry.phase] = [...(acc[entry.phase] ?? []), entry];
    return acc;
  }, {});
}

function modeLabel(mode: DecisionMode, locale: Locale): string {
  if (mode === "fast") return appCopy[locale].modeFast;
  if (mode === "red_team") return appCopy[locale].modeRedTeam;
  return appCopy[locale].modeDeep;
}

function formatProposalId(proposalId: string, locale: Locale): string {
  const normalized = proposalId
    .replace("-proposal-revised", "")
    .replace("-proposal", "")
    .replaceAll("_", " ")
    .replaceAll("-", " ");
  return localizeText(toTitleCase(normalized), locale);
}

function localizeText(value: string, locale: Locale): string {
  return localizeKnownDecisionText(value, locale);
}

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusLabel(status: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { strong: "Strong", watch: "Watch", weak: "Weak" },
    zh: { strong: "强", watch: "观察", weak: "偏弱" }
  };
  return labels[locale][status] ?? status;
}

function priorityLabel(priority: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { high: "High priority", medium: "Medium priority", low: "Low priority" },
    zh: { high: "高优先级", medium: "中优先级", low: "低优先级" }
  };
  return labels[locale][priority] ?? priority;
}

function adoptionLabel(status: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { adopted: "Adopted", partial: "Partial", deferred: "Deferred" },
    zh: { adopted: "已采纳", partial: "部分采纳", deferred: "延后" }
  };
  return labels[locale][status] ?? status;
}

function statusValueLabel(status: string, locale: Locale): string {
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

function taskStatusLabel(status: string, locale: Locale): string {
  return statusValueLabel(status, locale);
}

function executorStatusLabel(status: string, locale: Locale): string {
  return statusValueLabel(status, locale);
}

function permissionDecisionLabel(value: string, locale: Locale): string {
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

function riskLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { low: "low risk", medium: "medium risk", high: "high risk" },
    zh: { low: "低风险", medium: "中风险", high: "高风险" }
  };
  return labels[locale][value] ?? value;
}

function permissionCategoryLabel(value: string, locale: Locale): string {
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

function memoryActionLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { read: "read", write: "write", summarize: "summarize", inject: "inject", profile: "profile", compare: "compare", backlog: "backlog" },
    zh: { read: "读取", write: "写入", summarize: "摘要", inject: "注入", profile: "画像", compare: "对比", backlog: "回流" }
  };
  return labels[locale][value] ?? value;
}

function supervisorDecisionLabelUi(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { continue: "continue", pause_for_human: "pause for human", finalize: "finalize" },
    zh: { continue: "继续", pause_for_human: "暂停人工复审", finalize: "收敛" }
  };
  return labels[locale][value] ?? value;
}

function traceValidationLabel(status: string, locale: Locale): string {
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

function anonymityLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { blind: "blind", open: "open", "n/a": "n/a" },
    zh: { blind: "匿名", open: "公开", "n/a": "不适用" }
  };
  return labels[locale][value] ?? value;
}

function productStageLabel(value: DecisionContext["productStage"], locale: Locale): string {
  const labels: Record<Locale, Record<DecisionContext["productStage"], string>> = {
    en: { prototype: "prototype", mvp: "mvp", growth: "growth", scale: "scale", enterprise: "enterprise" },
    zh: { prototype: "原型", mvp: "MVP", growth: "增长期", scale: "规模化", enterprise: "企业级" }
  };
  return labels[locale][value];
}

function sensitivityLabel(value: DecisionContext["securityRequirement"], locale: Locale): string {
  const labels: Record<Locale, Record<DecisionContext["securityRequirement"], string>> = {
    en: { low: "low", medium: "medium", high: "high" },
    zh: { low: "低", medium: "中", high: "高" }
  };
  return labels[locale][value];
}

function domainLabel(value: string, locale: Locale): string {
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

function agentSourceLabel(value: string, locale: Locale): string {
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

function toolSourceLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { langchain_tool: "LangChain tool", live_model_provider: "live model provider" },
    zh: { langchain_tool: "LangChain 工具", live_model_provider: "真实模型提供方" }
  };
  return labels[locale][value] ?? value;
}

function executionModeLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { deterministic: "deterministic", live: "live" },
    zh: { deterministic: "确定性", live: "真实模型" }
  };
  return labels[locale][value] ?? value;
}

function fallbackReasonLabel(value: string, locale: Locale): string {
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

function terminationReasonLabel(value: string, locale: Locale): string {
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

function routeReasonLabel(value: string, locale: Locale): string {
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

function nodeLabel(value: string, locale: Locale): string {
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

function agentPatternLabel(value: string | undefined, locale: Locale): string {
  if (value === "langgraph_workflow_agent") {
    return locale === "zh" ? "LangGraph 工作流 Agent" : "LangGraph Workflow Agent";
  }
  return value ?? (locale === "zh" ? "未记录" : "Not recorded");
}

function agentLayerLabel(value: string, locale: Locale): string {
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

function intentCategoryLabelUi(value: string | undefined, locale: Locale): string {
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

function intentRouteLabelUi(value: string | undefined, locale: Locale): string {
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

function clarificationStrategyLabel(value: string | undefined, locale: Locale): string {
  if (value === "ask_before_running") return locale === "zh" ? "先澄清再运行" : "Ask before running";
  if (value === "answer_with_assumptions") return locale === "zh" ? "带假设继续" : "Continue with assumptions";
  return locale === "zh" ? "未记录" : "Not recorded";
}

function evaluatorActionLabel(value: string | undefined, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { finalize: "finalize", revise: "revise", human_review: "human review" },
    zh: { finalize: "最终输出", revise: "继续修订", human_review: "人工复审" }
  };
  return labels[locale][value ?? ""] ?? (locale === "zh" ? "未记录" : "Not recorded");
}

function gateStatusLabel(value: string, locale: Locale): string {
  const labels: Record<Locale, Record<string, string>> = {
    en: { pass: "Pass", warn: "Watch", fail: "Fail" },
    zh: { pass: "通过", warn: "关注", fail: "失败" }
  };
  return labels[locale][value] ?? value;
}

function evaluatorCheckLabel(value: string, locale: Locale): string {
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

function yesNo(value: boolean, locale: Locale): string {
  return value ? (locale === "zh" ? "是" : "Yes") : locale === "zh" ? "否" : "No";
}

function formatDuration(ms: number, locale: Locale): string {
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

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MiB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KiB`;
  }

  return `${bytes} B`;
}

function connectionBadgeLabel(
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function estimateProviderCalls(maxProviderRounds: number): number {
  return Math.max(1, maxProviderRounds) * 3;
}

function estimateTokens(maxProviderRounds: number): number {
  return Math.max(1, maxProviderRounds) * 18;
}

function modelCallHint(mode: DecisionMode, locale: Locale): string {
  if (mode === "fast") return locale === "zh" ? "少量模型席位 / 快速路径" : "reduced model seats / fast path";
  if (mode === "red_team") return locale === "zh" ? "提案 + 质询 + 红队修订" : "proposal + critique + red-team revision";
  return locale === "zh" ? "提案 + 互评 + 修订 + 排序 + 裁决" : "proposal + critique + revision + ranking + verdict";
}

function advanceRunProgress(current: RunProgress | null, locale: Locale): RunProgress | null {
  if (!current) {
    return current;
  }

  const cap = progressCapForRun(current.kind);

  if (current.progress >= cap) {
    return {
      ...current,
      ...progressCopyForRun(current.kind, current.progress, locale)
    };
  }

  const nextProgress = Math.min(cap, current.progress + progressStepForRun(current.kind, current.progress));

  return {
    ...current,
    ...progressCopyForRun(current.kind, nextProgress, locale),
    progress: nextProgress
  };
}

function progressCapForRun(kind: RunKind): number {
  if (kind === "agent") return 84;
  if (kind === "blueprint") return 82;
  if (kind === "provider-test") return 72;
  return 78;
}

function progressStepForRun(kind: RunKind, progress: number): number {
  if (kind === "provider-test") return progress < 60 ? 5 : 2;
  if (kind === "agent") return progress < 58 ? 6 : 3;
  if (kind === "blueprint") return progress < 62 ? 5 : 3;
  return progress < 56 ? 6 : 3;
}

function progressCopyForRun(kind: RunKind, progress: number, locale: Locale): Pick<RunProgress, "stage" | "message"> {
  if (kind === "decision") {
    if (progress < 48) {
      return {
        stage: locale === "zh" ? "请求后端 API" : "Requesting backend API",
        message:
          locale === "zh"
            ? "前端已向 /api/decisions 发起请求，正在等待后端返回。"
            : "The frontend has called /api/decisions and is waiting for the backend."
      };
    }

    if (progress < 68) {
      return {
        stage: locale === "zh" ? "等待模型与聚合" : "Waiting for model aggregation",
        message:
          locale === "zh"
          ? "如果当前是真实模型模式，后端可能正在等待多个模型提供方的结构化输出。"
            : "In live mode, the backend may be waiting on structured outputs from multiple providers."
      };
    }

    return {
      stage: locale === "zh" ? "等待最终裁决" : "Waiting for final verdict",
      message:
        locale === "zh"
          ? "请求仍在进行中；后端返回前不会把进度伪装成 100%。"
          : "The request is still running; progress will not be faked to 100% before the backend returns."
    };
  }

  if (kind === "blueprint") {
    if (progress < 52) {
      return {
        stage: locale === "zh" ? "请求蓝图 API" : "Requesting Blueprint API",
        message:
          locale === "zh"
            ? "前端已向 /api/blueprints 发起请求，正在等待草案和互评结果。"
            : "The frontend has called /api/blueprints and is waiting for drafts and critique."
      };
    }

    return {
      stage: locale === "zh" ? "蓝图多轮收敛中" : "Converging Blueprint rounds",
      message:
        locale === "zh"
          ? "正在等待共识轮次、模型轨迹或确定性合成结果。"
          : "Waiting for consensus rounds, model trace, or deterministic synthesis."
    };
  }

  if (kind === "agent") {
    return {
      stage: locale === "zh" ? "LangGraph 循环执行中" : "LangGraph loop running",
      message:
        locale === "zh"
          ? "正在等待 validate_result、revise_discussion 或 human_review_gate 路由结果。"
          : "Waiting for validate_result, revise_discussion, or human_review_gate routing."
    };
  }

  return {
    stage: locale === "zh" ? "测试模型连接" : "Testing model connections",
    message:
      locale === "zh"
        ? "正在等待模型提供方配置、响应和 schema 检查结果。"
        : "Waiting for provider configuration, response, and schema checks."
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `qm-${shortId()}`;
}

function preferredLocale(): Locale {
  if (typeof navigator === "undefined") {
    return "zh";
  }

  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function readStoredValue<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function readStoredNumber(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function renderHumanReviewPackage(run: AutonomousBlueprintRun, locale: Locale): string {
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
