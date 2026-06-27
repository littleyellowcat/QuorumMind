import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DecisionContext } from "../src/lib/domain";
import { parseProviderJson } from "../server/provider-json";
import { normalizeProviderPayload, type ProviderValidationIssue } from "../server/provider-schema";
import { createModelGatewayProvider } from "../server/providers/model-gateway";
import { createDeepSeekProvider } from "../server/providers/deepseek";
import { createGeminiProvider } from "../server/providers/gemini";
import { createOpenAIProvider } from "../server/providers/openai";
import { getProviderStatus, type Env } from "../server/providers/registry";
import type { ImplementedProviderId, ModelProvider } from "../server/providers/types";

type DeepConnectivityResult = {
  seatId: string;
  provider: ImplementedProviderId;
  model: string;
  configured: boolean;
  responded: boolean;
  jsonParsed: boolean;
  schemaUsable: boolean;
  validationStatus: "valid" | "repaired" | "invalid" | "unparsed" | "not_configured" | "error";
  durationMs: number;
  failureReason?: string;
  validationIssues: ProviderValidationIssue[];
};

const connectivityContext: DecisionContext = {
  productStage: "mvp",
  expectedScale: "20-50 enterprise tenants",
  teamProfile: "Small full-stack team",
  budgetSensitivity: "medium",
  reliabilityRequirement: "medium",
  securityRequirement: "medium",
  existingConstraints: ["Keep this connectivity test cheap", "Return concise JSON"],
  candidateOptions: ["Keep current architecture", "Introduce staged migration"],
  assumptions: ["This is a provider health check, not a production decision"]
};

const startedAt = new Date();
const env = loadLocalEnv();
const timeoutMs = boundedInteger(env.QUORUMMIND_PROVIDER_DEEP_TEST_TIMEOUT_MS ?? process.env.QUORUMMIND_PROVIDER_DEEP_TEST_TIMEOUT_MS, 60_000, 5_000, 180_000);
const seats = buildProviderSeats(env);
const results = await runDeepConnectivity(seats, timeoutMs);
const summary = summarize(results);
const reportPath = join("docs", "quality", `${formatDate(startedAt)}-provider-deep-connectivity-audit.md`);
const jsonPath = join("output", "provider-connectivity", `${formatDate(startedAt)}-provider-deep-connectivity-audit.json`);

mkdirSync(dirname(reportPath), { recursive: true });
mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(reportPath, renderReport({ startedAt, timeoutMs, results, summary, providerStatus: getProviderStatus(env), jsonPath }), "utf8");
writeFileSync(jsonPath, JSON.stringify({ startedAt: startedAt.toISOString(), timeoutMs, summary, results }, null, 2), "utf8");

console.log(`Provider deep connectivity audit complete: ${reportPath}`);
console.log(JSON.stringify({ timeoutMs, ...summary }, null, 2));

if (summary.configured > 0 && summary.schemaUsable === 0) {
  process.exitCode = 1;
}

async function runDeepConnectivity(
  providerSeats: Array<{ seatId: string; provider: ModelProvider }>,
  timeout: number
): Promise<DeepConnectivityResult[]> {
  const results: DeepConnectivityResult[] = [];

  for (const seat of providerSeats) {
    results.push(await testSeat(seat.seatId, seat.provider, timeout));
  }

  return results;
}

async function testSeat(seatId: string, provider: ModelProvider, timeout: number): Promise<DeepConnectivityResult> {
  const started = Date.now();

  try {
    const text = await withTimeout(
      provider.generateDecisionText({
        locale: "zh",
        mode: "fast",
        phase: "proposal",
        agentName: "Provider Deep Connectivity Tester",
        agentRole: "principal_architect",
        agentWeight: 1,
        scoringFocus: ["connectivity", "json schema", "low cost"],
        question: "连接深测：请只返回一个很短的有效 JSON 架构提案，用于验证模型是否能稳定返回 schema。",
        context: connectivityContext
      }),
      timeout,
      `${seatId} timed out after ${timeout}ms`
    );
    const parsed = parseProviderJson(text);
    const schema = parsed === undefined ? undefined : normalizeProviderPayload("proposal", parsed);
    const schemaUsable = Boolean(schema?.ok);

    return {
      seatId,
      provider: provider.id,
      model: provider.model,
      configured: true,
      responded: true,
      jsonParsed: parsed !== undefined,
      schemaUsable,
      validationStatus: schema?.validationStatus ?? "unparsed",
      durationMs: Date.now() - started,
      failureReason: schemaUsable ? undefined : schemaIssueSummary(schema?.issues) ?? "Provider response was not usable JSON.",
      validationIssues: schema?.issues ?? []
    };
  } catch (error) {
    return {
      seatId,
      provider: provider.id,
      model: provider.model,
      configured: true,
      responded: false,
      jsonParsed: false,
      schemaUsable: false,
      validationStatus: "error",
      durationMs: Date.now() - started,
      failureReason: truncateReason(error instanceof Error ? error.message : "Unknown provider connectivity error"),
      validationIssues: []
    };
  }
}

function buildProviderSeats(currentEnv: Env): Array<{ seatId: string; provider: ModelProvider }> {
  const seats: Array<{ seatId: string; provider: ModelProvider }> = [];
  const gatewayApiKey = currentEnv.MODEL_GATEWAY_API_KEY;
  const gatewayBaseUrl = currentEnv.MODEL_GATEWAY_BASE_URL;

  if (gatewayApiKey && gatewayBaseUrl) {
    const namedGatewayModels = [
      currentEnv.MODEL_GATEWAY_GPT_MODEL,
      currentEnv.MODEL_GATEWAY_DEEPSEEK_MODEL,
      currentEnv.MODEL_GATEWAY_GEMINI_MODEL
    ].flatMap((model) => (model ? [model] : []));
    const gatewayModels = currentEnv.MODEL_GATEWAY_MODELS
      ? modelsFromCommaSeparatedValue(currentEnv.MODEL_GATEWAY_MODELS)
      : namedGatewayModels.length > 0
        ? namedGatewayModels
        : modelsFromCommaSeparatedValue("gpt-4o-mini,deepseek-chat,gemini-2.0-flash-lite");
    const gatewayProviderIds: ImplementedProviderId[] = ["openai", "deepseek", "gemini"];

    gatewayModels.forEach((model, index) => {
      const providerId = gatewayProviderIds[index] ?? "model_gateway";
      seats.push({
        seatId: `model_gateway:${providerId}:${model}`,
        provider: createModelGatewayProvider({
          apiKey: gatewayApiKey,
          baseUrl: gatewayBaseUrl,
          model,
          providerId
        })
      });
    });
  } else {
    if (currentEnv.OPENAI_API_KEY) {
      const model = currentEnv.OPENAI_MODEL ?? "gpt-4o-mini";
      seats.push({
        seatId: `openai:${model}`,
        provider: createOpenAIProvider({ apiKey: currentEnv.OPENAI_API_KEY, model })
      });
    }

    if (currentEnv.DEEPSEEK_API_KEY) {
      const model = currentEnv.DEEPSEEK_MODEL ?? "deepseek-chat";
      seats.push({
        seatId: `deepseek:${model}`,
        provider: createDeepSeekProvider({ apiKey: currentEnv.DEEPSEEK_API_KEY, model })
      });
    }

    if (currentEnv.GEMINI_API_KEY) {
      const model = currentEnv.GEMINI_MODEL ?? "gemini-2.0-flash-lite";
      seats.push({
        seatId: `gemini:${model}`,
        provider: createGeminiProvider({ apiKey: currentEnv.GEMINI_API_KEY, model })
      });
    }
  }

  return seats;
}

function summarize(items: DeepConnectivityResult[]) {
  const configured = items.filter((item) => item.configured).length;
  const responded = items.filter((item) => item.responded).length;
  const jsonParsed = items.filter((item) => item.jsonParsed).length;
  const schemaUsable = items.filter((item) => item.schemaUsable).length;
  const repaired = items.filter((item) => item.validationStatus === "repaired").length;
  const failedSeats = items.filter((item) => !item.schemaUsable).map((item) => ({
    seatId: item.seatId,
    model: item.model,
    reason: item.failureReason ?? item.validationStatus
  }));

  return {
    seats: items.length,
    configured,
    responded,
    jsonParsed,
    schemaUsable,
    repaired,
    failedSeats,
    respondedRate: percent(responded, configured),
    jsonParseRate: percent(jsonParsed, configured),
    schemaUsableRate: percent(schemaUsable, configured)
  };
}

function renderReport(input: {
  startedAt: Date;
  timeoutMs: number;
  results: DeepConnectivityResult[];
  summary: ReturnType<typeof summarize>;
  providerStatus: ReturnType<typeof getProviderStatus>;
  jsonPath: string;
}): string {
  const providerRows = Object.values(input.providerStatus)
    .filter((provider) => provider.implemented)
    .map((provider) => `| ${provider.id} | ${provider.configured ? "已配置" : "未配置"} | ${provider.model} | ${provider.notes} |`)
    .join("\n");
  const rows = input.results
    .map(
      (result) =>
        `| ${result.seatId} | ${result.provider} | ${result.model} | ${result.responded ? "是" : "否"} | ${result.jsonParsed ? "是" : "否"} | ${result.schemaUsable ? "是" : "否"} | ${result.validationStatus} | ${result.durationMs} | ${result.failureReason ?? "-"} |`
    )
    .join("\n");

  return `# QuorumMind Provider 深度连通性审计

日期：${formatDate(input.startedAt)}

## 目标

逐个真实 provider/model seat 发送最小 JSON schema prompt，验证模型是否能响应、是否能解析 JSON、是否能通过 QuorumMind proposal schema。

本报告不记录任何 API key。

## 参数

| 项目 | 值 |
| --- | ---: |
| 单模型超时 | ${input.timeoutMs}ms |
| 检测 seat 数 | ${input.summary.seats} |
| 输出 JSON | \`${input.jsonPath}\` |

## Provider 状态

| Provider | 状态 | 模型 | 说明 |
| --- | --- | --- | --- |
${providerRows}

## 汇总

| 指标 | 结果 |
| --- | ---: |
| seat 数 | ${input.summary.seats} |
| configured | ${input.summary.configured} |
| responded | ${input.summary.responded} |
| JSON parsed | ${input.summary.jsonParsed} |
| schema usable | ${input.summary.schemaUsable} |
| repaired | ${input.summary.repaired} |
| 响应率 | ${input.summary.respondedRate} |
| JSON 解析率 | ${input.summary.jsonParseRate} |
| Schema 可用率 | ${input.summary.schemaUsableRate} |

## 明细

| Seat | Provider | Model | 响应 | JSON | Schema | Validation | 耗时 ms | 失败原因 |
| --- | --- | --- | --- | --- | --- | --- | ---: | --- |
${rows}

## 判读

- Schema=是：该模型可作为 QuorumMind live provider seat 使用。
- Validation=repaired：模型输出可修复，但应继续观察。
- 响应=否 或 Schema=否：不建议放在 live seat 前排；会拖低严格质量门。
`;
}

function loadLocalEnv(): Env {
  const fileEnv: Env = {};

  for (const file of [".env.local", ".env"]) {
    try {
      const contents = readFileSync(file, "utf8");

      for (const line of contents.split(/\r?\n/)) {
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
    } catch {
      // Optional env files.
    }
  }

  return { ...fileEnv, ...process.env };
}

function modelsFromCommaSeparatedValue(value: string): string[] {
  return value
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function schemaIssueSummary(issues: ProviderValidationIssue[] | undefined): string | undefined {
  if (!issues?.length) {
    return undefined;
  }

  return truncateReason(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
}

function truncateReason(value: string): string {
  return value.length > 240 ? `${value.slice(0, 237)}...` : value;
}

function percent(count: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }

  return `${Math.round((count / total) * 100)}%`;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);

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
