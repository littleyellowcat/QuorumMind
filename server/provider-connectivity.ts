import type { DecisionContext } from "../src/lib/domain";
import { parseProviderJson } from "./provider-json";
import { normalizeProviderPayload, type ProviderValidationIssue } from "./provider-schema";
import { createConfiguredProviders, getProviderStatus, type Env } from "./providers/registry";
import type { ImplementedProviderId, ModelProvider } from "./providers/types";

export type ProviderConnectionTestResult = {
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

const targetProviders: ImplementedProviderId[] = ["openai", "deepseek", "gemini"];

const connectionTestContext: DecisionContext = {
  productStage: "mvp",
  expectedScale: "20-50 enterprise tenants",
  teamProfile: "Small full-stack team",
  budgetSensitivity: "medium",
  reliabilityRequirement: "medium",
  securityRequirement: "medium",
  existingConstraints: ["Use the current TypeScript stack", "Keep the test cheap"],
  candidateOptions: ["Keep the current architecture", "Introduce a staged migration"],
  assumptions: ["This is a connectivity and schema smoke test, not a business recommendation"]
};

export async function testProviderConnections(env: Env): Promise<ProviderConnectionTestResult[]> {
  const providers = createConfiguredProviders(env).slice(0, 3);
  const providerById = new Map<ImplementedProviderId, ModelProvider>();

  for (const provider of providers) {
    if (!providerById.has(provider.id) && targetProviders.includes(provider.id)) {
      providerById.set(provider.id, provider);
    }
  }

  const status = getProviderStatus(env);

  return Promise.all(
    targetProviders.map((providerId) => {
      const provider = providerById.get(providerId);

      if (!provider) {
        return Promise.resolve({
          provider: providerId,
          model: status[providerId].model,
          configured: false,
          responded: false,
          jsonParsed: false,
          schemaUsable: false,
          validationStatus: "not_configured" as const,
          durationMs: 0,
          failureReason: "Provider is not configured for the current live model seats.",
          validationIssues: []
        });
      }

      return testSingleProvider(provider, providerTestTimeoutMs(env));
    })
  );
}

async function testSingleProvider(provider: ModelProvider, timeoutMs: number): Promise<ProviderConnectionTestResult> {
  const startedAt = Date.now();

  try {
    const text = await withTimeout(
      provider.generateDecisionText({
        locale: "zh",
        mode: "fast",
        phase: "proposal",
        agentName: "Provider Connection Tester",
        agentRole: "principal_architect",
        agentWeight: 1,
        scoringFocus: ["connectivity", "schema validity"],
        question: "连接测试：请返回一个简短、有效的架构提案 JSON，用于验证模型是否可用。",
        context: connectionTestContext
      }),
      timeoutMs,
      `${provider.id} provider test timed out after ${timeoutMs}ms`
    );
    const parsed = parseProviderJson(text);
    const schema = parsed === undefined ? undefined : normalizeProviderPayload("proposal", parsed);
    const schemaUsable = Boolean(schema?.ok);

    return {
      provider: provider.id,
      model: provider.model,
      configured: true,
      responded: true,
      jsonParsed: parsed !== undefined,
      schemaUsable,
      validationStatus: schema?.validationStatus ?? "unparsed",
      durationMs: Date.now() - startedAt,
      failureReason: schemaUsable ? undefined : schemaIssueSummary(schema?.issues) ?? "Provider response was not usable JSON.",
      validationIssues: schema?.issues ?? []
    };
  } catch (error) {
    return {
      provider: provider.id,
      model: provider.model,
      configured: true,
      responded: false,
      jsonParsed: false,
      schemaUsable: false,
      validationStatus: "error",
      durationMs: Date.now() - startedAt,
      failureReason: truncateReason(error instanceof Error ? error.message : "Unknown provider connectivity error"),
      validationIssues: []
    };
  }
}

function providerTestTimeoutMs(env: Env): number {
  const parsed = Number(env.QUORUMMIND_PROVIDER_TEST_TIMEOUT_MS);

  return Number.isInteger(parsed) && parsed >= 5_000 && parsed <= 120_000 ? parsed : 30_000;
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
