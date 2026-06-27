import type { DecisionMode } from "../src/lib/domain";
import type { DecisionQuestionPattern } from "../src/lib/question-context";

export type AuditLocale = "en" | "zh";
export type QualityAuditSuite = "smoke" | "expanded" | "full";

export type QualityAuditCase = {
  id: string;
  suites: QualityAuditSuite[];
  locale: AuditLocale;
  mode: DecisionMode;
  question: string;
  expectedPattern: DecisionQuestionPattern;
  expectedKeywords: string[];
};

export const qualityAuditCases: QualityAuditCase[] = [
  {
    id: "tenant-zh-fast",
    suites: ["smoke", "expanded", "full"],
    locale: "zh",
    mode: "fast",
    question: "一个 B2B SaaS MVP 应该使用 PostgreSQL 的 schema-per-tenant，还是 shared tables + tenant_id？",
    expectedPattern: "tenant_isolation",
    expectedKeywords: ["tenant", "租户", "postgres", "schema", "shared"]
  },
  {
    id: "tenant-en-deep",
    suites: ["full"],
    locale: "en",
    mode: "deep",
    question: "Should a B2B SaaS MVP use schema-per-tenant or shared tables with tenant_id in PostgreSQL?",
    expectedPattern: "tenant_isolation",
    expectedKeywords: ["tenant", "postgres", "schema", "shared"]
  },
  {
    id: "services-zh-fast",
    suites: ["smoke", "expanded", "full"],
    locale: "zh",
    mode: "fast",
    question: "我们是否应该把当前单体 Node.js 后端拆成微服务？团队 5 人，未来 6 个月主要目标是快速交付企业客户功能。",
    expectedPattern: "service_decomposition",
    expectedKeywords: ["node", "微服务", "monolith", "模块"]
  },
  {
    id: "services-en-deep",
    suites: ["full"],
    locale: "en",
    mode: "deep",
    question: "Should our 5-person team split the current Node.js monolith into microservices while enterprise feature delivery is the next-six-month priority?",
    expectedPattern: "service_decomposition",
    expectedKeywords: ["node", "microservice", "monolith", "module"]
  },
  {
    id: "services-zh-red-team",
    suites: ["expanded", "full"],
    locale: "zh",
    mode: "red_team",
    question: "现在稳定性有压力，我们要不要把 Node.js 单体拆成多个服务来提升可靠性？团队只有 5 人。",
    expectedPattern: "service_decomposition",
    expectedKeywords: ["node", "服务", "monolith", "可靠"]
  },
  {
    id: "agent-framework-zh-fast",
    suites: ["smoke", "expanded", "full"],
    locale: "zh",
    mode: "fast",
    question: "我要做一个多 agent 的小说转视觉小说生产数据系统，应该用 LangGraph 还是 LangChain？",
    expectedPattern: "agent_framework",
    expectedKeywords: ["LangGraph", "LangChain", "agent", "状态"]
  },
  {
    id: "agent-framework-en-deep",
    suites: ["full"],
    locale: "en",
    mode: "deep",
    question: "For a multi-agent long-form content pipeline, should the core orchestration use LangGraph, LangChain, or custom TypeScript?",
    expectedPattern: "agent_framework",
    expectedKeywords: ["LangGraph", "LangChain", "agent", "state"]
  },
  {
    id: "agent-framework-zh-red-team",
    suites: ["expanded", "full"],
    locale: "zh",
    mode: "red_team",
    question: "如果后续要接入人工复审、重试和分支，多 agent 工作流还适合只用 LangChain 吗？",
    expectedPattern: "agent_framework",
    expectedKeywords: ["LangGraph", "LangChain", "复审", "分支"]
  },
  {
    id: "generic-zh-fast",
    suites: ["smoke", "expanded", "full"],
    locale: "zh",
    mode: "fast",
    question: "我们是否应该现在引入事件驱动架构？团队还在 MVP 阶段，客户需求变化很快。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "阶段", "rollback"]
  },
  {
    id: "generic-en-deep",
    suites: ["full"],
    locale: "en",
    mode: "deep",
    question: "Should we adopt event-driven architecture now or keep a simpler request-response design until product constraints stabilize?",
    expectedPattern: "general_architecture",
    expectedKeywords: ["reversible", "validation", "rollback", "staged"]
  },
  {
    id: "generic-zh-deep",
    suites: ["expanded", "full"],
    locale: "zh",
    mode: "deep",
    question: "我们要不要现在上 Kubernetes？目前只有一个小团队，主要目标还是交付客户功能。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "成本", "阶段"]
  },
  {
    id: "generic-en-red-team",
    suites: ["full"],
    locale: "en",
    mode: "red_team",
    question: "Should we rewrite the admin backend in a new stack now, or keep the existing stack and define migration gates?",
    expectedPattern: "general_architecture",
    expectedKeywords: ["reversible", "validation", "rollback", "staged"]
  },
  {
    id: "product-pricing-zh-fast",
    suites: ["full"],
    locale: "zh",
    mode: "fast",
    question: "企业版应该先做按席位定价，还是按用量计费？我们还没有足够多的付费客户数据。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "阶段", "成本"]
  },
  {
    id: "product-roadmap-en-fast",
    suites: ["full"],
    locale: "en",
    mode: "fast",
    question: "Should we prioritize self-serve onboarding or enterprise SSO first when the sales pipeline is still uncertain?",
    expectedPattern: "general_architecture",
    expectedKeywords: ["reversible", "validation", "staged", "risk"]
  },
  {
    id: "team-process-zh-deep",
    suites: ["full"],
    locale: "zh",
    mode: "deep",
    question: "5 人团队要不要引入固定的双周架构评审？担心流程变重，但线上问题也越来越多。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "阶段", "团队"]
  },
  {
    id: "cost-observability-zh-fast",
    suites: ["full"],
    locale: "zh",
    mode: "fast",
    question: "为了控制成本，我们应该继续用托管可观测性平台，还是自建日志和指标系统？",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "成本", "阶段"]
  },
  {
    id: "frontend-migration-en-fast",
    suites: ["full"],
    locale: "en",
    mode: "fast",
    question: "Should we migrate the current React dashboard to Next.js now, or wait until routing and SEO needs are clearer?",
    expectedPattern: "general_architecture",
    expectedKeywords: ["reversible", "validation", "migration", "staged"]
  },
  {
    id: "model-routing-zh-fast",
    suites: ["full"],
    locale: "zh",
    mode: "fast",
    question: "客服系统应该只接一个大模型供应商，还是做多供应商路由和降级？目前预算有限。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "成本", "阶段"]
  },
  {
    id: "security-review-en-red-team",
    suites: ["full"],
    locale: "en",
    mode: "red_team",
    question: "Should every release require a manual security review, or should we gate only high-risk changes?",
    expectedPattern: "general_architecture",
    expectedKeywords: ["reversible", "validation", "risk", "staged"]
  },
  {
    id: "data-retention-zh-fast",
    suites: ["full"],
    locale: "zh",
    mode: "fast",
    question: "审计日志应该默认保留 30 天还是 180 天？客户想要更长留存，但存储和合规成本会增加。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "成本", "阶段"]
  },
  {
    id: "hiring-tradeoff-zh-fast",
    suites: ["full"],
    locale: "zh",
    mode: "fast",
    question: "下一位成员应该优先招 SRE，还是继续招全栈工程师？团队现在交付压力和稳定性压力都存在。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "阶段", "团队"]
  },
  {
    id: "product-process-zh-deep",
    suites: ["full"],
    locale: "zh",
    mode: "deep",
    question: "我们要不要强制所有需求先写完整 PRD 再开发？这样可能减少返工，但会拖慢小功能交付。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "阶段", "团队"]
  },
  {
    id: "portfolio-en-fast",
    suites: ["full"],
    locale: "en",
    mode: "fast",
    question: "Should I polish the current portfolio project for interviews, or start a new project with a more impressive technical angle?",
    expectedPattern: "general_architecture",
    expectedKeywords: ["reversible", "validation", "staged", "risk"]
  },
  {
    id: "support-ops-zh-red-team",
    suites: ["full"],
    locale: "zh",
    mode: "red_team",
    question: "客户支持要不要现在引入值班轮值和 SLA 看板？目前客户不多，但响应质量不稳定。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "阶段", "风险"]
  },
  {
    id: "kubernetes-zh-deep",
    suites: ["full"],
    locale: "zh",
    mode: "deep",
    question: "我们要不要现在把后端部署迁到 Kubernetes？团队 6 人，客户不多，但未来可能要灰度发布和弹性扩容。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "成本", "阶段"]
  },
  {
    id: "api-security-gate-zh-red-team",
    suites: ["full"],
    locale: "zh",
    mode: "red_team",
    question: "每次 API 发布是否都需要人工安全审查？我们担心影响交付速度，但最近出现过鉴权和日志脱敏问题。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "风险", "阶段"]
  },
  {
    id: "contract-review-agent-zh-fast",
    suites: ["full"],
    locale: "zh",
    mode: "fast",
    question: "合同审查辅助系统应该先做规则引擎，还是直接上多 Agent 大模型审查？必须保留人工律师确认。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["合同", "agent", "风险", "人工"]
  },
  {
    id: "rag-governance-zh-deep",
    suites: ["full"],
    locale: "zh",
    mode: "deep",
    question: "内部知识库问答要不要先引入 RAG 治理和引用评估？目前回答速度重要，但也担心幻觉和权限泄露。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "风险", "阶段"]
  },
  {
    id: "incident-response-zh-red-team",
    suites: ["full"],
    locale: "zh",
    mode: "red_team",
    question: "安全告警响应平台要不要允许 Agent 自动执行隔离动作？我们想提升响应速度，但担心误操作。",
    expectedPattern: "general_architecture",
    expectedKeywords: ["可逆", "验证", "风险", "阶段"]
  },
  {
    id: "agent-loop-cost-zh-deep",
    suites: ["full"],
    locale: "zh",
    mode: "deep",
    question: "多 Agent 系统是否应该默认开启循环互评直到共识达到 80？这样质量可能更好，但成本和耗时会上升。",
    expectedPattern: "agent_framework",
    expectedKeywords: ["LangGraph", "LangChain", "agent", "状态"]
  }
];
