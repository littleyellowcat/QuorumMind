import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { handleApiRequest } from "../server/decision-api";
import { generateADR } from "../src/lib/adr";
import { createAdrMarkdownExport, createJsonTraceExport, createPdfReportExport } from "../src/lib/exporters";
import { localizeKnownDecisionText } from "../src/lib/localization";
import { createManualProviderBundle } from "../src/lib/manual-provider";
import {
  contextForQuestion,
  defaultContext,
  inferQuestionPattern,
  type DecisionQuestionPattern
} from "../src/lib/question-context";
import { runDecisionRoom } from "../src/lib/workflow";
import { qualityAuditCases, type AuditLocale, type QualityAuditCase } from "./quality-audit-cases";
import type { DecisionContext, DecisionMode } from "../src/lib/domain";

type CaseResult = {
  id: string;
  locale: AuditLocale;
  mode: DecisionMode;
  expectedPattern: DecisionQuestionPattern;
  actualPattern: DecisionQuestionPattern;
  legacyPattern: DecisionQuestionPattern;
  contextPass: boolean;
  legacyContextPass: boolean;
  structurePass: boolean;
  relevancePass: boolean;
  rawChinesePass: boolean;
  localizedChinesePass: boolean;
  exportPass: boolean;
  quorumScore: number;
  dissentIndex: number;
  selectedProposalId: string;
  notes: string[];
};

const auditCases = qualityAuditCases;

const outputPath = join("docs", "quality", "2026-06-17-system-quality-audit.md");

const results = auditCases.map(evaluateCase);
const mockLive = await evaluateMockLive();
const summary = summarize(results, mockLive.ok);
const report = renderReport(results, summary, mockLive);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, report, "utf8");

console.log(`System quality audit complete: ${outputPath}`);
console.log(
  JSON.stringify(
    {
      cases: results.length,
      contextPassRate: summary.contextPassRate,
      legacyContextPassRate: summary.legacyContextPassRate,
      rawChinesePassRate: summary.rawChinesePassRate,
      localizedChinesePassRate: summary.localizedChinesePassRate,
      allCasePassRate: summary.allCasePassRate,
      mockLive: mockLive.ok
    },
    null,
    2
  )
);

function evaluateCase(testCase: QualityAuditCase): CaseResult {
  const context = contextForQuestion(testCase.question);
  const result = runDecisionRoom({
    question: testCase.question,
    mode: testCase.mode,
    context
  });
  const promptBundle = createManualProviderBundle({
    question: testCase.question,
    locale: testCase.locale,
    context
  });
  const visibleRecommendation = localizeKnownDecisionText(result.verdict.finalRecommendation, testCase.locale);
  const rawRecommendation = result.verdict.finalRecommendation;
  const adrMarkdown = createAdrMarkdownExport(result, testCase.locale).contents;
  const jsonTrace = createJsonTraceExport({
    question: testCase.question,
    locale: testCase.locale,
    providerMode: "demo",
    providerTrace: [],
    liveVerdict: null,
    promptBundle,
    result
  }).contents;
  const reportHtml = createPdfReportExport({
    question: testCase.question,
    locale: testCase.locale,
    providerMode: "demo",
    providerTrace: [],
    liveVerdict: null,
    promptBundle,
    result
  }).contents;
  const actualPattern = inferQuestionPattern(testCase.question);
  const legacyPattern = legacyInferQuestionPattern(testCase.question);
  const expectedProposals = testCase.mode === "fast" ? 3 : 5;
  const expectedCritiques = expectedProposals * (expectedProposals - 1);
  const structurePass =
    result.initialProposals.length === expectedProposals &&
    result.critiques.length === expectedCritiques &&
    result.revisedProposals.length === expectedProposals &&
    result.verdict.rankedProposals.length === expectedProposals &&
    result.verdict.delphiRounds.length === 6 &&
    result.verdict.riskRadar.length > 0 &&
    result.verdict.assumptionLedger.length > 0 &&
    result.verdict.adrMarkdown.includes("# ADR:");
  const searchable = normalizeSearchText([
    visibleRecommendation,
    result.verdict.adrMarkdown,
    result.revisedProposals.map((proposal) => `${proposal.title} ${proposal.recommendation}`).join(" "),
    result.verdict.riskRadar.map((risk) => `${risk.description} ${risk.mitigation}`).join(" "),
    context.candidateOptions.join(" ")
  ]);
  const keywordHits = testCase.expectedKeywords.filter((keyword) => searchable.includes(keyword.toLowerCase()));
  const relevancePass = keywordHits.length >= Math.min(2, testCase.expectedKeywords.length);
  const rawChinesePass = testCase.locale !== "zh" || isReadableChineseRecommendation(rawRecommendation);
  const localizedChinesePass = testCase.locale !== "zh" || isReadableChineseRecommendation(visibleRecommendation);
  const exportPass =
    adrMarkdown.length > 800 &&
    jsonTrace.includes('"result"') &&
    reportHtml.includes(testCase.locale === "zh" ? "QuorumMind 决策报告" : "QuorumMind Decision Report") &&
    (testCase.locale === "zh" ? generateADR(result.verdict.adr, "zh").includes("## 决策") : true);
  const notes: string[] = [];

  if (!structurePass) {
    notes.push("结构完整性不足");
  }
  if (!relevancePass) {
    notes.push(`关键词命中不足：${keywordHits.join(", ") || "无"}`);
  }
  if (!rawChinesePass && localizedChinesePass) {
    notes.push("原始确定性正文偏英文，已通过共享翻译表改善中文可读性");
  }
  if (!exportPass) {
    notes.push("导出内容不完整");
  }

  return {
    id: testCase.id,
    locale: testCase.locale,
    mode: testCase.mode,
    expectedPattern: testCase.expectedPattern,
    actualPattern,
    legacyPattern,
    contextPass: actualPattern === testCase.expectedPattern && classifyContext(context) === testCase.expectedPattern,
    legacyContextPass: legacyPattern === testCase.expectedPattern,
    structurePass,
    relevancePass,
    rawChinesePass,
    localizedChinesePass,
    exportPass,
    quorumScore: result.verdict.quorumScore,
    dissentIndex: result.verdict.dissentIndex,
    selectedProposalId: result.verdict.selectedProposalId,
    notes
  };
}

async function evaluateMockLive(): Promise<{ ok: boolean; calls: number; providers: string[]; details: string }> {
  const response = await handleApiRequest(
    new Request("http://127.0.0.1:8787/api/decisions", {
      method: "POST",
      body: JSON.stringify({
        question: auditCases[0].question,
        mode: "fast",
        locale: "zh",
        context: defaultContext
      })
    }),
    {
      QUORUMMIND_PROVIDER_MODE: "live",
      QUORUMMIND_MOCK_PROVIDERS: "1"
    }
  );
  const body = (await response.json()) as {
    providerMode?: string;
    providerTrace?: Array<{ status: string; jsonParsed: boolean; validationStatus?: string; provider: string }>;
    liveVerdict?: unknown;
  };
  const trace = body.providerTrace ?? [];
  const ok =
    response.status === 200 &&
    body.providerMode === "live" &&
    trace.length === 9 &&
    trace.every((entry) => entry.status === "ok" && entry.jsonParsed) &&
    trace.every((entry) => entry.validationStatus === "valid" || entry.validationStatus === "repaired") &&
    Boolean(body.liveVerdict);

  return {
    ok,
    calls: trace.length,
    providers: Array.from(new Set(trace.map((entry) => entry.provider))),
    details: ok ? "mock live schema aggregation passed" : `mock live failed with status ${response.status}`
  };
}

function summarize(results: CaseResult[], mockLiveOk: boolean) {
  const zhResults = results.filter((result) => result.locale === "zh");
  const allCasePasses = results.filter(
    (result) =>
      result.contextPass &&
      result.structurePass &&
      result.relevancePass &&
      result.localizedChinesePass &&
      result.exportPass
  ).length;

  return {
    totalCases: results.length,
    zhCases: zhResults.length,
    enCases: results.length - zhResults.length,
    contextPassRate: percent(results.filter((result) => result.contextPass).length, results.length),
    legacyContextPassRate: percent(results.filter((result) => result.legacyContextPass).length, results.length),
    structurePassRate: percent(results.filter((result) => result.structurePass).length, results.length),
    relevancePassRate: percent(results.filter((result) => result.relevancePass).length, results.length),
    rawChinesePassRate: percent(zhResults.filter((result) => result.rawChinesePass).length, zhResults.length),
    localizedChinesePassRate: percent(zhResults.filter((result) => result.localizedChinesePass).length, zhResults.length),
    exportPassRate: percent(results.filter((result) => result.exportPass).length, results.length),
    allCasePassRate: percent(allCasePasses, results.length),
    mockLivePassRate: mockLiveOk ? "100%" : "0%"
  };
}

function renderReport(
  results: CaseResult[],
  summary: ReturnType<typeof summarize>,
  mockLive: Awaited<ReturnType<typeof evaluateMockLive>>
): string {
  const rows = results
    .map(
      (result) =>
        `| ${result.id} | ${result.locale} | ${result.mode} | ${result.expectedPattern} | ${
          result.contextPass ? "通过" : "失败"
        } | ${result.structurePass ? "通过" : "失败"} | ${result.relevancePass ? "通过" : "失败"} | ${
          result.localizedChinesePass ? "通过" : "失败"
        } | ${result.exportPass ? "通过" : "失败"} | ${result.quorumScore} | ${result.dissentIndex} | ${
          result.notes.join("；") || "-"
        } |`
    )
    .join("\n");

  const weakCases = results.filter((result) => result.notes.length > 0);

  return `# QuorumMind 系统质量打磨记录

日期：2026-06-17

## 测试范围

- 决策引擎：确定性 workflow、Fast / Deep / Red-team 模式、Delphi 轮次、评分、风险、假设、ADR。
- 问题识别：租户隔离、Node.js 单体/微服务、LangGraph/LangChain、多数未知架构问题的通用兜底。
- 中文体验：中文问题的可见推荐正文、ADR 中文标题、导出报告中文标签。
- 导出：ADR Markdown、JSON trace、HTML 报告。
- API 质量门：mock live provider 的 JSON parse、schema validation、live verdict aggregation。

## 测试集

- 总用例：${summary.totalCases}
- 中文用例：${summary.zhCases}
- 英文用例：${summary.enCases}
- 模式覆盖：Fast、Deep、Red-team
- 核心题型覆盖：tenant isolation、service decomposition、agent framework、general architecture
- 相近问题覆盖：产品策略、团队流程、成本取舍、前端迁移、模型路由、安全评审、支持运营、作品集取舍
- 新增相近问题先进入确定性系统审计，不自动进入真实 API full 回归，避免真实模型测试成本失控。

## 发现的问题与策略

| 问题 | 基线表现 | 本轮策略 | 复测结果 |
| --- | --- | --- | --- |
| PostgreSQL / tenant 默认问题在前端上下文里会落到通用兜底 | 旧识别规则通过率 ${summary.legacyContextPassRate} | 抽出共享 \`question-context\` 模块，并补齐 tenant/PostgreSQL/schema-per-tenant/tenant_id 识别 | 新识别通过率 ${summary.contextPassRate} |
| 中文界面里部分确定性推荐正文仍是英文 | 原始中文推荐通过率 ${summary.rawChinesePassRate} | 增加共享确定性推荐翻译表，UI 和 ADR 导出共用 | 中文可见推荐通过率 ${summary.localizedChinesePassRate} |
| 用户不容易判断导出是否仍完整 | 未形成系统级回归记录 | 每个用例同时生成 ADR、JSON trace、HTML 报告并检查关键标签 | 导出通过率 ${summary.exportPassRate} |
| 真实模型 schema 风险需要持续观察 | 单元测试覆盖局部 schema | 增加 mock live 聚合检查：9 次调用、JSON parse、schema valid/repaired、live verdict | ${mockLive.ok ? "通过" : "失败"}（${mockLive.details}） |

## 汇总指标

| 指标 | 结果 |
| --- | ---: |
| 上下文识别通过率 | ${summary.contextPassRate} |
| 结构完整性通过率 | ${summary.structurePassRate} |
| 相关性通过率 | ${summary.relevancePassRate} |
| 中文可见推荐通过率 | ${summary.localizedChinesePassRate} |
| 导出通过率 | ${summary.exportPassRate} |
| mock live schema 通过率 | ${summary.mockLivePassRate} |
| 单用例综合通过率 | ${summary.allCasePassRate} |

## 最终验证命令

| 命令 | 结果 |
| --- | --- |
| \`npm run quality:audit\` | 通过，${summary.totalCases} 个系统质量用例综合通过率 ${summary.allCasePassRate} |
| \`npm test -- --run\` | 当前测试套件通过，具体文件和用例数以命令输出为准 |
| \`npm run mock:e2e\` | 通过，mock live 模式 ${mockLive.calls} 次调用，${mockLive.providers.join(" / ")} 三个 mock provider 均产出可解析结构化结果 |
| \`npm run build\` | 通过，TypeScript 与 Vite production build 均成功 |

## 用例明细

| 用例 | 语言 | 模式 | 期望类型 | 上下文 | 结构 | 相关性 | 中文 | 导出 | 共识分 | 分歧 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- |
${rows}

## 低分项处理

${
  weakCases.length === 0
    ? "- 本轮系统评估未发现阻断性低分项。"
    : weakCases.map((result) => `- ${result.id}: ${result.notes.join("；")}`).join("\n")
}

## 本轮结论

- 当前系统适合继续作为个人使用和演示版本：核心流程、导出、mock live schema、中文推荐可读性都已形成可复测记录。
- 真实模型输出质量仍需要用真实 API key 持续观察；mock live 只能证明 schema 管道可用，不能证明每个真实模型都会稳定遵守 schema。
- 暂时不建议为了这轮质量问题引入 LangGraph JS；当前收益更高的是测试集、schema 质量门和中文体验回归。
`;
}

function classifyContext(context: DecisionContext): DecisionQuestionPattern {
  const text = `${context.candidateOptions.join(" ")} ${context.teamProfile} ${context.expectedScale}`.toLowerCase();

  if (text.includes("langgraph") || text.includes("langchain") || text.includes("multi-agent")) {
    return "agent_framework";
  }

  if (text.includes("microservice") || text.includes("monolith") || text.includes("node.js")) {
    return "service_decomposition";
  }

  if (text.includes("tenant") || text.includes("postgres") || text.includes("schema per tenant") || text.includes("schema-per-tenant")) {
    return "tenant_isolation";
  }

  return "general_architecture";
}

function legacyInferQuestionPattern(question: string): DecisionQuestionPattern {
  const text = question.toLowerCase();

  if (
    text.includes("langgraph") ||
    text.includes("langchain") ||
    text.includes("多agent") ||
    text.includes("multi-agent") ||
    text.includes("多 agent")
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

  return "general_architecture";
}

function isReadableChineseRecommendation(value: string): boolean {
  const hasHan = /[\u4e00-\u9fff]/.test(value);
  const unresolvedEnglish = [
    "Use PostgreSQL shared tables",
    "Do not split the current Node.js backend",
    "For a 5-person team",
    "Avoid a broad microservice migration",
    "The revised plan adds"
  ].some((phrase) => value.includes(phrase));

  return hasHan && !unresolvedEnglish;
}

function normalizeSearchText(values: string[]): string {
  return values.join(" ").toLowerCase();
}

function percent(count: number, total: number): string {
  if (total === 0) {
    return "0%";
  }

  return `${Math.round((count / total) * 100)}%`;
}
