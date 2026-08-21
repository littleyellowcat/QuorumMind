import { normalizeProviderPayload } from "../provider-schema";
import { parseProviderJson } from "../provider-json";
import type { DecisionContext } from "../../src/lib/domain";
import type { ModelProvider } from "./types";

export type ProviderCapabilityProbeInput = {
  provider: ModelProvider;
  sampleCount?: number;
  now?: () => number;
};

export type ProviderCapabilityProbeResult = {
  providerId: ModelProvider["id"];
  model: string;
  sampleCount: number;
  jsonSchemaStable: boolean;
  toolCallsAvailable: "unknown";
  longContextLimit: "unknown";
  priceTier: "unknown";
  failureRate: number;
  averageLatencyMs: number;
  repairRate: number;
  recommendedUseCases: string[];
};

const probeContext: DecisionContext = {
  productStage: "mvp",
  expectedScale: "probe",
  teamProfile: "QuorumMind capability probe",
  budgetSensitivity: "medium",
  reliabilityRequirement: "medium",
  securityRequirement: "medium",
  existingConstraints: ["Keep output JSON-only"],
  candidateOptions: ["A", "B"],
  assumptions: ["This is a bounded capability probe"]
};

export async function probeProviderCapability(
  input: ProviderCapabilityProbeInput
): Promise<ProviderCapabilityProbeResult> {
  const sampleCount = Math.max(1, Math.min(5, input.sampleCount ?? 3));
  const now = input.now ?? (() => Date.now());
  let failures = 0;
  let repaired = 0;
  let usable = 0;
  let latencyTotal = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const startedAt = now();
    try {
      const text = await input.provider.generateDecisionText({
        locale: "en",
        phase: "proposal",
        agentName: "Provider Capability Probe",
        agentRole: "principal_architect",
        question: "Return one architecture proposal JSON for capability probing.",
        context: probeContext
      });
      latencyTotal += now() - startedAt;
      const parsed = parseProviderJson(text);
      const normalized = parsed === undefined ? undefined : normalizeProviderPayload("proposal", parsed);
      if (!normalized?.ok) {
        failures += 1;
        continue;
      }
      usable += 1;
      if (normalized.validationStatus === "repaired") {
        repaired += 1;
      }
    } catch {
      latencyTotal += now() - startedAt;
      failures += 1;
    }
  }

  return {
    providerId: input.provider.id,
    model: input.provider.model,
    sampleCount,
    jsonSchemaStable: usable / sampleCount >= 0.66,
    toolCallsAvailable: "unknown",
    longContextLimit: "unknown",
    priceTier: "unknown",
    failureRate: failures / sampleCount,
    averageLatencyMs: Math.round(latencyTotal / sampleCount),
    repairRate: repaired / sampleCount,
    recommendedUseCases: usable / sampleCount >= 0.66 ? ["architecture_review", "adr_generation"] : ["manual_prompt_bundle"]
  };
}
