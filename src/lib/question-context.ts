import type { DecisionContext } from "./domain";

export type DecisionQuestionPattern = "agent_framework" | "service_decomposition" | "tenant_isolation" | "general_architecture";

export const defaultQuestions: Record<"en" | "zh", string> = {
  en: "Should a B2B SaaS MVP use schema-per-tenant or shared tables with tenant_id in PostgreSQL?",
  zh: "一个 B2B SaaS MVP 应该使用 PostgreSQL 的 schema-per-tenant，还是 shared tables + tenant_id？"
};

export const defaultContext: DecisionContext = {
  productStage: "mvp",
  expectedScale: "First six months: 50 tenants and fewer than 10,000 daily active users.",
  teamProfile: "Small full-stack team with strong PostgreSQL experience.",
  budgetSensitivity: "high",
  reliabilityRequirement: "medium",
  securityRequirement: "high",
  existingConstraints: ["Use PostgreSQL", "Ship MVP in eight weeks"],
  candidateOptions: ["Shared tables with tenant_id", "Schema per tenant", "Database per tenant"],
  assumptions: ["No hard regulatory tenant isolation requirement at launch"]
};

export const serviceDecompositionContext: DecisionContext = {
  productStage: "mvp",
  expectedScale: "Next six months: one main Node.js backend supporting enterprise customer workflows.",
  teamProfile: "Small full-stack Node.js team of 5 engineers focused on fast enterprise feature delivery.",
  budgetSensitivity: "high",
  reliabilityRequirement: "medium",
  securityRequirement: "medium",
  existingConstraints: ["Keep enterprise feature delivery moving", "Avoid platform work that a 5-person team cannot operate"],
  candidateOptions: ["Modular monolith", "Selective service extraction", "Full microservices now"],
  assumptions: [
    "The current monolith can still be modularized without a rewrite.",
    "No immediate compliance requirement mandates service-level isolation.",
    "Independent scaling needs are not yet proven."
  ]
};

export const agentFrameworkContext: DecisionContext = {
  productStage: "mvp",
  expectedScale: "Convert novel chapters into visual-novel or standing-portrait game production data with multiple agents.",
  teamProfile: "Small AI application team building a structured multi-agent content pipeline.",
  budgetSensitivity: "medium",
  reliabilityRequirement: "high",
  securityRequirement: "medium",
  existingConstraints: ["Use multiple agents", "Need structured outputs from long-form prose", "Need review and retry loops"],
  candidateOptions: ["LangGraph", "LangChain", "Custom orchestration"],
  assumptions: [
    "The workflow needs explicit state across parsing, scene extraction, asset planning, and validation.",
    "The team wants controllable branching and review loops instead of a simple linear chain."
  ]
};

export const generalArchitectureContext: DecisionContext = {
  productStage: "mvp",
  expectedScale: "Current decision has incomplete evidence; prefer a reversible path until constraints are validated.",
  teamProfile: "Small product engineering team balancing delivery speed, operating cost, and future flexibility.",
  budgetSensitivity: "medium",
  reliabilityRequirement: "medium",
  securityRequirement: "medium",
  existingConstraints: ["Keep the first step reversible", "Define validation gates before deep commitment"],
  candidateOptions: ["Conservative reversible path", "Balanced staged path", "Aggressive platform bet"],
  assumptions: [
    "The team can validate the riskiest assumption before committing deeply.",
    "Current constraints may change after customer or operational feedback.",
    "A staged decision preserves more optionality than a one-way architecture bet."
  ]
};

export function inferQuestionPattern(question: string): DecisionQuestionPattern {
  const text = question.toLowerCase();
  const visualNovelCue =
    text.includes("visual novel") ||
    text.includes("视觉小说") ||
    text.includes("视觉类游戏") ||
    text.includes("vn") ||
    (text.includes("小说") && (text.includes("游戏") || text.includes("game") || text.includes("视觉")));
  const agentOrchestrationCue =
    (text.includes("multi-agent") || text.includes("多agent") || text.includes("多 agent") || text.includes("智能体")) &&
    (
      text.includes("循环") ||
      text.includes("互评") ||
      text.includes("共识") ||
      text.includes("复审") ||
      text.includes("编排") ||
      text.includes("工作流") ||
      text.includes("状态") ||
      text.includes("orchestration") ||
      text.includes("workflow") ||
      text.includes("consensus")
    );

  if (
    text.includes("langgraph") ||
    text.includes("langchain") ||
    visualNovelCue ||
    agentOrchestrationCue
  ) {
    return "agent_framework";
  }

  if (
    text.includes("microservice") ||
    text.includes("micro-service") ||
    text.includes("monolith") ||
    text.includes("node.js") ||
    text.includes("nodejs") ||
    text.includes("微服务") ||
    text.includes("单体")
  ) {
    return "service_decomposition";
  }

  if (
    text.includes("tenant") ||
    text.includes("postgres") ||
    text.includes("schema-per-tenant") ||
    text.includes("tenant_id") ||
    text.includes("租户")
  ) {
    return "tenant_isolation";
  }

  return "general_architecture";
}

export function contextForQuestion(question: string): DecisionContext {
  const pattern = inferQuestionPattern(question);

  if (pattern === "agent_framework") {
    return agentFrameworkContext;
  }

  if (pattern === "service_decomposition") {
    return serviceDecompositionContext;
  }

  if (pattern === "tenant_isolation") {
    return defaultContext;
  }

  return generalArchitectureContext;
}
