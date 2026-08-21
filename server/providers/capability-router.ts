import { getProviderCapabilityMatrix, type ProviderCapability, type ProviderCapabilityMatrix, type ProviderCapabilityValue } from "./capabilities";
import { getProviderStatus, type Env, type ProviderStatus } from "./registry";
import type { ProviderId } from "./types";

export type ProviderRoutingRequirements = {
  jsonSchema?: boolean;
  toolCalls?: boolean;
  longContext?: boolean;
  lowCost?: boolean;
  localOnly?: boolean;
  maxSeats?: number;
};

export type ProviderRoutingInput = {
  task: string;
  requirements?: ProviderRoutingRequirements;
  providerStatus?: Record<string, ProviderStatus>;
  capabilityMatrix?: ProviderCapabilityMatrix;
};

export type ProviderSeatRoute = {
  providerId: ProviderId;
  displayName: string;
  model: string;
  transport: "api" | "local";
  score: number;
  rationale: string[];
  capabilityWarnings: string[];
};

export type ExcludedProviderSeat = {
  providerId: string;
  displayName: string;
  reason: string;
};

export type ProviderRoutingResult = {
  task: string;
  requirements: Required<ProviderRoutingRequirements>;
  selectedSeats: ProviderSeatRoute[];
  excludedSeats: ExcludedProviderSeat[];
  capabilityWarnings: string[];
  explanation: string;
};

export function routeProviderSeats(input: ProviderRoutingInput): ProviderRoutingResult {
  const requirements = normalizeRequirements(input.requirements);
  const matrix = input.capabilityMatrix ?? getProviderCapabilityMatrix();
  const providerStatus = input.providerStatus ?? {};
  const selected: ProviderSeatRoute[] = [];
  const excluded: ExcludedProviderSeat[] = [];

  for (const status of Object.values(providerStatus)) {
    const capability = matrix[status.id];
    if (!capability) {
      excluded.push({
        providerId: status.id,
        displayName: status.displayName,
        reason: "No capability matrix entry is available."
      });
      continue;
    }

    const exclusion = exclusionReason(status, capability, requirements);
    if (exclusion) {
      excluded.push({
        providerId: status.id,
        displayName: status.displayName,
        reason: exclusion
      });
      continue;
    }

    selected.push(scoreProviderSeat(status, capability, requirements));
  }

  const sorted = selected
    .sort((a, b) => b.score - a.score || a.providerId.localeCompare(b.providerId))
    .slice(0, requirements.maxSeats);
  const warnings = [...new Set(sorted.flatMap((seat) => seat.capabilityWarnings))];

  return {
    task: input.task,
    requirements,
    selectedSeats: sorted,
    excludedSeats: excluded.sort((a, b) => a.providerId.localeCompare(b.providerId)),
    capabilityWarnings: warnings,
    explanation: `Provider route for ${input.task}: selected ${sorted.length} configured model seat${sorted.length === 1 ? "" : "s"} using capability matrix requirements.`
  };
}

export function routeProviderSeatsForEnv(input: {
  env: Env;
  task: string;
  requirements?: ProviderRoutingRequirements;
}): ProviderRoutingResult {
  return routeProviderSeats({
    task: input.task,
    requirements: input.requirements,
    providerStatus: getProviderStatus(input.env),
    capabilityMatrix: getProviderCapabilityMatrix()
  });
}

function normalizeRequirements(requirements: ProviderRoutingRequirements = {}): Required<ProviderRoutingRequirements> {
  return {
    jsonSchema: requirements.jsonSchema ?? false,
    toolCalls: requirements.toolCalls ?? false,
    longContext: requirements.longContext ?? false,
    lowCost: requirements.lowCost ?? false,
    localOnly: requirements.localOnly ?? false,
    maxSeats: Math.max(1, Math.min(8, Math.round(requirements.maxSeats ?? 3)))
  };
}

function exclusionReason(
  status: ProviderStatus,
  capability: ProviderCapability,
  requirements: Required<ProviderRoutingRequirements>
): string | undefined {
  if (!status.implemented || capability.implementationStatus !== "implemented") {
    return "Provider is not implemented in QuorumMind yet.";
  }

  if (!status.configured) {
    return "Provider is not configured in this environment.";
  }

  if (status.policy?.effect === "deny") {
    return `Provider policy denied this model: ${status.policy.reason}`;
  }

  if (requirements.localOnly && status.kind !== "local") {
    return "Excluded because this route is local-only.";
  }

  return undefined;
}

function scoreProviderSeat(
  status: ProviderStatus,
  capability: ProviderCapability,
  requirements: Required<ProviderRoutingRequirements>
): ProviderSeatRoute {
  const rationale = [
    `${status.displayName} is configured and implemented.`,
    `${status.model} is the selected model seat.`
  ];
  const capabilityWarnings: string[] = [];
  let score = 50;

  score += scoreCapability(requirements.jsonSchema, capability.supportsJsonSchema, "JSON schema", rationale, capabilityWarnings);
  score += scoreCapability(requirements.toolCalls, capability.supportsToolCalls, "tool calls", rationale, capabilityWarnings);
  score += scoreCapability(requirements.longContext, capability.supportsLongContext, "long context", rationale, capabilityWarnings);
  score += scoreCapability(requirements.lowCost, capability.supportsLowCostMode, "low-cost mode", rationale, capabilityWarnings);

  if (status.kind === "local") {
    score += requirements.localOnly || requirements.lowCost ? 18 : 4;
    rationale.push("Local transport reduces external data exposure.");
  } else if (!requirements.localOnly) {
    score += 8;
    rationale.push("API transport can use higher-capability hosted models.");
  }

  if (capability.capabilitySource === "adapter_verified") {
    score += 8;
    rationale.push("Capability source is adapter-verified.");
  }

  return {
    providerId: status.id,
    displayName: status.displayName,
    model: status.model,
    transport: status.kind,
    score,
    rationale,
    capabilityWarnings
  };
}

function scoreCapability(
  required: boolean,
  value: ProviderCapabilityValue,
  label: string,
  rationale: string[],
  warnings: string[]
): number {
  if (!required) {
    return 0;
  }

  if (value === true) {
    rationale.push(`Supports ${label}.`);
    return 16;
  }

  if (value === "model_dependent" || value === "proxy_dependent") {
    const warning = `${label} is ${value.replace("_", "-")} and should be verified for this model.`;
    rationale.push(warning);
    warnings.push(warning);
    return 7;
  }

  if (value === false) {
    warnings.push(`${label} is not supported by this provider.`);
    return -12;
  }

  warnings.push(`${label} support is unknown.`);
  return -4;
}
