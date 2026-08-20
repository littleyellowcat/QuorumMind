import type { ImplementedProviderId } from "./types";

export type ProviderPolicyEffect = "allow" | "deny";

export type ProviderPolicyStatement = {
  effect: ProviderPolicyEffect;
  action: "provider.use";
  resource: string;
};

export type ProviderPolicy = {
  statements: ProviderPolicyStatement[];
  issues: string[];
};

export type ProviderPolicyDecision = {
  effect: ProviderPolicyEffect;
  matchedAction?: string;
  matchedResource?: string;
  reason: string;
};

export function parseProviderPolicy(raw: string | undefined): ProviderPolicy {
  if (!raw?.trim()) {
    return { statements: [], issues: [] };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const candidates = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { statements?: unknown }).statements)
        ? (parsed as { statements: unknown[] }).statements
        : undefined;

    if (!candidates) {
      return { statements: [], issues: ["Policy must be a JSON array or an object with a statements array."] };
    }

    const statements = candidates.flatMap((candidate) => parseStatement(candidate));
    const issues = candidates.length === statements.length ? [] : ["Some provider policy statements were ignored because they were invalid."];

    return { statements, issues };
  } catch {
    return { statements: [], issues: ["Policy must be valid JSON."] };
  }
}

export function evaluateProviderPolicy(
  policy: ProviderPolicy,
  providerId: ImplementedProviderId,
  model: string
): ProviderPolicyDecision {
  const resourceCandidates = [providerId, `${providerId}:${model}`];
  const match = lastMatchingStatement(policy.statements, resourceCandidates);

  if (!match) {
    return {
      effect: "allow",
      reason: policy.issues.length > 0 ? policy.issues.join(" ") : "No provider policy matched; default allow."
    };
  }

  return {
    effect: match.effect,
    matchedAction: match.action,
    matchedResource: match.resource,
    reason: `Matched provider policy ${match.effect} ${match.action} ${match.resource}.`
  };
}

function lastMatchingStatement(
  statements: ProviderPolicyStatement[],
  resourceCandidates: string[]
): ProviderPolicyStatement | undefined {
  for (let index = statements.length - 1; index >= 0; index -= 1) {
    const statement = statements[index];

    if (
      wildcardMatch("provider.use", statement.action) &&
      resourceCandidates.some((resource) => wildcardMatch(resource, statement.resource))
    ) {
      return statement;
    }
  }

  return undefined;
}

export function isProviderPolicyAllowed(policy: ProviderPolicy, providerId: ImplementedProviderId, model: string): boolean {
  return evaluateProviderPolicy(policy, providerId, model).effect === "allow";
}

function parseStatement(candidate: unknown): ProviderPolicyStatement[] {
  if (typeof candidate !== "object" || candidate === null) {
    return [];
  }

  const statement = candidate as Partial<ProviderPolicyStatement>;

  if (
    (statement.effect !== "allow" && statement.effect !== "deny") ||
    statement.action !== "provider.use" ||
    typeof statement.resource !== "string" ||
    statement.resource.trim().length === 0
  ) {
    return [];
  }

  return [
    {
      effect: statement.effect,
      action: statement.action,
      resource: statement.resource.trim()
    }
  ];
}

function wildcardMatch(value: string, pattern: string): boolean {
  if (pattern === "*") {
    return true;
  }

  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  return new RegExp(`^${escaped}$`, "i").test(value);
}
