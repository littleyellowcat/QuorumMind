import type { AgentRole, DecisionContext, DecisionMode } from "./domain";

export type BlueprintAgentRole =
  | "product_strategist"
  | "workflow_architect"
  | "schema_designer"
  | "quality_reviewer"
  | "delivery_planner";

export type BlueprintAgent = {
  id: string;
  name: string;
  role: BlueprintAgentRole;
  critiqueFocus: string[];
};

export type BlueprintWorkflowStage = {
  id: string;
  title: string;
  ownerAgentId: string;
  input: string;
  output: string;
  validation: string;
};

export type BlueprintSchemaField = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

export type BlueprintSchema = {
  name: string;
  purpose: string;
  fields: BlueprintSchemaField[];
};

export type BlueprintDraft = {
  id: string;
  agentId: string;
  title: string;
  thesis: string;
  workflowStages: BlueprintWorkflowStage[];
  schemas: BlueprintSchema[];
  risks: string[];
  openQuestions: string[];
};

export type BlueprintCritique = {
  id: string;
  reviewerAgentId: string;
  targetDraftId: string;
  strongestPart: string;
  criticalGap: string;
  improvementSuggestions: string[];
};

export type BlueprintRevision = {
  id: string;
  draftId: string;
  title: string;
  incorporatedFeedback: string[];
  summary: string;
};

export type BlueprintConsensusRound = {
  round: number;
  phase: "draft" | "critique" | "revision" | "verification" | "final";
  consensusScore: number;
  threshold: number;
  passed: boolean;
  summary: string;
  improvements: string[];
  remainingDisagreements: string[];
  agentPositions: Array<{
    agentId: string;
    stance: string;
    confidence: number;
    concerns: string[];
  }>;
};

export type BlueprintSystemAgent = {
  id: string;
  name: string;
  responsibility: string;
  inputs: string[];
  outputs: string[];
  reviewQuestions: string[];
  failureMode: string;
};

export type BlueprintImplementationPhase = {
  name: string;
  duration: string;
  deliverables: string[];
  acceptanceCriteria: string[];
};

export type BlueprintModelContribution = {
  source: string;
  title: string;
  recommendation: string;
  usefulIdeas: string[];
  cautions: string[];
};

export type BlueprintEvaluationItem = {
  id: string;
  label: string;
  score: number;
  status: "strong" | "watch" | "weak";
  rationale: string;
  evidence: string[];
  improvementActions: string[];
};

export type BlueprintDetailedRecommendation = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  ownerAgentId: string;
  reason: string;
  actions: string[];
  expectedImpact: string;
  acceptanceCheck: string;
};

export type BlueprintAdoptionLedgerItem = {
  id: string;
  sourceCritiqueId: string;
  reviewerAgentId: string;
  targetDraftId: string;
  suggestion: string;
  adoptionStatus: "adopted" | "partial" | "deferred";
  targetSection: string;
  resolution: string;
  evidence: string[];
};

export type BlueprintBacklogItem = {
  id: string;
  title: string;
  phaseName: string;
  ownerAgentId: string;
  priority: "P0" | "P1" | "P2";
  effort: "S" | "M" | "L";
  dependencies: string[];
  deliverables: string[];
  acceptanceCriteria: string[];
  riskIfSkipped: string;
};

export type BlueprintFinalSpec = {
  title: string;
  executiveSummary: string;
  productGoal: string;
  recommendedAgentCount: number;
  targetOutputs: string[];
  successCriteria: string[];
  systemAgents: BlueprintSystemAgent[];
  agentDesign: BlueprintAgent[];
  workflowStages: BlueprintWorkflowStage[];
  schemas: BlueprintSchema[];
  extractionStrategy: string[];
  collaborationProtocol: string[];
  humanReviewLoop: string[];
  implementationPlan: BlueprintImplementationPhase[];
  milestones: string[];
  validationPlan: string[];
  risks: string[];
  openQuestions: string[];
  modelContributions: BlueprintModelContribution[];
  evaluationMatrix: BlueprintEvaluationItem[];
  detailedRecommendations: BlueprintDetailedRecommendation[];
  adoptionLedger: BlueprintAdoptionLedgerItem[];
  implementationBacklog: BlueprintBacklogItem[];
  markdown: string;
};

export type BlueprintRoomResult = {
  roomId: string;
  question: string;
  mode: DecisionMode;
  context: DecisionContext;
  agents: BlueprintAgent[];
  drafts: BlueprintDraft[];
  critiques: BlueprintCritique[];
  revisions: BlueprintRevision[];
  consensusThreshold: number;
  consensusRounds: BlueprintConsensusRound[];
  finalConsensusScore: number;
  consensusPassed: boolean;
  finalSpec: BlueprintFinalSpec;
};

type RunBlueprintRoomInput = {
  question: string;
  mode: DecisionMode;
  context: DecisionContext;
  locale: "en" | "zh";
};

type BlueprintPattern = "visual_novel_multi_agent" | "generic_blueprint";
type BlueprintTraceEntry = {
  provider?: string;
  model?: string;
  agentName?: string;
  phase?: string;
  status?: string;
  parsed?: unknown;
};
type BlueprintQuestionProfile = {
  subject: string;
  compactSubject: string;
  dataSources: string[];
  recommendationAreas: string[];
  riskAreas: string[];
  targetOutputs: string[];
  schemaConcepts: string[];
};
type BlueprintConsensusSignals = {
  draftCoverage: number;
  critiqueCoverage: number;
  revisionUptake: number;
  structureCoverage: number;
  questionSpecificity: number;
  domainCoverage: number;
  disagreementPressure: number;
};

const BLUEPRINT_CONSENSUS_THRESHOLD = 80;

export function runBlueprintRoom(input: RunBlueprintRoomInput): BlueprintRoomResult {
  const roomId = "blueprint-room";
  const pattern = inferBlueprintPattern(input.question);
  const agents = blueprintAgentsForMode(input.mode);
  const drafts = agents.slice(0, input.mode === "fast" ? 3 : agents.length).map((agent) =>
    createBlueprintDraft({
      roomId,
      agent,
      question: input.question,
      context: input.context,
      pattern,
      locale: input.locale
    })
  );
  const critiques = drafts.flatMap((draft) =>
    agents
      .filter((agent) => agent.id !== draft.agentId)
      .slice(0, input.mode === "fast" ? 2 : 4)
      .map((agent, index) => createBlueprintCritique(roomId, agent, draft, index, pattern, input.locale))
  );
  const revisions = drafts.map((draft) =>
    createBlueprintRevision(
      draft,
      critiques.filter((critique) => critique.targetDraftId === draft.id),
      input.locale
    )
  );
  const consensusRounds = buildBlueprintConsensusRounds({
    question: input.question,
    context: input.context,
    mode: input.mode,
    pattern,
    agents,
    drafts,
    critiques,
    revisions,
    locale: input.locale
  });
  const finalConsensusScore = consensusRounds.at(-1)?.consensusScore ?? 0;
  const consensusPassed = finalConsensusScore >= BLUEPRINT_CONSENSUS_THRESHOLD;
  const finalSpec = synthesizeFinalSpec({
    question: input.question,
    context: input.context,
    locale: input.locale,
    pattern,
    agents,
    drafts,
    critiques,
    revisions,
    consensusThreshold: BLUEPRINT_CONSENSUS_THRESHOLD,
    consensusRounds,
    finalConsensusScore,
    consensusPassed
  });

  return {
    roomId,
    question: input.question,
    mode: input.mode,
    context: input.context,
    agents,
    drafts,
    critiques,
    revisions,
    consensusThreshold: BLUEPRINT_CONSENSUS_THRESHOLD,
    consensusRounds,
    finalConsensusScore,
    consensusPassed,
    finalSpec
  };
}

export function enrichBlueprintWithModelContributions(
  result: BlueprintRoomResult,
  trace: BlueprintTraceEntry[],
  locale: "en" | "zh"
): BlueprintRoomResult {
  const modelContributions = extractModelContributions(trace, locale);

  if (modelContributions.length === 0) {
    return result;
  }

  const consensus = consensusAfterModelContributions(result, modelContributions, locale);
  const evaluationMatrix = evaluationMatrixAfterModelContributions(result.finalSpec.evaluationMatrix, modelContributions, locale);
  const detailedRecommendations = recommendationsAfterModelContributions(
    result.finalSpec.detailedRecommendations,
    modelContributions,
    locale
  );
  const finalSpec = {
    ...result.finalSpec,
    modelContributions,
    evaluationMatrix,
    detailedRecommendations
  };

  return {
    ...result,
    consensusRounds: consensus.rounds,
    finalConsensusScore: consensus.finalScore,
    consensusPassed: consensus.passed,
    finalSpec: {
      ...finalSpec,
      markdown: renderBlueprintMarkdown(finalSpec, locale, {
        threshold: result.consensusThreshold,
        rounds: consensus.rounds,
        finalScore: consensus.finalScore,
        passed: consensus.passed
      })
    }
  };
}

function inferBlueprintPattern(question: string): BlueprintPattern {
  const text = question.toLowerCase();
  const visualNovelCue =
    text.includes("visual novel") ||
    text.includes("视觉小说") ||
    text.includes("视觉类游戏") ||
    text.includes("vn") ||
    (text.includes("小说") && (text.includes("游戏") || text.includes("game") || text.includes("视觉")));

  if (visualNovelCue) {
    return "visual_novel_multi_agent";
  }

  return "generic_blueprint";
}

function createBlueprintQuestionProfile(question: string, locale: "en" | "zh", pattern: BlueprintPattern): BlueprintQuestionProfile {
  const zh = locale === "zh";

  if (pattern === "visual_novel_multi_agent") {
    return {
      subject: zh ? "视觉小说生产系统" : "visual novel production system",
      compactSubject: zh ? "视觉小说系统" : "VN system",
      dataSources: zh ? ["小说章节", "世界观说明", "目标平台"] : ["source chapters", "world notes", "target platform"],
      recommendationAreas: zh ? ["人物字段设计", "场景拆解", "对白结构化", "资产需求"] : ["character schema", "scene breakdown", "dialogue structure", "asset needs"],
      riskAreas: zh ? ["人物漂移", "剧情遗漏", "资产膨胀", "人工复审过重"] : ["character drift", "plot omissions", "asset sprawl", "heavy review"],
      targetOutputs: zh ? ["人物卡", "场景包", "对白结构", "资产需求", "校验报告"] : ["character cards", "scene package", "dialogue structure", "asset requests", "validation report"],
      schemaConcepts: ["CharacterCard", "SceneBeat", "DialogueLine", "AssetRequest"]
    };
  }

  const subject = deriveBlueprintSubject(question, locale);
  const dataSources = collectProfileItems(question, locale, [
    ["订单|order", zh ? "订单数据" : "order data"],
    ["库存|inventory|stock", zh ? "库存数据" : "inventory data"],
    ["广告|投放|预算|campaign|ad budget", zh ? "广告投放数据" : "advertising data"],
    ["客服|对话|support|conversation", zh ? "客服对话" : "support conversations"],
    ["差评|评价|review", zh ? "评价与差评" : "reviews and bad feedback"],
    ["商品|sku|product", zh ? "商品与 SKU 数据" : "product and SKU data"],
    ["成本|毛利|profit|margin|cost", zh ? "成本与毛利数据" : "cost and margin data"],
    ["用户|客户|customer|user", zh ? "客户数据" : "customer data"],
    ["日志|埋点|event|log", zh ? "行为日志" : "event logs"],
    ["文档|知识库|knowledge|document", zh ? "文档与知识库" : "documents and knowledge base"]
  ]);
  const recommendationAreas = collectProfileItems(question, locale, [
    ["每日运营简报|简报|brief", zh ? "每日运营简报" : "daily operations brief"],
    ["补货|replenishment|stockout", zh ? "补货建议" : "replenishment advice"],
    ["广告预算|预算调整|广告投放|ad budget|campaign", zh ? "广告预算调整建议" : "ad budget adjustment"],
    ["差评|review", zh ? "差评处理优先级" : "bad-review priority"],
    ["客服话术|话术|support response|reply", zh ? "客服话术优化方案" : "support response optimization"],
    ["agent|Agent|智能体", zh ? "Agent 分工与协作流程" : "agent responsibilities and workflow"],
    ["schema|Schema|字段", zh ? "数据 Schema 设计" : "data schema design"],
    ["评估|效果|accuracy|latency|cost|adoption", zh ? "Agent 效果评估" : "agent evaluation"],
    ["工作流|workflow", zh ? "工作流编排" : "workflow orchestration"]
  ]);
  const riskAreas = collectProfileItems(question, locale, [
    ["错误建议|wrong recommendation", zh ? "错误建议" : "wrong recommendations"],
    ["库存积压|overstock", zh ? "库存积压" : "overstock"],
    ["缺货|stockout", zh ? "缺货" : "stockout"],
    ["广告浪费|wasted ad|浪费", zh ? "广告浪费" : "wasted ad spend"],
    ["误回复|误回|wrong reply", zh ? "客服误回复" : "wrong support replies"],
    ["延迟|latency", zh ? "延迟过高" : "high latency"],
    ["成本|cost", zh ? "成本失控" : "cost overrun"],
    ["隐私|安全|privacy|security", zh ? "数据安全和隐私" : "data security and privacy"],
    ["范围|scope", zh ? "范围膨胀" : "scope creep"]
  ]);
  const targetOutputs = uniqueItems([
    ...recommendationAreas,
    zh ? "可审批建议清单" : "approvable recommendation list",
    zh ? "风险与人工复审队列" : "risk and human-review queue",
    zh ? "可导出的执行报告" : "exportable execution report"
  ]).slice(0, 8);
  const schemaConcepts = inferSchemaConcepts(question, locale, dataSources, recommendationAreas);

  return {
    subject,
    compactSubject: compactText(subject, zh ? 18 : 32),
    dataSources: dataSources.length > 0 ? dataSources : zh ? ["用户输入", "业务上下文", "历史样本"] : ["user input", "business context", "historical samples"],
    recommendationAreas: recommendationAreas.length > 0 ? recommendationAreas : zh ? ["目标方案", "工作流设计", "数据 Schema", "风险控制", "评估指标"] : ["target plan", "workflow design", "data schema", "risk controls", "evaluation metrics"],
    riskAreas: riskAreas.length > 0 ? riskAreas : zh ? ["错误建议", "范围膨胀", "数据质量不足"] : ["wrong recommendations", "scope creep", "poor data quality"],
    targetOutputs,
    schemaConcepts
  };
}

function deriveBlueprintSubject(question: string, locale: "en" | "zh"): string {
  const text = question.replace(/\s+/g, " ").trim();
  const zh = locale === "zh";
  const patterns = zh
    ? [
        /我想做一个([^。！？\n]+?)(?:。|，|,|；|;|$)/,
        /我想做([^。！？\n]+?)(?:。|，|,|；|;|$)/,
        /设计一套([^。！？\n]+?)(?:。|，|,|；|;|$)/,
        /做一个([^。！？\n]+?)(?:。|，|,|；|;|$)/
      ]
    : [
        /I want to build (?:a|an)?\s*([^.!?\n]+?)(?:\.|,|;|$)/i,
        /design (?:a|an)?\s*([^.!?\n]+?)(?:\.|,|;|$)/i,
        /build (?:a|an)?\s*([^.!?\n]+?)(?:\.|,|;|$)/i
      ];
  const match = patterns.map((pattern) => text.match(pattern)?.[1]?.trim()).find(Boolean);

  if (match) {
    return compactText(cleanSubject(match), zh ? 34 : 54);
  }

  const firstSentence = text.split(/[。！？.!?]/)[0]?.trim();
  return compactText(cleanSubject(firstSentence || (zh ? "当前开放式需求" : "the current open-ended request")), zh ? 34 : 54);
}

function cleanSubject(value: string): string {
  return value
    .replace(/^一个/, "")
    .replace(/^一套/, "")
    .replace(/^面向/, "面向")
    .replace(/^for\s+/i, "")
    .trim();
}

function collectProfileItems(question: string, locale: "en" | "zh", candidates: Array<[string, string]>): string[] {
  const text = question.toLowerCase();
  const items = candidates
    .filter(([pattern]) => new RegExp(pattern, "i").test(text))
    .map(([, label]) => label);

  return uniqueItems(items).slice(0, locale === "zh" ? 7 : 7);
}

function inferSchemaConcepts(
  question: string,
  locale: "en" | "zh",
  dataSources: string[],
  recommendationAreas: string[]
): string[] {
  const text = question.toLowerCase();
  const concepts: string[] = ["RequirementProfile"];

  if (/订单|order/.test(text) || dataSources.some((item) => /订单|order/i.test(item))) concepts.push("OrderSnapshot");
  if (/库存|inventory|stock|sku/i.test(text)) concepts.push("InventorySnapshot");
  if (/广告|投放|campaign|ad/i.test(text)) concepts.push("CampaignPerformance");
  if (/客服|对话|support|conversation/i.test(text)) concepts.push("SupportConversation");
  if (/差评|评价|review/i.test(text)) concepts.push("ReviewSignal");
  if (/补货|replenishment/i.test(text)) concepts.push("RecommendationItem");
  if (/简报|brief/i.test(text) || recommendationAreas.some((item) => /简报|brief/i.test(item))) concepts.push("DecisionBrief");
  concepts.push("HumanReviewItem", "EvaluationMetric");

  return uniqueItems(concepts).slice(0, 7);
}

function uniqueItems(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function compactText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function blueprintAgentsForMode(mode: DecisionMode): BlueprintAgent[] {
  const agents: BlueprintAgent[] = [
    {
      id: "product-strategist",
      name: "Product Strategist",
      role: "product_strategist",
      critiqueFocus: ["user outcome", "scope control", "MVP boundaries"]
    },
    {
      id: "workflow-architect",
      name: "Workflow Architect",
      role: "workflow_architect",
      critiqueFocus: ["agent handoff", "state flow", "failure recovery"]
    },
    {
      id: "schema-designer",
      name: "Schema Designer",
      role: "schema_designer",
      critiqueFocus: ["JSON contracts", "field completeness", "validation"]
    },
    {
      id: "quality-reviewer",
      name: "Quality Reviewer",
      role: "quality_reviewer",
      critiqueFocus: ["edge cases", "test sets", "human review"]
    },
    {
      id: "delivery-planner",
      name: "Delivery Planner",
      role: "delivery_planner",
      critiqueFocus: ["milestones", "sequencing", "implementation risk"]
    }
  ];

  return mode === "fast" ? agents.slice(0, 3) : agents;
}

function createBlueprintDraft(input: {
  roomId: string;
  agent: BlueprintAgent;
  question: string;
  context: DecisionContext;
  pattern: BlueprintPattern;
  locale: "en" | "zh";
}): BlueprintDraft {
  const zh = input.locale === "zh";
  const profile = createBlueprintQuestionProfile(input.question, input.locale, input.pattern);
  const title =
    input.pattern === "visual_novel_multi_agent"
      ? zh
        ? `${roleLabel(input.agent.role, input.locale)}：小说到视觉小说生产蓝图`
        : `${roleLabel(input.agent.role, input.locale)}: Novel-to-VN production blueprint`
      : zh
        ? `${roleLabel(input.agent.role, input.locale)}：${profile.compactSubject}蓝图`
        : `${roleLabel(input.agent.role, input.locale)}: ${profile.compactSubject} blueprint`;

  return {
    id: `${input.agent.id}-draft`,
    agentId: input.agent.id,
    title,
    thesis:
      input.pattern === "visual_novel_multi_agent"
        ? zh
          ? "先把长文本变成可审查的中间结构，再由多 Agent 分工生成场景、角色、对白、资产和验证报告。"
          : "Convert long-form prose into reviewable intermediate artifacts before agents generate scenes, characters, dialogue, assets, and validation reports."
        : zh
          ? `围绕“${profile.compactSubject}”先建立目标、数据源、Agent 分工、风险校验和效果回写闭环，再逐步扩展自动化深度。`
          : `For ${profile.compactSubject}, define goals, data sources, agent responsibilities, risk checks, and outcome feedback before expanding automation depth.`,
    workflowStages: workflowStages(input.pattern, input.locale, profile),
    schemas: schemasForPattern(input.pattern, input.locale, profile),
    risks: risksForPattern(input.pattern, input.locale, profile),
    openQuestions: openQuestionsForPattern(input.pattern, input.locale, profile)
  };
}

function createBlueprintCritique(
  roomId: string,
  reviewer: BlueprintAgent,
  draft: BlueprintDraft,
  index: number,
  pattern: BlueprintPattern,
  locale: "en" | "zh"
): BlueprintCritique {
  const zh = locale === "zh";
  const template = critiqueTemplateForRole(reviewer.role, pattern, locale);
  const targetRole = roleLabel(roleForDraftAgentId(draft.agentId), locale);

  return {
    id: `${roomId}-${reviewer.id}-${draft.id}-${index}`,
    reviewerAgentId: reviewer.id,
    targetDraftId: draft.id,
    strongestPart: zh
      ? `${roleLabel(reviewer.role, locale)}认可${targetRole}草案已经覆盖 ${draft.workflowStages.length} 个关键阶段，尤其是“${draft.workflowStages[index % draft.workflowStages.length]?.title}”。`
      : `${roleLabel(reviewer.role, locale)} accepts that the ${targetRole} draft covers ${draft.workflowStages.length} key stages, especially "${draft.workflowStages[index % draft.workflowStages.length]?.title}".`,
    criticalGap: template.criticalGap,
    improvementSuggestions: template.improvementSuggestions
  };
}

function createBlueprintRevision(draft: BlueprintDraft, critiques: BlueprintCritique[], locale: "en" | "zh"): BlueprintRevision {
  const zh = locale === "zh";
  const incorporatedFeedback = uniqueStrings(critiques.flatMap((critique) => critique.improvementSuggestions)).slice(0, 5);

  return {
    id: `${draft.id}-revision`,
    draftId: draft.id,
    title: zh ? `${draft.title}（修订版）` : `${draft.title} (revised)`,
    incorporatedFeedback,
    summary: zh
      ? `修订版吸收 ${incorporatedFeedback.length} 条差异化质询，把草案从想法扩展为可执行方案。`
      : `The revision incorporates ${incorporatedFeedback.length} differentiated critiques and turns the draft into an executable blueprint.`
  };
}

function critiqueTemplateForRole(
  role: BlueprintAgentRole,
  pattern: BlueprintPattern,
  locale: "en" | "zh"
): Pick<BlueprintCritique, "criticalGap" | "improvementSuggestions"> {
  const zh = locale === "zh";
  const visualNovel = pattern === "visual_novel_multi_agent";

  const templates: Record<BlueprintAgentRole, Pick<BlueprintCritique, "criticalGap" | "improvementSuggestions">> = zh
    ? {
        product_strategist: {
          criticalGap: visualNovel
            ? "产品边界还不够收敛：需要先定义 MVP 是章节转场景、可玩 Demo，还是完整生产管线。"
            : "目标用户和最小可用输出还不够明确，容易把蓝图扩成过大的项目。",
          improvementSuggestions: visualNovel
            ? [
                "把 MVP 限定为单章节到可审查 VN 场景包。",
                "明确人类编辑在哪些节点拥有最终决策权。",
                "为导出产物定义可验收的播放或预览标准。"
              ]
            : [
                "写清首批用户、使用场景和验收结果。",
                "把非 MVP 能力放入后续阶段，避免范围膨胀。",
                "为每个输出定义用户可感知的成功标准。"
              ]
        },
        workflow_architect: {
          criticalGap: visualNovel
            ? "Agent 交接状态还不够显式：章节、人物、场景、对白和资产之间需要可回放的状态流。"
            : "阶段之间的输入、输出、失败回流和重试条件还没有形成清晰编排图。",
          improvementSuggestions: visualNovel
            ? [
                "建立统一 StoryState，记录 sourceSpan、版本号和上游节点。",
                "把抽取、生成、校验拆成可重试节点，而不是一次性长链路。",
                "为阻断错误设计回流到原 Agent 的路径。"
              ]
            : [
                "把工作流画成节点、边、状态和终止条件。",
                "为每个阶段定义重试、跳过和人工接管策略。",
                "记录每次运行的输入快照，方便复现问题。"
              ]
        },
        schema_designer: {
          criticalGap: visualNovel
            ? "字段粒度还偏粗：人物别名、关系变化、场景引用和资产绑定需要更严格的数据契约。"
            : "Schema 缺少版本、来源引用和字段级校验，后续节点可能无法稳定消费。",
          improvementSuggestions: visualNovel
            ? [
                "为 CharacterCard 增加 aliases、stateTimeline、relationshipEdges。",
                "为 SceneBeat 和 DialogueLine 保留 sourceSpan 和 confidence。",
                "为 AssetRequest 增加去重 key、优先级和关联场景。"
              ]
            : [
                "给核心对象增加 schemaVersion 和 sourceRefs。",
                "区分必填字段、可选字段和人工确认字段。",
                "为跨节点引用设计稳定 ID，而不是依赖文本名称。"
              ]
        },
        quality_reviewer: {
          criticalGap: visualNovel
            ? "质量门槛还不够具体：需要用样本章节验证人物一致性、剧情覆盖率和对白归属。"
            : "测试集、回归指标和人工复审命中率还没有量化，难以判断方案是否真的变好。",
          improvementSuggestions: visualNovel
            ? [
                "建立 10 个章节样本，覆盖多人物、回忆、换场和伏笔。",
                "跟踪人物一致性、剧情覆盖、对白归属和资产闭环四类指标。",
                "把低置信度和冲突项进入人工复审队列。"
              ]
            : [
                "定义小型回归测试集，覆盖正常、边界和失败输入。",
                "记录每次运行的通过率、修复率和人工接管率。",
                "把高风险输出先做人工抽检，再扩大自动化范围。"
              ]
        },
        delivery_planner: {
          criticalGap: visualNovel
            ? "交付路径还需要压缩：同时做抽取、生成、资产和编辑器会拖慢 MVP。"
            : "里程碑缺少优先级和验收口径，容易在实现中同时推进过多模块。",
          improvementSuggestions: visualNovel
            ? [
                "第一阶段只交付章节解析、人物/场景抽取和 JSON 导出。",
                "第二阶段再加入对白结构化、资产需求和一致性报告。",
                "把编辑器、多人协作和引擎集成放到验证后。"
              ]
            : [
                "按一周一个可验收产物拆分里程碑。",
                "先交付最短闭环，再补图形化和高级自动化。",
                "为每个里程碑指定停止条件，避免持续追加范围。"
              ]
        }
      }
    : {
        product_strategist: {
          criticalGap: visualNovel
            ? "The product boundary is still too broad: define whether MVP means chapter-to-scenes, playable demo, or full production pipeline."
            : "The target user and minimum usable output are not explicit enough, which can expand the blueprint into an oversized project.",
          improvementSuggestions: visualNovel
            ? [
                "Limit the MVP to one chapter converted into a reviewable VN scene pack.",
                "Define where the human editor has final decision rights.",
                "Set acceptance criteria for previewable or playable exported output."
              ]
            : [
                "Name the first users, usage context, and accepted outcome.",
                "Move non-MVP capabilities into later phases.",
                "Define user-visible success criteria for every output."
              ]
        },
        workflow_architect: {
          criticalGap: visualNovel
            ? "Agent handoff state is not explicit enough: chapters, characters, scenes, dialogue, and assets need replayable state flow."
            : "Stage inputs, outputs, failure routing, and retry conditions are not yet a clear orchestration graph.",
          improvementSuggestions: visualNovel
            ? [
                "Create a shared StoryState with sourceSpan, version, and upstream node metadata.",
                "Split extraction, generation, and validation into retryable nodes.",
                "Route blocking errors back to the owning agent."
              ]
            : [
                "Draw the workflow as nodes, edges, state, and termination conditions.",
                "Define retry, skip, and human takeover rules for every stage.",
                "Snapshot every run input so failures are reproducible."
              ]
        },
        schema_designer: {
          criticalGap: visualNovel
            ? "The field model is too coarse: aliases, relationship changes, scene references, and asset bindings need stricter contracts."
            : "Schemas need versioning, source references, and field-level validation before downstream nodes can consume them safely.",
          improvementSuggestions: visualNovel
            ? [
                "Add aliases, stateTimeline, and relationshipEdges to CharacterCard.",
                "Keep sourceSpan and confidence on SceneBeat and DialogueLine.",
                "Add dedupe key, priority, and linked scenes to AssetRequest."
              ]
            : [
                "Add schemaVersion and sourceRefs to core objects.",
                "Separate required, optional, and human-confirmed fields.",
                "Use stable IDs for cross-node references instead of display names."
              ]
        },
        quality_reviewer: {
          criticalGap: visualNovel
            ? "Quality gates are not concrete enough: sample chapters should test character consistency, plot coverage, and dialogue ownership."
            : "Test set, regression metrics, and human-review precision are not quantified enough to judge improvement.",
          improvementSuggestions: visualNovel
            ? [
                "Build 10 chapter samples covering many characters, flashbacks, scene changes, and foreshadowing.",
                "Track character consistency, plot coverage, dialogue ownership, and asset closure.",
                "Route low-confidence and conflict items into a human review queue."
              ]
            : [
                "Define a small regression set covering normal, edge, and failing inputs.",
                "Track pass rate, repair rate, and human takeover rate.",
                "Sample high-risk outputs manually before expanding automation."
              ]
        },
        delivery_planner: {
          criticalGap: visualNovel
            ? "The delivery path needs compression: building extraction, generation, assets, and editor UI together will slow the MVP."
            : "Milestones need clearer priority and acceptance criteria to avoid implementing too many modules at once.",
          improvementSuggestions: visualNovel
            ? [
                "Ship chapter parsing, character/scene extraction, and JSON export first.",
                "Add dialogue structuring, asset requests, and consistency reports second.",
                "Defer editor UI, collaboration, and engine integration until validation."
              ]
            : [
                "Split milestones into one accepted artifact per week.",
                "Ship the shortest closed loop before visual analytics and advanced automation.",
                "Define stop conditions for every milestone."
              ]
        }
      };

  return templates[role];
}

function synthesizeFinalSpec(input: {
  question: string;
  context: DecisionContext;
  locale: "en" | "zh";
  pattern: BlueprintPattern;
  agents: BlueprintAgent[];
  drafts: BlueprintDraft[];
  critiques: BlueprintCritique[];
  revisions: BlueprintRevision[];
  consensusThreshold: number;
  consensusRounds: BlueprintConsensusRound[];
  finalConsensusScore: number;
  consensusPassed: boolean;
}): BlueprintFinalSpec {
  const zh = input.locale === "zh";
  const profile = createBlueprintQuestionProfile(input.question, input.locale, input.pattern);
  const workflow = workflowStages(input.pattern, input.locale, profile);
  const schemas = schemasForPattern(input.pattern, input.locale, profile);
  const targetOutputs = targetOutputsForPattern(input.pattern, input.locale, profile);
  const successCriteria = successCriteriaForPattern(input.pattern, input.locale, profile);
  const systemAgents = systemAgentsForPattern(input.pattern, input.locale, profile);
  const collaborationItems = collaborationProtocol(input.pattern, input.locale, profile);
  const implementationPhases = implementationPlan(input.pattern, input.locale, profile);
  const evaluationMatrix = evaluationMatrixForBlueprint({
    pattern: input.pattern,
    locale: input.locale,
    finalConsensusScore: input.finalConsensusScore,
    consensusPassed: input.consensusPassed,
    workflowCount: workflow.length,
    schemaCount: schemas.length,
    critiqueCount: input.critiques.length,
    revisionCount: input.revisions.length
  });
  const detailedRecommendations = detailedRecommendationsForBlueprint(input.pattern, input.locale, evaluationMatrix, profile);
  const adoptionLedger = adoptionLedgerForBlueprint({
    critiques: input.critiques,
    revisions: input.revisions,
    locale: input.locale
  });
  const implementationBacklog = implementationBacklogForBlueprint(input.pattern, input.locale, implementationPhases, profile);
  const title =
    input.pattern === "visual_novel_multi_agent"
      ? zh
        ? "多 Agent 视觉小说生产系统蓝图"
        : "Multi-agent visual novel production blueprint"
      : zh
        ? `${profile.subject}蓝图`
        : `${profile.subject} blueprint`;
  const executiveSummary =
    input.pattern === "visual_novel_multi_agent"
      ? zh
        ? "建议把系统设计成“章节解析 -> 结构抽取 -> 角色/场景/对白/资产生成 -> 一致性校验 -> 人工复审”的可审查流水线。每个 Agent 只负责一个明确产物，并通过 JSON Schema 交接。"
        : "Design the system as an auditable pipeline: chapter parsing -> structure extraction -> character/scene/dialogue/asset generation -> consistency validation -> human review. Each agent owns one clear artifact and hands off through JSON schemas."
      : zh
        ? `建议把“${profile.compactSubject}”设计成“需求/数据接入 -> 状态诊断 -> 建议生成 -> 风险校验 -> 人工审批 -> 交付与效果回写”的通用可审查流水线。重点围绕 ${profile.recommendationAreas.slice(0, 4).join("、")} 输出可解释方案，并对 ${profile.riskAreas.slice(0, 3).join("、")} 设置阻断或复审机制。`
        : `Design ${profile.compactSubject} as a generic auditable pipeline: request/data intake -> state diagnosis -> recommendation generation -> risk validation -> human approval -> delivery and outcome feedback. Focus on ${profile.recommendationAreas.slice(0, 4).join(", ")} while gating ${profile.riskAreas.slice(0, 3).join(", ")}.`;
  const finalSpec: Omit<BlueprintFinalSpec, "markdown"> = {
    title,
    executiveSummary,
    productGoal: zh
      ? `把用户的开放需求转成可执行方案：${input.question}`
      : `Turn the open-ended request into an executable plan: ${input.question}`,
    recommendedAgentCount: systemAgents.length,
    targetOutputs,
    successCriteria,
    systemAgents,
    agentDesign: input.agents,
    workflowStages: workflow,
    schemas,
    extractionStrategy: extractionStrategy(input.pattern, input.locale, profile),
    collaborationProtocol: collaborationItems,
    humanReviewLoop: humanReviewLoop(input.pattern, input.locale, profile),
    implementationPlan: implementationPhases,
    milestones: milestones(input.pattern, input.locale, profile),
    validationPlan: validationPlan(input.pattern, input.locale, profile),
    risks: risksForPattern(input.pattern, input.locale, profile),
    openQuestions: openQuestionsForPattern(input.pattern, input.locale, profile),
    modelContributions: [],
    evaluationMatrix,
    detailedRecommendations,
    adoptionLedger,
    implementationBacklog
  };

  return {
    ...finalSpec,
    markdown: renderBlueprintMarkdown(finalSpec, input.locale, {
      threshold: input.consensusThreshold,
      rounds: input.consensusRounds,
      finalScore: input.finalConsensusScore,
      passed: input.consensusPassed
    })
  };
}

function buildBlueprintConsensusRounds(input: {
  question: string;
  context: DecisionContext;
  mode: DecisionMode;
  pattern: BlueprintPattern;
  agents: BlueprintAgent[];
  drafts: BlueprintDraft[];
  critiques: BlueprintCritique[];
  revisions: BlueprintRevision[];
  locale: "en" | "zh";
}): BlueprintConsensusRound[] {
  const maxRounds = consensusMaxRounds(input.mode);
  const minRounds = consensusMinRounds(input.mode);
  const signals = blueprintConsensusSignals(input);
  const rounds: BlueprintConsensusRound[] = [];
  let previousScore = 0;

  for (let index = 0; index < maxRounds; index += 1) {
    const roundNumber = index + 1;
    const rawScore = consensusScoreForRound(signals, roundNumber, input.mode);
    const score = Math.max(rawScore, previousScore > 0 ? Math.min(96, previousScore + 1) : rawScore);
    const passed = score >= BLUEPRINT_CONSENSUS_THRESHOLD;
    rounds.push(
      createConsensusRound({
        round: roundNumber,
        score,
        passed,
        phase: consensusPhaseForRound(roundNumber, input.mode),
        pattern: input.pattern,
        agents: input.agents,
        drafts: input.drafts,
        critiques: input.critiques,
        revisions: input.revisions,
        locale: input.locale
      })
    );

    if (roundNumber >= minRounds && passed) {
      break;
    }

    previousScore = score;
  }

  return rounds;
}

function blueprintConsensusSignals(input: {
  question: string;
  context: DecisionContext;
  mode: DecisionMode;
  pattern: BlueprintPattern;
  agents: BlueprintAgent[];
  drafts: BlueprintDraft[];
  critiques: BlueprintCritique[];
  revisions: BlueprintRevision[];
}): BlueprintConsensusSignals {
  const expectedWorkflowStages = input.pattern === "visual_novel_multi_agent" ? 7 : 6;
  const expectedSchemaFields = input.pattern === "visual_novel_multi_agent" ? 16 : 18;
  const draftCoverage = averageScore(
    input.drafts.map((draft) => {
      const workflow = ratioScore(draft.workflowStages.length, expectedWorkflowStages);
      const schemaFields = draft.schemas.reduce((sum, schema) => sum + schema.fields.length, 0);
      const schemas = ratioScore(schemaFields, expectedSchemaFields);
      const risks = ratioScore(draft.risks.length, 5);
      const openQuestions = ratioScore(draft.openQuestions.length, 4);
      const thesis = ratioScore(draft.thesis.length, input.pattern === "visual_novel_multi_agent" ? 70 : 90);

      return boundedSignal(workflow * 0.28 + schemas * 0.28 + risks * 0.17 + openQuestions * 0.12 + thesis * 0.15);
    })
  );
  const expectedCritiques =
    input.drafts.length * Math.min(input.agents.length - 1, input.mode === "fast" ? 2 : 4);
  const critiqueRoleCoverage = ratioScore(uniqueStrings(input.critiques.map((critique) => critique.reviewerAgentId)).length, input.agents.length);
  const uniqueSuggestionCount = uniqueStrings(input.critiques.flatMap((critique) => critique.improvementSuggestions)).length;
  const critiqueSpecificity = ratioScore(
    input.critiques.reduce((sum, critique) => sum + critique.criticalGap.length + critique.improvementSuggestions.join(" ").length, 0),
    expectedCritiques * 140
  );
  const critiqueCoverage = boundedSignal(
    ratioScore(input.critiques.length, expectedCritiques) * 0.34 +
      critiqueRoleCoverage * 0.22 +
      ratioScore(uniqueSuggestionCount, expectedCritiques * 2.2) * 0.28 +
      critiqueSpecificity * 0.16
  );
  const incorporatedFeedback = uniqueStrings(input.revisions.flatMap((revision) => revision.incorporatedFeedback));
  const revisionUptake = boundedSignal(
    ratioScore(incorporatedFeedback.length, Math.max(8, uniqueSuggestionCount * 0.5)) * 0.46 +
      ratioScore(input.revisions.length, input.drafts.length) * 0.22 +
      ratioScore(average(input.revisions.map((revision) => revision.incorporatedFeedback.length)), 5) * 0.2 +
      ratioScore(average(input.revisions.map((revision) => revision.summary.length)), 90) * 0.12
  );
  const structureCoverage = boundedSignal(
    ratioScore(average(input.drafts.map((draft) => draft.workflowStages.length)), expectedWorkflowStages) * 0.38 +
      ratioScore(average(input.drafts.map((draft) => draft.schemas.reduce((sum, schema) => sum + schema.fields.length, 0))), expectedSchemaFields) * 0.34 +
      ratioScore(input.context.existingConstraints.length + input.context.assumptions.length + input.context.candidateOptions.length, 8) * 0.14 +
      ratioScore(input.agents.length, input.mode === "fast" ? 3 : 5) * 0.14
  );
  const questionSpecificity = questionSpecificityScore(input.question, input.context);
  const domainCoverage = questionDomainCoverageScore(input.question);
  const uniqueGaps = uniqueStrings(input.critiques.map((critique) => critique.criticalGap)).length;
  const avgOpenQuestions = average(input.drafts.map((draft) => draft.openQuestions.length));
  const disagreementPressure = boundedSignal(
    ratioScore(uniqueGaps, input.agents.length) * 0.42 +
      ratioScore(avgOpenQuestions, 5) * 0.22 +
      ratioScore(uniqueSuggestionCount, Math.max(8, expectedCritiques * 1.4)) * 0.2 +
      (input.mode === "red_team" ? 14 : 8)
  );

  return {
    draftCoverage,
    critiqueCoverage,
    revisionUptake,
    structureCoverage,
    questionSpecificity,
    domainCoverage,
    disagreementPressure
  };
}

function consensusScoreForRound(signals: BlueprintConsensusSignals, round: number, mode: DecisionMode): number {
  const modeAdjustment = mode === "fast" ? -3 : mode === "red_team" ? -5 : 0;
  const formulas = [
    38 +
      signals.draftCoverage * 0.22 +
      signals.structureCoverage * 0.12 +
      signals.questionSpecificity * 0.08 -
      signals.disagreementPressure * 0.12,
    40 +
      signals.draftCoverage * 0.14 +
      signals.structureCoverage * 0.12 +
      signals.critiqueCoverage * 0.16 +
      signals.questionSpecificity * 0.07 -
      signals.disagreementPressure * 0.08,
    41 +
      signals.draftCoverage * 0.1 +
      signals.structureCoverage * 0.14 +
      signals.critiqueCoverage * 0.1 +
      signals.revisionUptake * 0.14 +
      signals.questionSpecificity * 0.05 +
      signals.domainCoverage * 0.04 -
      signals.disagreementPressure * 0.05,
    42 +
      signals.draftCoverage * 0.08 +
      signals.structureCoverage * 0.15 +
      signals.critiqueCoverage * 0.08 +
      signals.revisionUptake * 0.14 +
      signals.questionSpecificity * 0.05 +
      signals.domainCoverage * 0.04 +
      verificationSignal(signals) * 0.08 -
      signals.disagreementPressure * 0.04
  ];
  const index = Math.min(round - 1, formulas.length - 1);

  return boundedScore(formulas[index] + modeAdjustment);
}

function ratioScore(value: number, target: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (value / target) * 100));
}

function boundedSignal(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageScore(values: number[]): number {
  return boundedSignal(average(values));
}

function questionSpecificityScore(question: string, context: DecisionContext): number {
  const text = question.toLowerCase();
  const numberedItems = (question.match(/\n\s*\d+[.、)]/g) ?? []).length;
  const domainSignals = [
    "agent",
    "schema",
    "workflow",
    "工作流",
    "字段",
    "数据",
    "指标",
    "评估",
    "风险",
    "验收",
    "mvp",
    "成本",
    "延迟",
    "人工"
  ].filter((signal) => text.includes(signal)).length;
  const contextSignals = [
    context.productStage,
    context.expectedScale,
    context.teamProfile,
    ...context.existingConstraints,
    ...context.candidateOptions,
    ...context.assumptions
  ].filter((item) => item.trim().length > 0).length;

  return boundedSignal(
    ratioScore(question.length, 260) * 0.34 +
      ratioScore(numberedItems, 6) * 0.18 +
      ratioScore(domainSignals, 8) * 0.24 +
      ratioScore(contextSignals, 12) * 0.24
  );
}

function questionDomainCoverageScore(question: string): number {
  const text = question.toLowerCase();
  const groups = [
    ["crm", "销售", "线索", "客户"],
    ["订单", "库存", "广告", "投放", "客服对话", "商品"],
    ["合同", "制度", "政策", "文档", "条款", "审查"],
    ["会议", "任务", "风险", "周报", "项目管理"],
    ["培训", "课程", "内容", "学习", "知识"],
    ["客服", "工单", "知识库", "话术"],
    ["agent", "智能体", "schema", "字段", "复审"],
    ["指标", "评估", "准确", "延迟", "成本", "采纳"]
  ];
  const matchedGroups = groups.filter((group) => group.some((item) => text.includes(item))).length;
  const matchedTerms = uniqueStrings(groups.flatMap((group) => group.filter((item) => text.includes(item)))).length;

  return boundedSignal(ratioScore(matchedGroups, 5) * 0.58 + ratioScore(matchedTerms, 10) * 0.42);
}

function verificationSignal(signals: BlueprintConsensusSignals): number {
  return boundedSignal(
    signals.structureCoverage * 0.28 +
      signals.revisionUptake * 0.3 +
      signals.critiqueCoverage * 0.22 +
      signals.questionSpecificity * 0.12 +
      signals.domainCoverage * 0.08
  );
}

function createConsensusRound(input: {
  round: number;
  score: number;
  passed: boolean;
  phase: BlueprintConsensusRound["phase"];
  pattern: BlueprintPattern;
  agents: BlueprintAgent[];
  drafts: BlueprintDraft[];
  critiques: BlueprintCritique[];
  revisions: BlueprintRevision[];
  locale: "en" | "zh";
}): BlueprintConsensusRound {
  const zh = input.locale === "zh";
  const visualNovel = input.pattern === "visual_novel_multi_agent";

  return {
    round: input.round,
    phase: input.phase,
    consensusScore: input.score,
    threshold: BLUEPRINT_CONSENSUS_THRESHOLD,
    passed: input.passed,
    summary: consensusRoundSummary(input.round, input.phase, input.score, input.passed, visualNovel, input.locale),
    improvements: consensusRoundImprovements(input.round, input.phase, visualNovel, input.locale),
    remainingDisagreements: consensusRoundDisagreements(input.round, input.passed, visualNovel, input.locale),
    agentPositions: input.agents.map((agent, index) => ({
      agentId: agent.id,
      stance: consensusAgentStance(agent.role, input.round, input.passed, visualNovel, input.locale),
      confidence: Math.min(94, Math.max(52, input.score - 8 + index * 2 + (agent.role === "quality_reviewer" ? -2 : 0))),
      concerns: zh
        ? agent.critiqueFocus.map((focus) => localizeCritiqueFocus(focus)).slice(0, 3)
        : agent.critiqueFocus.slice(0, 3)
    }))
  };
}

function consensusAfterModelContributions(
  result: BlueprintRoomResult,
  modelContributions: BlueprintModelContribution[],
  locale: "en" | "zh"
): { rounds: BlueprintConsensusRound[]; finalScore: number; passed: boolean } {
  const liveBump = liveContributionBump(modelContributions, result.finalConsensusScore);
  const finalScore = Math.min(96, Math.max(result.finalConsensusScore, result.finalConsensusScore + liveBump));
  const passed = finalScore >= result.consensusThreshold;
  const liveRound: BlueprintConsensusRound = {
    round: result.consensusRounds.length + 1,
    phase: "final",
    consensusScore: finalScore,
    threshold: result.consensusThreshold,
    passed,
    summary:
      locale === "zh"
        ? `真实模型贡献已纳入最终综合，系统把可采纳建议、风险提醒和本地结构化蓝图对齐后，共识提升到 ${finalScore}%。`
        : `Live model contributions were incorporated into the final synthesis, raising consensus to ${finalScore}% after aligning useful ideas, cautions, and the local structured blueprint.`,
    improvements:
      locale === "zh"
        ? [
            "把真实模型的推荐、优势和风险提醒合并到最终规格，而不是只展示原始文本。",
            "保留“真实模型贡献”和“本地结构化综合”的来源边界，避免误以为所有字段都由模型直接生成。",
            "只在模型输出可解析且可用时提高共识分；无可用模型贡献时不做加分。"
          ]
        : [
            "Merged live model recommendations, strengths, and cautions into the final specification.",
            "Kept the source boundary between live model contributions and local structured synthesis.",
            "Raised consensus only when usable, parsed model contributions were available."
          ],
    remainingDisagreements:
      locale === "zh"
        ? ["真实模型仍可能遗漏字段或不完全符合 Schema，关键输出需要继续通过回归样本验证。"]
        : ["Live models may still omit fields or drift from schema, so key outputs still need regression validation."],
    agentPositions: result.agents.map((agent, index) => ({
      agentId: agent.id,
      stance:
        locale === "zh"
          ? `${roleLabel(agent.role, locale)}同意采纳真实模型中可验证的建议，但保留结构化校验和人工复审。`
          : `${roleLabel(agent.role, locale)} accepts verifiable live-model ideas while preserving structured validation and human review.`,
      confidence: Math.min(94, finalScore - 6 + index * 2),
      concerns: locale === "zh" ? agent.critiqueFocus.map((focus) => localizeCritiqueFocus(focus)).slice(0, 3) : agent.critiqueFocus.slice(0, 3)
    }))
  };

  return {
    rounds: [...result.consensusRounds, liveRound],
    finalScore,
    passed
  };
}

function liveContributionBump(modelContributions: BlueprintModelContribution[], baseConsensusScore: number): number {
  if (modelContributions.length === 0) {
    return 0;
  }

  const quality = average(modelContributions.map(modelContributionQuality));
  const sourceDiversity = uniqueStrings(modelContributions.map((contribution) => contribution.source)).length;
  const ideaDensity = modelContributions.reduce(
    (sum, contribution) => sum + contribution.usefulIdeas.length + contribution.cautions.length,
    0
  );
  const rawBump = quality / 18 + Math.min(1.6, sourceDiversity * 0.35) + Math.min(1.2, ideaDensity / 12);
  const maxBump = baseConsensusScore >= 86 ? 2 : baseConsensusScore >= 82 ? 3 : 4;

  return Math.max(1, Math.min(maxBump, Math.round(rawBump)));
}

function modelContributionQuality(contribution: BlueprintModelContribution): number {
  return (
    ratioScore(contribution.title.length, 32) * 0.08 +
    ratioScore(contribution.recommendation.length, 180) * 0.34 +
    ratioScore(contribution.usefulIdeas.length, 4) * 0.22 +
    ratioScore(contribution.cautions.length, 3) * 0.18 +
    ratioScore(contribution.source.length, 24) * 0.08 +
    ratioScore(uniqueStrings([...contribution.usefulIdeas, ...contribution.cautions]).length, 6) * 0.1
  );
}

function evaluationMatrixForBlueprint(input: {
  pattern: BlueprintPattern;
  locale: "en" | "zh";
  finalConsensusScore: number;
  consensusPassed: boolean;
  workflowCount: number;
  schemaCount: number;
  critiqueCount: number;
  revisionCount: number;
}): BlueprintEvaluationItem[] {
  const zh = input.locale === "zh";
  const visualNovel = input.pattern === "visual_novel_multi_agent";
  const base = input.finalConsensusScore;
  const workflowCoverage = Math.min(7, input.workflowCount) * 1.4;
  const schemaCoverage = Math.min(4, input.schemaCount) * 1.5;
  const critiqueCoverage = Math.min(20, input.critiqueCount) * 0.25;
  const revisionCoverage = Math.min(5, input.revisionCount) * 0.7;

  const items = zh
    ? [
        evaluationItem(
          "goal-fit",
          "目标匹配度",
          boundedScore(base + (visualNovel ? 5 : 2) + (input.consensusPassed ? 2 : -4)),
          visualNovel
            ? "蓝图把开放需求收敛为章节级生产闭环，避免直接跳到完整游戏编辑器。"
            : "蓝图把开放需求转成目标、约束、输出和验收标准，能支撑后续拆解。",
          visualNovel
            ? ["目标输出覆盖 StoryState、人物卡、场景包、对白、资产和校验报告。", "共识轮次已把 MVP 范围压到单章节可审查闭环。"]
            : ["目标输出覆盖需求说明、工作流、Schema、风险和里程碑。", "共识轮次已把范围控制作为持续评审项。"],
          ["把首个真实样本写进需求单，避免方案继续抽象化。", "明确第一版只验收一个完整闭环，不验收所有后续功能。"]
        ),
        evaluationItem(
          "workflow-coherence",
          "工作流完整性",
          boundedScore(base - 1 + workflowCoverage + revisionCoverage - 8),
          visualNovel
            ? "流程已经覆盖从文本接入到一致性校验的关键节点，但实际实现还需要状态机和失败回流。"
            : "流程已覆盖目标澄清、工作流、数据契约、评审和交付，但实现时仍要显式化状态流。",
          ["每个阶段都有输入、输出、负责人和校验说明。", `${input.revisionCount} 个草案已经过修订，吸收了交叉质询。`],
          ["把工作流落成可执行节点图，定义每条边的状态和终止条件。", "给每个阶段补超时、重试、跳过和人工接管规则。"]
        ),
        evaluationItem(
          "schema-rigor",
          "Schema 严谨度",
          boundedScore(base - 3 + schemaCoverage + (visualNovel ? 2 : 0)),
          visualNovel
            ? "核心对象已经覆盖人物、场景、对白和资产，但需要在实现时补充 sourceSpan、confidence 和版本迁移策略。"
            : "核心对象已有需求和阶段产物，但需要继续扩展字段级校验和跨节点引用。",
          visualNovel
            ? ["已有 CharacterCard、SceneBeat、DialogueLine、AssetRequest 四类核心 Schema。", "质询轮明确要求保留来源引用和稳定 ID。"]
            : ["已有 Requirement 和 WorkflowArtifact。", "质询轮明确要求 schemaVersion、sourceRefs 和稳定 ID。"],
          ["为每个字段增加示例、校验规则和失败错误码。", "建立 schemaVersion 迁移表，避免后续迭代破坏旧导出。"]
        ),
        evaluationItem(
          "risk-control",
          "风险控制",
          boundedScore(base - 7 + critiqueCoverage),
          "风险已经被显式列出并进入人工复审/验证计划，但真实模型输出漂移和长文本上下文丢失仍需要样本验证。",
          [`交叉质询数量：${input.critiqueCount}。`, "风险清单覆盖范围膨胀、字段不一致、人工复审成本和输出漂移。"],
          ["把最高风险项绑定到回归用例，不能只留在风险清单。", "为模型输出异常设置降级策略：重试、局部重跑、人工确认或阻断。"]
        ),
        evaluationItem(
          "delivery-readiness",
          "交付可执行性",
          boundedScore(base - 5 + (input.consensusPassed ? 3 : -3)),
          "实施计划已经按阶段拆分，但要真正可交付，还需要任务粒度、负责人和验收样本。",
          ["实施计划拆到最小结构化闭环、人物/场景/对白联动、资产审校、生产化回归。", "里程碑按周组织，适合小团队推进。"],
          ["把每个阶段拆成 issue 级任务，并给出输入样本和输出文件。", "把验收标准写成可自动检查的脚本或人工检查清单。"]
        ),
        evaluationItem(
          "reviewability",
          "可审查性",
          boundedScore(base + 1 + critiqueCoverage + revisionCoverage - 4),
          "共识轮次、交叉质询、修订记录和来源标识已经能解释结果如何形成，但真实模型贡献仍要持续区分来源。",
          ["结果展示包含共识阈值、每轮改进、剩余分歧和 Agent 立场。", "真实模型贡献会独立展示可采纳点和风险提醒。"],
          ["在导出报告中保留运行参数、模型调用质量和是否使用兜底。", "给用户提供一键复制“待人工确认问题”的能力。"]
        )
      ]
    : [
        evaluationItem(
          "goal-fit",
          "Goal fit",
          boundedScore(base + (visualNovel ? 5 : 2) + (input.consensusPassed ? 2 : -4)),
          visualNovel
            ? "The blueprint narrows the open request into a chapter-level production loop instead of jumping to a full game editor."
            : "The blueprint turns the open request into goals, constraints, outputs, and acceptance criteria.",
          visualNovel
            ? ["Target outputs cover StoryState, character cards, scene package, dialogue, assets, and audit report.", "Consensus rounds compress MVP scope to a reviewable single-chapter loop."]
            : ["Target outputs cover requirement brief, workflow, schemas, risks, and milestones.", "Consensus rounds keep scope control under review."],
          ["Put the first real sample into the requirement brief.", "Accept only one full loop for v1, not every future capability."]
        ),
        evaluationItem(
          "workflow-coherence",
          "Workflow coherence",
          boundedScore(base - 1 + workflowCoverage + revisionCoverage - 8),
          visualNovel
            ? "The flow covers text intake through consistency audit, but implementation still needs explicit state and failure routing."
            : "The flow covers goal clarification, workflow, contracts, review, and delivery, but implementation still needs explicit state.",
          ["Every stage has input, output, owner, and validation.", `${input.revisionCount} drafts were revised after cross-critique.`],
          ["Convert the workflow into executable nodes and state transitions.", "Add timeout, retry, skip, and human takeover rules."]
        ),
        evaluationItem(
          "schema-rigor",
          "Schema rigor",
          boundedScore(base - 3 + schemaCoverage + (visualNovel ? 2 : 0)),
          visualNovel
            ? "Core objects cover characters, scenes, dialogue, and assets, but implementation needs sourceSpan, confidence, and migration policy."
            : "Core objects exist, but field validation and cross-node references need more detail.",
          visualNovel
            ? ["CharacterCard, SceneBeat, DialogueLine, and AssetRequest are defined.", "Critique asks for source refs and stable IDs."]
            : ["Requirement and WorkflowArtifact are defined.", "Critique asks for schemaVersion, sourceRefs, and stable IDs."],
          ["Add examples, validation rules, and error codes for each field.", "Create schemaVersion migration rules."]
        ),
        evaluationItem(
          "risk-control",
          "Risk control",
          boundedScore(base - 7 + critiqueCoverage),
          "Risks are explicit and tied to review or validation, but model drift and long-context loss still need sample validation.",
          [`Cross-critiques: ${input.critiqueCount}.`, "Risks include scope, inconsistent fields, review cost, and output drift."],
          ["Bind top risks to regression cases.", "Define retry, partial rerun, human confirmation, and blocking behavior."]
        ),
        evaluationItem(
          "delivery-readiness",
          "Delivery readiness",
          boundedScore(base - 5 + (input.consensusPassed ? 3 : -3)),
          "The plan is phased, but real delivery needs task-level ownership and acceptance samples.",
          ["Implementation is staged into minimum loop, linked entities, asset/audit, and production regression.", "Milestones are weekly enough for a small team."],
          ["Split each phase into issue-sized tasks with inputs and outputs.", "Make acceptance criteria scriptable or checklist-based."]
        ),
        evaluationItem(
          "reviewability",
          "Reviewability",
          boundedScore(base + 1 + critiqueCoverage + revisionCoverage - 4),
          "Consensus rounds, critiques, revisions, and source labels explain how the result formed, but live model source boundaries must remain visible.",
          ["The result includes threshold, round improvements, remaining disagreement, and agent positions.", "Live model contributions show useful ideas and cautions separately."],
          ["Keep run parameters, model quality, and fallback usage in exported reports.", "Add quick copy for human-confirmation questions."]
        )
      ];

  return items.map((item) => ({
    ...item,
    status: evaluationStatus(item.score)
  }));
}

function detailedRecommendationsForBlueprint(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  evaluationMatrix: BlueprintEvaluationItem[],
  profile = createBlueprintQuestionProfile("", locale, pattern)
): BlueprintDetailedRecommendation[] {
  const zh = locale === "zh";
  const visualNovel = pattern === "visual_novel_multi_agent";
  const weakest = [...evaluationMatrix].sort((a, b) => a.score - b.score).slice(0, 2);

  if (zh) {
    return [
      {
        id: "sample-regression-pack",
        priority: "high",
        title: visualNovel ? "建立 10 个章节样本回归包" : "建立真实样本回归包",
        ownerAgentId: "quality-reviewer",
        reason: `当前最低维度是 ${weakest.map((item) => item.label).join("、")}。没有样本回归时，共识分只能说明方案结构合理，不能证明输出质量稳定。`,
        actions: visualNovel
          ? [
              "选 10 个章节：多人物对话、回忆、换场、伏笔、战斗/动作、内心独白各至少覆盖一次。",
              "为每个章节人工标注关键事件、人物别名、场景数量、对白归属和资产需求期望值。",
              "每次运行记录剧情覆盖率、人物一致性、speakerId 准确率、资产闭环率和人工复审命中率。"
            ]
          : [
              `选 20-30 个围绕“${profile.compactSubject}”的真实或近似真实样本，覆盖 ${profile.recommendationAreas.slice(0, 4).join("、")}。`,
              `为每个样本写明必须覆盖的数据源：${profile.dataSources.slice(0, 4).join("、")}，以及不可接受偏差。`,
              "每次运行记录中文质量、相关性、Schema 有效性、兜底触发、人工可用性和采纳率。"
            ],
        expectedImpact: "把“看起来合理”变成可复测的质量趋势，后续才能判断模型、Prompt 或流程是否真的改进。",
        acceptanceCheck: "回归报告能列出每个样本的通过/失败原因，并且至少 80% 样本达到人工可用。"
      },
      {
        id: "state-machine-contract",
        priority: "high",
        title: "把蓝图工作流落成状态机契约",
        ownerAgentId: "workflow-architect",
        reason: "多 Agent 系统最容易失败在交接状态不清楚：上游输出不稳定，下游仍继续生成，最终错误被放大。",
        actions: [
          "为每个阶段定义状态：pending、running、valid、needs_review、blocked、repaired。",
          "为每条边定义允许输入、输出 Schema、重试次数、超时、回流目标和人工接管条件。",
          "保存每次节点运行的输入快照、输出快照、模型来源、错误类型和修复动作。"
        ],
        expectedImpact: "减少链式错误传播，让失败能定位到具体 Agent 和具体字段。",
        acceptanceCheck: "任意阶段失败时，系统能显示 ownerAgentId、失败字段、建议修复动作和是否允许继续。"
      },
      {
        id: "schema-fixtures",
        priority: "high",
        title: "为核心 Schema 补字段示例和失败样例",
        ownerAgentId: "schema-designer",
        reason: "只有字段名还不够，真实模型经常会给出类型相似但语义不一致的结构，需要用 fixture 固定边界。",
        actions: [
          "给每个核心对象补充 valid example、minimal example、invalid example。",
          "为 sourceSpan、confidence、ownerAgentId、schemaVersion、stableId 设为跨对象通用字段。",
          "定义字段级错误码，例如 missing_source_span、invalid_reference、low_confidence_conflict。"
        ],
        expectedImpact: "提高真实模型输出修复率，并减少前端/导出层对字段含义的猜测。",
        acceptanceCheck: "Schema 校验失败时能返回字段路径、错误码和可读修复建议。"
      },
      {
        id: "human-review-queue",
        priority: "medium",
        title: "设计人工复审队列和编辑回写机制",
        ownerAgentId: "quality-reviewer",
        reason: "高质量系统不是完全自动化，而是只把最值得人工看的冲突推给用户。",
        actions: [
          "把低置信度、互斥关系、缺少来源引用、关键剧情删改放入复审队列。",
          "给每个复审项展示原文片段、模型输出、冲突原因、推荐动作和影响范围。",
          "人工修改后重新触发局部校验，不重跑整个流程。"
        ],
        expectedImpact: "降低人工复审成本，同时提升最终产物可信度。",
        acceptanceCheck: "人工处理一个冲突后，系统能标记已解决并重新计算相关校验项。"
      },
      {
        id: "mvp-scope-lock",
        priority: "medium",
        title: "锁定 MVP 范围和延期清单",
        ownerAgentId: "product-strategist",
        reason: visualNovel
          ? "视觉小说生产系统很容易扩张到编辑器、资产生成、引擎集成和协作平台，必须先保护最小闭环。"
          : `“${profile.compactSubject}”容易持续加功能，需要把首版可验收产物和延期能力分清楚。`,
        actions: visualNovel
          ? [
              "MVP 只承诺单章节输入、结构化 JSON、人物/场景/对白/资产需求、校验报告。",
              "编辑器、多用户协作、自动美术生成、引擎直接导入放入延期清单。",
              "每次新增功能必须说明会提升哪个质量指标。"
            ]
          : [
              `MVP 只承诺 ${profile.recommendationAreas.slice(0, 3).join("、")} 的最短闭环、核心 Schema、导出和人工评审。`,
              `高级自动化、复杂权限、多租户协作和非关键输出放入延期清单。`,
              "每个新增功能必须绑定用户可感知收益和可追踪指标。"
            ],
        expectedImpact: "减少范围膨胀，提升小团队交付确定性。",
        acceptanceCheck: "MVP 清单和延期清单可以被导出，并且每个里程碑只验收清单内能力。"
      },
      {
        id: "report-and-source-trust",
        priority: "low",
        title: "增强报告里的来源可信度说明",
        ownerAgentId: "delivery-planner",
        reason: "用户需要清楚知道哪些内容来自真实模型，哪些来自本地结构化综合，哪些是兜底结果。",
        actions: [
          "在报告摘要中显示 providerMode、可用模型调用数、修复次数、兜底状态和最终共识分。",
          "把真实模型贡献、确定性综合、人工待确认问题分成独立小节。",
          "导出时保留运行时间、问题原文和核心上下文。"
        ],
        expectedImpact: "减少用户误解，提高报告用于评审和归档的可信度。",
        acceptanceCheck: "导出报告无需查看控制台，也能判断本轮是否调用了真实模型以及是否使用兜底。"
      }
    ];
  }

  return [
    {
      id: "sample-regression-pack",
      priority: "high",
      title: visualNovel ? "Build a 10-chapter regression pack" : "Build a real-sample regression pack",
      ownerAgentId: "quality-reviewer",
      reason: `The weakest dimensions are ${weakest.map((item) => item.label).join(", ")}. Without regression samples, consensus only says the plan is structured, not that output quality is stable.`,
      actions: visualNovel
        ? [
            "Choose 10 chapters covering dialogue, flashback, scene change, foreshadowing, action, and inner monologue.",
            "Annotate expected events, aliases, scene count, dialogue ownership, and asset needs.",
            "Track plot coverage, character consistency, speaker accuracy, asset closure, and review precision."
          ]
        : [
            `Choose 20-30 realistic samples around ${profile.compactSubject}, covering ${profile.recommendationAreas.slice(0, 4).join(", ")}.`,
            `For each sample, list required data sources such as ${profile.dataSources.slice(0, 4).join(", ")} and unacceptable deviations.`,
            "Track language, relevance, schema validity, fallback usage, adoption, and human usability."
          ],
      expectedImpact: "Turns plausible output into a repeatable quality trend.",
      acceptanceCheck: "The regression report explains each pass/fail and at least 80% of samples are human-usable."
    },
    {
      id: "state-machine-contract",
      priority: "high",
      title: "Turn the workflow into a state-machine contract",
      ownerAgentId: "workflow-architect",
      reason: "Multi-agent systems often fail when handoff state is unclear and downstream agents continue from unstable upstream outputs.",
      actions: [
        "Define states: pending, running, valid, needs_review, blocked, repaired.",
        "Define allowed inputs, output schema, retries, timeouts, return target, and takeover conditions for each edge.",
        "Store input snapshot, output snapshot, model source, error type, and repair action per node."
      ],
      expectedImpact: "Prevents chain failures and makes errors attributable to an agent and field.",
      acceptanceCheck: "Any failed stage shows ownerAgentId, failed field, suggested repair, and whether continuation is allowed."
    },
    {
      id: "schema-fixtures",
      priority: "high",
      title: "Add examples and failing fixtures for core schemas",
      ownerAgentId: "schema-designer",
      reason: "Field names are not enough; live models often produce structurally similar but semantically different output.",
      actions: [
        "Add valid, minimal, and invalid examples for each core object.",
        "Make sourceSpan, confidence, ownerAgentId, schemaVersion, and stableId common fields.",
        "Define field-level error codes such as missing_source_span, invalid_reference, and low_confidence_conflict."
      ],
      expectedImpact: "Improves model-output repair and reduces UI/export guessing.",
      acceptanceCheck: "Schema failures return field path, error code, and readable repair guidance."
    },
    {
      id: "human-review-queue",
      priority: "medium",
      title: "Design a human-review queue and edit writeback",
      ownerAgentId: "quality-reviewer",
      reason: "The system should not be fully automatic; it should route only the highest-value conflicts to humans.",
      actions: [
        "Route low confidence, mutually exclusive relationships, missing source refs, and major plot changes to review.",
        "Show source text, model output, conflict reason, recommended action, and blast radius.",
        "Revalidate locally after human edits instead of rerunning the whole pipeline."
      ],
      expectedImpact: "Reduces review cost while increasing final artifact trust.",
      acceptanceCheck: "After a user resolves one conflict, related validation items recalculate."
    },
    {
      id: "mvp-scope-lock",
      priority: "medium",
      title: "Lock MVP scope and the deferral list",
      ownerAgentId: "product-strategist",
      reason: visualNovel
        ? "VN production systems can expand into editor, asset generation, engine integration, and collaboration platform unless the first loop is protected."
        : `${profile.compactSubject} can keep absorbing features unless v1 scope and deferrals are explicit.`,
      actions: visualNovel
        ? [
            "MVP promises only single-chapter input, structured JSON, character/scene/dialogue/asset needs, and validation report.",
            "Defer editor, collaboration, automated art generation, and direct engine import.",
            "Every new feature must name which quality metric it improves."
          ]
        : [
            `MVP promises the shortest loop for ${profile.recommendationAreas.slice(0, 3).join(", ")}, core schemas, export, and review.`,
            "Defer advanced automation, complex permissions, collaboration, and dashboards.",
            "Every new feature must map to a user-visible benefit and measurable metric."
          ],
      expectedImpact: "Reduces scope creep and improves delivery certainty.",
      acceptanceCheck: "The MVP and deferral lists are exportable and milestones accept only in-scope items."
    },
    {
      id: "report-and-source-trust",
      priority: "low",
      title: "Strengthen source-trust notes in reports",
      ownerAgentId: "delivery-planner",
      reason: "Users need to know what came from live models, local synthesis, and fallback behavior.",
      actions: [
        "Show providerMode, usable calls, repair count, fallback status, and final consensus in the report summary.",
        "Separate live model contributions, deterministic synthesis, and human-confirmation questions.",
        "Keep run time, original question, and core context in exports."
      ],
      expectedImpact: "Reduces misunderstanding and makes the report more useful for review and archival.",
      acceptanceCheck: "The report reveals live model use and fallback status without opening the console."
    }
  ];
}

function evaluationMatrixAfterModelContributions(
  matrix: BlueprintEvaluationItem[],
  modelContributions: BlueprintModelContribution[],
  locale: "en" | "zh"
): BlueprintEvaluationItem[] {
  if (modelContributions.length === 0) {
    return matrix;
  }

  return matrix.map((item) => {
    const bump = item.id === "reviewability" ? 4 : item.id === "risk-control" ? 3 : 1;
    const score = boundedScore(item.score + bump);
    return {
      ...item,
      score,
      status: evaluationStatus(score),
      evidence: [
        ...item.evidence,
        locale === "zh"
          ? `已纳入 ${modelContributions.length} 条真实模型贡献作为外部参照。`
          : `Incorporated ${modelContributions.length} live model contributions as external evidence.`
      ].slice(0, 4)
    };
  });
}

function recommendationsAfterModelContributions(
  recommendations: BlueprintDetailedRecommendation[],
  modelContributions: BlueprintModelContribution[],
  locale: "en" | "zh"
): BlueprintDetailedRecommendation[] {
  if (modelContributions.length === 0) {
    return recommendations;
  }

  const liveRecommendation: BlueprintDetailedRecommendation =
    locale === "zh"
      ? {
          id: "live-model-evidence-loop",
          priority: "medium",
          title: "把真实模型贡献纳入可追踪证据链",
          ownerAgentId: "quality-reviewer",
          reason: "真实模型已经给出可采纳点和风险提醒，下一步应把它们变成可验证证据，而不是只当成摘要展示。",
          actions: [
            "为每条模型贡献标记来源模型、阶段、是否被采纳、采纳到哪个蓝图字段。",
            "把模型提醒的风险转成回归样本或人工复审规则。",
            "当多个模型意见冲突时，记录采用/拒绝原因。"
          ],
          expectedImpact: "让真实模型真正参与完善过程，同时保留可审查边界。",
          acceptanceCheck: "报告能说明每条模型贡献被采纳、搁置或拒绝的原因。"
        }
      : {
          id: "live-model-evidence-loop",
          priority: "medium",
          title: "Make live model contributions traceable evidence",
          ownerAgentId: "quality-reviewer",
          reason: "Live models produced useful ideas and cautions; the next step is turning them into verifiable evidence, not just summaries.",
          actions: [
            "Tag each model contribution with source model, phase, adoption status, and target blueprint field.",
            "Turn model risk cautions into regression samples or human-review rules.",
            "Record accept/reject reasons when models conflict."
          ],
          expectedImpact: "Makes live models genuinely improve the blueprint while preserving auditability.",
          acceptanceCheck: "The report explains why each model contribution was accepted, deferred, or rejected."
        };

  return [...recommendations, liveRecommendation];
}

function adoptionLedgerForBlueprint(input: {
  critiques: BlueprintCritique[];
  revisions: BlueprintRevision[];
  locale: "en" | "zh";
}): BlueprintAdoptionLedgerItem[] {
  const revisionByDraft = new Map(input.revisions.map((revision) => [revision.draftId, revision]));

  return input.critiques.flatMap((critique) => {
    const revision = revisionByDraft.get(critique.targetDraftId);
    const adoptedFeedback = new Set(revision?.incorporatedFeedback ?? []);

    return critique.improvementSuggestions.map((suggestion, index) => {
      const adopted = adoptedFeedback.has(suggestion);
      const status = adopted ? "adopted" : index % 2 === 0 ? "partial" : "deferred";
      const targetSection = adoptionTargetSection(suggestion, input.locale);

      return {
        id: `${critique.id}-suggestion-${index}`,
        sourceCritiqueId: critique.id,
        reviewerAgentId: critique.reviewerAgentId,
        targetDraftId: critique.targetDraftId,
        suggestion,
        adoptionStatus: status,
        targetSection,
        resolution: adoptionResolution(status, targetSection, input.locale),
        evidence: adoptionEvidence(status, targetSection, revision, input.locale)
      };
    });
  });
}

function adoptionTargetSection(suggestion: string, locale: "en" | "zh"): string {
  const text = suggestion.toLowerCase();
  const zh = locale === "zh";

  if (
    text.includes("schema") ||
    text.includes("字段") ||
    text.includes("source") ||
    text.includes("span") ||
    text.includes("json") ||
    text.includes("id") ||
    text.includes("character") ||
    text.includes("scene") ||
    text.includes("asset")
  ) {
    return zh ? "核心 Schema" : "Core schemas";
  }

  if (
    text.includes("工作流") ||
    text.includes("节点") ||
    text.includes("回流") ||
    text.includes("重试") ||
    text.includes("状态") ||
    text.includes("workflow") ||
    text.includes("retry") ||
    text.includes("route") ||
    text.includes("state")
  ) {
    return zh ? "工作流" : "Workflow";
  }

  if (
    text.includes("mvp") ||
    text.includes("阶段") ||
    text.includes("里程碑") ||
    text.includes("交付") ||
    text.includes("scope") ||
    text.includes("milestone") ||
    text.includes("deliver")
  ) {
    return zh ? "实施计划" : "Implementation plan";
  }

  if (
    text.includes("测试") ||
    text.includes("回归") ||
    text.includes("指标") ||
    text.includes("人工") ||
    text.includes("复审") ||
    text.includes("validation") ||
    text.includes("regression") ||
    text.includes("review")
  ) {
    return zh ? "验证计划" : "Validation plan";
  }

  if (
    text.includes("用户") ||
    text.includes("输出") ||
    text.includes("验收") ||
    text.includes("成功") ||
    text.includes("user") ||
    text.includes("output") ||
    text.includes("acceptance")
  ) {
    return zh ? "目标输出与验收标准" : "Target outputs and acceptance criteria";
  }

  return zh ? "详细优化建议" : "Detailed recommendations";
}

function adoptionResolution(
  status: BlueprintAdoptionLedgerItem["adoptionStatus"],
  targetSection: string,
  locale: "en" | "zh"
): string {
  if (locale === "zh") {
    if (status === "adopted") {
      return `已采纳到“${targetSection}”，作为最终蓝图的一部分。`;
    }

    if (status === "partial") {
      return `已部分采纳到“${targetSection}”，剩余细节进入优化建议或验证计划。`;
    }

    return `暂不直接写入主方案，作为“${targetSection}”相关的后续验证项保留。`;
  }

  if (status === "adopted") {
    return `Adopted into "${targetSection}" as part of the final blueprint.`;
  }

  if (status === "partial") {
    return `Partially adopted into "${targetSection}", with residual detail moved into recommendations or validation.`;
  }

  return `Deferred as a follow-up validation item related to "${targetSection}".`;
}

function adoptionEvidence(
  status: BlueprintAdoptionLedgerItem["adoptionStatus"],
  targetSection: string,
  revision: BlueprintRevision | undefined,
  locale: "en" | "zh"
): string[] {
  const zh = locale === "zh";

  if (status === "adopted" && revision) {
    return zh
      ? [`修订记录：${revision.summary}`, `目标章节：${targetSection}`]
      : [`Revision record: ${revision.summary}`, `Target section: ${targetSection}`];
  }

  if (status === "partial") {
    return zh
      ? [`目标章节：${targetSection}`, "已保留为可执行改进动作。"]
      : [`Target section: ${targetSection}`, "Kept as an executable improvement action."];
  }

  return zh
    ? [`目标章节：${targetSection}`, "需要真实样本或人工确认后再进入主规格。"]
    : [`Target section: ${targetSection}`, "Needs real-sample validation or human confirmation before entering the main spec."];
}

function evaluationItem(
  id: string,
  label: string,
  score: number,
  rationale: string,
  evidence: string[],
  improvementActions: string[]
): BlueprintEvaluationItem {
  return {
    id,
    label,
    score,
    status: evaluationStatus(score),
    rationale,
    evidence,
    improvementActions
  };
}

function boundedScore(score: number): number {
  return Math.max(42, Math.min(96, Math.round(score)));
}

function evaluationStatus(score: number): BlueprintEvaluationItem["status"] {
  if (score >= 82) {
    return "strong";
  }

  if (score >= 70) {
    return "watch";
  }

  return "weak";
}

function consensusMaxRounds(mode: DecisionMode): number {
  if (mode === "fast") {
    return 2;
  }

  return mode === "red_team" ? 5 : 4;
}

function consensusMinRounds(mode: DecisionMode): number {
  if (mode === "fast") {
    return 2;
  }

  return mode === "red_team" ? 4 : 3;
}

function consensusPhaseForRound(round: number, mode: DecisionMode): BlueprintConsensusRound["phase"] {
  if (round === 1) {
    return "draft";
  }

  if (round === 2) {
    return "critique";
  }

  if (round === 3) {
    return "revision";
  }

  return mode === "red_team" ? "verification" : "final";
}

function consensusRoundSummary(
  round: number,
  phase: BlueprintConsensusRound["phase"],
  score: number,
  passed: boolean,
  visualNovel: boolean,
  locale: "en" | "zh"
): string {
  const zh = locale === "zh";

  if (zh) {
    const summaries: Record<BlueprintConsensusRound["phase"], string> = {
      draft: visualNovel
        ? "各 Agent 先独立提出章节解析、人物记忆、场景规划、对白和资产链路，分歧主要集中在 MVP 范围和字段粒度。"
        : "各 Agent 先独立提出目标、工作流、Schema、质量门和交付节奏，分歧主要集中在范围边界。",
      critique: "进入交叉质询后，评审集中要求补齐输入输出契约、失败回流、人工复审和验收口径。",
      revision: "修订轮把可执行质询合并进最终规格，重点收敛到最小闭环、结构化交接和回归验证。",
      verification: "红队复核继续压测未解决风险，要求给出停止条件、降级路径和人工接管触发点。",
      final: "最终综合轮确认关键分歧都有处理路径，剩余问题被放入待确认清单。"
    };

    return `第 ${round} 轮（${phaseLabel(phase, locale)}）${summaries[phase]} 当前共识 ${score}%，${passed ? "已达到阈值" : "未达到阈值"}。`;
  }

  const summaries: Record<BlueprintConsensusRound["phase"], string> = {
    draft: visualNovel
      ? "Agents independently propose chapter parsing, character memory, scene planning, dialogue, and asset flow; disagreement centers on MVP scope and field granularity."
      : "Agents independently propose goals, workflow, schemas, quality gates, and delivery cadence; disagreement centers on scope boundaries.",
    critique: "Cross-critique asks for stronger I/O contracts, failure routing, human review, and acceptance criteria.",
    revision: "Revision folds executable objections into the final spec and converges on a minimum loop, structured handoff, and regression validation.",
    verification: "Red-team verification pressure-tests unresolved risk and asks for stop conditions, degradation paths, and human takeover triggers.",
    final: "Final synthesis confirms that key disagreements have handling paths and moves residual issues into open questions."
  };

  return `Round ${round} (${phaseLabel(phase, locale)}): ${summaries[phase]} Consensus is ${score}%, ${passed ? "above threshold" : "below threshold"}.`;
}

function consensusRoundImprovements(
  round: number,
  phase: BlueprintConsensusRound["phase"],
  visualNovel: boolean,
  locale: "en" | "zh"
): string[] {
  const zh = locale === "zh";

  if (zh) {
    if (phase === "draft") {
      return visualNovel
        ? ["形成“章节 -> StoryState -> 人物/场景/对白/资产 -> 校验”的首版链路。", "明确每个 Agent 只负责一个可审查产物。", "把最终输出从泛泛方案压到可导出的结构化生产包。"]
        : ["形成目标、工作流、Schema、评审和交付的首版蓝图。", "明确最小可用输出和后续扩展边界。", "把开放问题拆成可验收产物。"];
    }

    if (phase === "critique") {
      return ["把泛泛建议改成可执行质询：缺字段、缺证据、缺回流、缺验收。", "要求每个阶段写清输入、输出、负责人和失败处理。", "把高风险项移动到人工复审或回归测试中验证。"];
    }

    if (phase === "revision") {
      return ["合并交叉质询，补齐 Schema 版本、sourceSpan、confidence 和 ownerAgentId。", "压缩 MVP 范围，先跑通单样本闭环再扩展高级能力。", "把验收标准改成可测指标，而不是主观描述。"];
    }

    if (phase === "verification") {
      return ["加入红队停止条件：字段不可信、上下文缺失、成本超限时必须降级。", "要求所有阻断错误可定位到 ownerAgentId。", "保留人工接管路径，避免自动化错误继续传播。"];
    }

    return ["确认最终规格已经吸收主要质询。", "把剩余分歧转入待确认问题和验证计划。", "输出可导出的蓝图报告。"];
  }

  if (phase === "draft") {
    return visualNovel
      ? ["Created the first chapter -> StoryState -> character/scene/dialogue/asset -> audit flow.", "Assigned one reviewable artifact to each agent.", "Narrowed the output to an exportable production package."]
      : ["Created the first goal, workflow, schema, review, and delivery blueprint.", "Clarified minimum usable output and later expansion boundaries.", "Split open questions into acceptable artifacts."];
  }

  if (phase === "critique") {
    return ["Turned vague advice into executable critiques: missing fields, evidence, routing, and acceptance.", "Specified inputs, outputs, owners, and failure handling for every stage.", "Moved high-risk items into human review or regression validation."];
  }

  if (phase === "revision") {
    return ["Added schemaVersion, sourceSpan, confidence, and ownerAgentId.", "Compressed MVP scope before expanding advanced capability.", "Converted acceptance criteria into measurable checks."];
  }

  if (phase === "verification") {
    return ["Added red-team stop conditions for unreliable fields, missing context, and cost overruns.", "Required blocking errors to point to ownerAgentId.", "Preserved human takeover before errors propagate."];
  }

  return ["Confirmed the final spec absorbs the main critiques.", "Moved residual disagreement into open questions and validation.", "Produced an exportable blueprint report."];
}

function consensusRoundDisagreements(round: number, passed: boolean, visualNovel: boolean, locale: "en" | "zh"): string[] {
  const zh = locale === "zh";

  if (passed) {
    return zh
      ? [
          visualNovel ? "目标引擎和导出格式仍需产品侧确认。" : "首批用户和交付边界仍需业务侧确认。",
          "真实样本回归前，质量指标只能作为目标值，不能视为已验证结果。"
        ]
      : [
          visualNovel ? "Target engine and export format still need product confirmation." : "First users and delivery boundaries still need business confirmation.",
          "Quality metrics are targets until validated with real-sample regression."
        ];
  }

  if (round === 1) {
    return zh
      ? ["MVP 范围是否包含编辑器和引擎集成仍有分歧。", "字段粒度是否先做完整还是先做最小闭环仍未统一。"]
      : ["MVP scope still disagrees on editor and engine integration.", "Field granularity still disagrees on complete model versus minimum loop."];
  }

  return zh
    ? ["人工复审成本和自动修复边界仍需压测。", "模型输出不稳定时的兜底策略仍需样本验证。"]
    : ["Human-review cost and auto-repair boundaries need stress testing.", "Fallback behavior for unstable model output still needs sample validation."];
}

function consensusAgentStance(
  role: BlueprintAgentRole,
  round: number,
  passed: boolean,
  visualNovel: boolean,
  locale: "en" | "zh"
): string {
  const zh = locale === "zh";

  if (zh) {
    const subject = roleLabel(role, locale);

    if (passed) {
      return `${subject}同意推进当前蓝图，但要求把剩余分歧放入验证计划。`;
    }

    const stances: Record<BlueprintAgentRole, string> = {
      product_strategist: visualNovel ? "要求先限定单章节可审查 MVP，避免一次性做完整游戏生产平台。" : "要求先锁定首批用户和最小可用输出。",
      workflow_architect: "要求把 Agent 交接做成可回放状态流，而不是一次性长 Prompt。",
      schema_designer: "要求补齐版本、来源引用、置信度和跨节点稳定 ID。",
      quality_reviewer: "要求用样本集证明覆盖率、错误回流和人工复审命中率。",
      delivery_planner: "要求按周交付可验收产物，并明确停止条件。"
    };

    return `${subject}第 ${round} 轮立场：${stances[role]}`;
  }

  if (passed) {
    return `${roleLabel(role, locale)} accepts the current blueprint while moving residual disagreement into validation.`;
  }

  const stances: Record<BlueprintAgentRole, string> = {
    product_strategist: visualNovel ? "Limit MVP to a reviewable single-chapter loop before building a full production platform." : "Lock first users and the minimum usable output.",
    workflow_architect: "Make agent handoff a replayable state flow instead of one long prompt.",
    schema_designer: "Add versioning, source refs, confidence, and stable cross-node ids.",
    quality_reviewer: "Use a sample set to prove coverage, error routing, and human-review precision.",
    delivery_planner: "Deliver accepted weekly artifacts with explicit stop conditions."
  };

  return `${roleLabel(role, locale)} round ${round} stance: ${stances[role]}`;
}

function phaseLabel(phase: BlueprintConsensusRound["phase"], locale: "en" | "zh"): string {
  const labels: Record<"en" | "zh", Record<BlueprintConsensusRound["phase"], string>> = {
    en: {
      draft: "Independent draft",
      critique: "Cross-critique",
      revision: "Revision",
      verification: "Red-team verification",
      final: "Final synthesis"
    },
    zh: {
      draft: "独立草案",
      critique: "交叉质询",
      revision: "反驳修订",
      verification: "红队复核",
      final: "最终综合"
    }
  };

  return labels[locale][phase];
}

function localizeCritiqueFocus(focus: string): string {
  const labels: Record<string, string> = {
    "user outcome": "用户结果",
    "scope control": "范围控制",
    "MVP boundaries": "MVP 边界",
    "agent handoff": "Agent 交接",
    "state flow": "状态流",
    "failure recovery": "失败恢复",
    "JSON contracts": "JSON 契约",
    "field completeness": "字段完整性",
    validation: "校验",
    "edge cases": "边界样本",
    "test sets": "测试集",
    "human review": "人工复审",
    milestones: "里程碑",
    sequencing: "推进顺序",
    "implementation risk": "实现风险"
  };

  return labels[focus] ?? focus;
}

function workflowStages(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): BlueprintWorkflowStage[] {
  const zh = locale === "zh";

  if (pattern === "visual_novel_multi_agent") {
    return [
      stage("intake", zh ? "文本接入与章节切分" : "Text intake and chapter splitting", "product-strategist", zh ? "小说章节、世界观说明、目标平台" : "Novel chapter, world notes, target platform", zh ? "章节元数据和段落索引" : "Chapter metadata and paragraph index", zh ? "检查章节边界、字数、缺失段落" : "Check chapter boundaries, length, and missing paragraphs"),
      stage("story-ir", zh ? "故事中间表示抽取" : "Story IR extraction", "workflow-architect", zh ? "章节段落" : "Chapter paragraphs", zh ? "事件、地点、时间线、叙事节拍" : "Events, locations, timeline, narrative beats", zh ? "事件顺序和引用一致性" : "Event order and reference consistency"),
      stage("character", zh ? "人物与关系抽取" : "Character and relationship extraction", "schema-designer", zh ? "故事 IR" : "Story IR", zh ? "人物卡、关系边、状态变化" : "Character cards, relationship edges, state changes", zh ? "人物别名、出场、关系冲突校验" : "Alias, appearance, and relationship conflict checks"),
      stage("scene", zh ? "视觉小说场景生成" : "VN scene generation", "workflow-architect", zh ? "故事 IR 和人物卡" : "Story IR and character cards", zh ? "场景列表、背景、演出提示、分支点" : "Scene list, backgrounds, staging notes, branch points", zh ? "场景是否覆盖关键剧情节拍" : "Check whether scenes cover key story beats"),
      stage("dialogue", zh ? "对白和旁白结构化" : "Dialogue and narration structuring", "product-strategist", zh ? "场景列表和原文" : "Scene list and source text", zh ? "speaker、line、emotion、voice cue" : "speaker, line, emotion, voice cue", zh ? "说话人、语气、上下文一致性" : "Speaker, tone, and context consistency"),
      stage("asset", zh ? "资产需求生成" : "Asset requirement generation", "delivery-planner", zh ? "人物、场景、对白" : "Characters, scenes, dialogue", zh ? "立绘、表情、背景、音乐、音效需求" : "Sprite, expression, background, music, and SFX needs", zh ? "资产是否去重、是否绑定场景" : "Deduplicate assets and bind them to scenes"),
      stage("validation", zh ? "一致性校验与人工复审" : "Consistency validation and human review", "quality-reviewer", zh ? "所有结构化产物" : "All structured artifacts", zh ? "校验报告、冲突列表、待人工确认项" : "Validation report, conflicts, human-review queue", zh ? "阻断错误必须回流到对应 Agent" : "Blocking errors must route back to the owning agent")
    ];
  }

  return [
    stage("intake", zh ? "需求与数据源接入" : "Request and data-source intake", "product-strategist", zh ? `原始需求、${profile.dataSources.join("、")}` : `source request, ${profile.dataSources.join(", ")}`, zh ? "目标画像、数据源清单、成功标准" : "goal profile, data-source list, success criteria", zh ? "目标、数据源和验收口径必须可追溯到原问题" : "Goals, data sources, and acceptance criteria trace back to the request"),
    stage("diagnosis", zh ? "状态诊断与机会识别" : "State diagnosis and opportunity detection", "workflow-architect", zh ? "标准化输入、历史基线、业务约束" : "normalized inputs, baselines, constraints", zh ? "问题清单、机会清单、优先级依据" : "problem list, opportunity list, priority rationale", zh ? "每个判断都要带来源数据和置信度" : "Every judgment carries source data and confidence"),
    stage("recommendation", zh ? "建议生成与 Agent 分工" : "Recommendation generation and agent ownership", "schema-designer", zh ? profile.recommendationAreas.join("、") : profile.recommendationAreas.join(", "), zh ? "结构化建议、ownerAgentId、预期影响" : "structured recommendations, ownerAgentId, expected impact", zh ? "建议必须有行动、影响范围和可审批状态" : "Recommendations need action, blast radius, and approval state"),
    stage("risk-gate", zh ? "风险校验与阻断规则" : "Risk validation and blocking rules", "quality-reviewer", zh ? profile.riskAreas.join("、") : profile.riskAreas.join(", "), zh ? "风险评分、阻断项、人工复审队列" : "risk score, blockers, human-review queue", zh ? "高风险建议不能直接自动执行" : "High-risk recommendations cannot execute automatically"),
    stage("delivery", zh ? "最终方案与报告交付" : "Final plan and report delivery", "delivery-planner", zh ? "已校验建议和复审结果" : "validated recommendations and review outcomes", zh ? profile.targetOutputs.join("、") : profile.targetOutputs.join(", "), zh ? "报告能被非技术用户阅读，也能被专业人员复盘" : "Report works for non-technical readers and expert review"),
    stage("feedback", zh ? "效果回写与 AgentEval" : "Outcome feedback and AgentEval", "quality-reviewer", zh ? "人工采纳、执行结果、后续指标" : "adoption, execution result, later metrics", zh ? "质量趋势、成本延迟、采纳率和失败原因" : "quality trend, cost/latency, adoption rate, failure reasons", zh ? "每次运行都能进入离线评估和在线追踪闭环" : "Every run feeds offline evaluation and online tracing")
  ];
}

function schemasForPattern(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): BlueprintSchema[] {
  const zh = locale === "zh";

  if (pattern === "visual_novel_multi_agent") {
    return [
      schema("CharacterCard", zh ? "人物基础信息、状态和资产绑定。" : "Character identity, state, and asset binding.", [
        field("id", "string", true, zh ? "稳定人物 ID。" : "Stable character id."),
        field("displayName", "string", true, zh ? "显示名称。" : "Display name."),
        field("aliases", "string[]", false, zh ? "别名和称呼。" : "Aliases and honorifics."),
        field("role", "protagonist|supporting|antagonist|npc", true, zh ? "剧情角色。" : "Story role."),
        field("traits", "string[]", false, zh ? "性格和视觉特征。" : "Personality and visual traits."),
        field("relationships", "RelationshipRef[]", false, zh ? "与其他人物的关系。" : "Relationships to other characters."),
        field("assetRefs", "string[]", false, zh ? "立绘、表情、服装资源引用。" : "Sprite, expression, and costume asset refs.")
      ]),
      schema("SceneBeat", zh ? "视觉小说场景和叙事节拍。" : "Visual novel scene and narrative beat.", [
        field("id", "string", true, zh ? "场景 ID。" : "Scene id."),
        field("chapterId", "string", true, zh ? "来源章节。" : "Source chapter."),
        field("location", "string", true, zh ? "场景地点。" : "Scene location."),
        field("timeOfDay", "string", false, zh ? "时间和氛围。" : "Time and mood."),
        field("summary", "string", true, zh ? "场景摘要。" : "Scene summary."),
        field("characters", "string[]", true, zh ? "出场人物 ID。" : "Appearing character ids."),
        field("dialogueRefs", "string[]", false, zh ? "对白片段引用。" : "Dialogue segment refs.")
      ]),
      schema("DialogueLine", zh ? "对白、旁白和演出提示。" : "Dialogue, narration, and staging cues.", [
        field("id", "string", true, zh ? "对白行 ID。" : "Dialogue line id."),
        field("sceneId", "string", true, zh ? "所属场景。" : "Owning scene."),
        field("speakerId", "string|null", true, zh ? "说话人，旁白可为空。" : "Speaker id, null for narration."),
        field("text", "string", true, zh ? "对白文本。" : "Line text."),
        field("emotion", "string", false, zh ? "情绪标签。" : "Emotion tag."),
        field("stageDirection", "string", false, zh ? "演出说明。" : "Staging direction.")
      ]),
      schema("AssetRequest", zh ? "美术、音频和演出资源需求。" : "Art, audio, and staging asset request.", [
        field("id", "string", true, zh ? "资产需求 ID。" : "Asset request id."),
        field("type", "sprite|expression|background|music|sfx|ui", true, zh ? "资产类型。" : "Asset type."),
        field("description", "string", true, zh ? "需求描述。" : "Requirement description."),
        field("priority", "low|medium|high", true, zh ? "MVP 优先级。" : "MVP priority."),
        field("linkedSceneIds", "string[]", false, zh ? "关联场景。" : "Linked scene ids.")
      ])
    ];
  }

  return [
    schema("Requirement", zh ? "目标、约束和验收标准。" : "Goal, constraints, and acceptance criteria.", [
      field("id", "string", true, zh ? "需求 ID。" : "Requirement id."),
      field("goal", "string", true, zh ? "目标。" : "Goal."),
      field("subject", "string", true, zh ? `当前蓝图主题，例如：${profile.compactSubject}。` : `Current blueprint subject, e.g. ${profile.compactSubject}.`),
      field("constraints", "string[]", false, zh ? "限制条件。" : "Constraints."),
      field("acceptanceCriteria", "string[]", true, zh ? "验收标准。" : "Acceptance criteria.")
    ]),
    schema("DataSourceProfile", zh ? "当前问题涉及的数据源、来源系统和质量状态。" : "Data sources, source systems, and quality state for the current request.", [
      field("id", "string", true, zh ? "数据源 ID。" : "Data source id."),
      field("name", "string", true, zh ? `数据源名称，例如：${profile.dataSources[0] ?? "业务数据"}。` : `Data source name, e.g. ${profile.dataSources[0] ?? "business data"}.`),
      field("sourceSystem", "string", false, zh ? "来源系统或手工上传渠道。" : "Source system or upload channel."),
      field("freshness", "string", false, zh ? "数据新鲜度。" : "Data freshness."),
      field("qualityStatus", "valid|missing|stale|needs_mapping", true, zh ? "质量状态。" : "Quality status.")
    ]),
    schema("WorkflowArtifact", zh ? "阶段产物和负责人。" : "Stage artifact and owner.", [
      field("id", "string", true, zh ? "产物 ID。" : "Artifact id."),
      field("ownerAgentId", "string", true, zh ? "负责 Agent。" : "Owning agent."),
      field("inputRefs", "string[]", false, zh ? "输入引用。" : "Input refs."),
      field("output", "object", true, zh ? "结构化输出。" : "Structured output."),
      field("validationStatus", "valid|needs_review|blocked", true, zh ? "校验状态。" : "Validation status.")
    ]),
    schema("RecommendationItem", zh ? "模型或 Agent 生成的可执行建议。" : "Actionable recommendation generated by a model or agent.", [
      field("id", "string", true, zh ? "建议 ID。" : "Recommendation id."),
      field("area", "string", true, zh ? `建议类型，例如：${profile.recommendationAreas[0] ?? "工作流设计"}。` : `Recommendation area, e.g. ${profile.recommendationAreas[0] ?? "workflow design"}.`),
      field("action", "string", true, zh ? "具体动作。" : "Specific action."),
      field("reason", "string", true, zh ? "推荐原因和来源证据。" : "Reason and source evidence."),
      field("expectedImpact", "string", false, zh ? "预期影响。" : "Expected impact."),
      field("riskFlags", "string[]", false, zh ? `关联风险，例如：${profile.riskAreas[0] ?? "错误建议"}。` : `Related risks, e.g. ${profile.riskAreas[0] ?? "wrong recommendation"}.`),
      field("approvalStatus", "draft|approved|rejected|needs_review", true, zh ? "审批状态。" : "Approval status.")
    ]),
    schema("EvaluationMetric", zh ? "AgentEval 和线上追踪指标。" : "AgentEval and online tracing metric.", [
      field("id", "string", true, zh ? "指标 ID。" : "Metric id."),
      field("name", "string", true, zh ? "指标名称。" : "Metric name."),
      field("target", "number|string", false, zh ? "目标阈值。" : "Target threshold."),
      field("observed", "number|string", false, zh ? "当前观测值。" : "Observed value."),
      field("failureReason", "string", false, zh ? "失败原因。" : "Failure reason.")
    ])
  ];
}

function targetOutputsForPattern(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): string[] {
  const zh = locale === "zh";

  if (pattern === "visual_novel_multi_agent") {
    return zh
      ? [
          "章节级 StoryState JSON：保留 sourceSpan、事件、人物、地点、时间线和版本号。",
          "人物卡与关系图：支持别名合并、状态变化、关系边和资产引用。",
          "视觉小说场景包：SceneBeat、DialogueLine、分支点、演出提示和背景需求。",
          "资产需求清单：立绘、表情、背景、音乐、音效、UI 元素及优先级。",
          "一致性校验报告：冲突、低置信度字段、待人工确认项和回流节点。",
          "可导出的生产包：面向 Ren'Py、Web VN、Unity 或内部管线的 JSON。"
        ]
      : [
          "Chapter-level StoryState JSON with sourceSpan, events, characters, locations, timeline, and version.",
          "Character cards and relationship graph with aliases, state changes, relationship edges, and asset refs.",
          "VN scene package with SceneBeat, DialogueLine, branch points, staging cues, and background needs.",
          "Asset requirement backlog for sprites, expressions, backgrounds, music, SFX, and UI elements.",
          "Consistency report with conflicts, low-confidence fields, human-review items, and return routes.",
          "Exportable production package for Ren'Py, web VN, Unity, or an internal pipeline."
        ];
  }

  return zh
    ? [
        `${profile.compactSubject}目标画像和数据源清单。`,
        ...profile.targetOutputs.map((item) => `${item}。`),
        "风险与人工复审队列。",
        "AgentEval 指标、采纳率、延迟、成本和失败原因报告。"
      ]
    : [
        `${profile.compactSubject} goal profile and data-source list.`,
        ...profile.targetOutputs.map((item) => `${item}.`),
        "Risk and human-review queue.",
        "AgentEval metrics, adoption, latency, cost, and failure-reason report."
      ];
}

function successCriteriaForPattern(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): string[] {
  const zh = locale === "zh";

  if (pattern === "visual_novel_multi_agent") {
    return zh
      ? [
          "单章节输入后，系统能输出完整人物、场景、对白和资产需求 JSON。",
          "每个结构化产物都能回链到原文 sourceSpan，人工可以快速复核。",
          "关键事件覆盖率达到 90% 以上，人物别名合并错误可被检测并进入复审。",
          "高优先级场景至少包含背景、主要人物立绘和必要音效需求。",
          "人工复审只处理冲突和低置信度项，不需要逐字段重做模型输出。"
        ]
      : [
          "A single chapter produces complete character, scene, dialogue, and asset requirement JSON.",
          "Every artifact links back to sourceSpan for quick human review.",
          "Key event coverage exceeds 90%, and alias merge errors are detected for review.",
          "High-priority scenes include background, main character sprites, and necessary SFX requirements.",
          "Human review handles conflicts and low-confidence items instead of rewriting every field."
        ];
  }

  return zh
    ? [
        `最小闭环能围绕“${profile.compactSubject}”在真实样本上跑通。`,
        `${profile.recommendationAreas.slice(0, 3).join("、")} 能输出可解释、可审批的建议。`,
        `${profile.riskAreas.slice(0, 3).join("、")} 有阻断、降级或人工接管路径。`,
        "核心输出可校验、可导出、可复审。",
        "每次运行能记录准确性、延迟、成本、采纳率和失败原因。"
      ]
    : [
        `The minimum loop works on real samples for ${profile.compactSubject}.`,
        `${profile.recommendationAreas.slice(0, 3).join(", ")} produce explainable and approvable recommendations.`,
        `${profile.riskAreas.slice(0, 3).join(", ")} have blocking, fallback, or human-takeover paths.`,
        "Core outputs are validatable, exportable, and reviewable.",
        "Each run records accuracy, latency, cost, adoption rate, and failure reason."
      ];
}

function systemAgentsForPattern(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): BlueprintSystemAgent[] {
  const zh = locale === "zh";

  if (pattern === "visual_novel_multi_agent") {
    return [
      systemAgent(
        "chapter-parser",
        zh ? "章节解析 Agent" : "Chapter Parser Agent",
        zh ? "把小说章节切成稳定段落、事件候选和 sourceSpan。" : "Split novel chapters into stable paragraphs, event candidates, and sourceSpan refs.",
        zh ? ["原文章节", "世界观说明", "目标平台"] : ["Source chapter", "world notes", "target platform"],
        zh ? ["ChapterIndex", "ParagraphSpan[]", "EventCandidate[]"] : ["ChapterIndex", "ParagraphSpan[]", "EventCandidate[]"],
        zh
          ? ["章节边界是否正确？", "是否有长段落需要二次切分？"]
          : ["Are chapter boundaries correct?", "Do long paragraphs need another split?"],
        zh ? "章节缺失、段落过长或 sourceSpan 无法定位时阻断。" : "Blocks when chapter text is missing, paragraphs are too long, or sourceSpan cannot be located."
      ),
      systemAgent(
        "story-ir",
        zh ? "故事 IR Agent" : "Story IR Agent",
        zh ? "抽取事件、地点、时间线、叙事节拍和因果关系。" : "Extract events, locations, timeline, narrative beats, and causality.",
        zh ? ["ChapterIndex", "ParagraphSpan[]"] : ["ChapterIndex", "ParagraphSpan[]"],
        zh ? ["StoryEvent[]", "Timeline", "LocationMap"] : ["StoryEvent[]", "Timeline", "LocationMap"],
        zh
          ? ["关键事件是否遗漏？", "时间顺序是否与原文冲突？"]
          : ["Are key events missing?", "Does event order conflict with the source?"],
        zh ? "事件顺序冲突或关键引用缺失时回流。" : "Returns to parsing when event order conflicts or key references are missing."
      ),
      systemAgent(
        "character-memory",
        zh ? "人物记忆 Agent" : "Character Memory Agent",
        zh ? "维护人物卡、别名、关系边、状态变化和出场记录。" : "Maintain character cards, aliases, relationship edges, state changes, and appearances.",
        zh ? ["StoryEvent[]", "已有 CharacterCard[]"] : ["StoryEvent[]", "existing CharacterCard[]"],
        zh ? ["CharacterCard[]", "RelationshipGraph", "StateTimeline"] : ["CharacterCard[]", "RelationshipGraph", "StateTimeline"],
        zh
          ? ["同一人物是否被拆成多个 ID？", "关系变化是否有原文依据？"]
          : ["Was one character split into multiple IDs?", "Are relationship changes source-backed?"],
        zh ? "人物合并冲突、别名不确定或关系互斥时进入人工复审。" : "Requires review for merge conflicts, uncertain aliases, or mutually exclusive relationships."
      ),
      systemAgent(
        "scene-planner",
        zh ? "场景规划 Agent" : "Scene Planner Agent",
        zh ? "把 StoryEvent 转成视觉小说场景、分支点和演出结构。" : "Convert StoryEvent records into VN scenes, branch points, and staging structure.",
        zh ? ["StoryEvent[]", "CharacterCard[]"] : ["StoryEvent[]", "CharacterCard[]"],
        zh ? ["SceneBeat[]", "BranchPoint[]", "StagingNote[]"] : ["SceneBeat[]", "BranchPoint[]", "StagingNote[]"],
        zh
          ? ["每个关键事件是否映射到场景？", "分支是否改变核心剧情过多？"]
          : ["Does every key event map to a scene?", "Do branches change the plot too much?"],
        zh ? "关键事件没有场景承载或分支破坏主线时回流。" : "Returns when key events lack scenes or branches break the main plot."
      ),
      systemAgent(
        "dialogue-director",
        zh ? "对白导演 Agent" : "Dialogue Director Agent",
        zh ? "结构化对白、旁白、情绪、语气和演出提示。" : "Structure dialogue, narration, emotion, tone, and staging cues.",
        zh ? ["SceneBeat[]", "原文段落"] : ["SceneBeat[]", "source paragraphs"],
        zh ? ["DialogueLine[]", "NarrationLine[]", "EmotionCue[]"] : ["DialogueLine[]", "NarrationLine[]", "EmotionCue[]"],
        zh
          ? ["speakerId 是否存在？", "语气是否偏离原文角色？"]
          : ["Does speakerId exist?", "Does tone drift from the character voice?"],
        zh ? "说话人不确定或大幅改写原文语气时进入复审。" : "Requires review when speaker is uncertain or source tone is heavily rewritten."
      ),
      systemAgent(
        "asset-producer",
        zh ? "资产需求 Agent" : "Asset Requirement Agent",
        zh ? "从人物、场景和对白生成美术/音频/演出资源清单。" : "Generate art, audio, and staging asset requirements from characters, scenes, and dialogue.",
        zh ? ["CharacterCard[]", "SceneBeat[]", "DialogueLine[]"] : ["CharacterCard[]", "SceneBeat[]", "DialogueLine[]"],
        zh ? ["AssetRequest[]", "DedupedAssetBacklog"] : ["AssetRequest[]", "DedupedAssetBacklog"],
        zh
          ? ["资产是否重复？", "MVP 优先级是否可控？"]
          : ["Are assets duplicated?", "Is MVP priority controlled?"],
        zh ? "资产数量超过预算或缺少场景绑定时降级处理。" : "Downgrades when asset volume exceeds budget or lacks scene bindings."
      ),
      systemAgent(
        "consistency-auditor",
        zh ? "一致性审校 Agent" : "Consistency Auditor Agent",
        zh ? "检查 Schema、引用、剧情覆盖、人物一致性和人工复审队列。" : "Check schemas, references, plot coverage, character consistency, and the human-review queue.",
        zh ? ["所有结构化产物"] : ["All structured artifacts"],
        zh ? ["ValidationReport", "Conflict[]", "HumanReviewQueue"] : ["ValidationReport", "Conflict[]", "HumanReviewQueue"],
        zh
          ? ["错误应回流到哪个 Agent？", "哪些冲突必须人工确认？"]
          : ["Which agent should receive the error?", "Which conflicts require human confirmation?"],
        zh ? "阻断错误必须带 ownerAgentId 和修复建议。" : "Blocking errors must include ownerAgentId and a repair suggestion."
      )
    ];
  }

  return [
    systemAgent(
      "intake-agent",
      zh ? "需求与数据接入 Agent" : "Request and Data Intake Agent",
      zh
        ? `把“${profile.compactSubject}”需求转成目标画像、数据源清单和约束。`
        : `Turn ${profile.compactSubject} into goals, data sources, and constraints.`,
      [zh ? "原始需求" : "Source request"],
      ["RequirementProfile", "DataSourceProfile[]"],
      zh ? ["目标是否具体？", "数据源是否足够？"] : ["Is the goal concrete?", "Are data sources sufficient?"],
      zh ? "缺少关键数据源或目标不可验证时要求补充。" : "Requests clarification when key data or verifiable goals are missing."
    ),
    systemAgent(
      "diagnosis-agent",
      zh ? "状态诊断 Agent" : "State Diagnosis Agent",
      zh ? "分析输入数据，识别异常、机会和优先级。" : "Analyze inputs to identify anomalies, opportunities, and priorities.",
      profile.dataSources,
      zh ? ["问题清单", "机会清单"] : ["Problem list", "Opportunity list"],
      [zh ? "判断是否有来源证据？" : "Does the judgment have evidence?"],
      zh ? "来源不足或置信度过低时降级为待复审。" : "Downgrades to review when evidence or confidence is weak."
    ),
    systemAgent(
      "recommendation-agent",
      zh ? "建议生成 Agent" : "Recommendation Agent",
      zh ? "生成可执行建议、预期影响和审批状态。" : "Generate actionable recommendations, expected impact, and approval state.",
      profile.recommendationAreas,
      ["RecommendationItem[]"],
      [zh ? "建议是否能直接执行？" : "Can the recommendation be executed?"],
      zh ? "没有动作、原因或影响范围时阻断。" : "Blocks recommendations without action, reason, or blast radius."
    ),
    systemAgent(
      "risk-guard-agent",
      zh ? "风险守门 Agent" : "Risk Guard Agent",
      zh ? "检查错误建议、越权自动化和高风险输出。" : "Check wrong recommendations, over-automation, and high-risk outputs.",
      profile.riskAreas,
      ["RiskGateResult", "HumanReviewItem[]"],
      [zh ? "是否需要人工批准？" : "Does this need human approval?"],
      zh ? "高风险建议只能进入复审，不能自动执行。" : "High-risk recommendations go to review and cannot auto-execute."
    ),
    systemAgent(
      "schema-agent",
      "Schema Agent",
      zh ? "定义核心数据契约和字段级校验。" : "Define core data contracts and field-level validation.",
      profile.schemaConcepts,
      zh ? ["JSON Schema", "fixture", "错误码表"] : ["JSON Schema", "fixture", "error code table"],
      [zh ? "字段是否可校验？" : "Are fields validatable?"],
      zh ? "字段歧义或引用无效时进入复审。" : "Requires review for ambiguous fields or invalid refs."
    ),
    systemAgent(
      "delivery-agent",
      zh ? "交付与报告 Agent" : "Delivery and Reporting Agent",
      zh ? "把建议、风险、复审和指标合成可读报告。" : "Synthesize recommendations, risks, review items, and metrics into a readable report.",
      profile.targetOutputs,
      zh ? ["最终方案", "简版 PDF", "审查报告"] : ["final plan", "simple PDF", "audit report"],
      [zh ? "非技术用户是否能读懂？" : "Can non-technical users read it?"],
      zh ? "报告缺少来源、风险或待确认项时阻断。" : "Blocks reports missing source, risk, or review items."
    ),
    systemAgent(
      "eval-agent",
      zh ? "AgentEval 评估 Agent" : "AgentEval Agent",
      zh ? "追踪准确性、延迟、成本、采纳率和失败原因。" : "Track accuracy, latency, cost, adoption, and failure reasons.",
      zh ? ["运行日志", "人工反馈"] : ["run logs", "human feedback"],
      zh ? ["质量趋势报告"] : ["quality trend report"],
      [zh ? "是否真的改善业务结果？" : "Did it improve outcomes?"],
      zh ? "指标缺失时不允许宣称效果提升。" : "Cannot claim improvement when metrics are missing."
    )
  ];
}

function collaborationProtocol(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): string[] {
  const zh = locale === "zh";
  const visualNovel = pattern === "visual_novel_multi_agent";

  if (visualNovel) {
    return zh
      ? [
          "每个 Agent 只写自己的产物，不直接覆盖别人的输出。",
          "每个输出必须带 sourceSpan、confidence、schemaVersion 和 ownerAgentId。",
          "下游 Agent 只能消费通过 Schema 校验的上游产物。",
          "质询 Agent 以问题形式指出缺口：缺字段、缺证据、范围过大、风险无缓解。",
          "修订 Agent 必须逐条声明吸收了哪些质询，未吸收的原因是什么。",
          "一致性审校 Agent 决定自动通过、自动修复、回流重试或人工复审。"
        ]
      : [
          "Each agent writes only its owned artifact and does not overwrite other outputs.",
          "Every output carries sourceSpan, confidence, schemaVersion, and ownerAgentId.",
          "Downstream agents consume only schema-valid upstream artifacts.",
          "Critique agents frame gaps as questions: missing fields, missing evidence, excessive scope, or unmitigated risk.",
          "Revision agents state which critiques were incorporated and why any were rejected.",
          "The auditor decides pass, auto-repair, retry, or human review."
        ];
  }

  return zh
    ? [
        `先围绕“${profile.compactSubject}”独立产出草案，再交叉质询，不在第一轮互相影响。`,
        `每轮质询至少检查一个数据源、一个建议类型和一个风险：${profile.dataSources[0]} / ${profile.recommendationAreas[0]} / ${profile.riskAreas[0]}。`,
        "质询必须落到可执行修改，而不是泛泛评价。",
        "综合版本必须说明采纳、延后或拒绝了哪些质询，并输出可验收计划。",
        "最终方案必须保留来源说明、人工复审点和 AgentEval 指标，方便后续导出 PDF。"
      ]
    : [
        `Draft independently around ${profile.compactSubject} before cross-critique.`,
        `Each critique checks at least one data source, recommendation area, and risk: ${profile.dataSources[0]} / ${profile.recommendationAreas[0]} / ${profile.riskAreas[0]}.`,
        "Critiques must become executable changes, not vague feedback.",
        "The synthesis explains accepted, deferred, and rejected critiques.",
        "The final plan keeps source notes, review gates, and AgentEval metrics for PDF export."
      ];
}

function implementationPlan(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): BlueprintImplementationPhase[] {
  const zh = locale === "zh";

  if (pattern === "visual_novel_multi_agent") {
    return [
      phase(
        zh ? "第 1 阶段：最小结构化闭环" : "Phase 1: Minimum structured loop",
        zh ? "1 周" : "1 week",
        zh ? ["章节解析", "StoryState", "CharacterCard / SceneBeat 最小 Schema", "JSON 导出"] : ["Chapter parsing", "StoryState", "minimal CharacterCard / SceneBeat schemas", "JSON export"],
        zh ? ["输入一个章节后能导出可读 JSON。", "每个字段有 sourceSpan。", "Schema 校验失败能定位字段。"] : ["One chapter exports readable JSON.", "Every field has sourceSpan.", "Schema failures identify fields."]
      ),
      phase(
        zh ? "第 2 阶段：人物、场景、对白联动" : "Phase 2: Character, scene, and dialogue loop",
        zh ? "1-2 周" : "1-2 weeks",
        zh ? ["人物别名合并", "关系图", "DialogueLine", "场景覆盖报告"] : ["Alias merge", "relationship graph", "DialogueLine", "scene coverage report"],
        zh ? ["关键事件覆盖率达到 90%。", "speakerId 都能引用到人物卡。", "冲突项进入人工复审。"] : ["Key event coverage reaches 90%.", "speakerId references character cards.", "Conflicts enter review."]
      ),
      phase(
        zh ? "第 3 阶段：资产需求和审校回流" : "Phase 3: Asset needs and audit routing",
        zh ? "1-2 周" : "1-2 weeks",
        zh ? ["AssetRequest", "去重和优先级", "一致性审校 Agent", "回流重试"] : ["AssetRequest", "dedupe and priority", "auditor agent", "retry routing"],
        zh ? ["高优先级场景都有资产闭环。", "阻断错误能回流到 ownerAgentId。", "人工复审列表可导出。"] : ["High-priority scenes have asset closure.", "Blocking errors route to ownerAgentId.", "Human-review queue is exportable."]
      ),
      phase(
        zh ? "第 4 阶段：生产化和回归测试" : "Phase 4: Production hardening and regression",
        zh ? "2 周" : "2 weeks",
        zh ? ["10 个章节样本", "质量趋势记录", "导出报告", "编辑回写"] : ["10 chapter samples", "quality trend log", "report export", "edit writeback"],
        zh ? ["回归样本可重复运行。", "人工修改能重新校验。", "报告能用于评审和归档。"] : ["Regression samples are repeatable.", "Human edits revalidate.", "Reports support review and archival."]
      )
    ];
  }

  return [
    phase(
      zh ? "第 1 阶段：目标、数据源和 Schema 契约" : "Phase 1: Goals, data sources, and schemas",
      zh ? "1 周" : "1 week",
      zh
        ? [`${profile.compactSubject}目标说明`, `数据源映射：${profile.dataSources.slice(0, 4).join("、")}`, "最小 Schema 和样本输入"]
        : [`${profile.compactSubject} goal brief`, `data-source mapping: ${profile.dataSources.slice(0, 4).join(", ")}`, "minimum schemas and sample inputs"],
      zh
        ? ["样本能通过最小流程。", "每个数据源有质量状态和缺失字段说明。", "核心 Schema 能被校验。"]
        : ["Samples pass the minimum loop.", "Every data source has quality status and missing-field notes.", "Core schemas validate."]
    ),
    phase(
      zh ? "第 2 阶段：建议生成与工作流闭环" : "Phase 2: Recommendation and workflow loop",
      zh ? "1-2 周" : "1-2 weeks",
      zh
        ? [`建议类型：${profile.recommendationAreas.slice(0, 4).join("、")}`, "阶段节点", "失败回流", "导出结果"]
        : [`recommendation areas: ${profile.recommendationAreas.slice(0, 4).join(", ")}`, "stage nodes", "failure routing", "export result"],
      zh
        ? ["每条建议有 ownerAgentId、来源证据、置信度和审批状态。", "失败能定位并回流。"]
        : ["Every recommendation has ownerAgentId, evidence, confidence, and approval state.", "Failures are located and routed."]
    ),
    phase(
      zh ? "第 3 阶段：风险门禁、互评和人工复审" : "Phase 3: Risk gates, critique, and review",
      zh ? "1-2 周" : "1-2 weeks",
      zh
        ? [`风险门禁：${profile.riskAreas.slice(0, 4).join("、")}`, "质询修订", "人工复审队列", "采纳账本"]
        : [`risk gates: ${profile.riskAreas.slice(0, 4).join(", ")}`, "critique and revision", "human-review queue", "adoption ledger"],
      zh
        ? ["高风险建议不会自动执行。", "互评意见有采纳、延后或拒绝状态。", "报告可用于团队评审。"]
        : ["High-risk recommendations do not auto-execute.", "Critiques have adopted, deferred, or rejected status.", "Report supports team review."]
    ),
    phase(
      zh ? "第 4 阶段：AgentEval 和持续迭代" : "Phase 4: AgentEval and continuous iteration",
      zh ? "1-2 周" : "1-2 weeks",
      zh ? ["离线样本集", "延迟与成本记录", "采纳率", "失败原因复盘"] : ["offline samples", "latency and cost logs", "adoption rate", "failure review"],
      zh
        ? ["能比较不同模型、Prompt 或流程版本。", "输出质量、延迟、成本和人工采纳率可追踪。"]
        : ["Model, prompt, and workflow versions can be compared.", "Quality, latency, cost, and adoption are traceable."]
    )
  ];
}

function implementationBacklogForBlueprint(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  phases: BlueprintImplementationPhase[],
  profile = createBlueprintQuestionProfile("", locale, pattern)
): BlueprintBacklogItem[] {
  const zh = locale === "zh";
  const phaseName = (index: number) => phases[index]?.name ?? (zh ? `第 ${index + 1} 阶段` : `Phase ${index + 1}`);

  if (pattern === "visual_novel_multi_agent") {
    return [
      backlogItem(
        "chapter-source-ingest",
        zh ? "实现章节接入、段落切分和 sourceSpan 索引" : "Implement chapter intake, paragraph splitting, and sourceSpan index",
        phaseName(0),
        "chapter-parser",
        "P0",
        "M",
        [],
        zh ? ["ChapterIndex", "ParagraphSpan[]", "sourceSpan 定位工具"] : ["ChapterIndex", "ParagraphSpan[]", "sourceSpan locator"],
        zh
          ? ["输入单章节后能生成稳定段落索引。", "任意抽取字段都能回链到原文位置。", "缺失章节或空段落会阻断并提示。"]
          : ["A single chapter produces stable paragraph indexes.", "Any extracted field can link back to the source.", "Missing chapter or empty paragraphs block with a clear message."],
        zh ? "后续人物、场景和对白无法证明来源，人工复审成本会显著上升。" : "Downstream characters, scenes, and dialogue cannot prove source evidence, raising review cost."
      ),
      backlogItem(
        "schema-fixtures",
        zh ? "补齐核心 Schema、示例和失败样例" : "Complete core schemas, examples, and failing fixtures",
        phaseName(0),
        "schema-designer",
        "P0",
        "M",
        ["chapter-source-ingest"],
        zh ? ["CharacterCard fixture", "SceneBeat fixture", "DialogueLine fixture", "AssetRequest fixture"] : ["CharacterCard fixture", "SceneBeat fixture", "DialogueLine fixture", "AssetRequest fixture"],
        zh
          ? ["每个 Schema 至少有 valid、minimal、invalid 三类样例。", "字段级错误能返回 path、code、message。", "sourceSpan、confidence、ownerAgentId、schemaVersion 成为通用字段。"]
          : ["Each schema has valid, minimal, and invalid examples.", "Field errors return path, code, and message.", "sourceSpan, confidence, ownerAgentId, and schemaVersion are common fields."],
        zh ? "模型输出会变成相似但语义不稳定的 JSON，后续修复成本高。" : "Model output may look structurally valid but remain semantically unstable."
      ),
      backlogItem(
        "story-ir-extractor",
        zh ? "实现 StoryState / StoryEvent 抽取节点" : "Implement StoryState / StoryEvent extraction node",
        phaseName(1),
        "story-ir",
        "P0",
        "L",
        ["chapter-source-ingest", "schema-fixtures"],
        zh ? ["StoryState JSON", "StoryEvent[]", "Timeline", "LocationMap"] : ["StoryState JSON", "StoryEvent[]", "Timeline", "LocationMap"],
        zh
          ? ["关键事件覆盖率在样本章节中达到 90%。", "每个事件都有 sourceSpan 和 confidence。", "时间线冲突会进入复审队列。"]
          : ["Key event coverage reaches 90% on sample chapters.", "Every event has sourceSpan and confidence.", "Timeline conflicts enter review."],
        zh ? "后续场景规划会遗漏剧情节拍，视觉小说场景不完整。" : "Scene planning will miss story beats and produce incomplete VN scenes."
      ),
      backlogItem(
        "character-memory",
        zh ? "实现人物卡、别名合并和关系图" : "Implement character cards, alias merge, and relationship graph",
        phaseName(1),
        "character-memory",
        "P0",
        "L",
        ["story-ir-extractor", "schema-fixtures"],
        zh ? ["CharacterCard[]", "RelationshipGraph", "StateTimeline"] : ["CharacterCard[]", "RelationshipGraph", "StateTimeline"],
        zh
          ? ["同一人物不会被拆成多个稳定 ID。", "关系变化能追溯到原文事件。", "别名不确定时进入人工复审。"]
          : ["One character is not split into multiple stable IDs.", "Relationship changes trace back to source events.", "Uncertain aliases enter human review."],
        zh ? "人物身份漂移会污染对白、资产和场景生成。" : "Character identity drift will contaminate dialogue, assets, and scenes."
      ),
      backlogItem(
        "scene-dialogue-loop",
        zh ? "实现场景规划和对白结构化闭环" : "Implement scene planning and dialogue structuring loop",
        phaseName(1),
        "scene-planner",
        "P0",
        "L",
        ["story-ir-extractor", "character-memory"],
        zh ? ["SceneBeat[]", "DialogueLine[]", "NarrationLine[]", "场景覆盖报告"] : ["SceneBeat[]", "DialogueLine[]", "NarrationLine[]", "scene coverage report"],
        zh
          ? ["每个关键事件至少映射到一个 SceneBeat。", "speakerId 必须引用 CharacterCard。", "对白大幅改写原文语气时进入复审。"]
          : ["Every key event maps to at least one SceneBeat.", "speakerId must reference CharacterCard.", "Major source-tone rewrites enter review."],
        zh ? "输出会像摘要而不是可生产的视觉小说脚本。" : "Output will look like a summary rather than a producible VN script."
      ),
      backlogItem(
        "asset-backlog",
        zh ? "生成资产需求、去重和 MVP 优先级" : "Generate asset requirements, dedupe, and MVP priority",
        phaseName(2),
        "asset-producer",
        "P1",
        "M",
        ["scene-dialogue-loop"],
        zh ? ["AssetRequest[]", "DedupedAssetBacklog", "高优先级场景资产闭环"] : ["AssetRequest[]", "DedupedAssetBacklog", "high-priority scene asset closure"],
        zh
          ? ["资产需求绑定场景和人物。", "重复资产会合并。", "高优先级场景包含背景、主要人物立绘和必要音效。"]
          : ["Asset requests bind to scenes and characters.", "Duplicate assets are merged.", "High-priority scenes include background, main sprites, and required SFX."],
        zh ? "MVP 资产范围会失控，交付成本难以估算。" : "MVP asset scope can sprawl and become hard to estimate."
      ),
      backlogItem(
        "consistency-audit",
        zh ? "实现一致性审校、错误回流和人工复审队列" : "Implement consistency audit, error routing, and human-review queue",
        phaseName(2),
        "consistency-auditor",
        "P0",
        "L",
        ["schema-fixtures", "scene-dialogue-loop", "asset-backlog"],
        zh ? ["ValidationReport", "Conflict[]", "HumanReviewQueue", "ownerAgentId 回流"] : ["ValidationReport", "Conflict[]", "HumanReviewQueue", "ownerAgentId routing"],
        zh
          ? ["阻断错误必须定位到 ownerAgentId。", "低置信度和引用冲突进入复审。", "人工修改后能局部重新校验。"]
          : ["Blocking errors point to ownerAgentId.", "Low confidence and reference conflicts enter review.", "Human edits trigger local revalidation."],
        zh ? "系统会把错误继续传给下游，最终报告不可审查。" : "Errors will continue downstream and make the final report unreviewable."
      ),
      backlogItem(
        "export-package",
        zh ? "实现生产包导出和报告归档" : "Implement production package export and report archive",
        phaseName(3),
        "delivery-planner",
        "P1",
        "M",
        ["consistency-audit"],
        zh ? ["JSON 生产包", "蓝图报告", "复审结果导出"] : ["JSON production package", "blueprint report", "review result export"],
        zh
          ? ["导出包含 schemaVersion、运行时间、来源说明和校验状态。", "报告能说明是否调用真实模型和是否使用兜底。", "复审结果能回写到结构化产物。"]
          : ["Export includes schemaVersion, run time, source note, and validation status.", "Report explains live-model and fallback usage.", "Review results write back to structured artifacts."],
        zh ? "结果只能在页面上查看，无法交付给制作或评审流程。" : "Results stay trapped in the UI and cannot feed production or review workflows."
      ),
      backlogItem(
        "regression-suite",
        zh ? "建立 10 章节回归测试和质量趋势记录" : "Build 10-chapter regression suite and quality trend log",
        phaseName(3),
        "quality-reviewer",
        "P0",
        "M",
        ["export-package"],
        zh ? ["10 章节样本集", "质量趋势表", "失败样本复盘"] : ["10-chapter sample set", "quality trend table", "failed-sample review"],
        zh
          ? ["人物一致性、剧情覆盖、对白归属和资产闭环都有指标。", "每次改动能比较通过率变化。", "失败样本能定位到具体节点。"]
          : ["Character consistency, plot coverage, dialogue ownership, and asset closure have metrics.", "Each change compares pass-rate movement.", "Failed samples map to concrete nodes."],
        zh ? "无法判断 Prompt、模型或流程调整是否真的改善质量。" : "You cannot tell whether prompt, model, or workflow changes actually improved quality."
      )
    ];
  }

  return [
    backlogItem(
      "goal-contract",
      zh ? `沉淀${profile.compactSubject}目标、约束和验收契约` : `Codify ${profile.compactSubject} goals, constraints, and acceptance contract`,
      phaseName(0),
      "goal-agent",
      "P0",
      "S",
      [],
      zh ? ["Requirement", "验收标准", "延期清单"] : ["Requirement", "acceptance criteria", "deferral list"],
      zh
        ? [`目标能回到原问题：“${profile.compactSubject}”。`, "MVP 和延期能力分开。", "候选输出有明确验收口径。"]
        : [`Goal traces back to the request: ${profile.compactSubject}.`, "MVP and deferrals are separated.", "Candidate outputs have acceptance criteria."],
      zh ? "需求会持续扩大，后续工作流没有收敛目标。" : "The request will keep expanding and the workflow will lack a converged goal."
    ),
    backlogItem(
      "data-source-mapping",
      zh ? "梳理数据源、字段映射和质量状态" : "Map data sources, fields, and quality status",
      phaseName(0),
      "schema-agent",
      "P0",
      "M",
      ["goal-contract"],
      zh ? ["DataSourceProfile", ...profile.dataSources.slice(0, 4)] : ["DataSourceProfile", ...profile.dataSources.slice(0, 4)],
      zh
        ? ["每个数据源有 owner、刷新频率、缺失字段和质量状态。", "关键建议能追溯到至少一个数据源。", "缺失数据会触发降级或人工确认。"]
        : ["Every source has owner, freshness, missing fields, and quality status.", "Key recommendations trace to at least one source.", "Missing data triggers fallback or human confirmation."],
      zh ? "数据来源不清会让建议看似合理但无法审计。" : "Unclear sources make recommendations plausible but unauditable."
    ),
    backlogItem(
      "workflow-state",
      zh ? "实现工作流节点、状态和失败回流" : "Implement workflow nodes, state, and failure routing",
      phaseName(1),
      "workflow-agent",
      "P0",
      "M",
      ["goal-contract", "data-source-mapping"],
      zh ? ["WorkflowArtifact", "状态机", "回流规则"] : ["WorkflowArtifact", "state machine", "return rules"],
      zh
        ? [`覆盖关键建议：${profile.recommendationAreas.slice(0, 4).join("、")}。`, "每个节点有输入输出。", "失败能定位 owner。", "重试和人工接管条件明确。"]
        : [`Covers key recommendations: ${profile.recommendationAreas.slice(0, 4).join(", ")}.`, "Every node has I/O.", "Failures identify owner.", "Retry and takeover conditions are explicit."],
      zh ? "多 Agent 输出会变成松散文本，无法稳定复现。" : "Multi-agent output becomes loose text and cannot be reproduced reliably."
    ),
    backlogItem(
      "core-schema-contract",
      zh ? "补核心 Schema、示例和校验错误码" : "Add core schemas, examples, and validation error codes",
      phaseName(0),
      "schema-agent",
      "P0",
      "M",
      ["goal-contract", "data-source-mapping"],
      zh ? ["JSON Schema", "fixture", "错误码表", ...profile.schemaConcepts.slice(0, 3)] : ["JSON Schema", "fixtures", "error code table", ...profile.schemaConcepts.slice(0, 3)],
      zh
        ? [`核心对象至少覆盖：${profile.schemaConcepts.slice(0, 5).join("、")}。`, "每个核心对象有 valid/minimal/invalid 样例。", "校验失败返回字段路径。", "下游只消费 valid 或 repaired 输出。"]
        : [`Core objects cover at least: ${profile.schemaConcepts.slice(0, 5).join(", ")}.`, "Each core object has valid/minimal/invalid examples.", "Validation failures return field path.", "Downstream consumes only valid or repaired output."],
      zh ? "后续节点会猜测字段含义，导致结果漂移。" : "Downstream nodes will guess field meaning and drift."
    ),
    backlogItem(
      "recommendation-engine",
      zh ? "实现建议生成、证据绑定和审批状态" : "Implement recommendation generation, evidence binding, and approval state",
      phaseName(1),
      "recommendation-agent",
      "P0",
      "L",
      ["workflow-state", "core-schema-contract"],
      zh ? ["RecommendationItem", ...profile.recommendationAreas.slice(0, 4)] : ["RecommendationItem", ...profile.recommendationAreas.slice(0, 4)],
      zh
        ? ["每条建议包含 action、reason、expectedImpact、riskFlags、approvalStatus。", "建议能说明依赖的数据源和置信度。", "低置信度建议默认进入复审。"]
        : ["Every item includes action, reason, expectedImpact, riskFlags, and approvalStatus.", "Recommendations explain source data and confidence.", "Low-confidence recommendations enter review by default."],
      zh ? "系统会输出漂亮但不可执行、不可追责的建议。" : "The system will produce polished but unactionable recommendations."
    ),
    backlogItem(
      "review-loop",
      zh ? "实现质询、采纳账本和复审队列" : "Implement critique, adoption ledger, and review queue",
      phaseName(2),
      "review-agent",
      "P1",
      "M",
      ["workflow-state", "core-schema-contract", "recommendation-engine"],
      zh ? ["质询采纳账本", "风险清单", "HumanReviewQueue"] : ["Critique adoption ledger", "risk list", "HumanReviewQueue"],
      zh
        ? [`高风险项覆盖：${profile.riskAreas.slice(0, 4).join("、")}。`, "每条质询有采纳状态。", "高风险项有 owner 和验证动作。", "人工复审项能导出。"]
        : [`High-risk items cover: ${profile.riskAreas.slice(0, 4).join(", ")}.`, "Every critique has adoption status.", "High risks have owner and validation action.", "Review items can be exported."],
      zh ? "用户看不到模型互评是否真正影响最终方案。" : "Users cannot see whether model critique actually changed the final plan."
    ),
    backlogItem(
      "report-export",
      zh ? "实现报告导出和来源可信度说明" : "Implement report export and source-trust notes",
      phaseName(2),
      "delivery-agent",
      "P1",
      "S",
      ["review-loop"],
      zh ? ["HTML 报告", "Markdown 蓝图", "来源说明"] : ["HTML report", "Markdown blueprint", "source note"],
      zh
        ? [`报告标题和正文必须围绕“${profile.compactSubject}”。`, "报告包含 providerMode。", "报告包含共识、评估、建议和采纳账本。", "无需控制台即可判断是否使用兜底。"]
        : [`Report title and body stay centered on ${profile.compactSubject}.`, "Report includes providerMode.", "Report includes consensus, evaluation, recommendations, and adoption ledger.", "Fallback usage is visible without console."],
      zh ? "结果难以分享、评审和归档。" : "Results are hard to share, review, and archive."
    ),
    backlogItem(
      "sample-regression",
      zh ? "建立 20-30 个样本回归测试" : "Build 20-30 sample regression tests",
      phaseName(2),
      "review-agent",
      "P0",
      "M",
      ["report-export"],
      zh ? ["样本集", "质量报告", "失败复盘"] : ["sample set", "quality report", "failure review"],
      zh
        ? [`覆盖 ${profile.recommendationAreas.slice(0, 5).join("、")}。`, "记录中文质量、相关性、Schema 有效性、兜底触发、延迟、成本和采纳率。", "至少 80% 样本人工可用。"]
        : [`Covers ${profile.recommendationAreas.slice(0, 5).join(", ")}.`, "Tracks language quality, relevance, schema validity, fallback usage, latency, cost, and adoption.", "At least 80% of samples are human-usable."],
      zh ? "无法量化后续优化是否有效。" : "Future improvements cannot be measured."
    )
  ];
}

function extractionStrategy(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): string[] {
  const zh = locale === "zh";

  if (pattern === "visual_novel_multi_agent") {
    return zh
      ? [
          "先按章节和自然段建立稳定 sourceSpan，所有抽取结果都回链到原文位置。",
          "先抽事件和人物，再生成 VN 场景，避免直接从原文跳到对白导致遗漏上下文。",
          "人物抽取要支持别名合并、关系变化和状态时间线。",
          "对白生成保留 sourceQuote、speakerId、emotion、stageDirection，方便人工复审。",
          "资产需求从场景和人物共同生成，并做去重和优先级排序。"
        ]
      : [
          "Create stable sourceSpan references at chapter and paragraph level.",
          "Extract events and characters before generating VN scenes to avoid losing context.",
          "Support alias merging, relationship changes, and state timelines for characters.",
          "Keep sourceQuote, speakerId, emotion, and stageDirection on dialogue lines.",
          "Generate asset requests from both scenes and characters, then deduplicate and prioritize."
        ];
  }

  return zh
    ? [
        `先抽取“${profile.compactSubject}”的目标、约束、用户和验收口径，再设计工作流。`,
        `把数据源先标准化为 ${profile.dataSources.slice(0, 5).join("、")}，并记录来源系统、刷新频率和缺失字段。`,
        `围绕 ${profile.recommendationAreas.slice(0, 5).join("、")} 生成结构化 RecommendationItem，而不是只给自然语言建议。`,
        "每条建议都保留 sourceRefs、confidence、expectedImpact、riskFlags 和 approvalStatus。",
        `涉及 ${profile.riskAreas.slice(0, 4).join("、")} 的输出默认进入风险门禁或人工复审。`
      ]
    : [
        `Extract goals, constraints, users, and acceptance criteria for ${profile.compactSubject} before designing workflow.`,
        `Normalize data sources first: ${profile.dataSources.slice(0, 5).join(", ")}, including source system, freshness, and missing fields.`,
        `Generate structured RecommendationItem objects for ${profile.recommendationAreas.slice(0, 5).join(", ")} instead of plain prose only.`,
        "Every recommendation keeps sourceRefs, confidence, expectedImpact, riskFlags, and approvalStatus.",
        `Outputs touching ${profile.riskAreas.slice(0, 4).join(", ")} go through risk gates or human review by default.`
      ];
}

function humanReviewLoop(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): string[] {
  const visualNovel = pattern === "visual_novel_multi_agent";

  if (visualNovel) {
    return locale === "zh"
      ? [
          "Schema 校验失败：直接回流到负责 Agent。",
          "人物合并、关系冲突、关键剧情删改：进入人工复审。",
          "低风险格式问题：自动修复并记录修复日志。",
          "人工修改后的产物重新进入一致性校验。"
        ]
      : [
          "Schema failure routes back to the owning agent.",
          "Character merge conflicts, relationship conflicts, and major plot changes require human review.",
          "Low-risk formatting issues are repaired automatically and logged.",
          "Human-edited artifacts re-enter consistency validation."
        ];
  }

  return locale === "zh"
    ? [
        "Schema 校验失败：直接回流到负责 Agent。",
        `缺少 ${profile.dataSources.slice(0, 3).join("、")} 等关键数据时，不允许给确定性建议，只能给待确认问题。`,
        `涉及 ${profile.riskAreas.slice(0, 4).join("、")} 的建议必须进入人工复审或二次确认。`,
        "低风险格式问题可以自动修复，但必须记录修复日志和字段路径。",
        "人工修改后的建议重新进入风险校验，并回写采纳率和失败原因。"
      ]
    : [
        "Schema failure routes back to the owning agent.",
        `When key data such as ${profile.dataSources.slice(0, 3).join(", ")} is missing, the system asks confirmation questions instead of making definitive recommendations.`,
        `Recommendations touching ${profile.riskAreas.slice(0, 4).join(", ")} require human review or explicit confirmation.`,
        "Low-risk formatting issues can be repaired automatically with field-path logs.",
        "Human edits re-enter risk validation and write back adoption and failure reasons."
      ];
}

function milestones(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): string[] {
  const zh = locale === "zh";

  if (pattern === "visual_novel_multi_agent") {
    return zh
      ? [
          "第 1 周：定义 CharacterCard、SceneBeat、DialogueLine、AssetRequest Schema。",
          "第 2 周：跑通单章节解析和人物/场景抽取。",
          "第 3 周：加入对白结构化、资产需求和一致性校验。",
          "第 4 周：加入人工复审界面和导出 JSON。",
          "第 5-6 周：用 10 个章节样本做回归测试，修复常见漂移。"
        ]
      : [
          "Week 1: define CharacterCard, SceneBeat, DialogueLine, and AssetRequest schemas.",
          "Week 2: run single-chapter parsing and character/scene extraction.",
          "Week 3: add dialogue structuring, asset requests, and consistency validation.",
          "Week 4: add human review UI and JSON export.",
          "Weeks 5-6: regression-test 10 chapter samples and fix common drift."
        ];
  }

  return zh
    ? [
        `第 1 周：定义“${profile.compactSubject}”目标、数据源映射和核心 Schema。`,
        `第 2 周：跑通 ${profile.recommendationAreas.slice(0, 3).join("、")} 的最小工作流。`,
        `第 3 周：加入 ${profile.riskAreas.slice(0, 3).join("、")} 风险门禁、互评和人工复审。`,
        "第 4 周：导出简版 PDF 和审查报告，并用真实样本回归。",
        "第 5-6 周：接入 AgentEval，比较质量、延迟、成本和采纳率趋势。"
      ]
    : [
        `Week 1: define ${profile.compactSubject} goals, data-source mapping, and core schemas.`,
        `Week 2: run the minimum workflow for ${profile.recommendationAreas.slice(0, 3).join(", ")}.`,
        `Week 3: add risk gates, critique, and review for ${profile.riskAreas.slice(0, 3).join(", ")}.`,
        "Week 4: export simple PDF and audit reports, then regress with real samples.",
        "Weeks 5-6: connect AgentEval and compare quality, latency, cost, and adoption trends."
      ];
}

function validationPlan(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): string[] {
  const zh = locale === "zh";

  if (pattern === "visual_novel_multi_agent") {
    return zh
      ? [
          "人物一致性：同一人物别名是否合并正确。",
          "剧情覆盖：每个关键事件是否映射到至少一个 SceneBeat。",
          "对白归属：speakerId 是否存在且符合上下文。",
          "资产闭环：高优先级场景是否都有背景和主要人物立绘需求。",
          "人工复审命中率：被标记冲突是否真正需要人工处理。"
        ]
      : [
          "Character consistency: aliases merge correctly.",
          "Plot coverage: every key event maps to at least one SceneBeat.",
          "Dialogue ownership: speakerId exists and matches context.",
          "Asset closure: high-priority scenes have backgrounds and main character sprites.",
          "Human-review precision: flagged conflicts genuinely need review."
        ];
  }

  return zh
    ? [
        `关键需求覆盖率：${profile.recommendationAreas.slice(0, 5).join("、")} 是否都被回答。`,
        `数据忠实度：建议是否能回链到 ${profile.dataSources.slice(0, 5).join("、")}。`,
        "Schema 校验通过率和自动修复率。",
        "人工复审命中率、人工采纳率和误报率。",
        "端到端延迟、模型调用次数、Token 成本和失败原因分布。",
        "简版 PDF 与页面最终方案是否一致。"
      ]
    : [
        `Requirement coverage: ${profile.recommendationAreas.slice(0, 5).join(", ")} are all answered.`,
        `Data faithfulness: recommendations trace back to ${profile.dataSources.slice(0, 5).join(", ")}.`,
        "Schema pass rate and auto-repair rate.",
        "Human-review precision, adoption rate, and false-positive rate.",
        "End-to-end latency, model calls, token cost, and failure-reason distribution.",
        "Simple PDF matches the final plan shown in the page."
      ];
}

function risksForPattern(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): string[] {
  const zh = locale === "zh";

  if (pattern === "visual_novel_multi_agent") {
    return zh
      ? [
          "长文本上下文丢失导致人物关系或伏笔断裂。",
          "多个 Agent 输出字段不一致，后续节点无法消费。",
          "直接生成对白可能改写原作语气。",
          "资产需求膨胀，MVP 无法落地。",
          "人工复审太重，抵消自动化收益。"
        ]
      : [
          "Long-context loss breaks relationships or foreshadowing.",
          "Agent outputs drift across fields and break downstream nodes.",
          "Direct dialogue generation changes the source tone.",
          "Asset requests expand beyond MVP capacity.",
          "Human review becomes too heavy and offsets automation benefits."
        ];
  }

  return zh
    ? [
        `范围膨胀：${profile.recommendationAreas.join("、")} 全部同时做会拖慢 MVP。`,
        `数据契约不稳定：${profile.dataSources.join("、")} 字段缺失或刷新不同步会污染建议。`,
        `高风险输出：${profile.riskAreas.join("、")} 如果自动执行，可能造成业务损失。`,
        "模型互评只停留在文字批评，没有进入采纳账本和修订结果。",
        "缺少真实样本回归，无法判断不同模型或 Prompt 是否真的改善。"
      ]
    : [
        `Scope expansion: building ${profile.recommendationAreas.join(", ")} at once slows the MVP.`,
        `Unstable data contracts: missing or stale fields across ${profile.dataSources.join(", ")} can contaminate recommendations.`,
        `High-risk outputs: ${profile.riskAreas.join(", ")} can create business damage if auto-executed.`,
        "Model critique stays as prose instead of feeding the adoption ledger and revisions.",
        "Without real-sample regression, model or prompt changes cannot be trusted."
      ];
}

function openQuestionsForPattern(
  pattern: BlueprintPattern,
  locale: "en" | "zh",
  profile = createBlueprintQuestionProfile("", locale, pattern)
): string[] {
  const zh = locale === "zh";

  if (pattern === "visual_novel_multi_agent") {
    return zh
      ? [
          "目标输出是 Ren'Py、Unity、Web VN，还是内部 JSON？",
          "是否允许模型改写对白，还是只能结构化原文？",
          "人物立绘需要多细的表情/服装维度？",
          "人工复审由谁负责，复审后的修改如何回写训练样本？"
        ]
      : [
          "Is the target output Ren'Py, Unity, web VN, or internal JSON?",
          "May the model rewrite dialogue, or only structure source text?",
          "How detailed should expression and costume variants be?",
          "Who owns human review, and how are edits fed back into samples?"
        ];
  }

  return zh
    ? [
        `“${profile.compactSubject}”的首批用户是谁，日常在哪里使用？`,
        `MVP 必须先覆盖 ${profile.recommendationAreas.slice(0, 3).join("、")} 中的哪些输出？`,
        `${profile.dataSources.slice(0, 4).join("、")} 分别来自哪些系统，刷新频率和权限边界是什么？`,
        `哪些涉及 ${profile.riskAreas.slice(0, 4).join("、")} 的建议必须人工确认？`,
        "人工采纳率、准确性、延迟和成本的目标阈值分别是多少？"
      ]
    : [
        `Who are the first users of ${profile.compactSubject}, and where will they use it daily?`,
        `Which outputs among ${profile.recommendationAreas.slice(0, 3).join(", ")} must the MVP cover first?`,
        `Which systems provide ${profile.dataSources.slice(0, 4).join(", ")}, and what are their freshness and permission boundaries?`,
        `Which recommendations touching ${profile.riskAreas.slice(0, 4).join(", ")} require human confirmation?`,
        "What are the target thresholds for adoption, accuracy, latency, and cost?"
      ];
}

function renderBlueprintMarkdown(
  spec: Omit<BlueprintFinalSpec, "markdown">,
  locale: "en" | "zh",
  consensus: {
    threshold: number;
    rounds: BlueprintConsensusRound[];
    finalScore: number;
    passed: boolean;
  }
): string {
  const zh = locale === "zh";

  return [
    `# ${spec.title}`,
    "",
    `## ${zh ? "摘要" : "Executive Summary"}`,
    spec.executiveSummary,
    "",
    `## ${zh ? "产品目标" : "Product Goal"}`,
    spec.productGoal,
    "",
    `## ${zh ? "推荐 Agent 数量" : "Recommended Agent Count"}`,
    String(spec.recommendedAgentCount),
    "",
    `## ${zh ? "共识收敛记录" : "Consensus Convergence Record"}`,
    `- ${zh ? "阈值" : "Threshold"}：${consensus.threshold}%`,
    `- ${zh ? "最终共识" : "Final consensus"}：${consensus.finalScore}%（${consensus.passed ? (zh ? "已达标" : "passed") : zh ? "未达标" : "needs more work"}）`,
    ...consensus.rounds.flatMap((round) => [
      `### ${zh ? `第 ${round.round} 轮` : `Round ${round.round}`}：${phaseLabel(round.phase, locale)}`,
      `${zh ? "共识分" : "Consensus score"}：${round.consensusScore}% / ${round.threshold}%`,
      round.summary,
      `${zh ? "本轮改进" : "Round improvements"}：${round.improvements.join(" / ")}`,
      `${zh ? "剩余分歧" : "Remaining disagreements"}：${round.remainingDisagreements.join(" / ")}`,
      `${zh ? "Agent 立场" : "Agent positions"}：${round.agentPositions
        .map((position) => `${position.agentId} ${position.confidence}% - ${position.stance}`)
        .join("；")}`
    ]),
    "",
    `## ${zh ? "终局评估矩阵" : "Final Evaluation Matrix"}`,
    ...spec.evaluationMatrix.flatMap((item) => [
      `### ${item.label}：${item.score}/100（${evaluationStatusLabel(item.status, locale)}）`,
      item.rationale,
      `${zh ? "证据" : "Evidence"}：${item.evidence.join(" / ")}`,
      `${zh ? "改进动作" : "Improvement actions"}：${item.improvementActions.join(" / ")}`
    ]),
    "",
    `## ${zh ? "详细优化建议" : "Detailed Optimization Recommendations"}`,
    ...spec.detailedRecommendations.flatMap((recommendation) => [
      `### ${priorityLabel(recommendation.priority, locale)} · ${recommendation.title}`,
      `${zh ? "负责方" : "Owner"}：${recommendation.ownerAgentId}`,
      `${zh ? "原因" : "Reason"}：${recommendation.reason}`,
      `${zh ? "行动" : "Actions"}：${recommendation.actions.join(" / ")}`,
      `${zh ? "预期影响" : "Expected impact"}：${recommendation.expectedImpact}`,
      `${zh ? "验收检查" : "Acceptance check"}：${recommendation.acceptanceCheck}`
    ]),
    "",
    `## ${zh ? "质询采纳账本" : "Critique Adoption Ledger"}`,
    ...spec.adoptionLedger.slice(0, 30).flatMap((item) => [
      `### ${adoptionStatusLabel(item.adoptionStatus, locale)} · ${item.targetSection}`,
      `${zh ? "质询来源" : "Critique source"}：${item.reviewerAgentId} -> ${item.targetDraftId}`,
      `${zh ? "建议" : "Suggestion"}：${item.suggestion}`,
      `${zh ? "处理" : "Resolution"}：${item.resolution}`,
      `${zh ? "证据" : "Evidence"}：${item.evidence.join(" / ")}`
    ]),
    "",
    `## ${zh ? "实施任务清单" : "Implementation Backlog"}`,
    ...spec.implementationBacklog.flatMap((item) => [
      `### ${item.priority} · ${item.title}`,
      `${zh ? "阶段" : "Phase"}：${item.phaseName}`,
      `${zh ? "负责方" : "Owner"}：${item.ownerAgentId}`,
      `${zh ? "预估" : "Effort"}：${item.effort}`,
      `${zh ? "依赖" : "Dependencies"}：${item.dependencies.join(" / ") || (zh ? "无" : "None")}`,
      `${zh ? "交付物" : "Deliverables"}：${item.deliverables.join(" / ")}`,
      `${zh ? "验收" : "Acceptance"}：${item.acceptanceCriteria.join(" / ")}`,
      `${zh ? "跳过风险" : "Risk if skipped"}：${item.riskIfSkipped}`
    ]),
    "",
    `## ${zh ? "目标输出" : "Target Outputs"}`,
    ...spec.targetOutputs.map((item) => `- ${item}`),
    "",
    `## ${zh ? "验收标准" : "Success Criteria"}`,
    ...spec.successCriteria.map((item) => `- ${item}`),
    "",
    `## ${zh ? "目标系统 Agent 设计" : "Target System Agent Design"}`,
    ...spec.systemAgents.flatMap((agent) => [
      `### ${agent.name}`,
      `${zh ? "职责" : "Responsibility"}：${agent.responsibility}`,
      `${zh ? "输入" : "Inputs"}：${agent.inputs.join(" / ")}`,
      `${zh ? "输出" : "Outputs"}：${agent.outputs.join(" / ")}`,
      `${zh ? "互评问题" : "Review questions"}：${agent.reviewQuestions.join(" / ")}`,
      `${zh ? "失败处理" : "Failure mode"}：${agent.failureMode}`
    ]),
    "",
    `## ${zh ? "工作流" : "Workflow"}`,
    ...spec.workflowStages.map((stage, index) => `${index + 1}. ${stage.title}: ${stage.input} -> ${stage.output}. ${stage.validation}`),
    "",
    `## ${zh ? "核心 Schema" : "Core Schemas"}`,
    ...spec.schemas.flatMap((schemaItem) => [
      `### ${schemaItem.name}`,
      schemaItem.purpose,
      ...schemaItem.fields.map(
        (fieldItem) =>
          `- ${fieldItem.name} (${fieldItem.type}${fieldItem.required ? (zh ? ", 必填" : ", required") : ""}): ${fieldItem.description}`
      )
    ]),
    "",
    `## ${zh ? "抽取策略" : "Extraction Strategy"}`,
    ...spec.extractionStrategy.map((item) => `- ${item}`),
    "",
    `## ${zh ? "多 Agent 协作与互评协议" : "Multi-agent Collaboration and Critique Protocol"}`,
    ...spec.collaborationProtocol.map((item) => `- ${item}`),
    "",
    `## ${zh ? "人工复审" : "Human Review"}`,
    ...spec.humanReviewLoop.map((item) => `- ${item}`),
    "",
    `## ${zh ? "实施计划" : "Implementation Plan"}`,
    ...spec.implementationPlan.flatMap((phaseItem, index) => [
      `${index + 1}. ${phaseItem.name}（${phaseItem.duration}）`,
      `   - ${zh ? "交付物" : "Deliverables"}：${phaseItem.deliverables.join(" / ")}`,
      `   - ${zh ? "验收" : "Acceptance"}：${phaseItem.acceptanceCriteria.join(" / ")}`
    ]),
    "",
    `## ${zh ? "里程碑" : "Milestones"}`,
    ...spec.milestones.map((item) => `- ${item}`),
    "",
    `## ${zh ? "验证计划" : "Validation Plan"}`,
    ...spec.validationPlan.map((item) => `- ${item}`),
    "",
    `## ${zh ? "风险" : "Risks"}`,
    ...spec.risks.map((item) => `- ${item}`),
    "",
    `## ${zh ? "模型贡献摘要" : "Model Contribution Summary"}`,
    ...(spec.modelContributions.length > 0
      ? spec.modelContributions.flatMap((contribution) => [
          `### ${contribution.source}: ${contribution.title}`,
          contribution.recommendation,
          `${zh ? "可采纳点" : "Useful ideas"}：${contribution.usefulIdeas.join(" / ") || (zh ? "无" : "None")}`,
          `${zh ? "风险提醒" : "Cautions"}：${contribution.cautions.join(" / ") || (zh ? "无" : "None")}`
        ])
      : [`- ${zh ? "本轮没有可用的真实模型结构化贡献，最终蓝图来自本地结构化综合器。" : "No usable structured live model contribution was available; the final blueprint came from the local structured synthesizer."}`])
  ].join("\n");
}

function stage(id: string, title: string, ownerAgentId: string, input: string, output: string, validation: string): BlueprintWorkflowStage {
  return { id, title, ownerAgentId, input, output, validation };
}

function schema(name: string, purpose: string, fields: BlueprintSchemaField[]): BlueprintSchema {
  return { name, purpose, fields };
}

function field(name: string, type: string, required: boolean, description: string): BlueprintSchemaField {
  return { name, type, required, description };
}

function systemAgent(
  id: string,
  name: string,
  responsibility: string,
  inputs: string[],
  outputs: string[],
  reviewQuestions: string[],
  failureMode: string
): BlueprintSystemAgent {
  return { id, name, responsibility, inputs, outputs, reviewQuestions, failureMode };
}

function phase(
  name: string,
  duration: string,
  deliverables: string[],
  acceptanceCriteria: string[]
): BlueprintImplementationPhase {
  return { name, duration, deliverables, acceptanceCriteria };
}

function backlogItem(
  id: string,
  title: string,
  phaseName: string,
  ownerAgentId: string,
  priority: BlueprintBacklogItem["priority"],
  effort: BlueprintBacklogItem["effort"],
  dependencies: string[],
  deliverables: string[],
  acceptanceCriteria: string[],
  riskIfSkipped: string
): BlueprintBacklogItem {
  return {
    id,
    title,
    phaseName,
    ownerAgentId,
    priority,
    effort,
    dependencies,
    deliverables,
    acceptanceCriteria,
    riskIfSkipped
  };
}

function roleForDraftAgentId(agentId: string): BlueprintAgentRole {
  const mapping: Record<string, BlueprintAgentRole> = {
    "product-strategist": "product_strategist",
    "workflow-architect": "workflow_architect",
    "schema-designer": "schema_designer",
    "quality-reviewer": "quality_reviewer",
    "delivery-planner": "delivery_planner"
  };

  return mapping[agentId] ?? "product_strategist";
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items));
}

function extractModelContributions(trace: BlueprintTraceEntry[], locale: "en" | "zh"): BlueprintModelContribution[] {
  return trace
    .filter((entry) => entry.status === "ok" && (entry.phase === "proposal" || entry.phase === "revision"))
    .flatMap((entry) => {
      if (!isRecord(entry.parsed)) {
        return [];
      }

      const recommendation = stringValue(entry.parsed.recommendation) || stringValue(entry.parsed.reasoning);

      if (!recommendation) {
        return [];
      }

      return [
        {
          source: [entry.agentName, entry.provider?.toUpperCase(), entry.model].filter(Boolean).join(" · "),
          title: stringValue(entry.parsed.title) || stringValue(entry.parsed.proposalId) || (locale === "zh" ? "模型方案" : "Model proposal"),
          recommendation,
          usefulIdeas: uniqueStrings([
            ...stringArray(entry.parsed.strengths),
            ...stringArray(entry.parsed.alternatives).slice(0, 1)
          ]).slice(0, 4),
          cautions: uniqueStrings([
            ...stringArray(entry.parsed.weaknesses),
            ...risksFromParsed(entry.parsed)
          ]).slice(0, 4)
        }
      ];
    })
    .slice(0, 6);
}

function risksFromParsed(parsed: Record<string, unknown>): string[] {
  if (!Array.isArray(parsed.risks)) {
    return [];
  }

  return parsed.risks.flatMap((risk) => {
    if (!isRecord(risk)) {
      return [];
    }

    return stringValue(risk.description) ? [stringValue(risk.description)] : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = stringValue(item);
        return text ? [text] : [];
      })
    : [];
}

export function blueprintRoleLabel(role: BlueprintAgentRole, locale: "en" | "zh"): string {
  return roleLabel(role, locale);
}

function evaluationStatusLabel(status: BlueprintEvaluationItem["status"], locale: "en" | "zh"): string {
  const labels: Record<"en" | "zh", Record<BlueprintEvaluationItem["status"], string>> = {
    en: {
      strong: "strong",
      watch: "watch",
      weak: "weak"
    },
    zh: {
      strong: "稳健",
      watch: "需关注",
      weak: "薄弱"
    }
  };

  return labels[locale][status];
}

function priorityLabel(priority: BlueprintDetailedRecommendation["priority"], locale: "en" | "zh"): string {
  const labels: Record<"en" | "zh", Record<BlueprintDetailedRecommendation["priority"], string>> = {
    en: {
      high: "High priority",
      medium: "Medium priority",
      low: "Low priority"
    },
    zh: {
      high: "高优先级",
      medium: "中优先级",
      low: "低优先级"
    }
  };

  return labels[locale][priority];
}

function adoptionStatusLabel(status: BlueprintAdoptionLedgerItem["adoptionStatus"], locale: "en" | "zh"): string {
  const labels: Record<"en" | "zh", Record<BlueprintAdoptionLedgerItem["adoptionStatus"], string>> = {
    en: {
      adopted: "Adopted",
      partial: "Partially adopted",
      deferred: "Deferred"
    },
    zh: {
      adopted: "已采纳",
      partial: "部分采纳",
      deferred: "延期验证"
    }
  };

  return labels[locale][status];
}

function roleLabel(role: BlueprintAgentRole, locale: "en" | "zh"): string {
  const labels: Record<"en" | "zh", Record<BlueprintAgentRole, string>> = {
    en: {
      product_strategist: "Product Strategist",
      workflow_architect: "Workflow Architect",
      schema_designer: "Schema Designer",
      quality_reviewer: "Quality Reviewer",
      delivery_planner: "Delivery Planner"
    },
    zh: {
      product_strategist: "产品策略",
      workflow_architect: "工作流架构",
      schema_designer: "数据契约",
      quality_reviewer: "质量评审",
      delivery_planner: "交付规划"
    }
  };

  return labels[locale][role];
}

export function blueprintRoleToAgentRole(role: BlueprintAgentRole): AgentRole {
  const mapping: Record<BlueprintAgentRole, AgentRole> = {
    product_strategist: "principal_architect",
    workflow_architect: "sre_reviewer",
    schema_designer: "pragmatic_builder",
    quality_reviewer: "security_reviewer",
    delivery_planner: "cost_engineer"
  };

  return mapping[role];
}
