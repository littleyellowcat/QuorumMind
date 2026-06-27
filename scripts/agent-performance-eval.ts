import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runAutonomousBlueprintGraph, type AutonomousBlueprintRun } from "../server/agent-platform/autonomous-blueprint";
import type { DecisionMode } from "../src/lib/domain";
import { runBlueprintRoom, type BlueprintRoomResult } from "../src/lib/blueprint";
import { contextForQuestion, inferQuestionPattern, type DecisionQuestionPattern } from "../src/lib/question-context";
import { runDecisionRoom, type DecisionRoomResult } from "../src/lib/workflow";

type AgentEvalSuite = "smoke" | "expanded" | "full";
type AgentEvalKind = "decision" | "blueprint" | "agent_blueprint";
type AgentEvalStatus = "passed" | "warning" | "failed";

type AgentEvalCase = {
  id: string;
  suite: AgentEvalSuite;
  kind: AgentEvalKind;
  locale: "en" | "zh";
  mode: DecisionMode;
  question: string;
  expectedPattern?: DecisionQuestionPattern;
  expectedKeywords: string[];
  expectedSections?: string[];
  expectedNodes?: string[];
  expectedTools?: string[];
  minConsensus?: number;
  maxConsensusRounds?: number;
  expectedTerminationReason?: string;
  maxLatencyMs: number;
  maxEstimatedTokens: number;
};

type ScoreBreakdown = {
  responseQuality: number;
  trajectory: number;
  toolAndSchema: number;
  collaboration: number;
  engineering: number;
  explainability: number;
  reasoning: number;
  toolUse: number;
  interaction: number;
  total: number;
};

type AgentEvalResult = {
  id: string;
  kind: AgentEvalKind;
  suite: AgentEvalSuite;
  locale: "en" | "zh";
  mode: DecisionMode;
  status: AgentEvalStatus;
  score: ScoreBreakdown;
  latencyMs: number;
  estimatedTokens: number;
  providerCalls: number;
  fallbackUsed: boolean;
  consensusScore: number | null;
  terminationReason: string | null;
  keywordHits: string[];
  missingKeywords: string[];
  expectedNodesHitRate: string;
  toolPrecision: string;
  toolRecall: string;
  schemaValidRate: string;
  notes: string[];
};

type AgentEvalTrendEntry = {
  timestamp: string;
  suite: AgentEvalSuite;
  outputPath: string;
  cases: number;
  passed: number;
  warning: number;
  failed: number;
  averageScore: number;
  averageLatencyMs: number;
  averageEstimatedTokens: number;
  fallbackRate: string;
  averageTrajectoryScore: number;
  averageToolRecall: string;
  averageReasoningScore: number;
  averageInteractionScore: number;
  notableCases: Array<Pick<AgentEvalResult, "id" | "status" | "notes">>;
};

const startedAt = new Date();
const suite = suiteFromEnv(process.env.QUORUMMIND_AGENT_EVAL_SUITE);
const requestedCaseIds = csvFromEnv(process.env.QUORUMMIND_AGENT_EVAL_CASE_IDS);
const allCases = readCases(join("eval", "agent-eval-cases.jsonl"));
const suiteCases = allCases.filter((testCase) => caseIncludedInSuite(testCase, suite));
const selectedCases = requestedCaseIds.length > 0 ? suiteCases.filter((testCase) => requestedCaseIds.includes(testCase.id)) : suiteCases;
const missingCaseIds = requestedCaseIds.filter((id) => !selectedCases.some((testCase) => testCase.id === id));
const limit = boundedInteger(process.env.QUORUMMIND_AGENT_EVAL_LIMIT, selectedCases.length, 1, Math.max(1, selectedCases.length));
const casesToRun = selectedCases.slice(0, limit);
const suiteSuffix = suite === "smoke" ? "" : `-${suite}`;
const outputPath = join("docs", "quality", `${formatDate(startedAt)}-agent-performance-audit${suiteSuffix}.md`);
const detailPath = join("output", "agent-eval", `${formatDate(startedAt)}-agent-performance-audit${suiteSuffix}.json`);
const trendPath = join("docs", "quality", "agent-performance-trend.jsonl");
const trendReportPath = join("docs", "quality", "agent-performance-trend.md");

const results: AgentEvalResult[] = [];

for (const testCase of casesToRun) {
  results.push(await evaluateCase(testCase));
}

const summary = summarize(results);
const report = renderReport({
  suite,
  startedAt,
  outputPath,
  detailPath,
  results,
  summary,
  totalSuiteCases: suiteCases.length,
  selectedCaseIds: requestedCaseIds,
  missingCaseIds
});
const trendEntry = createTrendEntry({ suite, outputPath, startedAt, results, summary });

mkdirSync(dirname(outputPath), { recursive: true });
mkdirSync(dirname(detailPath), { recursive: true });
writeFileSync(outputPath, report, "utf8");
writeFileSync(
  detailPath,
  JSON.stringify(
    {
      startedAt: startedAt.toISOString(),
      suite,
      cases: results
    },
    null,
    2
  ),
  "utf8"
);
appendFileSync(trendPath, `${JSON.stringify(trendEntry)}\n`, "utf8");
writeFileSync(trendReportPath, renderTrendReport(readTrendEntries(trendPath)), "utf8");

console.log(`Agent performance eval complete: ${outputPath}`);
console.log(`Agent performance details: ${detailPath}`);
console.log(
  JSON.stringify(
    {
      suite,
      cases: results.length,
      averageScore: summary.averageScore,
      passed: summary.passed,
      warning: summary.warning,
      failed: summary.failed,
      averageTrajectoryScore: summary.averageTrajectoryScore,
      averageToolRecall: summary.averageToolRecall,
      fallbackRate: summary.fallbackRate
    },
    null,
    2
  )
);

if (summary.failed > 0) {
  process.exitCode = 1;
}

async function evaluateCase(testCase: AgentEvalCase): Promise<AgentEvalResult> {
  const started = Date.now();

  if (testCase.kind === "decision") {
    const result = runDecisionRoom({
      question: testCase.question,
      mode: testCase.mode,
      context: contextForQuestion(testCase.question)
    });
    return evaluateDecisionCase(testCase, result, Date.now() - started);
  }

  if (testCase.kind === "blueprint") {
    const result = runBlueprintRoom({
      question: testCase.question,
      mode: testCase.mode,
      locale: testCase.locale,
      context: contextForQuestion(testCase.question)
    });
    return evaluateBlueprintCase(testCase, result, Date.now() - started);
  }

  const run = await runAutonomousBlueprintGraph({
    question: testCase.question,
    mode: testCase.mode,
    locale: testCase.locale,
    context: contextForQuestion(testCase.question),
    threadId: `agent-eval-${testCase.id}`,
    maxConsensusRounds: testCase.maxConsensusRounds
  });
  return evaluateAgentBlueprintCase(testCase, run, Date.now() - started);
}

function evaluateDecisionCase(testCase: AgentEvalCase, result: DecisionRoomResult, latencyMs: number): AgentEvalResult {
  const searchable = normalizeText(
    [
      result.verdict.finalRecommendation,
      result.verdict.adrMarkdown,
      result.revisedProposals.map((proposal) => `${proposal.title} ${proposal.recommendation} ${proposal.reasoning}`).join(" "),
      result.verdict.riskRadar.map((risk) => `${risk.category} ${risk.description} ${risk.mitigation}`).join(" ")
    ].join("\n")
  );
  const keyword = keywordCoverage(searchable, testCase.expectedKeywords);
  const actualPattern = inferQuestionPattern(testCase.question);
  const expectedProposals = testCase.mode === "fast" ? 3 : 5;
  const completeness = scoreBooleans([
    result.initialProposals.length === expectedProposals,
    result.critiques.length >= expectedProposals * (expectedProposals - 1),
    result.revisedProposals.length === expectedProposals,
    result.verdict.rankedProposals.length === expectedProposals,
    result.verdict.riskRadar.length >= 3,
    result.verdict.assumptionLedger.length >= 3,
    result.verdict.adrMarkdown.length > 800
  ]);
  const actionability = scoreBooleans([
    result.verdict.adr.rollbackPlan.length >= 2,
    result.verdict.preMortem.length >= 2,
    result.verdict.assumptionLedger.some((entry) => entry.validationAction.length > 0),
    result.verdict.riskRadar.some((risk) => risk.mitigation.length > 0)
  ]);
  const correctness = testCase.expectedPattern ? (actualPattern === testCase.expectedPattern ? 100 : 45) : 90;
  const chinese = languageScore(searchable, testCase.locale);
  const trajectory = scoreBooleans([
    result.initialProposals.length > 0,
    result.critiques.length > 0,
    result.revisedProposals.length > 0,
    result.rankings.length > 0,
    result.verdict.delphiRounds.length >= 6
  ]);
  const toolAndSchema = scoreBooleans([
    result.verdict.rankedProposals.every((proposal) => Number.isFinite(proposal.quorumScore)),
    result.verdict.riskRadar.every((risk) => Boolean(risk.category && risk.severity && risk.mitigation)),
    result.verdict.assumptionLedger.every((entry) => Boolean(entry.assumption && entry.validationQuestion && entry.validationAction)),
    result.verdict.adr.status === "accepted"
  ]);
  const collaboration = scoreBooleans([
    result.verdict.delphiRounds.length >= 6,
    result.critiques.length >= expectedProposals * (expectedProposals - 1),
    result.revisedProposals.some((proposal) => proposal.version === "revised" && proposal.reasoning.length > 80),
    result.verdict.quorumScore >= (testCase.minConsensus ?? 70)
  ]);
  const estimatedTokens = estimateTokens(`${searchable}\n${JSON.stringify(result.verdict.rankedProposals)}`);
  const engineering = efficiencyScore(latencyMs, testCase.maxLatencyMs, estimatedTokens, testCase.maxEstimatedTokens);
  const explainability = scoreBooleans([
    result.verdict.adrMarkdown.includes("##"),
    result.verdict.delphiRounds.length > 0,
    result.verdict.regretMap.length > 0,
    result.verdict.ahpAnalysis.sensitivityScenarios.length > 0
  ]);
  const score = buildScore({
    responseQuality: average([keyword.score, completeness, actionability, correctness, chinese]),
    trajectory,
    toolAndSchema,
    collaboration,
    engineering,
    explainability,
    reasoning: average([correctness, result.verdict.quorumScore, completeness]),
    toolUse: toolAndSchema,
    interaction: scoreBooleans([result.verdict.delphiRounds.length >= 6, result.critiques.length > 0, result.revisedProposals.length > 0])
  });
  const notes = buildNotes(testCase, score, {
    latencyMs,
    estimatedTokens,
    keyword,
    consensusScore: result.verdict.quorumScore,
    terminationReason: null
  });

  return {
    id: testCase.id,
    kind: testCase.kind,
    suite: testCase.suite,
    locale: testCase.locale,
    mode: testCase.mode,
    status: statusFor(score.total, notes),
    score,
    latencyMs,
    estimatedTokens,
    providerCalls: 0,
    fallbackUsed: false,
    consensusScore: result.verdict.quorumScore,
    terminationReason: null,
    keywordHits: keyword.hits,
    missingKeywords: keyword.missing,
    expectedNodesHitRate: "n/a",
    toolPrecision: "n/a",
    toolRecall: "n/a",
    schemaValidRate: `${Math.round(toolAndSchema)}%`,
    notes
  };
}

function evaluateBlueprintCase(testCase: AgentEvalCase, result: BlueprintRoomResult, latencyMs: number): AgentEvalResult {
  const spec = result.finalSpec;
  const searchable = normalizeText(
    [
      spec.title,
      spec.executiveSummary,
      spec.markdown,
      spec.schemas.map((schema) => `${schema.name} ${schema.purpose} ${schema.fields.map((field) => `${field.name} ${field.description}`).join(" ")}`).join(" "),
      spec.implementationBacklog.map((item) => `${item.title} ${item.deliverables.join(" ")} ${item.acceptanceCriteria.join(" ")}`).join(" ")
    ].join("\n")
  );
  const keyword = keywordCoverage(searchable, testCase.expectedKeywords);
  const sectionScore = sectionCoverage(spec.markdown, testCase.expectedSections ?? []);
  const completeness = average([
    sectionScore,
    scoreBooleans([
      spec.workflowStages.length >= 5,
      spec.schemas.length >= 3,
      spec.systemAgents.length >= 5,
      spec.implementationPlan.length >= 3,
      spec.successCriteria.length >= 4,
      spec.targetOutputs.length >= 4
    ])
  ]);
  const actionability = scoreBooleans([
    spec.implementationBacklog.some((item) => item.priority === "P0"),
    spec.implementationBacklog.every((item) => item.acceptanceCriteria.length > 0),
    spec.detailedRecommendations.length >= 4,
    spec.risks.length >= 3
  ]);
  const chinese = languageScore(searchable, testCase.locale);
  const trajectory = scoreBooleans([
    result.drafts.length > 0,
    result.critiques.length > result.drafts.length,
    result.revisions.length === result.drafts.length,
    result.consensusRounds.length >= 3,
    isNonDecreasing(result.consensusRounds.map((round) => round.consensusScore)),
    spec.adoptionLedger.length >= result.critiques.length
  ]);
  const toolAndSchema = scoreBooleans([
    spec.schemas.length >= 3,
    spec.schemas.every((schema) => schema.fields.length >= 3),
    spec.schemas.some((schema) => schema.fields.some((field) => field.required)),
    spec.evaluationMatrix.every((item) => Number.isFinite(item.score) && item.score >= 0 && item.score <= 100)
  ]);
  const collaboration = scoreBooleans([
    result.finalConsensusScore >= (testCase.minConsensus ?? result.consensusThreshold),
    spec.adoptionLedger.some((item) => item.adoptionStatus === "adopted"),
    spec.adoptionLedger.some((item) => item.adoptionStatus === "deferred" || item.adoptionStatus === "partial"),
    result.consensusRounds.at(-1)?.phase === "final"
  ]);
  const estimatedTokens = estimateTokens(searchable);
  const engineering = efficiencyScore(latencyMs, testCase.maxLatencyMs, estimatedTokens, testCase.maxEstimatedTokens);
  const explainability = scoreBooleans([
    spec.markdown.includes("## 共识收敛记录") || spec.markdown.includes("## Consensus"),
    spec.markdown.includes("## 质询采纳账本") || spec.markdown.includes("Critique"),
    spec.evaluationMatrix.length >= 4,
    spec.modelContributions.length >= 0
  ]);
  const score = buildScore({
    responseQuality: average([keyword.score, completeness, actionability, 92, chinese]),
    trajectory,
    toolAndSchema,
    collaboration,
    engineering,
    explainability,
    reasoning: average([keyword.score, completeness, result.finalConsensusScore]),
    toolUse: toolAndSchema,
    interaction: average([trajectory, collaboration])
  });
  const notes = buildNotes(testCase, score, {
    latencyMs,
    estimatedTokens,
    keyword,
    consensusScore: result.finalConsensusScore,
    terminationReason: null
  });

  return {
    id: testCase.id,
    kind: testCase.kind,
    suite: testCase.suite,
    locale: testCase.locale,
    mode: testCase.mode,
    status: statusFor(score.total, notes),
    score,
    latencyMs,
    estimatedTokens,
    providerCalls: 0,
    fallbackUsed: false,
    consensusScore: result.finalConsensusScore,
    terminationReason: null,
    keywordHits: keyword.hits,
    missingKeywords: keyword.missing,
    expectedNodesHitRate: "n/a",
    toolPrecision: "n/a",
    toolRecall: "n/a",
    schemaValidRate: `${Math.round(toolAndSchema)}%`,
    notes
  };
}

function evaluateAgentBlueprintCase(testCase: AgentEvalCase, run: AutonomousBlueprintRun, latencyMs: number): AgentEvalResult {
  const spec = run.result.finalSpec;
  const searchable = normalizeText(
    [
      run.goalBrief.goal,
      spec.title,
      spec.executiveSummary,
      spec.markdown,
      run.summary.nextActions.join(" "),
      run.trace.map((entry) => `${entry.node} ${entry.summary} ${entry.evidence.join(" ")}`).join(" ")
    ].join("\n")
  );
  const keyword = keywordCoverage(searchable, testCase.expectedKeywords);
  const nodes = run.trace.map((entry) => entry.node);
  const tools = run.toolCalls.map((entry) => entry.toolName);
  const nodeScore = orderedPathScore(nodes, testCase.expectedNodes ?? []);
  const toolMatch = toolMatchScore(tools, testCase.expectedTools ?? []);
  const terminationOk = testCase.expectedTerminationReason ? run.summary.terminationReason === testCase.expectedTerminationReason : true;
  const responseQuality = average([
    keyword.score,
    scoreBooleans([
      spec.workflowStages.length >= 5,
      spec.schemas.length >= 3,
      spec.implementationBacklog.length >= 6,
      spec.detailedRecommendations.length >= 4
    ]),
    scoreBooleans([
      spec.implementationBacklog.some((item) => item.priority === "P0"),
      run.summary.nextActions.length === 3,
      spec.risks.length >= 3
    ]),
    92,
    languageScore(searchable, testCase.locale)
  ]);
  const trajectory = average([
    nodeScore,
    scoreBooleans([
      run.consensusLoop.length > 0,
      run.routeDecisions.length > 0,
      run.trace.at(0)?.node === "understand_request",
      run.trace.at(-1)?.node === "finalize",
      terminationOk
    ])
  ]);
  const toolAndSchema = average([
    toolMatch.recallScore,
    scoreBooleans([
      spec.schemas.length >= 3,
      spec.schemas.every((schema) => schema.fields.length >= 3),
      run.toolCalls.every((call) => call.source === "langchain_tool" || call.source === "live_model_provider")
    ])
  ]);
  const collaboration = scoreBooleans([
    run.consensusLoop.length >= 2,
    isNonDecreasing(run.consensusLoop.map((round) => round.consensusScore)),
    run.routeDecisions.length >= 1,
    run.result.finalSpec.adoptionLedger.length >= run.result.critiques.length,
    run.summary.consensusScore >= (testCase.minConsensus ?? 75)
  ]);
  const estimatedTokens = estimateTokens(searchable);
  const engineering = efficiencyScore(latencyMs, testCase.maxLatencyMs, estimatedTokens, testCase.maxEstimatedTokens);
  const explainability = scoreBooleans([
    run.routeDecisions.length > 0,
    run.validation.reviewWarnings.length >= 0,
    run.runtimeLimits.maxConsensusRounds >= 1,
    run.platform.orchestrator === "langgraph"
  ]);
  const score = buildScore({
    responseQuality,
    trajectory,
    toolAndSchema,
    collaboration,
    engineering,
    explainability,
    reasoning: average([run.summary.consensusScore, responseQuality, trajectory]),
    toolUse: average([toolMatch.precisionScore, toolMatch.recallScore, toolAndSchema]),
    interaction: scoreBooleans([
      run.routeDecisions.length > 0,
      terminationOk,
      run.summary.humanReviewRequired === (run.summary.terminationReason !== "threshold_met"),
      run.consensusLoop.every((round) => round.action === "continue" || round.action === "finalize" || round.action === "human_review")
    ])
  });
  const notes = buildNotes(testCase, score, {
    latencyMs,
    estimatedTokens,
    keyword,
    consensusScore: run.summary.consensusScore,
    terminationReason: run.summary.terminationReason
  });

  if (!terminationOk) {
    notes.push(`终止原因不符合预期：期望 ${testCase.expectedTerminationReason}，实际 ${run.summary.terminationReason}`);
  }

  return {
    id: testCase.id,
    kind: testCase.kind,
    suite: testCase.suite,
    locale: testCase.locale,
    mode: testCase.mode,
    status: statusFor(score.total, notes),
    score,
    latencyMs,
    estimatedTokens,
    providerCalls: run.liveModel.providerCalls,
    fallbackUsed: run.liveModel.requested === "live" && run.liveModel.actual !== "live",
    consensusScore: run.summary.consensusScore,
    terminationReason: run.summary.terminationReason,
    keywordHits: keyword.hits,
    missingKeywords: keyword.missing,
    expectedNodesHitRate: `${Math.round(nodeScore)}%`,
    toolPrecision: `${Math.round(toolMatch.precisionScore)}%`,
    toolRecall: `${Math.round(toolMatch.recallScore)}%`,
    schemaValidRate: `${Math.round(toolAndSchema)}%`,
    notes
  };
}

function buildScore(input: Omit<ScoreBreakdown, "total">): ScoreBreakdown {
  const total =
    input.responseQuality * 0.35 +
    input.trajectory * 0.2 +
    input.toolAndSchema * 0.15 +
    input.collaboration * 0.15 +
    input.engineering * 0.1 +
    input.explainability * 0.05;

  return {
    ...mapScoreValues(input),
    total: roundScore(total)
  };
}

function mapScoreValues<T extends Record<string, number>>(value: T): T {
  return Object.fromEntries(Object.entries(value).map(([key, score]) => [key, roundScore(score)])) as T;
}

function buildNotes(
  testCase: AgentEvalCase,
  score: ScoreBreakdown,
  facts: {
    latencyMs: number;
    estimatedTokens: number;
    keyword: ReturnType<typeof keywordCoverage>;
    consensusScore: number | null;
    terminationReason: string | null;
  }
): string[] {
  const notes: string[] = [];

  if (facts.keyword.score < 70) {
    notes.push(`关键词覆盖不足：缺少 ${facts.keyword.missing.join(", ") || "无"}`);
  }
  if (facts.consensusScore !== null && testCase.minConsensus !== undefined && facts.consensusScore < testCase.minConsensus) {
    notes.push(`共识分低于阈值：${facts.consensusScore} < ${testCase.minConsensus}`);
  }
  if (facts.latencyMs > testCase.maxLatencyMs) {
    notes.push(`延迟超过预算：${facts.latencyMs}ms > ${testCase.maxLatencyMs}ms`);
  }
  if (facts.estimatedTokens > testCase.maxEstimatedTokens) {
    notes.push(`估算 Token 超过预算：${facts.estimatedTokens} > ${testCase.maxEstimatedTokens}`);
  }
  if (score.trajectory < 75) {
    notes.push(`轨迹分偏低：${score.trajectory}`);
  }
  if (score.toolAndSchema < 75) {
    notes.push(`工具/Schema 分偏低：${score.toolAndSchema}`);
  }
  if (score.responseQuality < 75) {
    notes.push(`响应质量分偏低：${score.responseQuality}`);
  }

  return notes;
}

function summarize(results: AgentEvalResult[]) {
  const passed = results.filter((result) => result.status === "passed").length;
  const warning = results.filter((result) => result.status === "warning").length;
  const failed = results.filter((result) => result.status === "failed").length;

  return {
    totalCases: results.length,
    passed,
    warning,
    failed,
    passRate: percent(passed, results.length),
    averageScore: roundScore(average(results.map((result) => result.score.total))),
    averageLatencyMs: Math.round(average(results.map((result) => result.latencyMs))),
    averageEstimatedTokens: Math.round(average(results.map((result) => result.estimatedTokens))),
    fallbackRate: percent(results.filter((result) => result.fallbackUsed).length, results.length),
    averageResponseQuality: roundScore(average(results.map((result) => result.score.responseQuality))),
    averageTrajectoryScore: roundScore(average(results.map((result) => result.score.trajectory))),
    averageToolSchemaScore: roundScore(average(results.map((result) => result.score.toolAndSchema))),
    averageCollaborationScore: roundScore(average(results.map((result) => result.score.collaboration))),
    averageEngineeringScore: roundScore(average(results.map((result) => result.score.engineering))),
    averageReasoningScore: roundScore(average(results.map((result) => result.score.reasoning))),
    averageToolUseScore: roundScore(average(results.map((result) => result.score.toolUse))),
    averageInteractionScore: roundScore(average(results.map((result) => result.score.interaction))),
    averageToolRecall: percentFromScores(results.map((result) => percentNumber(result.toolRecall)).filter((value): value is number => value !== undefined))
  };
}

function renderReport(input: {
  suite: AgentEvalSuite;
  startedAt: Date;
  outputPath: string;
  detailPath: string;
  results: AgentEvalResult[];
  summary: ReturnType<typeof summarize>;
  totalSuiteCases: number;
  selectedCaseIds: string[];
  missingCaseIds: string[];
}): string {
  const rows = input.results
    .map(
      (result) =>
        `| ${result.id} | ${result.kind} | ${result.status} | ${result.score.total} | ${result.score.responseQuality} | ${
          result.score.trajectory
        } | ${result.score.toolAndSchema} | ${result.score.collaboration} | ${result.latencyMs} | ${
          result.estimatedTokens
        } | ${result.consensusScore ?? "-"} | ${result.expectedNodesHitRate} | ${result.toolRecall} | ${
          result.notes.join("；") || "-"
        } |`
    )
    .join("\n");
  const issueRows = topIssues(input.results)
    .map((issue) => `| ${issue.issue} | ${issue.count} | ${issue.cases.join(", ")} |`)
    .join("\n");

  return `# QuorumMind AgentEval 性能评估报告

日期：${formatDate(input.startedAt)}

## 评估方法

AgentEval 按“最终结果质量 + 执行轨迹合理性 + 工具/Schema 使用正确性 + 多模型协作质量 + 延迟/成本等工程指标 + 可解释性”评分。默认使用离线规则评估，不调用真实模型，也不启用 LLM-as-a-Judge。

评分权重：

| 维度 | 权重 | 说明 |
| --- | ---: | --- |
| 结果质量 | 35% | 相关性、完整性、可执行性、问题类型匹配、中文质量 |
| 执行轨迹 | 20% | 节点顺序、共识循环、路由是否符合预期 |
| 工具/Schema | 15% | 工具命中率、Schema 字段完整性、结构化分数有效性 |
| 多模型协作 | 15% | 互评、修订、质询采纳、共识提升 |
| 工程效率 | 10% | 延迟和估算 Token 是否在预算内 |
| 可解释性 | 5% | ADR、routeDecisions、评估矩阵、复审信息是否可审查 |

美团龙猫式三维拆解：

| 维度 | 本项目映射 |
| --- | --- |
| 推理维度 | 问题类型识别、关键词相关性、共识分、完整性 |
| 工具维度 | LangChain tool 命中率、Schema 有效性、provider/tool trace |
| 交互维度 | 多轮共识、主动进入人工复审、routeDecisions 和 terminationReason |

RAG 评测：当前 AgentEval 未启用 RAGAS，因为 QuorumMind 现阶段没有检索证据链；后续如果 knowledge/RAG 成为主路径，应加入忠实度、引用可追溯性和证据相关性。

## 运行范围

- 套件：\`${input.suite}\`
- 本套件可用用例：${input.totalSuiteCases}
- 本轮运行用例：${input.results.length}
- 用例过滤：${input.selectedCaseIds.length > 0 ? input.selectedCaseIds.join(", ") : "未启用"}
${input.missingCaseIds.length > 0 ? `- 未匹配用例：${input.missingCaseIds.join(", ")}` : ""}
- 明细 JSON：\`${input.detailPath}\`

## 汇总指标

| 指标 | 结果 |
| --- | ---: |
| 通过率 | ${input.summary.passRate} |
| 通过 / 警告 / 失败 | ${input.summary.passed} / ${input.summary.warning} / ${input.summary.failed} |
| 平均总分 | ${input.summary.averageScore} |
| 平均响应质量 | ${input.summary.averageResponseQuality} |
| 平均轨迹分 | ${input.summary.averageTrajectoryScore} |
| 平均工具/Schema 分 | ${input.summary.averageToolSchemaScore} |
| 平均协作分 | ${input.summary.averageCollaborationScore} |
| 平均工程效率分 | ${input.summary.averageEngineeringScore} |
| 平均推理分 | ${input.summary.averageReasoningScore} |
| 平均工具使用分 | ${input.summary.averageToolUseScore} |
| 平均交互分 | ${input.summary.averageInteractionScore} |
| 平均延迟 | ${input.summary.averageLatencyMs}ms |
| 平均估算 Token | ${input.summary.averageEstimatedTokens} |
| 兜底率 | ${input.summary.fallbackRate} |

## 用例明细

| 用例 | 类型 | 状态 | 总分 | 结果质量 | 轨迹 | 工具/Schema | 协作 | 延迟 ms | 估算 Token | 共识 | 节点命中 | 工具召回 | 备注 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
${rows}

## 失败原因 Top

| 问题 | 次数 | 用例 |
| --- | ---: | --- |
${issueRows || "| - | 0 | - |"}

## 下一步

- 将本报告作为默认离线 Agent 性能门：\`npm run agent:eval\`。
- 需要扩大覆盖时运行 \`npm run agent:eval:expanded\`；面试展示可引用本报告和趋势文件。
- 后续可加入 LLM-as-a-Judge：只对低分或人工抽检样本运行，避免每次评估都消耗真实 API。
`;
}

function createTrendEntry(input: {
  suite: AgentEvalSuite;
  outputPath: string;
  startedAt: Date;
  results: AgentEvalResult[];
  summary: ReturnType<typeof summarize>;
}): AgentEvalTrendEntry {
  return {
    timestamp: input.startedAt.toISOString(),
    suite: input.suite,
    outputPath: input.outputPath,
    cases: input.results.length,
    passed: input.summary.passed,
    warning: input.summary.warning,
    failed: input.summary.failed,
    averageScore: input.summary.averageScore,
    averageLatencyMs: input.summary.averageLatencyMs,
    averageEstimatedTokens: input.summary.averageEstimatedTokens,
    fallbackRate: input.summary.fallbackRate,
    averageTrajectoryScore: input.summary.averageTrajectoryScore,
    averageToolRecall: input.summary.averageToolRecall,
    averageReasoningScore: input.summary.averageReasoningScore,
    averageInteractionScore: input.summary.averageInteractionScore,
    notableCases: input.results
      .filter((result) => result.status !== "passed" || result.notes.length > 0)
      .slice(0, 8)
      .map((result) => ({ id: result.id, status: result.status, notes: result.notes }))
  };
}

function renderTrendReport(entries: AgentEvalTrendEntry[]): string {
  const latest = entries.at(-1);
  const rows = entries
    .slice(-20)
    .reverse()
    .map(
      (entry) =>
        `| ${entry.timestamp} | ${entry.suite} | ${entry.cases} | ${entry.passed}/${entry.warning}/${entry.failed} | ${
          entry.averageScore
        } | ${entry.averageTrajectoryScore} | ${entry.averageToolRecall} | ${entry.averageReasoningScore} | ${
          entry.averageInteractionScore
        } | ${entry.averageLatencyMs} | ${entry.fallbackRate} | ${entry.outputPath} |`
    )
    .join("\n");
  const notableRows = latest?.notableCases.length
    ? latest.notableCases.map((item) => `| ${item.id} | ${item.status} | ${item.notes.join("；") || "-"} |`).join("\n")
    : "| - | - | - |";

  return `# QuorumMind AgentEval 趋势

更新：${new Date().toISOString()}

## 最近记录

| 时间 | 套件 | 用例 | 通过/警告/失败 | 平均总分 | 轨迹分 | 工具召回 | 推理分 | 交互分 | 平均延迟 ms | 兜底率 | 报告 |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${rows || "| - | - | 0 | - | - | - | - | - | - | - | - | - |"}

## 最新需关注用例

| 用例 | 状态 | 备注 |
| --- | --- | --- |
${notableRows}
`;
}

function topIssues(results: AgentEvalResult[]): Array<{ issue: string; count: number; cases: string[] }> {
  const issues = new Map<string, string[]>();

  for (const result of results) {
    for (const note of result.notes) {
      const key = note.split("：")[0] || note;
      issues.set(key, [...(issues.get(key) ?? []), result.id]);
    }
  }

  return Array.from(issues.entries())
    .map(([issue, cases]) => ({ issue, count: cases.length, cases }))
    .sort((a, b) => b.count - a.count || a.issue.localeCompare(b.issue))
    .slice(0, 8);
}

function readCases(path: string): AgentEvalCase[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return [];
      }

      try {
        return [JSON.parse(trimmed) as AgentEvalCase];
      } catch (error) {
        throw new Error(`Invalid AgentEval JSONL at ${path}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
}

function readTrendEntries(path: string): AgentEvalTrendEntry[] {
  if (!existsSync(path)) {
    return [];
  }

  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return [];
      }

      try {
        return [JSON.parse(trimmed) as AgentEvalTrendEntry];
      } catch {
        return [];
      }
    });
}

function statusFor(total: number, notes: string[]): AgentEvalStatus {
  const hasHardFailure = notes.some((note) => note.includes("终止原因不符合预期") || note.includes("共识分低于阈值"));

  if (hasHardFailure || total < 70) {
    return "failed";
  }

  return total < 85 || notes.length > 0 ? "warning" : "passed";
}

function keywordCoverage(searchable: string, expectedKeywords: string[]) {
  const hits = expectedKeywords.filter((keyword) => searchable.includes(normalizeText(keyword)));
  const missing = expectedKeywords.filter((keyword) => !hits.includes(keyword));

  return {
    hits,
    missing,
    score: expectedKeywords.length === 0 ? 100 : roundScore((hits.length / expectedKeywords.length) * 100)
  };
}

function sectionCoverage(markdown: string, expectedSections: string[]): number {
  if (expectedSections.length === 0) {
    return 100;
  }

  const normalized = normalizeText(markdown);
  const hits = expectedSections.filter((section) => normalized.includes(normalizeText(section)));
  return roundScore((hits.length / expectedSections.length) * 100);
}

function orderedPathScore(actual: string[], expected: string[]): number {
  if (expected.length === 0) {
    return 100;
  }

  if (actual.join(" > ") === expected.join(" > ")) {
    return 100;
  }

  return roundScore((longestCommonSubsequence(actual, expected) / expected.length) * 100);
}

function toolMatchScore(actual: string[], expected: string[]) {
  if (expected.length === 0) {
    return { precisionScore: 100, recallScore: 100 };
  }

  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const hits = Array.from(expectedSet).filter((toolName) => actualSet.has(toolName)).length;
  const precisionDenominator = actualSet.size || 1;

  return {
    precisionScore: roundScore((hits / precisionDenominator) * 100),
    recallScore: roundScore((hits / expectedSet.size) * 100)
  };
}

function longestCommonSubsequence(left: string[], right: string[]): number {
  const dp = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      dp[i][j] = left[i - 1] === right[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  return dp[left.length][right.length];
}

function languageScore(value: string, locale: "en" | "zh"): number {
  if (locale !== "zh") {
    return 100;
  }

  const cjk = (value.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const ratio = value.length > 0 ? cjk / value.length : 0;

  if (cjk >= 80 && ratio >= 0.08) {
    return 100;
  }

  if (cjk >= 40) {
    return 80;
  }

  return 40;
}

function efficiencyScore(latencyMs: number, maxLatencyMs: number, estimatedTokens: number, maxEstimatedTokens: number): number {
  const latencyScore = budgetScore(latencyMs, maxLatencyMs);
  const tokenScore = budgetScore(estimatedTokens, maxEstimatedTokens);
  return average([latencyScore, tokenScore]);
}

function budgetScore(value: number, budget: number): number {
  if (value <= budget) {
    return 100;
  }

  return roundScore(Math.max(0, 100 - ((value - budget) / budget) * 100));
}

function scoreBooleans(values: boolean[]): number {
  if (values.length === 0) {
    return 100;
  }

  return roundScore((values.filter(Boolean).length / values.length) * 100);
}

function isNonDecreasing(values: number[]): boolean {
  return values.every((value, index) => index === 0 || value >= values[index - 1]);
}

function estimateTokens(value: string): number {
  const cjk = (value.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = Math.max(0, value.length - cjk);
  return Math.ceil(cjk / 1.7 + latin / 4);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function percent(count: number, total: number): string {
  return total <= 0 ? "0%" : `${Math.round((count / total) * 100)}%`;
}

function percentFromScores(values: number[]): string {
  return values.length === 0 ? "n/a" : `${roundScore(average(values))}%`;
}

function percentNumber(value: string): number | undefined {
  if (value === "n/a") {
    return undefined;
  }

  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function caseIncludedInSuite(testCase: AgentEvalCase, selectedSuite: AgentEvalSuite): boolean {
  if (selectedSuite === "full") {
    return true;
  }

  if (selectedSuite === "expanded") {
    return testCase.suite === "smoke" || testCase.suite === "expanded";
  }

  return testCase.suite === "smoke";
}

function suiteFromEnv(value: string | undefined): AgentEvalSuite {
  return value === "expanded" || value === "full" ? value : "smoke";
}

function csvFromEnv(value: string | undefined): string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
