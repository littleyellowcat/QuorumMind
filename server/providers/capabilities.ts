import { providerRegistry } from "./registry";
import type { ProviderId } from "./types";

export type ProviderCapabilityValue = boolean | "model_dependent" | "proxy_dependent" | "unknown";
export type ProviderImplementationStatus = "implemented" | "reserved" | "local_reserved";

export type ProviderCapability = {
  providerId: ProviderId;
  displayName: string;
  implementationStatus: ProviderImplementationStatus;
  capabilitySource: "adapter_verified" | "documented_not_verified" | "unknown";
  transport: "api" | "local";
  supportsJsonSchema: ProviderCapabilityValue;
  supportsToolCalls: ProviderCapabilityValue;
  supportsLongContext: ProviderCapabilityValue;
  supportsLowCostMode: ProviderCapabilityValue;
  notes: string[];
};

export type ProviderCapabilityMatrix = Record<ProviderId, ProviderCapability>;

const capabilityOverrides: Partial<Record<ProviderId, Partial<ProviderCapability>>> = {
  model_gateway: {
    supportsJsonSchema: "proxy_dependent",
    supportsToolCalls: "proxy_dependent",
    supportsLongContext: "proxy_dependent",
    supportsLowCostMode: "proxy_dependent"
  },
  openai: {
    supportsJsonSchema: true,
    supportsToolCalls: true,
    supportsLongContext: true,
    supportsLowCostMode: true
  },
  deepseek: {
    supportsJsonSchema: true,
    supportsToolCalls: false,
    supportsLongContext: true,
    supportsLowCostMode: true
  },
  gemini: {
    supportsJsonSchema: true,
    supportsToolCalls: true,
    supportsLongContext: true,
    supportsLowCostMode: true
  },
  anthropic: {
    supportsJsonSchema: true,
    supportsToolCalls: true,
    supportsLongContext: true,
    supportsLowCostMode: false
  },
  openrouter: {
    supportsJsonSchema: "model_dependent",
    supportsToolCalls: "model_dependent",
    supportsLongContext: "model_dependent",
    supportsLowCostMode: "model_dependent"
  },
  ollama: {
    supportsJsonSchema: "model_dependent",
    supportsToolCalls: "model_dependent",
    supportsLongContext: "model_dependent",
    supportsLowCostMode: true
  },
  lmstudio: {
    supportsJsonSchema: "model_dependent",
    supportsToolCalls: "model_dependent",
    supportsLongContext: "model_dependent",
    supportsLowCostMode: true
  }
};

export function getProviderCapabilityMatrix(): ProviderCapabilityMatrix {
  return Object.fromEntries(
    providerRegistry.map((entry) => {
      const base: ProviderCapability = {
        providerId: entry.id,
        displayName: entry.displayName,
        implementationStatus: entry.implemented ? "implemented" : entry.kind === "local" ? "local_reserved" : "reserved",
        capabilitySource: entry.implemented ? "adapter_verified" : entry.id in capabilityOverrides ? "documented_not_verified" : "unknown",
        transport: entry.kind,
        supportsJsonSchema: "unknown",
        supportsToolCalls: "unknown",
        supportsLongContext: "unknown",
        supportsLowCostMode: entry.kind === "local",
        notes: [
          entry.implemented
            ? "Callable through the current QuorumMind provider adapter."
            : "Reserved slot only; QuorumMind will not call this provider until an adapter is implemented.",
          entry.notes
        ]
      };

      return [
        entry.id,
        {
          ...base,
          ...capabilityOverrides[entry.id]
        }
      ];
    })
  ) as ProviderCapabilityMatrix;
}
