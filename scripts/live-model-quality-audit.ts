import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { handleApiRequest } from "../server/decision-api";
import { getProviderStatus, providerRegistry, type Env } from "../server/providers/registry";
import { contextForQuestion, inferQuestionPattern, type DecisionQuestionPattern } from "../src/lib/question-context";
import { qualityAuditCases, type AuditLocale, type QualityAuditCase, type QualityAuditSuite } from "./quality-audit-cases";
import { createAuditHarness, type AuditRunSummary, type AuditTraceSummary } from "./audit-harness";
import type { DecisionApiResponse } from "../src/lib/api-client";
import type { DecisionMode } from "../src/lib/domain";

type LiveAuditSuite = QualityAuditSuite;
type LiveAuditCase = QualityAuditCase;

type LiveCaseResult = {
  id: string;
  locale: AuditLocale;
  mode: DecisionMode;
  expectedPattern: DecisionQuestionPattern;
  actualPattern: DecisionQuestionPattern;
  status: "passed" | "warning" | "failed" | "skipped";
  source: "live" | "fallback" | "error" | "skipped";
  calls: number;
  successes: number;
  failures: number;
  jsonParsed: number;
  valid: number;
  repaired: number;
  invalid: number;
  jsonParseRate: string;
  schemaUsableRate: string;
  liveVerdict: boolean;
  chinesePass: boolean | "n/a";
  relevancePass: boolean;
  selectedProposalId: string;
  quorumScore: number | null;
  dissentIndex: number | null;
  latencyMs: number;
  notes: string[];
  traceSummary: AuditTraceSummary;
};

type LiveAuditTrendEntry = {
  timestamp: string;
  suite: LiveAuditSuite;
  outputPath: string;
  selectedCaseIds: string[];
  missingCaseIds: string[];
  availableCaseCount: number;
  cases: number;
  callBudget: number;
  configuredProviders: string[];
  liveVerdictRate: string;
  jsonParseRate: string;
  schemaUsableRate: string;
  repairedRate: string;
  fallbackRate: string;
  chinesePassRate: string;
  relevancePassRate: string;
  overallPassRate: string;
  passed: number;
  warning: number;
  failed: number;
  skipped: number;
  invalidCalls: number;
  repairedCalls: number;
  fallbackCases: number;
  totalLatencyMs: number;
  timeoutMs: number;
  providerTimeoutMs: number;
  providerSource: "real" | "mock";
  notableCases: Array<{
    id: string;
    status: LiveCaseResult["status"];
    source: LiveCaseResult["source"];
    notes: string[];
  }>;
};

const liveAuditCases = qualityAuditCases;

const env = loadLocalEnv();
const suite = liveAuditSuiteFromEnv(env.QUORUMMIND_LIVE_AUDIT_SUITE ?? process.env.QUORUMMIND_LIVE_AUDIT_SUITE);
const suiteCases = liveAuditCases.filter((testCase) => testCase.suites.includes(suite));
const requestedCaseIds = liveAuditCaseIdsFromEnv(env.QUORUMMIND_LIVE_AUDIT_CASE_IDS ?? process.env.QUORUMMIND_LIVE_AUDIT_CASE_IDS);
const selectedCases = requestedCaseIds.length > 0 ? suiteCases.filter((testCase) => requestedCaseIds.includes(testCase.id)) : suiteCases;
const missingCaseIds = requestedCaseIds.filter((id) => !selectedCases.some((testCase) => testCase.id === id));
const startedAt = new Date();
const outputPath = liveAuditOutputPath(suite, requestedCaseIds, startedAt);
const limit = boundedInteger(
  env.QUORUMMIND_LIVE_AUDIT_LIMIT ?? process.env.QUORUMMIND_LIVE_AUDIT_LIMIT,
  defaultLimitForSuite(suite, selectedCases.length),
  1,
  selectedCases.length
);
const timeoutMs = boundedInteger(
  env.QUORUMMIND_LIVE_AUDIT_TIMEOUT_MS ?? process.env.QUORUMMIND_LIVE_AUDIT_TIMEOUT_MS,
  defaultTimeoutForSuite(suite),
  10_000,
  600_000
);
const providerTimeoutMs = boundedInteger(
  env.QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS ?? process.env.QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS,
  defaultProviderTimeoutForSuite(suite),
  5_000,
  300_000
);
const maxRuntimeMs = boundedInteger(
  env.QUORUMMIND_LIVE_AUDIT_MAX_RUNTIME_MS ?? process.env.QUORUMMIND_LIVE_AUDIT_MAX_RUNTIME_MS,
  0,
  0,
  86_400_000
);
const mockAuditEnabled =
  (env.QUORUMMIND_LIVE_AUDIT_ALLOW_MOCK ?? process.env.QUORUMMIND_LIVE_AUDIT_ALLOW_MOCK) === "1" &&
  (env.QUORUMMIND_MOCK_PROVIDERS ?? process.env.QUORUMMIND_MOCK_PROVIDERS) === "1";
const providerStatus = getProviderStatus(env);
const configuredProviders = mockAuditEnabled
  ? mockConfiguredProviders()
  : Object.values(providerStatus).filter((provider) => provider.implemented && provider.configured);
const casesToRun = selectedCases.slice(0, limit);
const allowedTechnicalTerms = new Set([
  "node",
  "langgraph",
  "langchain",
  "postgresql",
  "tenant",
  "schema",
  "shared",
  "mvp",
  "api",
  "json",
  "adr"
]);

installFetchTimeout(providerTimeoutMs);

const harness = createAuditHarness<LiveCaseResult>({
  kind: "live-model-quality-audit",
  startedAt,
  selectedCaseIds: requestedCaseIds,
  env,
  progressPathEnvKey: "QUORUMMIND_LIVE_AUDIT_PROGRESS_PATH",
  resumeEnvKey: "QUORUMMIND_LIVE_AUDIT_RESUME",
  maxRuntimeEnvKey: "QUORUMMIND_LIVE_AUDIT_MAX_RUNTIME_MS",
  defaultMaxRuntimeMs: maxRuntimeMs,
  plannedCases: casesToRun.length
});
const results = await collectLiveResults(casesToRun, timeoutMs);
const runSummary = harness.summary(results);
const summary = summarize(results);
const report = renderReport({
  startedAt,
  results,
  summary,
  configuredProviders,
  suite,
  availableCaseCount: suiteCases.length,
  selectedCaseIds: requestedCaseIds,
  missingCaseIds,
  callBudget: callBudgetForCases(casesToRun),
  timeoutMs,
  providerTimeoutMs,
  limit,
  runSummary,
  providerSource: mockAuditEnabled ? "mock" : "real"
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, report, "utf8");
const trendEntry = createTrendEntry({
  startedAt,
  suite,
  outputPath,
  results,
  summary,
  configuredProviders,
  availableCaseCount: suiteCases.length,
  selectedCaseIds: requestedCaseIds,
  missingCaseIds,
  callBudget: callBudgetForCases(casesToRun),
  timeoutMs,
  providerTimeoutMs,
  providerSource: mockAuditEnabled ? "mock" : "real"
});
appendTrendEntry(trendEntry);
writeFileSync(liveAuditTrendReportPath(), renderTrendReport(readTrendEntries()), "utf8");

console.log(`Live model quality audit complete: ${outputPath}`);
console.log(`Live model quality trend updated: ${liveAuditTrendReportPath()}`);
console.log(
  JSON.stringify(
    {
      suite,
      cases: results.length,
      selectedCaseIds: requestedCaseIds,
      missingCaseIds,
      callBudget: callBudgetForCases(casesToRun),
      configuredProviders: configuredProviders.map((provider) => provider.id),
      providerSource: mockAuditEnabled ? "mock" : "real",
      progressPath: runSummary.progressPath,
      resumeEnabled: runSummary.resumeEnabled,
      resumedCases: runSummary.resumedCases,
      completedCases: runSummary.completedCases,
      plannedCases: runSummary.plannedCases,
      stopReason: runSummary.stopReason,
      liveVerdictRate: summary.liveVerdictRate,
      jsonParseRate: summary.jsonParseRate,
      schemaUsableRate: summary.schemaUsableRate,
      chinesePassRate: summary.chinesePassRate,
      relevancePassRate: summary.relevancePassRate,
      fallbackRate: summary.fallbackRate,
      overallPassRate: summary.overallPassRate
    },
    null,
    2
  )
);

async function collectLiveResults(cases: LiveAuditCase[], timeoutMs: number): Promise<LiveCaseResult[]> {
  if (configuredProviders.length === 0) {
    const skipped = cases.map((testCase) => skippedCase(testCase, "未检测到已实现且已配置的真实 provider。"));

    for (const result of skipped) {
      harness.caseResult(result);
    }

    return skipped;
  }

  return runCases(cases, timeoutMs);
}

async function runCases(cases: LiveAuditCase[], timeoutMs: number): Promise<LiveCaseResult[]> {
  const results: LiveCaseResult[] = [];

  for (const [index, testCase] of cases.entries()) {
    const completed = harness.completedResult(testCase.id);

    if (completed) {
      harness.logResumeSkip(index + 1, cases.length, testCase.id);
      results.push(completed);
      continue;
    }

    if (harness.shouldStopBeforeNextCase()) {
      break;
    }

    harness.caseStart(index + 1, cases.length, testCase.id, {
      locale: testCase.locale,
      mode: testCase.mode,
      timeoutMs,
      providerTimeoutMs,
      callBudget: callBudgetForCases([testCase])
    });

    const result = await evaluateLiveCase(testCase, timeoutMs);
    results.push(result);
    harness.caseResult(result);
  }

  return results;
}

async function evaluateLiveCase(testCase: LiveAuditCase, timeoutMs: number): Promise<LiveCaseResult> {
  const startedAt = Date.now();
  const actualPattern = inferQuestionPattern(testCase.question);
  const context = contextForQuestion(testCase.question);

  try {
    const response = await withTimeout(
      handleApiRequest(
        new Request("http://127.0.0.1:8787/api/decisions", {
          method: "POST",
          body: JSON.stringify({
            question: testCase.question,
            mode: testCase.mode,
            locale: testCase.locale,
            context
          })
        }),
        {
          ...env,
          QUORUMMIND_PROVIDER_MODE: "live",
          QUORUMMIND_MOCK_PROVIDERS: mockAuditEnabled ? "1" : undefined
        }
      ),
      timeoutMs
    );
    const body = (await response.json()) as Partial<DecisionApiResponse> & { error?: string };

    if (!response.ok || body.error) {
      return errorCase(testCase, actualPattern, Date.now() - startedAt, body.error ?? `HTTP ${response.status}`);
    }

    const trace = body.providerTrace ?? [];
    const liveVerdict = body.liveVerdict ?? null;
    const visibleRecommendation = liveVerdict?.finalRecommendation ?? body.result?.verdict.finalRecommendation ?? "";
    const searchable = normalizeSearchText([
      visibleRecommendation,
      body.result?.verdict.adrMarkdown ?? "",
      body.result?.revisedProposals?.map((proposal) => `${proposal.title} ${proposal.recommendation}`).join(" ") ?? "",
      context.candidateOptions.join(" ")
    ]);
    const keywordHits = testCase.expectedKeywords.filter((keyword) => searchable.includes(keyword.toLowerCase()));
    const relevancePass = keywordHits.length >= Math.min(2, testCase.expectedKeywords.length);
    const chinesePass = testCase.locale === "zh" ? isChineseAnswer(visibleRecommendation) : "n/a";
    const valid = trace.filter((entry) => entry.validationStatus === "valid").length;
    const repaired = trace.filter((entry) => entry.validationStatus === "repaired").length;
    const invalid = trace.filter(
      (entry) => entry.status === "error" || entry.validationStatus === "invalid" || entry.validationStatus === "unparsed"
    ).length;
    const invalidDetails = trace
      .filter((entry) => entry.status === "error" || entry.validationStatus === "invalid" || entry.validationStatus === "unparsed")
      .map((entry) => traceInvalidDetail(entry));
    const traceSummary = summarizeTrace(trace);
    const successes = trace.filter((entry) => entry.status === "ok").length;
    const failures = trace.filter((entry) => entry.status === "error").length;
    const jsonParsed = trace.filter((entry) => entry.jsonParsed).length;
    const notes: string[] = [];

    if (actualPattern !== testCase.expectedPattern) {
      notes.push(`问题识别为 ${actualPattern}，期望 ${testCase.expectedPattern}`);
    }
    if (!liveVerdict) {
      notes.push("真实模型未生成可聚合裁决，结果会依赖确定性兜底。");
    }
    if (repaired > 0) {
      notes.push(`${repaired} 次调用依赖 schema 修复。`);
    }
    if (invalid > 0) {
      notes.push(`${invalid} 次调用无效或未解析：${invalidDetails.join("；")}`);
    }
    if (testCase.locale === "zh" && chinesePass !== true) {
      notes.push("中文可见回答未通过语言检查。");
    }
    if (!relevancePass) {
      notes.push(`相关关键词命中不足：${keywordHits.join(", ") || "无"}`);
    }

    const status =
      liveVerdict && relevancePass && (testCase.locale !== "zh" || chinesePass === true) && invalid === 0
        ? repaired > 0
          ? "warning"
          : "passed"
        : liveVerdict
          ? "warning"
          : "failed";

    return {
      id: testCase.id,
      locale: testCase.locale,
      mode: testCase.mode,
      expectedPattern: testCase.expectedPattern,
      actualPattern,
      status,
      source: liveVerdict ? "live" : "fallback",
      calls: trace.length,
      successes,
      failures,
      jsonParsed,
      valid,
      repaired,
      invalid,
      jsonParseRate: percent(jsonParsed, trace.length),
      schemaUsableRate: percent(valid + repaired, trace.length),
      liveVerdict: Boolean(liveVerdict),
      chinesePass,
      relevancePass,
      selectedProposalId: liveVerdict?.selectedProposalId ?? body.result?.verdict.selectedProposalId ?? "-",
      quorumScore: liveVerdict?.quorumScore ?? body.result?.verdict.quorumScore ?? null,
      dissentIndex: liveVerdict?.dissentIndex ?? body.result?.verdict.dissentIndex ?? null,
      latencyMs: Date.now() - startedAt,
      notes,
      traceSummary
    };
  } catch (error) {
    return errorCase(testCase, actualPattern, Date.now() - startedAt, error instanceof Error ? error.message : "Unknown live audit error");
  }
}

function renderReport(input: {
  startedAt: Date;
  results: LiveCaseResult[];
  summary: ReturnType<typeof summarize>;
  configuredProviders: Array<{ id: string; displayName: string; model: string }>;
  suite: LiveAuditSuite;
  availableCaseCount: number;
  selectedCaseIds: string[];
  missingCaseIds: string[];
  callBudget: number;
  timeoutMs: number;
  providerTimeoutMs: number;
  limit: number;
  runSummary: AuditRunSummary;
  providerSource: "real" | "mock";
}): string {
  const providerRows = providerRegistry
    .filter((provider) => provider.implemented)
    .map((provider) => {
      const status = providerStatus[provider.id];
      return `| ${provider.id} | ${status.configured ? "已配置" : "未配置"} | ${status.model} | ${status.notes} |`;
    })
    .join("\n");
  const rows = input.results
    .map(
      (result) =>
        `| ${result.id} | ${result.locale} | ${result.mode} | ${result.source} | ${result.status} | ${result.calls} | ${
          result.jsonParseRate
        } | ${result.schemaUsableRate} | ${result.chinesePass} | ${result.relevancePass ? "通过" : "失败"} | ${
          result.quorumScore ?? "-"
        } | ${result.dissentIndex ?? "-"} | ${result.latencyMs} | ${result.notes.join("；") || "-"} |`
    )
    .join("\n");

  return `# QuorumMind Live 模型质量评估记录

日期：${formatDate(input.startedAt)}

## 评估目标

- 验证真实 provider 是否能产出可解析 JSON。
- 验证 schema valid / repaired / invalid 比例。
- 验证真实模型是否能聚合出 live verdict，避免悄悄回退到确定性兜底。
- 验证中文问题的可见回答是否仍为中文且与问题相关。
- 验证不同运行深度下的快测、Deep 和 Red-team 链路是否稳定。

## 本轮策略

- Prompt 已强化：中文运行要求所有用户可见字符串使用简体中文，保留 JSON 字段、proposalId、模型名和技术标识。
- Prompt 已强化：ranking / verdict 阶段必须使用 payload 里出现过的 proposalId，不能自造 ID。
- 当前套件：\`${input.suite}\`。可选 \`smoke\`、\`expanded\`、\`full\`，通过 \`QUORUMMIND_LIVE_AUDIT_SUITE\` 切换。
- \`smoke\` 默认保持 4 个中文 fast 代表问题；\`expanded\` 增加中文 Deep / Red-team；\`full\` 跑完整 30 题真实 API 回归池。
- 本套件可运行用例：${input.availableCaseCount} 个；本轮实际运行：${input.limit} 个；预估模型调用预算：${input.callBudget} 次。
- 用例过滤：${input.selectedCaseIds.length > 0 ? input.selectedCaseIds.join(", ") : "未启用，按套件顺序运行"}。
${input.missingCaseIds.length > 0 ? `- 未匹配到的用例：${input.missingCaseIds.join(", ")}。` : ""}
- 可通过 \`QUORUMMIND_LIVE_AUDIT_LIMIT\` 控制本套件内运行用例数，避免真实 API 调用过量。
- Provider source：${input.providerSource}。
- 单用例超时：${input.timeoutMs}ms，可通过 \`QUORUMMIND_LIVE_AUDIT_TIMEOUT_MS\` 调整。
- 单 provider 请求超时：${input.providerTimeoutMs}ms，可通过 \`QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS\` 调整。
- 进度 JSONL：\`${input.runSummary.progressPath}\`。
- Resume：${input.runSummary.resumeEnabled ? "启用" : "未启用"}；本轮恢复 ${input.runSummary.resumedCases} 个已完成用例。
- 全局最大运行时长：${input.runSummary.maxRuntimeMs > 0 ? `${input.runSummary.maxRuntimeMs}ms` : "未设置"}；停止原因：${input.runSummary.stopReason}。

## Provider 配置状态

> 这里只记录是否配置和模型名，不记录任何 API key。

| Provider | 状态 | 模型 | 说明 |
| --- | --- | --- | --- |
${providerRows}

## 汇总指标

| 指标 | 结果 |
| --- | ---: |
| 评估套件 | ${input.suite} |
| 运行用例数 | ${input.results.length} |
| 套件可用用例数 | ${input.availableCaseCount} |
| 用例过滤 | ${input.selectedCaseIds.length > 0 ? input.selectedCaseIds.join(", ") : "未启用"} |
| 预估模型调用预算 | ${input.callBudget} |
| 配置的真实 provider | ${input.configuredProviders.map((provider) => provider.id).join(", ") || "无"} |
| Provider source | ${input.providerSource} |
| 已完成 / 计划用例 | ${input.runSummary.completedCases}/${input.runSummary.plannedCases} |
| 进度 JSONL | ${input.runSummary.progressPath} |
| 停止原因 | ${input.runSummary.stopReason} |
| live verdict 生成率 | ${input.summary.liveVerdictRate} |
| JSON 解析率 | ${input.summary.jsonParseRate} |
| Schema 可用率 | ${input.summary.schemaUsableRate} |
| Schema 修复占比 | ${input.summary.repairedRate} |
| 兜底触发率 | ${input.summary.fallbackRate} |
| 中文回答通过率 | ${input.summary.chinesePassRate} |
| 相关性通过率 | ${input.summary.relevancePassRate} |
| 综合通过率 | ${input.summary.overallPassRate} |

## 用例明细

| 用例 | 语言 | 模式 | 来源 | 状态 | 调用数 | JSON 解析 | Schema 可用 | 中文 | 相关性 | 共识分 | 分歧 | 耗时 ms | 备注 |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | --- |
${rows}

## 判读规则

- \`passed\`：有 live verdict、相关性通过、中文用例通过中文检查、且无 invalid/unparsed/error 调用。
- \`warning\`：能生成 live verdict，但有 schema 修复、中文/相关性风险或部分调用质量风险。
- \`failed\`：未生成 live verdict、请求失败、超时或只能依赖确定性兜底。
- \`skipped\`：未配置真实 provider。

## 下一步建议

${
  input.summary.overallPassRate === "100%"
    ? "- 真实模型链路当前可继续观察；下一步可运行 `npm run quality:live:expanded` 检查 Deep/Red-team live 回归。"
    : "- 优先查看 warning/failed 用例备注，针对 provider 输出格式、中文指令或 proposalId 对齐继续加强 prompt/schema 修复。"
}
- 如果 \`Schema 修复占比\` 长期偏高，应该进一步收紧 provider prompt 或增加 provider-specific repair 规则。
- 如果 \`兜底触发率\` 非 0，需要在 UI 中继续强调“当前不是 live verdict”。
`;
}

function summarize(results: LiveCaseResult[]) {
  const totalCalls = sum(results.map((result) => result.calls));
  const zhResults = results.filter((result) => result.locale === "zh" && result.status !== "skipped");
  const runnableResults = results.filter((result) => result.status !== "skipped");
  const totalRunnable = runnableResults.length;

  return {
    liveVerdictRate: percent(results.filter((result) => result.liveVerdict).length, totalRunnable),
    jsonParseRate: percent(sum(results.map((result) => result.jsonParsed)), totalCalls),
    schemaUsableRate: percent(sum(results.map((result) => result.valid + result.repaired)), totalCalls),
    repairedRate: percent(sum(results.map((result) => result.repaired)), totalCalls),
    fallbackRate: percent(results.filter((result) => result.source === "fallback").length, totalRunnable),
    chinesePassRate: percent(zhResults.filter((result) => result.chinesePass === true).length, zhResults.length),
    relevancePassRate: percent(results.filter((result) => result.relevancePass).length, totalRunnable),
    overallPassRate: percent(results.filter((result) => result.status === "passed").length, totalRunnable)
  };
}

function createTrendEntry(input: {
  startedAt: Date;
  suite: LiveAuditSuite;
  outputPath: string;
  results: LiveCaseResult[];
  summary: ReturnType<typeof summarize>;
  configuredProviders: Array<{ id: string }>;
  availableCaseCount: number;
  selectedCaseIds: string[];
  missingCaseIds: string[];
  callBudget: number;
  timeoutMs: number;
  providerTimeoutMs: number;
  providerSource: "real" | "mock";
}): LiveAuditTrendEntry {
  return {
    timestamp: input.startedAt.toISOString(),
    suite: input.suite,
    outputPath: input.outputPath,
    selectedCaseIds: input.selectedCaseIds,
    missingCaseIds: input.missingCaseIds,
    availableCaseCount: input.availableCaseCount,
    cases: input.results.length,
    callBudget: input.callBudget,
    configuredProviders: input.configuredProviders.map((provider) => provider.id),
    liveVerdictRate: input.summary.liveVerdictRate,
    jsonParseRate: input.summary.jsonParseRate,
    schemaUsableRate: input.summary.schemaUsableRate,
    repairedRate: input.summary.repairedRate,
    fallbackRate: input.summary.fallbackRate,
    chinesePassRate: input.summary.chinesePassRate,
    relevancePassRate: input.summary.relevancePassRate,
    overallPassRate: input.summary.overallPassRate,
    passed: input.results.filter((result) => result.status === "passed").length,
    warning: input.results.filter((result) => result.status === "warning").length,
    failed: input.results.filter((result) => result.status === "failed").length,
    skipped: input.results.filter((result) => result.status === "skipped").length,
    invalidCalls: sum(input.results.map((result) => result.invalid)),
    repairedCalls: sum(input.results.map((result) => result.repaired)),
    fallbackCases: input.results.filter((result) => result.source === "fallback").length,
    totalLatencyMs: sum(input.results.map((result) => result.latencyMs)),
    timeoutMs: input.timeoutMs,
    providerTimeoutMs: input.providerTimeoutMs,
    providerSource: input.providerSource,
    notableCases: input.results
      .filter((result) => result.status !== "passed" || result.notes.length > 0)
      .map((result) => ({
        id: result.id,
        status: result.status,
        source: result.source,
        notes: result.notes
      }))
  };
}

function appendTrendEntry(entry: LiveAuditTrendEntry): void {
  const path = liveAuditTrendDataPath();

  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}

function readTrendEntries(): LiveAuditTrendEntry[] {
  const path = liveAuditTrendDataPath();

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
        return [JSON.parse(trimmed) as LiveAuditTrendEntry];
      } catch {
        return [];
      }
    });
}

function renderTrendReport(entries: LiveAuditTrendEntry[]): string {
  const latestEntries = entries.slice(-20).reverse();
  const latest = entries.at(-1);
  const previous = entries.length > 1 ? entries.at(-2) : undefined;
  const rows = latestEntries
    .map(
      (entry) =>
        `| ${entry.timestamp} | ${entry.suite} | ${entry.cases}/${entry.availableCaseCount} | ${
          entry.selectedCaseIds.length > 0 ? entry.selectedCaseIds.join(", ") : "未过滤"
        } | ${entry.providerSource ?? "real"} | ${entry.liveVerdictRate} | ${entry.jsonParseRate} | ${entry.schemaUsableRate} | ${entry.chinesePassRate} | ${
          entry.relevancePassRate
        } | ${entry.fallbackRate} | ${entry.overallPassRate} | ${entry.invalidCalls} | ${entry.repairedCalls} | ${
          entry.totalLatencyMs
        } | ${entry.outputPath} |`
    )
    .join("\n");
  const notableRows = latest?.notableCases.length
    ? latest.notableCases
        .map((item) => `| ${item.id} | ${item.status} | ${item.source} | ${item.notes.join("；") || "-"} |`)
        .join("\n")
    : "| - | - | - | - |";

  return `# QuorumMind 真实模型质量趋势

更新：${new Date().toISOString()}

## 说明

- 数据源：\`${liveAuditTrendDataPath()}\`，每次运行 \`npm run quality:live\`、\`quality:live:expanded\` 或 \`quality:live:full\` 后自动追加。
- 这里只记录 provider 是否配置、模型名、质量指标、失败用例和报告路径，不记录 API key。
- 真实 API 有波动，趋势比单次结果更有判断价值。

## 最新结果

| 指标 | 结果 |
| --- | ---: |
| 总记录数 | ${entries.length} |
| 最新套件 | ${latest?.suite ?? "-"} |
| 最新用例数 | ${latest ? `${latest.cases}/${latest.availableCaseCount}` : "-"} |
| 最新 Provider source | ${latest?.providerSource ?? "real"} |
| 最新 live verdict | ${latest?.liveVerdictRate ?? "-"} |
| 最新 JSON 解析 | ${latest?.jsonParseRate ?? "-"} |
| 最新 Schema 可用 | ${latest?.schemaUsableRate ?? "-"} |
| 最新中文通过 | ${latest?.chinesePassRate ?? "-"} |
| 最新相关性通过 | ${latest?.relevancePassRate ?? "-"} |
| 最新兜底率 | ${latest?.fallbackRate ?? "-"} |
| 最新综合通过 | ${latest?.overallPassRate ?? "-"} |
| 相比上次综合通过 | ${trendDelta(latest?.overallPassRate, previous?.overallPassRate)} |
| 相比上次兜底率 | ${trendDelta(latest?.fallbackRate, previous?.fallbackRate)} |

## 最近记录

| 时间 | 套件 | 用例 | 过滤 | Provider source | live verdict | JSON | Schema | 中文 | 相关性 | 兜底 | 综合 | invalid | repaired | 耗时 ms | 报告 |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${rows || "| - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |"}

## 最新异常用例

| 用例 | 状态 | 来源 | 备注 |
| --- | --- | --- | --- |
${notableRows}
`;
}

function trendDelta(current: string | undefined, previous: string | undefined): string {
  if (!current || !previous) {
    return "-";
  }

  const currentValue = percentNumber(current);
  const previousValue = percentNumber(previous);

  if (currentValue === undefined || previousValue === undefined) {
    return "-";
  }

  const delta = currentValue - previousValue;

  if (delta === 0) {
    return "0pp";
  }

  return `${delta > 0 ? "+" : ""}${delta}pp`;
}

function percentNumber(value: string): number | undefined {
  const parsed = Number(value.replace("%", ""));

  return Number.isFinite(parsed) ? parsed : undefined;
}

function skippedCase(testCase: LiveAuditCase, reason: string): LiveCaseResult {
  return {
    id: testCase.id,
    locale: testCase.locale,
    mode: testCase.mode,
    expectedPattern: testCase.expectedPattern,
    actualPattern: inferQuestionPattern(testCase.question),
    status: "skipped",
    source: "skipped",
    calls: 0,
    successes: 0,
    failures: 0,
    jsonParsed: 0,
    valid: 0,
    repaired: 0,
    invalid: 0,
    jsonParseRate: "0%",
    schemaUsableRate: "0%",
    liveVerdict: false,
    chinesePass: testCase.locale === "zh" ? false : "n/a",
    relevancePass: false,
    selectedProposalId: "-",
    quorumScore: null,
    dissentIndex: null,
    latencyMs: 0,
    notes: [reason],
    traceSummary: []
  };
}

function errorCase(testCase: LiveAuditCase, actualPattern: DecisionQuestionPattern, latencyMs: number, reason: string): LiveCaseResult {
  return {
    ...skippedCase(testCase, reason),
    actualPattern,
    status: "failed",
    source: "error",
    latencyMs
  };
}

function loadLocalEnv(): Env {
  const fileEnv: Env = {};

  for (const file of [".env", ".env.local"]) {
    if (!existsSync(file)) {
      continue;
    }

    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separator = trimmed.indexOf("=");

      if (separator < 0) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");

      fileEnv[key] = value;
    }
  }

  return { ...fileEnv, ...process.env };
}

function liveAuditSuiteFromEnv(value: string | undefined): LiveAuditSuite {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "expanded" || normalized === "full" || normalized === "smoke") {
    return normalized;
  }

  return "smoke";
}

function liveAuditCaseIdsFromEnv(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function liveAuditOutputPath(suite: LiveAuditSuite, caseIds: string[], startedAt: Date): string {
  const suiteSuffix = suite === "smoke" ? "" : `-${suite}`;
  const caseSuffix = caseIds.length > 0 ? "-filtered" : "";

  return join("docs", "quality", `${formatDate(startedAt)}-live-model-quality-audit${suiteSuffix}${caseSuffix}.md`);
}

function liveAuditTrendDataPath(): string {
  return join("docs", "quality", "live-model-quality-trend.jsonl");
}

function liveAuditTrendReportPath(): string {
  return join("docs", "quality", "live-model-quality-trend.md");
}

function defaultTimeoutForSuite(suite: LiveAuditSuite): number {
  return suite === "smoke" ? 120_000 : 180_000;
}

function defaultProviderTimeoutForSuite(suite: LiveAuditSuite): number {
  return suite === "smoke" ? 60_000 : 90_000;
}

function defaultLimitForSuite(suite: LiveAuditSuite, available: number): number {
  if (suite === "smoke") {
    return Math.min(4, available);
  }

  return available;
}

function callBudgetForCases(cases: LiveAuditCase[]): number {
  return sum(cases.map((testCase) => (testCase.mode === "fast" ? 9 : 15)));
}

function isChineseAnswer(value: string): boolean {
  const hanCharacters = value.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latinWords = value.match(/[A-Za-z]{4,}/g)?.filter((word) => !allowedTechnicalTerms.has(word.toLowerCase())).length ?? 0;

  return hanCharacters >= 12 && latinWords <= 12;
}

function normalizeSearchText(values: string[]): string {
  return values.join(" ").toLowerCase();
}

function traceInvalidDetail(entry: DecisionApiResponse["providerTrace"][number]): string {
  const issues = entry.validationIssues
    ?.slice(0, 2)
    .map((issue) => `${issue.path} ${issue.message}`)
    .join(", ");
  const reason = entry.error ?? issues;
  const status = entry.failureClass ?? entry.validationStatus ?? entry.status;
  const model = entry.model ? `/${entry.model}` : "";

  return `${entry.phase}/${entry.provider}${model} ${status}${reason ? ` (${shortText(reason)})` : ""}`;
}

function summarizeTrace(trace: DecisionApiResponse["providerTrace"]): AuditTraceSummary {
  return trace.map((entry) => ({
    phase: entry.phase,
    provider: entry.provider,
    model: entry.model,
    status: entry.status,
    validationStatus: entry.validationStatus,
    jsonParsed: entry.jsonParsed,
    failureClass: entry.failureClass,
    durationMs: entry.durationMs
  }));
}

function mockConfiguredProviders(): Array<{ id: string; displayName: string; model: string; implemented: boolean; configured: boolean }> {
  return [
    {
      id: "openai",
      displayName: "Mock GPT Seat",
      model: "mock-gpt-seat",
      implemented: true,
      configured: true
    },
    {
      id: "deepseek",
      displayName: "Mock DeepSeek Seat",
      model: "mock-deepseek-seat",
      implemented: true,
      configured: true
    },
    {
      id: "gemini",
      displayName: "Mock Gemini Seat",
      model: "mock-gemini-seat",
      implemented: true,
      configured: true
    }
  ];
}

function shortText(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function installFetchTimeout(timeoutMs: number): void {
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const originalSignal = init?.signal;
    const abortFromOriginal = () => controller.abort(originalSignal?.reason);

    if (originalSignal?.aborted) {
      controller.abort(originalSignal.reason);
    } else {
      originalSignal?.addEventListener("abort", abortFromOriginal, { once: true });
    }

    const timeout = setTimeout(() => controller.abort(`Provider request timed out after ${timeoutMs}ms`), timeoutMs);

    try {
      return await originalFetch(input, {
        ...init,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
      originalSignal?.removeEventListener("abort", abortFromOriginal);
    }
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Live audit case timed out after ${timeoutMs}ms`)), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function percent(count: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }

  return `${Math.round((count / total) * 100)}%`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
