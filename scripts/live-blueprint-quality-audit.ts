import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { handleApiRequest } from "../server/decision-api";
import { getProviderStatus, providerRegistry, type Env } from "../server/providers/registry";
import { contextForQuestion } from "../src/lib/question-context";
import { createAuditHarness, type AuditRunSummary, type AuditTraceSummary } from "./audit-harness";
import type { AgentBlueprintApiResponse, BlueprintApiResponse, DecisionApiResponse } from "../src/lib/api-client";
import type { DecisionMode } from "../src/lib/domain";

type BlueprintLiveAuditCase = {
  id: string;
  question: string;
  locale: "zh" | "en";
  mode: DecisionMode;
  endpoint: "blueprint" | "agent";
  expectedKeywords: string[];
};

type BlueprintLiveCaseResult = {
  id: string;
  endpoint: BlueprintLiveAuditCase["endpoint"];
  locale: BlueprintLiveAuditCase["locale"];
  mode: DecisionMode;
  status: "passed" | "warning" | "failed" | "skipped";
  liveCalled: boolean;
  liveUsable: boolean;
  source: "live" | "fallback" | "error" | "skipped";
  calls: number;
  valid: number;
  repaired: number;
  invalid: number;
  schemaUsableRate: string;
  chinesePass: boolean | "n/a";
  relevancePass: boolean;
  detailPass: boolean;
  fallbackReason: string;
  consensusScore: number | null;
  latencyMs: number;
  notes: string[];
  traceSummary: AuditTraceSummary;
};

let env: Env = {};
let providerStatus: ReturnType<typeof getProviderStatus> = {};
let maxProviderRounds = 3;
let timeoutMs = 180_000;
let providerTimeoutMs = 90_000;
let mockAuditEnabled = false;
let auditHarness: ReturnType<typeof createAuditHarness<BlueprintLiveCaseResult>>;

async function runCases(cases: BlueprintLiveAuditCase[]): Promise<BlueprintLiveCaseResult[]> {
  const results: BlueprintLiveCaseResult[] = [];

  for (const [index, testCase] of cases.entries()) {
    const completed = auditHarness.completedResult(testCase.id);

    if (completed) {
      auditHarness.logResumeSkip(index + 1, cases.length, testCase.id);
      results.push(completed);
      continue;
    }

    if (auditHarness.shouldStopBeforeNextCase()) {
      break;
    }

    auditHarness.caseStart(index + 1, cases.length, testCase.id, {
      endpoint: testCase.endpoint,
      locale: testCase.locale,
      mode: testCase.mode,
      timeoutMs,
      providerTimeoutMs,
      maxProviderRounds
    });

    const result = await evaluateCase(testCase);
    results.push(result);
    auditHarness.caseResult(result);
  }

  return results;
}

async function evaluateCase(testCase: BlueprintLiveAuditCase): Promise<BlueprintLiveCaseResult> {
  const started = Date.now();
  const context = contextForQuestion(testCase.question);
  const path = testCase.endpoint === "agent" ? "/api/agent-runs/blueprint" : "/api/blueprints";

  try {
    const response = await withTimeout(
      handleApiRequest(
        new Request(`http://127.0.0.1:8787${path}`, {
          method: "POST",
          body: JSON.stringify({
            question: testCase.question,
            mode: testCase.mode,
            locale: testCase.locale,
            context,
            blueprintRuntime: {
              executionMode: "live",
              maxProviderRounds
            },
            agentRuntime:
              testCase.endpoint === "agent"
                ? {
                    threadId: `live-blueprint-audit-${testCase.id}`,
                    maxConsensusRounds: 3
                  }
                : undefined
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
    const body = (await response.json()) as Partial<BlueprintApiResponse & AgentBlueprintApiResponse> & { error?: string };

    if (!response.ok || body.error) {
      return errorCase(testCase, Date.now() - started, body.error ?? `HTTP ${response.status}`);
    }

    const trace = testCase.endpoint === "agent" ? body.run?.providerTrace ?? [] : body.providerTrace ?? [];
    const traceSummary = summarizeTrace(trace);
    const execution = testCase.endpoint === "agent" ? body.run?.liveModel : body.blueprintExecution;
    const result = testCase.endpoint === "agent" ? body.run?.result : body.result;
    const visibleText = normalizeSearchText([
      result?.finalSpec.title ?? "",
      result?.finalSpec.executiveSummary ?? "",
      result?.finalSpec.markdown ?? "",
      result?.finalSpec.detailedRecommendations.map((item) => `${item.title} ${item.reason}`).join(" ") ?? ""
    ]);
    const keywordHits = testCase.expectedKeywords.filter((keyword) => visibleText.includes(keyword.toLowerCase()));
    const relevancePass = keywordHits.length >= Math.min(2, testCase.expectedKeywords.length);
    const chinesePass = testCase.locale === "zh" ? isChineseAnswer(visibleText) : "n/a";
    const detailPass = Boolean(
      result &&
        result.finalSpec.workflowStages.length >= 5 &&
        result.finalSpec.schemas.length >= 3 &&
        result.finalSpec.detailedRecommendations.length >= 6 &&
        result.finalSpec.implementationBacklog.length >= 8 &&
        result.finalSpec.markdown.length >= 2500
    );
    const valid = trace.filter((entry) => entry.validationStatus === "valid").length;
    const repaired = trace.filter((entry) => entry.validationStatus === "repaired").length;
    const invalid = trace.filter(
      (entry) => entry.status === "error" || entry.validationStatus === "invalid" || entry.validationStatus === "unparsed"
    ).length;
    const liveCalled = Boolean(execution?.liveTraceAttempted || trace.length > 0);
    const liveUsable = Boolean(execution?.liveTraceUsable);
    const notes: string[] = [];

    if (!liveCalled) {
      notes.push("未实际调用真实模型。");
    }
    if (!liveUsable) {
      notes.push(`真实模型轨迹不可用：${execution?.fallbackReason ?? "unknown"}`);
    }
    if (repaired > 0) {
      notes.push(`${repaired} 次调用触发 schema 修复。`);
    }
    if (invalid > 0) {
      const invalidDetails = trace
        .filter((entry) => entry.status === "error" || entry.validationStatus === "invalid" || entry.validationStatus === "unparsed")
        .map((entry) =>
          [
            entry.phase,
            entry.provider,
            entry.model,
            entry.status,
            entry.validationStatus,
            entry.failureClass
          ]
            .filter(Boolean)
            .join("/")
        )
        .join(", ");
      notes.push(`${invalid} 次调用 invalid/unparsed/error：${invalidDetails || "未返回明细"}。`);
    }
    if (testCase.locale === "zh" && chinesePass !== true) {
      notes.push("中文输出检查未通过。");
    }
    if (!relevancePass) {
      notes.push(`相关关键词命中不足：${keywordHits.join(", ") || "无"}`);
    }
    if (!detailPass) {
      notes.push("蓝图详细度不足，工作流/schema/建议/任务清单或 Markdown 长度未达阈值。");
    }

    const status =
      liveCalled && liveUsable && relevancePass && detailPass && (testCase.locale !== "zh" || chinesePass === true)
        ? repaired > 0 || invalid > 0
          ? "warning"
          : "passed"
        : liveCalled
          ? "warning"
          : "failed";

    return {
      id: testCase.id,
      endpoint: testCase.endpoint,
      locale: testCase.locale,
      mode: testCase.mode,
      status,
      liveCalled,
      liveUsable,
      source: liveUsable ? "live" : "fallback",
      calls: trace.length,
      valid,
      repaired,
      invalid,
      schemaUsableRate: percent(valid + repaired, trace.length),
      chinesePass,
      relevancePass,
      detailPass,
      fallbackReason: execution?.fallbackReason ?? "-",
      consensusScore: result?.finalConsensusScore ?? null,
      latencyMs: Date.now() - started,
      notes,
      traceSummary
    };
  } catch (error) {
    return errorCase(testCase, Date.now() - started, error instanceof Error ? error.message : "Unknown Blueprint live audit error");
  }
}

function renderReport(input: {
  startedAt: Date;
  results: BlueprintLiveCaseResult[];
  summary: ReturnType<typeof summarize>;
  limit: number;
  selectedCaseIds: string[];
  missingCaseIds: string[];
  maxProviderRounds: number;
  timeoutMs: number;
  providerTimeoutMs: number;
  configuredProviders: Array<{ id: string; model: string }>;
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
        `| ${result.id} | ${result.endpoint} | ${result.locale} | ${result.mode} | ${result.status} | ${
          result.liveCalled ? "是" : "否"
        } | ${result.liveUsable ? "是" : "否"} | ${result.calls} | ${result.schemaUsableRate} | ${result.repaired} | ${
          result.invalid
        } | ${result.chinesePass} | ${result.relevancePass ? "通过" : "失败"} | ${result.detailPass ? "通过" : "失败"} | ${
          result.fallbackReason
        } | ${result.consensusScore ?? "-"} | ${result.latencyMs} | ${result.notes.join("；") || "-"} |`
    )
    .join("\n");

  return `# QuorumMind Live 蓝图质量回归

日期：${input.startedAt.toISOString().slice(0, 10)}

## 评估目标

- 验证蓝图室 / Agent 平台是否真的调用真实模型。
- 记录中文、相关性、schema 可用性、schema 修复、兜底原因。
- 判断最终蓝图是否足够详细，避免只输出概要。
- 验证来源透明：真实模型不可用时必须显示确定性兜底。

## 本轮运行参数

| 项目 | 值 |
| --- | ---: |
| 用例上限 | ${input.limit} |
| 用例过滤 | ${input.selectedCaseIds.length > 0 ? input.selectedCaseIds.join(", ") : "未启用"} |
| 未找到用例 | ${input.missingCaseIds.length > 0 ? input.missingCaseIds.join(", ") : "无"} |
| 最大 provider 阶段 | ${input.maxProviderRounds}/5 |
| 预计最大调用数 | ${input.limit * input.maxProviderRounds * Math.min(3, Math.max(1, input.configuredProviders.length || 3))} |
| 单用例超时 | ${input.timeoutMs}ms |
| 单 provider 超时 | ${input.providerTimeoutMs}ms |
| 已配置真实 provider | ${input.configuredProviders.map((provider) => provider.id).join(", ") || "无"} |
| Provider source | ${input.providerSource} |
| 进度 JSONL | ${input.runSummary.progressPath} |
| Resume | ${input.runSummary.resumeEnabled ? "启用" : "未启用"} |
| 已恢复用例 | ${input.runSummary.resumedCases} |
| 已完成 / 计划用例 | ${input.runSummary.completedCases}/${input.runSummary.plannedCases} |
| 全局最大运行时长 | ${input.runSummary.maxRuntimeMs > 0 ? `${input.runSummary.maxRuntimeMs}ms` : "未设置"} |
| 停止原因 | ${input.runSummary.stopReason} |

## Provider 配置状态

| Provider | 状态 | 模型 | 说明 |
| --- | --- | --- | --- |
${providerRows}

## 汇总指标

| 指标 | 结果 |
| --- | ---: |
| 运行用例 | ${input.results.length} |
| 真实模型调用率 | ${input.summary.liveCalledRate} |
| 可用真实轨迹率 | ${input.summary.liveUsableRate} |
| Schema 可用率 | ${input.summary.schemaUsableRate} |
| Schema 修复率 | ${input.summary.repairedRate} |
| 兜底率 | ${input.summary.fallbackRate} |
| 中文通过率 | ${input.summary.chinesePassRate} |
| 相关性通过率 | ${input.summary.relevancePassRate} |
| 蓝图详细度通过率 | ${input.summary.detailPassRate} |
| 功能可用率 | ${input.summary.usablePassRate} |
| 严格通过率 | ${input.summary.overallPassRate} |

## 用例明细

| 用例 | 端点 | 语言 | 模式 | 状态 | 真实调用 | 可用轨迹 | 调用数 | Schema 可用 | 修复 | 无效 | 中文 | 相关性 | 详细度 | 兜底原因 | 共识 | 耗时 ms | 备注 |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | --- |
${rows}

## 判读规则

- \`passed\`：真实调用、可用 live trace、中文/相关性/详细度通过，且无 invalid/unparsed/error。
- \`warning\`：有真实调用且功能可用，但存在 schema 修复、provider error、兜底、详细度或语言相关风险。
- \`failed\`：没有真实调用、请求失败、超时或只能得到错误。
- \`skipped\`：本地未配置真实 provider。

## 下一步

- 若“真实模型调用率”为 0，先检查 \`.env.local\`、\`QUORUMMIND_PROVIDER_MODE=live\` 和 provider key。
- 若“详细度通过率”低，优先加强 Blueprint provider prompt 和最终合成约束。
- 若“Schema 修复率”高，优先收紧 provider JSON schema 提示或增加 provider-specific repair。
`;
}

function summarize(results: BlueprintLiveCaseResult[]) {
  const runnable = results.filter((result) => result.status !== "skipped");
  const totalRunnable = runnable.length;
  const totalCalls = sum(results.map((result) => result.calls));
  const zh = runnable.filter((result) => result.locale === "zh");

  return {
    liveCalledRate: percent(runnable.filter((result) => result.liveCalled).length, totalRunnable),
    liveUsableRate: percent(runnable.filter((result) => result.liveUsable).length, totalRunnable),
    schemaUsableRate: percent(sum(results.map((result) => result.valid + result.repaired)), totalCalls),
    repairedRate: percent(sum(results.map((result) => result.repaired)), totalCalls),
    fallbackRate: percent(runnable.filter((result) => result.source === "fallback").length, totalRunnable),
    chinesePassRate: percent(zh.filter((result) => result.chinesePass === true).length, zh.length),
    relevancePassRate: percent(runnable.filter((result) => result.relevancePass).length, totalRunnable),
    detailPassRate: percent(runnable.filter((result) => result.detailPass).length, totalRunnable),
    usablePassRate: percent(runnable.filter((result) => result.status === "passed" || result.status === "warning").length, totalRunnable),
    overallPassRate: percent(runnable.filter((result) => result.status === "passed").length, totalRunnable)
  };
}

function skippedCase(testCase: BlueprintLiveAuditCase, reason: string): BlueprintLiveCaseResult {
  return {
    id: testCase.id,
    endpoint: testCase.endpoint,
    locale: testCase.locale,
    mode: testCase.mode,
    status: "skipped",
    liveCalled: false,
    liveUsable: false,
    source: "skipped",
    calls: 0,
    valid: 0,
    repaired: 0,
    invalid: 0,
    schemaUsableRate: "0%",
    chinesePass: testCase.locale === "zh" ? false : "n/a",
    relevancePass: false,
    detailPass: false,
    fallbackReason: "-",
    consensusScore: null,
    latencyMs: 0,
    notes: [reason],
    traceSummary: []
  };
}

function errorCase(testCase: BlueprintLiveAuditCase, latencyMs: number, reason: string): BlueprintLiveCaseResult {
  return {
    ...skippedCase(testCase, reason),
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

function isChineseAnswer(value: string): boolean {
  const normalized = value.replace(
    /\b(agent|schema|json|api|mvp|ui|ux|llm|rag|adr|pdf|markdown|yaml|sql|postgresql|node|js|typescript|react|langgraph|langchain|openai|deepseek|gemini|model|gateway|provider|trace|prompt|backlog|p[0-3]|id|vn)\b/gi,
    " "
  );
  const hanCharacters = normalized.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latinCharacters = normalized.match(/[A-Za-z]/g)?.length ?? 0;
  const chineseRatio = hanCharacters / Math.max(1, hanCharacters + latinCharacters);

  return hanCharacters >= 120 && chineseRatio >= 0.35;
}

function normalizeSearchText(values: string[]): string {
  return values.join(" ").toLowerCase();
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
    const timeout = setTimeout(() => reject(new Error(`Live Blueprint audit case timed out after ${timeoutMs}ms`)), timeoutMs);

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

function caseIdsFromEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

const auditCases: BlueprintLiveAuditCase[] = [
  {
    id: "vn-agent-workflow-zh",
    question: "我想做一个视觉类游戏，使用多 agent 处理小说文本，完整工作流是什么样，人物字段怎么设计？",
    locale: "zh",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["agent", "人物", "工作流", "schema"]
  },
  {
    id: "enterprise-feature-roadmap-zh",
    question: "我们 5 人团队未来 6 个月要快速交付企业客户功能，怎样设计产品研发工作流和优先级机制？",
    locale: "zh",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["企业", "优先级", "客户", "交付"]
  },
  {
    id: "ai-code-review-platform-zh",
    question: "我想做一个 AI 代码评审平台，多个模型互相挑刺，最后输出可执行修复建议，系统蓝图怎么设计？",
    locale: "zh",
    mode: "deep",
    endpoint: "agent",
    expectedKeywords: ["代码", "评审", "模型", "修复"]
  },
  {
    id: "knowledge-base-rag-zh",
    question: "公司内部知识库要做 RAG 问答，如何设计文档摄取、权限过滤、评估集和人工复审流程？",
    locale: "zh",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["rag", "权限", "评估", "文档"]
  },
  {
    id: "sales-crm-agent-zh",
    question: "我们要做一个销售 CRM 智能助手，自动总结客户、推荐下一步动作、提醒风险，蓝图怎么做？",
    locale: "zh",
    mode: "fast",
    endpoint: "blueprint",
    expectedKeywords: ["销售", "客户", "风险", "助手"]
  },
  {
    id: "data-quality-monitor-zh",
    question: "如何设计一个数据质量监控系统，能发现异常、定位负责人、生成修复工单并追踪闭环？",
    locale: "zh",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["数据", "异常", "工单", "质量"]
  },
  {
    id: "customer-support-agent-zh",
    question: "客服团队想用多 Agent 自动分流、检索知识库、生成回复并升级复杂问题，完整方案怎么设计？",
    locale: "zh",
    mode: "deep",
    endpoint: "agent",
    expectedKeywords: ["客服", "知识库", "升级", "回复"]
  },
  {
    id: "personal-learning-planner-zh",
    question: "我想做一个个人学习规划系统，根据目标、时间和反馈自动调整学习路径，字段和流程怎么设计？",
    locale: "zh",
    mode: "fast",
    endpoint: "blueprint",
    expectedKeywords: ["学习", "目标", "反馈", "路径"]
  },
  {
    id: "medical-triage-safe-zh",
    question: "做一个低风险医疗分诊辅助工具，如何设计安全边界、人工复核、免责声明和数据字段？",
    locale: "zh",
    mode: "red_team",
    endpoint: "blueprint",
    expectedKeywords: ["医疗", "安全", "人工", "风险"]
  },
  {
    id: "finance-report-agent-zh",
    question: "如何做一个财务月报 Agent，自动读取数据、解释波动、标注风险并生成管理层报告？",
    locale: "zh",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["财务", "月报", "风险", "报告"]
  },
  {
    id: "design-review-agent-zh",
    question: "我想做一个 UI 设计评审 Agent，检查一致性、可访问性、响应式和文案质量，蓝图怎么设计？",
    locale: "zh",
    mode: "deep",
    endpoint: "agent",
    expectedKeywords: ["设计", "可访问", "响应式", "文案"]
  },
  {
    id: "startup-pricing-strategy-zh",
    question: "SaaS 初创产品要设计定价实验系统，如何让多 Agent 评估套餐、成本、转化和客户反馈？",
    locale: "zh",
    mode: "fast",
    endpoint: "blueprint",
    expectedKeywords: ["定价", "套餐", "转化", "客户"]
  },
  {
    id: "security-incident-playbook-zh",
    question: "如何设计安全事件响应平台，让 Agent 协同研判告警、隔离风险、生成复盘和改进任务？",
    locale: "zh",
    mode: "red_team",
    endpoint: "blueprint",
    expectedKeywords: ["安全", "告警", "复盘", "风险"]
  },
  {
    id: "game-npc-dialogue-zh",
    question: "开放世界游戏想用 Agent 生成 NPC 对话和任务线，如何保证人设一致、剧情连续和可控审核？",
    locale: "zh",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["npc", "对话", "剧情", "审核"]
  },
  {
    id: "legal-contract-review-zh",
    question: "如何做合同审查辅助系统，抽取条款、识别风险、生成修改建议并保证人工律师最终确认？",
    locale: "zh",
    mode: "red_team",
    endpoint: "agent",
    expectedKeywords: ["合同", "条款", "风险", "人工"]
  },
  {
    id: "hr-interview-agent-zh",
    question: "HR 想用多 Agent 协助面试，生成问题、记录评价、校准偏见和输出候选人报告，怎么设计？",
    locale: "zh",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["面试", "候选人", "偏见", "报告"]
  },
  {
    id: "ops-runbook-agent-zh",
    question: "运维团队要把故障 Runbook 自动化，Agent 如何读取指标、判断原因、执行建议和升级人工？",
    locale: "zh",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["运维", "故障", "指标", "升级"]
  },
  {
    id: "research-literature-agent-zh",
    question: "如何设计论文阅读 Agent，自动检索、总结、对比实验、提取争议点并生成研究备忘录？",
    locale: "zh",
    mode: "fast",
    endpoint: "blueprint",
    expectedKeywords: ["论文", "实验", "争议", "备忘录"]
  },
  {
    id: "education-homework-feedback-zh",
    question: "教育产品想做作业批改和反馈 Agent，如何设计评分标准、错因分析、家长报告和安全边界？",
    locale: "zh",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["作业", "反馈", "评分", "安全"]
  },
  {
    id: "portfolio-generator-zh",
    question: "我想做一个作品集生成器，把项目经历转成简历亮点、案例页、面试讲稿和改进计划，蓝图怎么设计？",
    locale: "zh",
    mode: "deep",
    endpoint: "agent",
    expectedKeywords: ["作品集", "简历", "案例", "面试"]
  },
  {
    id: "multi-agent-vn-en",
    question: "Design a multi-agent workflow for converting novel chapters into a visual novel production package.",
    locale: "en",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["agent", "chapter", "workflow", "schema"]
  },
  {
    id: "rag-governance-en",
    question: "Design a RAG governance blueprint with ingestion, permissions, evaluation sets, and human review.",
    locale: "en",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["rag", "permissions", "evaluation", "review"]
  },
  {
    id: "incident-response-en",
    question: "Create a blueprint for an AI-assisted security incident response platform with escalation and postmortems.",
    locale: "en",
    mode: "red_team",
    endpoint: "agent",
    expectedKeywords: ["security", "incident", "escalation", "postmortem"]
  },
  {
    id: "pricing-experiment-en",
    question: "Design a pricing experiment system where agents evaluate packages, cost, conversion, and customer feedback.",
    locale: "en",
    mode: "fast",
    endpoint: "blueprint",
    expectedKeywords: ["pricing", "packages", "conversion", "feedback"]
  },
  {
    id: "agent-loop-governance-zh",
    question: "请设计一个多 Agent 循环治理平台，每轮独立回答、互评、修订、评估器打分，直到达到共识阈值或进入人工复审。",
    locale: "zh",
    mode: "deep",
    endpoint: "agent",
    expectedKeywords: ["agent", "循环", "共识", "复审"]
  },
  {
    id: "api-security-gate-zh",
    question: "帮我设计一个 API 发布安全门禁平台，覆盖鉴权、CORS、限流、请求体大小、日志脱敏、人工复审和回归测试。",
    locale: "zh",
    mode: "red_team",
    endpoint: "agent",
    expectedKeywords: ["api", "安全", "限流", "复审"]
  },
  {
    id: "contract-review-agent-zh",
    question: "如何做合同审查辅助系统，抽取条款、识别风险、生成修改建议，并保证律师人工确认后才能导出报告？",
    locale: "zh",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["合同", "条款", "风险", "人工"]
  },
  {
    id: "rag-eval-platform-zh",
    question: "设计一个 RAG 评估平台，检查答案忠实度、引用可追溯、权限过滤、失败样本回流和质量趋势。",
    locale: "zh",
    mode: "deep",
    endpoint: "agent",
    expectedKeywords: ["rag", "评估", "引用", "权限"]
  },
  {
    id: "agent-memory-system-zh",
    question: "设计一个 Agent 记忆系统，包含知识记忆、工作记忆、上下文压缩、checkpoint、人工校正和垃圾回收策略。",
    locale: "zh",
    mode: "deep",
    endpoint: "blueprint",
    expectedKeywords: ["agent", "记忆", "checkpoint", "压缩"]
  },
  {
    id: "autonomous-research-planner-zh",
    question: "我想做一个自主研究规划 Agent，能拆问题、查资料、生成假设、互评证据、输出研究备忘录和下一步实验。",
    locale: "zh",
    mode: "deep",
    endpoint: "agent",
    expectedKeywords: ["研究", "假设", "证据", "备忘录"]
  }
];

await main();

async function main(): Promise<void> {
  env = loadLocalEnv();
  providerStatus = getProviderStatus(env);
  mockAuditEnabled =
    (env.QUORUMMIND_BLUEPRINT_LIVE_AUDIT_ALLOW_MOCK ?? process.env.QUORUMMIND_BLUEPRINT_LIVE_AUDIT_ALLOW_MOCK) === "1" &&
    (env.QUORUMMIND_MOCK_PROVIDERS ?? process.env.QUORUMMIND_MOCK_PROVIDERS) === "1";
  const configuredProviders = mockAuditEnabled
    ? mockConfiguredProviders()
    : Object.values(providerStatus).filter((provider) => provider.implemented && provider.configured);
  const requestedCaseIds = caseIdsFromEnv(env.QUORUMMIND_BLUEPRINT_LIVE_AUDIT_CASE_IDS ?? process.env.QUORUMMIND_BLUEPRINT_LIVE_AUDIT_CASE_IDS);
  const candidateCases =
    requestedCaseIds.length > 0
      ? auditCases.filter((testCase) => requestedCaseIds.includes(testCase.id))
      : auditCases;
  const missingCaseIds = requestedCaseIds.filter((id) => !candidateCases.some((testCase) => testCase.id === id));
  const limit = boundedInteger(
    env.QUORUMMIND_BLUEPRINT_LIVE_AUDIT_LIMIT ?? process.env.QUORUMMIND_BLUEPRINT_LIVE_AUDIT_LIMIT,
    Math.min(20, candidateCases.length),
    1,
    Math.max(1, candidateCases.length)
  );
  maxProviderRounds = boundedInteger(
    env.QUORUMMIND_BLUEPRINT_LIVE_AUDIT_MAX_PROVIDER_ROUNDS ?? process.env.QUORUMMIND_BLUEPRINT_LIVE_AUDIT_MAX_PROVIDER_ROUNDS,
    3,
    1,
    5
  );
  timeoutMs = boundedInteger(
    env.QUORUMMIND_BLUEPRINT_LIVE_AUDIT_TIMEOUT_MS ?? process.env.QUORUMMIND_BLUEPRINT_LIVE_AUDIT_TIMEOUT_MS,
    180_000,
    10_000,
    900_000
  );
  providerTimeoutMs = boundedInteger(
    env.QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS ?? process.env.QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS,
    90_000,
    5_000,
    300_000
  );
  const selectedCases = candidateCases.slice(0, limit);

  installFetchTimeout(providerTimeoutMs);

  const startedAt = new Date();
  const outputPath = blueprintAuditOutputPath(requestedCaseIds, startedAt);
  auditHarness = createAuditHarness<BlueprintLiveCaseResult>({
    kind: "live-blueprint-quality-audit",
    startedAt,
    selectedCaseIds: requestedCaseIds,
    env,
    progressPathEnvKey: "QUORUMMIND_BLUEPRINT_LIVE_AUDIT_PROGRESS_PATH",
    resumeEnvKey: "QUORUMMIND_BLUEPRINT_LIVE_AUDIT_RESUME",
    maxRuntimeEnvKey: "QUORUMMIND_BLUEPRINT_LIVE_AUDIT_MAX_RUNTIME_MS",
    defaultMaxRuntimeMs: boundedInteger(
      env.QUORUMMIND_BLUEPRINT_LIVE_AUDIT_MAX_RUNTIME_MS ?? process.env.QUORUMMIND_BLUEPRINT_LIVE_AUDIT_MAX_RUNTIME_MS,
      0,
      0,
      86_400_000
    ),
    plannedCases: selectedCases.length
  });
  const results =
    configuredProviders.length === 0
      ? recordSkippedCases(selectedCases, "未检测到已实现且已配置的真实 provider。")
      : await runCases(selectedCases);
  const runSummary = auditHarness.summary(results);
  const summary = summarize(results);
  const report = renderReport({
    startedAt,
    results,
    summary,
    limit,
    selectedCaseIds: requestedCaseIds,
    missingCaseIds,
    maxProviderRounds,
    timeoutMs,
    providerTimeoutMs,
    configuredProviders,
    runSummary,
    providerSource: mockAuditEnabled ? "mock" : "real"
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, report, "utf8");

  console.log(`Live Blueprint quality audit complete: ${outputPath}`);
  console.log(
    JSON.stringify(
      {
        cases: results.length,
        selectedCaseIds: requestedCaseIds,
        missingCaseIds,
        configuredProviders: configuredProviders.map((provider) => provider.id),
        providerSource: mockAuditEnabled ? "mock" : "real",
        maxProviderRounds,
        progressPath: runSummary.progressPath,
        resumeEnabled: runSummary.resumeEnabled,
        resumedCases: runSummary.resumedCases,
        completedCases: runSummary.completedCases,
        plannedCases: runSummary.plannedCases,
        stopReason: runSummary.stopReason,
        liveCalledRate: summary.liveCalledRate,
        liveUsableRate: summary.liveUsableRate,
        schemaUsableRate: summary.schemaUsableRate,
        chinesePassRate: summary.chinesePassRate,
        relevancePassRate: summary.relevancePassRate,
        detailPassRate: summary.detailPassRate,
        fallbackRate: summary.fallbackRate,
        usablePassRate: summary.usablePassRate,
        overallPassRate: summary.overallPassRate
      },
      null,
      2
    )
  );
}

function recordSkippedCases(cases: BlueprintLiveAuditCase[], reason: string): BlueprintLiveCaseResult[] {
  const results = cases.map((testCase) => skippedCase(testCase, reason));

  for (const result of results) {
    auditHarness.caseResult(result);
  }

  return results;
}

function mockConfiguredProviders(): Array<{ id: string; model: string }> {
  return [
    {
      id: "openai",
      model: "mock-gpt-seat"
    },
    {
      id: "deepseek",
      model: "mock-deepseek-seat"
    },
    {
      id: "gemini",
      model: "mock-gemini-seat"
    }
  ];
}

function blueprintAuditOutputPath(caseIds: string[], startedAt: Date): string {
  const caseSuffix = caseIds.length > 0 ? "-filtered" : "";

  return join("docs", "quality", `${startedAt.toISOString().slice(0, 10)}-live-blueprint-quality-audit${caseSuffix}.md`);
}
