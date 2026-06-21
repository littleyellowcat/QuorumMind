import type { Agent, Critique, DecisionContext, Proposal } from "./domain";
import { matchSkills } from "./skill-loader";
import { buildSkillCandidateList, buildSkillInjection } from "./skill-inject";

const baseRisks = {
  tenantLeak: {
    category: "security",
    severity: "high",
    description: "A missing tenant boundary can expose cross-tenant data.",
    mitigation: "Centralize tenant-scoped data access and add authorization boundary tests."
  },
  operationalLoad: {
    category: "complexity",
    severity: "medium",
    description: "More isolated tenancy models increase migration, backup, and support operations.",
    mitigation: "Automate tenant lifecycle tasks before moving beyond shared tables."
  },
  scalePressure: {
    category: "performance",
    severity: "medium",
    description: "Noisy tenants can stress shared indexes and connection pools.",
    mitigation: "Track per-tenant usage and add partitioning or premium isolation when needed."
  },
  distributedComplexity: {
    category: "complexity",
    severity: "high",
    description: "Splitting a small-team Node.js backend into services adds distributed debugging, deployment, and contract-management overhead.",
    mitigation: "Keep a modular monolith first, isolate bounded contexts in code, and extract only after ownership and scaling pressure are proven."
  },
  deliverySlowdown: {
    category: "cost",
    severity: "high",
    description: "Microservice infrastructure can consume the next six months of delivery capacity before customer-facing work ships.",
    mitigation: "Use one deployable with strong module boundaries, CI checks, and explicit extraction triggers."
  },
  serviceReliability: {
    category: "reliability",
    severity: "medium",
    description: "Network calls, partial failures, and version skew introduce reliability modes the current team may not be staffed to operate.",
    mitigation: "Add observability and background-job boundaries inside the monolith before introducing independent services."
  },
  workflowDrift: {
    category: "reliability",
    severity: "medium",
    description: "A multi-agent content pipeline can drift if state, retries, and validation handoffs are implicit.",
    mitigation: "Use explicit graph state, typed intermediate artifacts, validation nodes, and human review checkpoints."
  },
  frameworkOverhead: {
    category: "complexity",
    severity: "medium",
    description: "Choosing a graph framework too early can add ceremony before the production data schema is stable.",
    mitigation: "Start with a small LangGraph workflow and keep business transforms framework-light and testable."
  },
  prematureCommitment: {
    category: "complexity",
    severity: "medium",
    description: "Committing to the heaviest architecture option before validating constraints can slow delivery and make reversal expensive.",
    mitigation: "Start with the lowest-regret option, define validation gates, and revisit the decision when evidence changes."
  },
  stakeholderMismatch: {
    category: "reliability",
    severity: "medium",
    description: "A technically attractive option can fail if it does not match team capacity, operating model, or customer timing.",
    mitigation: "Score options against delivery, operations, security, and reversibility before committing."
  }
} as const;

export function createDefaultAgents(): Agent[] {
  return [
    {
      id: "principal-architect",
      name: "Principal Architect",
      role: "principal_architect",
      provider: "demo",
      weight: 1
    },
    {
      id: "sre-reviewer",
      name: "SRE Reviewer",
      role: "sre_reviewer",
      provider: "demo",
      weight: 0.95
    },
    {
      id: "security-reviewer",
      name: "Security Reviewer",
      role: "security_reviewer",
      provider: "demo",
      weight: 1
    },
    {
      id: "cost-engineer",
      name: "Cost Engineer",
      role: "cost_engineer",
      provider: "demo",
      weight: 0.9
    },
    {
      id: "pragmatic-builder",
      name: "Pragmatic Builder",
      role: "pragmatic_builder",
      provider: "demo",
      weight: 1
    }
  ];
}

export function generateProposal(roomId: string, agent: Agent, context: DecisionContext, question = "", knowledgeInjection = ""): Proposal {
  // ── Skill integration ───────────────────────────────────────────
  const skillMatches = matchSkills(question ?? "", domainFromContext(context), agent.role);
  const skillCandidateList = buildSkillCandidateList(skillMatches);
  // For demo agent, auto-select the top 2 most matched skills
  const autoChosen = skillMatches.slice(0, 2).map(s => s.name);
  const skillBody = buildSkillInjection(autoChosen, skillMatches);

  const enhancedKnowledge = [knowledgeInjection, skillBody].filter(Boolean).join("\n\n---\n\n");
  const prefix = enhancedKnowledge ? `${enhancedKnowledge}\n\n---\n\n` : "";

  if (isAgentFrameworkQuestion(question, context)) {
    return injectKnowledge(generateAgentFrameworkProposal(roomId, agent, context), prefix);
  }

  if (isServiceDecompositionQuestion(question, context)) {
    return injectKnowledge(generateServiceDecompositionProposal(roomId, agent, context), prefix);
  }

  if (!isTenantIsolationQuestion(question, context)) {
    return injectKnowledge(generateGeneralArchitectureProposal(roomId, agent, context, question), prefix);
  }

  const sharedTableRecommendation =
    "Use PostgreSQL shared tables with tenant_id for the MVP, enforce tenant-aware repositories, and keep a documented path to schema-level isolation for enterprise tenants.";

  const schemaRecommendation =
    "Use schema-per-tenant for regulated or high-value tenants, but keep the MVP control plane and shared metadata simple.";

  const microserviceWarning =
    "Avoid database-per-tenant or service-per-tenant at launch unless a signed enterprise requirement justifies the operational load.";

  const common = {
    roomId,
    agentId: agent.id,
    alternatives: ["Shared tables with tenant_id", "Schema per tenant", "Database per tenant"],
    assumptions: context.assumptions,
    migrationPath: [
      "Start with shared tables and tenant_id on every tenant-owned table.",
      "Add tenant-aware repository helpers and authorization tests before beta.",
      "Introduce schema-per-tenant for enterprise tenants only after isolation requirements appear.",
      "Revisit database-per-tenant when operational automation and revenue justify it."
    ],
    version: "initial" as const
  };

  switch (agent.role) {
    case "security_reviewer":
      return injectKnowledge({
        ...common,
        id: `${agent.id}-proposal`,
        title: "Shared tenancy with strict access guardrails",
        recommendation: sharedTableRecommendation,
        reasoning:
          "Security risk is real, but the MVP can control it with centralized tenant scoping, row-level conventions, and tests. Schema-per-tenant should be reserved for stronger isolation commitments.",
        strengths: ["Fast MVP delivery", "Clear upgrade path", "Security controls can be tested centrally"],
        weaknesses: ["A missed tenant filter is severe", "Requires discipline in every data access path"],
        risks: [baseRisks.tenantLeak],
        criteriaScores: {
          scalability: 76,
          reliability: 78,
          security: 82,
          costEfficiency: 86,
          implementationComplexity: 80,
          maintainability: 78,
          migrationFlexibility: 82,
          teamFit: 86,
          timeToMarket: 88,
          reversibility: 80
        },
        regretByScenario: {
          trafficSpike: 28,
          smallTeam: 12,
          strictSecurity: 45,
          budgetPressure: 14
        },
        confidence: 0.82
      }, prefix);
    case "sre_reviewer":
      return injectKnowledge({
        ...common,
        id: `${agent.id}-proposal`,
        title: "Operate one database first, isolate later",
        recommendation: sharedTableRecommendation,
        reasoning:
          "One shared PostgreSQL deployment keeps backups, migrations, monitoring, and incident response understandable for a small team. Isolation can become a premium migration path.",
        strengths: ["Low operational burden", "Simpler migrations", "Easier observability"],
        weaknesses: ["Noisy tenant risk", "Requires per-tenant metrics from the start"],
        risks: [baseRisks.scalePressure],
        criteriaScores: {
          scalability: 78,
          reliability: 84,
          security: 76,
          costEfficiency: 88,
          implementationComplexity: 84,
          maintainability: 82,
          migrationFlexibility: 78,
          teamFit: 88,
          timeToMarket: 86,
          reversibility: 76
        },
        regretByScenario: {
          trafficSpike: 35,
          smallTeam: 8,
          strictSecurity: 50,
          budgetPressure: 12
        },
        confidence: 0.84
      }, prefix);
    case "cost_engineer":
      return injectKnowledge({
        ...common,
        id: `${agent.id}-proposal`,
        title: "Optimize for learning cost and migration optionality",
        recommendation: sharedTableRecommendation,
        reasoning:
          "The MVP's scarce resource is engineering time. Shared tables reduce infrastructure cost and defer expensive automation until revenue proves the isolation need.",
        strengths: ["Cheapest launch path", "Smallest engineering surface", "Avoids premature tenant automation"],
        weaknesses: ["Enterprise isolation may require later migration", "Cost savings depend on good indexing"],
        risks: [baseRisks.operationalLoad],
        criteriaScores: {
          scalability: 74,
          reliability: 78,
          security: 74,
          costEfficiency: 94,
          implementationComplexity: 88,
          maintainability: 80,
          migrationFlexibility: 80,
          teamFit: 90,
          timeToMarket: 90,
          reversibility: 82
        },
        regretByScenario: {
          trafficSpike: 34,
          smallTeam: 6,
          strictSecurity: 52,
          budgetPressure: 8
        },
        confidence: 0.85
      }, prefix);
    case "pragmatic_builder":
      return injectKnowledge({
        ...common,
        id: `${agent.id}-proposal`,
        title: "Ship shared tables, test tenant boundaries hard",
        recommendation: sharedTableRecommendation,
        reasoning:
          "The product should not pay microservice or tenant-automation tax before it has customers. Build the narrow path well and make the escape hatch visible.",
        strengths: ["Fastest to build", "Best match for team size", "Avoids over-engineering"],
        weaknesses: ["Requires a strong data access convention", "Not ideal for hard isolation contracts"],
        risks: [baseRisks.tenantLeak, baseRisks.scalePressure],
        criteriaScores: {
          scalability: 75,
          reliability: 78,
          security: 78,
          costEfficiency: 90,
          implementationComplexity: 92,
          maintainability: 84,
          migrationFlexibility: 82,
          teamFit: 92,
          timeToMarket: 94,
          reversibility: 84
        },
        regretByScenario: {
          trafficSpike: 32,
          smallTeam: 5,
          strictSecurity: 48,
          budgetPressure: 7
        },
        confidence: 0.88
      }, prefix);
    case "principal_architect":
    default:
      return injectKnowledge({
        ...common,
        id: `${agent.id}-proposal`,
        title: "Shared core with explicit isolation evolution path",
        recommendation: `${sharedTableRecommendation} ${schemaRecommendation} ${microserviceWarning}`,
        reasoning:
          "Architecture should match the product stage while preserving a clean evolution path. Shared tables are the right default when the team needs speed, but the data model must make future isolation possible.",
        strengths: ["Balances speed and future migration", "Keeps system boundaries simple", "Documents when to evolve"],
        weaknesses: ["Needs careful schema conventions", "May need migration work for enterprise contracts"],
        risks: [baseRisks.tenantLeak, baseRisks.operationalLoad],
        criteriaScores: {
          scalability: 82,
          reliability: 82,
          security: 80,
          costEfficiency: 86,
          implementationComplexity: 84,
          maintainability: 86,
          migrationFlexibility: 88,
          teamFit: 88,
          timeToMarket: 86,
          reversibility: 86
        },
        regretByScenario: {
          trafficSpike: 25,
          smallTeam: 10,
          strictSecurity: 42,
          budgetPressure: 12
        },
        confidence: 0.86
      }, prefix);
  }
}

function generateGeneralArchitectureProposal(roomId: string, agent: Agent, context: DecisionContext, question: string): Proposal {
  const options = context.candidateOptions.length > 0 ? context.candidateOptions : ["Conservative path", "Balanced path", "Aggressive path"];
  const selectedOption = options[0] ?? "Balanced path";
  const alternativeOption = options[1] ?? "Higher-ceremony alternative";
  const recommendation =
    `Use ${selectedOption} as the default path for now, but treat it as a staged decision with explicit validation gates. ` +
    `Do not commit deeply to ${alternativeOption} until the team has evidence that the added cost is justified.`;
  const common = {
    roomId,
    agentId: agent.id,
    alternatives: options,
    assumptions:
      context.assumptions.length > 0
        ? context.assumptions
        : [
            "The current constraints are accurate enough to choose a reversible first step.",
            "The team can revisit this decision after gathering delivery and operational evidence."
          ],
    migrationPath: [
      "Write the decision as an ADR with explicit success and rollback signals.",
      "Run a small implementation or design spike before committing to the highest-cost option.",
      "Measure delivery friction, operational load, security risk, and reversibility.",
      "Re-run the decision when customer, staffing, or scale assumptions change."
    ],
    version: "initial" as const
  };

  switch (agent.role) {
    case "security_reviewer":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Choose the option with clear control boundaries",
        recommendation,
        reasoning:
          "The safest architecture decision is the one whose access, ownership, audit, and rollback controls can be verified before scale. Avoid treating an unvalidated architecture preference as a security guarantee.",
        strengths: ["Explicit control checks", "Avoids security theater", "Keeps rollback visible"],
        weaknesses: ["Needs concrete validation criteria", "May defer a stronger isolation move"],
        risks: [baseRisks.prematureCommitment],
        criteriaScores: {
          scalability: 78,
          reliability: 82,
          security: 84,
          costEfficiency: 78,
          implementationComplexity: 80,
          maintainability: 82,
          migrationFlexibility: 86,
          teamFit: 82,
          timeToMarket: 80,
          reversibility: 88
        },
        regretByScenario: {
          fastDelivery: 18,
          operatingLoad: 16,
          securityReview: 12,
          requirementChange: 14
        },
        confidence: 0.8
      };
    case "sre_reviewer":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Prefer the path the team can operate",
        recommendation,
        reasoning:
          "Architecture choices fail when operational complexity arrives before observability, ownership, and incident muscle. Pick the option that the current team can run under stress.",
        strengths: ["Fits operating capacity", "Keeps incident paths understandable", "Supports staged hardening"],
        weaknesses: ["May not maximize future scalability immediately", "Requires operational metrics"],
        risks: [baseRisks.stakeholderMismatch],
        criteriaScores: {
          scalability: 78,
          reliability: 86,
          security: 78,
          costEfficiency: 82,
          implementationComplexity: 84,
          maintainability: 84,
          migrationFlexibility: 82,
          teamFit: 86,
          timeToMarket: 82,
          reversibility: 84
        },
        regretByScenario: {
          fastDelivery: 16,
          operatingLoad: 10,
          securityReview: 18,
          requirementChange: 18
        },
        confidence: 0.82
      };
    case "cost_engineer":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Optimize for low regret and learning speed",
        recommendation,
        reasoning:
          "When the question lacks hard evidence for a high-cost move, the best financial decision is to buy information cheaply before scaling investment.",
        strengths: ["Controls sunk cost", "Preserves options", "Makes assumptions testable"],
        weaknesses: ["Less decisive than a full platform bet", "Needs disciplined review dates"],
        risks: [baseRisks.prematureCommitment],
        criteriaScores: {
          scalability: 76,
          reliability: 78,
          security: 76,
          costEfficiency: 90,
          implementationComplexity: 88,
          maintainability: 82,
          migrationFlexibility: 88,
          teamFit: 88,
          timeToMarket: 90,
          reversibility: 90
        },
        regretByScenario: {
          fastDelivery: 8,
          operatingLoad: 16,
          securityReview: 22,
          requirementChange: 10
        },
        confidence: 0.84
      };
    case "pragmatic_builder":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Ship the smallest reversible slice",
        recommendation,
        reasoning:
          "The practical path is to make the next step small enough to learn from, while leaving clear seams for the heavier option if evidence demands it.",
        strengths: ["Fast feedback", "Low implementation drag", "Clear next checkpoint"],
        weaknesses: ["Requires saying no to speculative complexity", "May need rework if assumptions are wrong"],
        risks: [baseRisks.stakeholderMismatch],
        criteriaScores: {
          scalability: 76,
          reliability: 80,
          security: 76,
          costEfficiency: 88,
          implementationComplexity: 92,
          maintainability: 84,
          migrationFlexibility: 86,
          teamFit: 92,
          timeToMarket: 94,
          reversibility: 88
        },
        regretByScenario: {
          fastDelivery: 6,
          operatingLoad: 18,
          securityReview: 24,
          requirementChange: 12
        },
        confidence: 0.86
      };
    case "principal_architect":
    default:
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Staged architecture decision with validation gates",
        recommendation,
        reasoning:
          `For this question, the decision should be framed around reversibility, operating cost, and evidence quality rather than a one-way platform bet. The first path should preserve optionality while making the key assumption testable.`,
        strengths: ["Balances delivery and optionality", "Makes assumptions explicit", "Creates ADR-ready review gates"],
        weaknesses: ["Requires follow-through on validation", "Does not fully optimize one stakeholder's preference"],
        risks: [baseRisks.prematureCommitment, baseRisks.stakeholderMismatch],
        criteriaScores: {
          scalability: 82,
          reliability: 84,
          security: 80,
          costEfficiency: 84,
          implementationComplexity: 84,
          maintainability: 86,
          migrationFlexibility: 90,
          teamFit: 88,
          timeToMarket: 86,
          reversibility: 92
        },
        regretByScenario: {
          fastDelivery: 10,
          operatingLoad: 12,
          securityReview: 16,
          requirementChange: 8
        },
        confidence: 0.84
      };
  }
}

function generateAgentFrameworkProposal(roomId: string, agent: Agent, context: DecisionContext): Proposal {
  const langGraphRecommendation =
    "建议用 LangGraph 作为多 agent 主编排框架，用 LangChain 作为模型调用、Prompt 模板、工具封装和文档加载的辅助层；不要用纯 LangChain 承担长文本解析、分支、复审和重试状态机。";
  const rollout =
    "MVP 先做最小图：章节切分、场景抽取、角色/立绘需求抽取、规则校验、人工复审、导出 VN 生产数据。等数据结构稳定后再扩展更多 agent。";

  const common = {
    roomId,
    agentId: agent.id,
    alternatives: ["LangGraph", "LangChain", "Custom orchestration"],
    assumptions: context.assumptions,
    migrationPath: [
      "先定义 VN 生产数据 schema，例如 scenes、characters、dialogue、assets、validation issues。",
      "用 LangGraph 建立显式状态和节点：parse、extract、critique、revise、validate、export。",
      "把 LangChain 限定在 LLM 调用、PromptTemplate、retriever/tool wrapper 等工具层。",
      "给每个中间产物加测试样例和人工复审入口。"
    ],
    version: "initial" as const
  };

  switch (agent.role) {
    case "cost_engineer":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "LangGraph 主编排，LangChain 做工具层",
        recommendation: `${langGraphRecommendation} ${rollout}`,
        reasoning:
          "纯 LangChain 更适合线性链或工具调用封装；你的场景需要多轮状态流、条件分支、失败重试和审校回路，LangGraph 的图模型更贴近问题结构。",
        strengths: ["状态可控", "适合多 agent 回路", "仍可复用 LangChain 生态"],
        weaknesses: ["需要先设计状态 schema", "比简单 chain 有更多工程约束"],
        risks: [baseRisks.frameworkOverhead],
        criteriaScores: {
          scalability: 82,
          reliability: 84,
          security: 72,
          costEfficiency: 78,
          implementationComplexity: 76,
          maintainability: 86,
          migrationFlexibility: 84,
          teamFit: 82,
          timeToMarket: 78,
          reversibility: 80
        },
        regretByScenario: {
          longChapterInput: 20,
          schemaChange: 18,
          agentDrift: 16,
          smallTeam: 22
        },
        confidence: 0.86
      };
    case "sre_reviewer":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "用显式图状态降低多 agent 漂移",
        recommendation: langGraphRecommendation,
        reasoning:
          "小说转游戏数据不是一次问答，而是可观测的生产流水线。LangGraph 更容易记录每个节点输入输出、失败原因、重试次数和人工复审状态。",
        strengths: ["更好观测", "更容易恢复失败节点", "适合审校闭环"],
        weaknesses: ["需要定义节点边界", "需要维护状态迁移"],
        risks: [baseRisks.workflowDrift],
        criteriaScores: {
          scalability: 80,
          reliability: 88,
          security: 74,
          costEfficiency: 76,
          implementationComplexity: 74,
          maintainability: 86,
          migrationFlexibility: 82,
          teamFit: 80,
          timeToMarket: 76,
          reversibility: 78
        },
        regretByScenario: {
          longChapterInput: 18,
          schemaChange: 20,
          agentDrift: 12,
          smallTeam: 24
        },
        confidence: 0.85
      };
    case "security_reviewer":
    case "principal_architect":
    case "pragmatic_builder":
    default:
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "LangGraph 优先，LangChain 辅助",
        recommendation: `${langGraphRecommendation} ${rollout}`,
        reasoning:
          "这个产品的关键难点是把长篇文本稳定转成结构化 VN 生产数据，并让多个 agent 反复校验和修正。LangGraph 的显式状态图比 LangChain 的线性 chain 更适合主流程。",
        strengths: ["匹配多 agent 编排", "支持分支和循环", "便于插入人工复审"],
        weaknesses: ["初期设计成本略高", "不应把所有业务逻辑都绑死在框架里"],
        risks: [baseRisks.workflowDrift, baseRisks.frameworkOverhead],
        criteriaScores: {
          scalability: 84,
          reliability: 86,
          security: 74,
          costEfficiency: 78,
          implementationComplexity: 78,
          maintainability: 88,
          migrationFlexibility: 86,
          teamFit: 84,
          timeToMarket: 80,
          reversibility: 82
        },
        regretByScenario: {
          longChapterInput: 16,
          schemaChange: 16,
          agentDrift: 14,
          smallTeam: 20
        },
        confidence: 0.88
      };
  }
}

function generateServiceDecompositionProposal(roomId: string, agent: Agent, context: DecisionContext): Proposal {
  const modularMonolithRecommendation =
    "Do not split the current Node.js backend into full microservices yet. For a 5-person team focused on shipping enterprise features in the next six months, keep one deployable modular monolith, enforce clear domain modules, add service-ready interfaces around the highest-change areas, and define measurable extraction triggers.";
  const selectiveExtractionRecommendation =
    "Extract only a narrow service later when a domain has independent scaling, release cadence, compliance boundary, or a dedicated owner.";
  const fullMicroserviceWarning =
    "Avoid a broad microservice migration now because it would add CI/CD, observability, data consistency, incident response, and API-contract work before the team has enough capacity to operate it.";

  const common = {
    roomId,
    agentId: agent.id,
    alternatives: ["Modular monolith", "Selective service extraction", "Full microservices now"],
    assumptions: [
      "The team has about 5 engineers.",
      "The next six months prioritize fast enterprise feature delivery.",
      "The current monolith can still be refactored without a rewrite."
    ],
    migrationPath: [
      "Map the monolith into explicit bounded modules with owners and dependency rules.",
      "Add contract tests around module interfaces and external APIs.",
      "Move slow or failure-prone workflows behind queues inside the monolith first.",
      "Extract one service only after metrics show independent scaling or release pressure."
    ],
    version: "initial" as const
  };

  switch (agent.role) {
    case "security_reviewer":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Keep one deployable, harden module and access boundaries",
        recommendation: `${modularMonolithRecommendation} ${selectiveExtractionRecommendation}`,
        reasoning:
          "Security boundaries do not automatically improve because code is split into services. A small team will get more benefit from explicit authorization checks, ownership boundaries, audit logging, and contract tests inside the existing Node.js backend.",
        strengths: ["Lower operational attack surface", "Clearer access-control rollout", "Security work stays close to product delivery"],
        weaknesses: ["Requires discipline around module boundaries", "Does not create process-level isolation immediately"],
        risks: [baseRisks.distributedComplexity, baseRisks.serviceReliability],
        criteriaScores: {
          scalability: 76,
          reliability: 84,
          security: 82,
          costEfficiency: 88,
          implementationComplexity: 88,
          maintainability: 84,
          migrationFlexibility: 86,
          teamFit: 92,
          timeToMarket: 90,
          reversibility: 88
        },
        regretByScenario: {
          enterpriseFeatureRush: 8,
          teamTurnover: 16,
          trafficSpike: 30,
          complianceBoundary: 34
        },
        confidence: 0.86
      };
    case "sre_reviewer":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Stabilize operations before adding distributed systems",
        recommendation: `${modularMonolithRecommendation} ${fullMicroserviceWarning}`,
        reasoning:
          "Microservices multiply deployment units, alerts, dashboards, retries, timeouts, and incident paths. The SRE-safe path is to improve observability and reliability in one runtime before extracting a service.",
        strengths: ["Simpler incidents", "Fewer deployment moving parts", "Better fit for current staffing"],
        weaknesses: ["One deployable can still create coordination bottlenecks", "Some scaling problems may need later extraction"],
        risks: [baseRisks.serviceReliability, baseRisks.deliverySlowdown],
        criteriaScores: {
          scalability: 78,
          reliability: 88,
          security: 78,
          costEfficiency: 86,
          implementationComplexity: 90,
          maintainability: 84,
          migrationFlexibility: 84,
          teamFit: 90,
          timeToMarket: 88,
          reversibility: 86
        },
        regretByScenario: {
          enterpriseFeatureRush: 10,
          teamTurnover: 14,
          trafficSpike: 28,
          complianceBoundary: 38
        },
        confidence: 0.87
      };
    case "cost_engineer":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Spend engineering budget on features, not platform split",
        recommendation: modularMonolithRecommendation,
        reasoning:
          "For a 5-person team, the migration cost of full microservices competes directly with enterprise roadmap delivery. The cheapest reversible move is modularization plus extraction criteria.",
        strengths: ["Lowest migration cost", "Preserves roadmap capacity", "Avoids premature platform investment"],
        weaknesses: ["Technical debt can persist if boundaries are not enforced", "Future extraction still needs planning"],
        risks: [baseRisks.deliverySlowdown],
        criteriaScores: {
          scalability: 74,
          reliability: 80,
          security: 76,
          costEfficiency: 94,
          implementationComplexity: 92,
          maintainability: 82,
          migrationFlexibility: 84,
          teamFit: 94,
          timeToMarket: 94,
          reversibility: 88
        },
        regretByScenario: {
          enterpriseFeatureRush: 6,
          teamTurnover: 18,
          trafficSpike: 34,
          complianceBoundary: 40
        },
        confidence: 0.88
      };
    case "pragmatic_builder":
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Refactor the monolith into clear modules now",
        recommendation: `${modularMonolithRecommendation} Start by separating domains, background jobs, and integration adapters inside the repo before creating network services.`,
        reasoning:
          "The team needs fewer coordination points, not more. Modularizing the Node.js backend gives most of the design benefit while keeping local development, testing, and release flow fast.",
        strengths: ["Fastest path to product work", "Improves code ownership immediately", "Keeps deployment simple"],
        weaknesses: ["Needs enforcement in reviews and CI", "Does not solve all scaling limits"],
        risks: [baseRisks.deliverySlowdown, baseRisks.distributedComplexity],
        criteriaScores: {
          scalability: 76,
          reliability: 82,
          security: 78,
          costEfficiency: 92,
          implementationComplexity: 94,
          maintainability: 88,
          migrationFlexibility: 86,
          teamFit: 96,
          timeToMarket: 96,
          reversibility: 90
        },
        regretByScenario: {
          enterpriseFeatureRush: 5,
          teamTurnover: 12,
          trafficSpike: 32,
          complianceBoundary: 36
        },
        confidence: 0.9
      };
    case "principal_architect":
    default:
      return {
        ...common,
        id: `${agent.id}-proposal`,
        title: "Modular monolith with explicit service extraction triggers",
        recommendation: `${modularMonolithRecommendation} ${selectiveExtractionRecommendation} ${fullMicroserviceWarning}`,
        reasoning:
          "The architecture should optimize for the team's actual constraint: fast enterprise feature delivery with only 5 engineers. A modular monolith preserves speed while creating a credible path to microservices if scale or ownership pressure becomes real.",
        strengths: ["Balances delivery speed and future optionality", "Keeps architecture understandable", "Creates measurable migration gates"],
        weaknesses: ["Requires intentional module governance", "May defer some scaling isolation"],
        risks: [baseRisks.distributedComplexity, baseRisks.deliverySlowdown],
        criteriaScores: {
          scalability: 82,
          reliability: 86,
          security: 80,
          costEfficiency: 90,
          implementationComplexity: 90,
          maintainability: 88,
          migrationFlexibility: 90,
          teamFit: 94,
          timeToMarket: 92,
          reversibility: 90
        },
        regretByScenario: {
          enterpriseFeatureRush: 7,
          teamTurnover: 12,
          trafficSpike: 26,
          complianceBoundary: 32
        },
        confidence: 0.89
      };
  }
}

export function generateCritique(
  roomId: string,
  reviewer: Agent,
  targetProposal: Proposal,
  index: number
): Critique {
  const risk = targetProposal.risks[0];

  return {
    id: `${reviewer.id}-critiques-${targetProposal.id}`,
    roomId,
    reviewerAgentId: reviewer.id,
    targetProposalId: targetProposal.id,
    strongestArgument: `Proposal ${String.fromCharCode(65 + index)} is strongest when it keeps the MVP aligned with current team capacity.`,
    weakestAssumption:
      reviewer.role === "security_reviewer"
        ? weakestSecurityAssumptionForProposal(targetProposal)
        : weakestGeneralAssumptionForProposal(targetProposal),
    hiddenRisks: [risk?.description ?? "The proposal may hide migration work until after customer commitments are made."],
    missingConsiderations: missingConsiderationsForProposal(targetProposal),
    improvementSuggestions: improvementSuggestionsForProposal(targetProposal),
    scores: targetProposal.criteriaScores
  };
}

export function reviseProposal(proposal: Proposal, critiques: Critique[]): Proposal {
  const acceptedSuggestions = Array.from(
    new Set(critiques.flatMap((critique) => critique.improvementSuggestions))
  ).slice(0, 3);

  return {
    ...proposal,
    id: `${proposal.id}-revised`,
    version: "revised",
    recommendation: `${proposal.recommendation} ${revisionSummaryForProposal(proposal)}`,
    strengths: [...proposal.strengths, "Responds to cross-agent critique with concrete guardrails"],
    weaknesses: proposal.weaknesses.filter((weakness) => !weakness.toLowerCase().includes("requires discipline")),
    migrationPath: [...proposal.migrationPath, ...acceptedSuggestions],
    confidence: Math.min(0.95, proposal.confidence + 0.03)
  };
}

function domainFromContext(context: DecisionContext): string {
  // Derive a domain string from the decision context to match against skill frontmatter
  const text = [
    context.teamProfile,
    ...context.candidateOptions,
    ...context.existingConstraints,
  ]
    .join(" ")
    .toLowerCase();

  if (/tenant|postgres|database|schema|rls/.test(text)) return "technical_architecture";
  if (/security|auth|encryption|vulnerability|threat/.test(text)) return "security";
  if (/cost|budget|pricing|cloud|aws|gcp|azure|spend/.test(text)) return "cost";
  if (/microservice|decomposition|monolith|module|extract/.test(text)) return "architecture";
  if (/network|load|traffic|cache|deploy|kubernetes|k8s/.test(text)) return "infrastructure";
  if (/backend|frontend|api|graphql|rest/.test(text)) return "development";

  return "all";
}

function isServiceDecompositionQuestion(question: string, context: DecisionContext): boolean {
  const text = `${question} ${context.candidateOptions.join(" ")} ${context.teamProfile}`.toLowerCase();

  return (
    text.includes("microservice") ||
    text.includes("micro-service") ||
    text.includes("monolith") ||
    text.includes("node.js") ||
    text.includes("nodejs") ||
    text.includes("微服务") ||
    text.includes("单体")
  );
}

function injectKnowledge(proposal: Proposal, prefix: string): Proposal {
  if (!prefix) return proposal;
  return {
    ...proposal,
    reasoning: `${prefix}${proposal.reasoning}`
  };
}

function isAgentFrameworkQuestion(question: string, context: DecisionContext): boolean {
  const text = `${question} ${context.candidateOptions.join(" ")} ${context.teamProfile}`.toLowerCase();

  return (
    text.includes("langgraph") ||
    text.includes("langchain") ||
    text.includes("multi-agent") ||
    text.includes("多agent") ||
    text.includes("多 agent")
  );
}

function isTenantIsolationQuestion(question: string, context: DecisionContext): boolean {
  const text = `${question} ${context.candidateOptions.join(" ")}`.toLowerCase();

  return (
    text.includes("tenant") ||
    text.includes("postgres") ||
    text.includes("schema-per-tenant") ||
    text.includes("tenant_id") ||
    text.includes("租户")
  );
}

function isServiceDecompositionProposal(proposal: Proposal): boolean {
  return proposal.alternatives.some((alternative) => alternative.toLowerCase().includes("monolith")) || proposal.title.toLowerCase().includes("monolith");
}

function isGeneralArchitectureProposal(proposal: Proposal): boolean {
  return proposal.title.toLowerCase().includes("validation gate") || proposal.title.toLowerCase().includes("reversible");
}

function weakestSecurityAssumptionForProposal(proposal: Proposal): string {
  if (isAgentFrameworkProposal(proposal)) {
    return "It assumes graph state and intermediate artifacts will not leak sensitive source text or draft content across agent boundaries.";
  }

  if (isServiceDecompositionProposal(proposal)) {
    return "It assumes in-process module boundaries and authorization checks will be enforced as rigorously as service boundaries.";
  }

  if (isGeneralArchitectureProposal(proposal)) {
    return "It assumes the validation gates will catch security, ownership, and rollback gaps before the team commits deeply.";
  }

  return "It assumes tenant filtering will be applied perfectly across every future data path.";
}

function weakestGeneralAssumptionForProposal(proposal: Proposal): string {
  if (isAgentFrameworkProposal(proposal)) {
    return "It assumes the workflow needs explicit graph state and review loops rather than a simpler linear chain.";
  }

  if (isServiceDecompositionProposal(proposal)) {
    return "It assumes the current monolith can be modularized faster than a service split can be safely operated.";
  }

  if (isGeneralArchitectureProposal(proposal)) {
    return "It assumes the team can learn enough from a small reversible step before the decision window closes.";
  }

  return "It assumes current scale and compliance needs will remain stable long enough to defer deeper isolation.";
}

function missingConsiderationsForProposal(proposal: Proposal): string[] {
  if (isAgentFrameworkProposal(proposal)) {
    return [
      "Define the VN production data schema before expanding the agent graph.",
      "Decide which steps need human review, retries, and deterministic validation."
    ];
  }

  if (isServiceDecompositionProposal(proposal)) {
    return [
      "Define explicit triggers for extracting a service from the modular monolith.",
      "Add ownership, dependency, and API-contract rules before any split."
    ];
  }

  if (isGeneralArchitectureProposal(proposal)) {
    return [
      "Define the evidence that would make the team switch to a heavier option.",
      "Add a review date, owner, and rollback trigger to the ADR."
    ];
  }

  return [
    "Define explicit triggers for moving from shared tables to schema-per-tenant.",
    "Add runbook ownership for tenant migration, backup, and incident response."
  ];
}

function improvementSuggestionsForProposal(proposal: Proposal): string[] {
  if (isAgentFrameworkProposal(proposal)) {
    return [
      "Start with a minimal LangGraph state machine and three to five nodes.",
      "Keep LangChain usage at the model/tool wrapper layer.",
      "Add validation nodes for scene continuity, character consistency, and asset completeness."
    ];
  }

  if (isServiceDecompositionProposal(proposal)) {
    return [
      "Add module boundary checks in CI.",
      "Track deployment frequency, incident load, and domain-level scaling pressure.",
      "Document rollback and service-extraction criteria in the ADR."
    ];
  }

  if (isGeneralArchitectureProposal(proposal)) {
    return [
      "Write success, failure, and rollback signals before implementation.",
      "Run a small spike against the riskiest assumption.",
      "Re-score the options after the review window closes."
    ];
  }

  return [
    "Add tenant boundary tests before launch.",
    "Track per-tenant metrics from day one.",
    "Document rollback and isolation upgrade paths in the ADR."
  ];
}

function revisionSummaryForProposal(proposal: Proposal): string {
  if (isAgentFrameworkProposal(proposal)) {
    return "修正后的方案增加了最小 LangGraph 状态机、VN 数据 schema、校验节点、人工复审入口，并把 LangChain 限定在模型和工具封装层。";
  }

  if (isServiceDecompositionProposal(proposal)) {
    return "The revised plan adds CI-enforced module boundaries, ownership rules, observability for extraction signals, and a written service-extraction trigger.";
  }

  if (isGeneralArchitectureProposal(proposal)) {
    return "The revised plan adds explicit validation gates, review ownership, rollback signals, and a small spike before deeper commitment.";
  }

  return "The revised plan adds explicit tenant-boundary tests, per-tenant metrics, and a written isolation upgrade trigger.";
}

function isAgentFrameworkProposal(proposal: Proposal): boolean {
  return proposal.alternatives.some((alternative) => alternative.toLowerCase().includes("langgraph"));
}
