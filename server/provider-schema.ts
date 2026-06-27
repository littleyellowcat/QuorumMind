import type { CriteriaScores } from "../src/lib/domain";
import type { ProviderPhase } from "./providers";

export type ProviderValidationIssue = {
  path: string;
  severity: "warning" | "error";
  message: string;
};

export type NormalizedProviderProposal = {
  proposalId: string;
  recommendation: string;
  criteriaScores: CriteriaScores;
  regretByScenario: Record<string, number>;
  confidence: number;
};

export type NormalizedProviderRanking = {
  rankedProposalIds: string[];
  confidence: number;
};

export type NormalizedProviderVerdict = {
  selectedProposalId: string;
  finalRecommendation: string;
  whyItWon: string[];
  remainingDissent: string[];
};

export type NormalizedProviderPayload =
  | NormalizedProviderProposal
  | NormalizedProviderRanking
  | NormalizedProviderVerdict
  | Record<string, unknown>;

export type ProviderSchemaResult =
  | {
      ok: true;
      validationStatus: "valid" | "repaired";
      normalized: NormalizedProviderPayload;
      issues: ProviderValidationIssue[];
    }
  | {
      ok: false;
      validationStatus: "invalid";
      normalized?: undefined;
      issues: ProviderValidationIssue[];
    };

const criteriaKeys = [
  "scalability",
  "reliability",
  "security",
  "costEfficiency",
  "implementationComplexity",
  "maintainability",
  "migrationFlexibility",
  "teamFit",
  "timeToMarket",
  "reversibility"
] as const;

export function normalizeProviderPayload(phase: ProviderPhase, payload: unknown): ProviderSchemaResult {
  if (!isRecord(payload)) {
    return invalid("payload", "Provider output must be a JSON object.");
  }

  if (phase === "proposal" || phase === "revision") {
    return normalizeProposal(payload);
  }

  if (phase === "ranking") {
    return normalizeRanking(payload);
  }

  if (phase === "verdict") {
    return normalizeVerdict(payload);
  }

  return {
    ok: true,
    validationStatus: "valid",
    normalized: payload,
    issues: []
  };
}

function normalizeProposal(payload: Record<string, unknown>): ProviderSchemaResult {
  const issues: ProviderValidationIssue[] = [];
  const proposalId = stringValue(firstField(payload, ["proposalId", "proposal_id", "id", "optionId", "option_id"], "proposalId", issues));
  const recommendation = stringValue(
    firstField(payload, ["recommendation", "finalRecommendation", "decision", "summary", "answer"], "recommendation", issues)
  );

  if (!proposalId) {
    issues.push(error("proposalId", "Proposal payload needs proposalId or id."));
  }

  if (!recommendation) {
    issues.push(error("recommendation", "Proposal payload needs a recommendation."));
  }

  if (!proposalId || !recommendation) {
    return { ok: false, validationStatus: "invalid", issues };
  }

  return repairedAware({
    proposalId,
    recommendation,
    criteriaScores: normalizeCriteriaScores(
      firstField(payload, ["criteriaScores", "criteria_scores", "scores", "scorecard"], "criteriaScores", issues),
      issues
    ),
    regretByScenario: normalizeRegretByScenario(
      firstField(payload, ["regretByScenario", "regret_by_scenario", "regrets"], "regretByScenario", issues),
      issues
    ),
    confidence: boundedNumber(payload.confidence, 0.65, 0, 1, "confidence", issues)
  }, issues);
}

function normalizeRanking(payload: Record<string, unknown>): ProviderSchemaResult {
  const issues: ProviderValidationIssue[] = [];
  const rankedProposalIds = normalizeRankedProposalIds(payload, issues);

  if (rankedProposalIds.length === 0) {
    return {
      ok: false,
      validationStatus: "invalid",
      issues: [error("rankedProposalIds", "Ranking payload needs at least one proposal id.")]
    };
  }

  return repairedAware(
    {
      rankedProposalIds,
      confidence: boundedNumber(payload.confidence, 0.67, 0, 1, "confidence", issues)
    },
    issues
  );
}

function normalizeVerdict(payload: Record<string, unknown>): ProviderSchemaResult {
  const issues: ProviderValidationIssue[] = [];
  const selectedProposalId = stringValue(
    firstField(payload, ["selectedProposalId", "selected_proposal_id", "winnerProposalId", "winner", "proposalId"], "selectedProposalId", issues)
  );
  const finalRecommendation = stringValue(
    firstField(
      payload,
      ["finalRecommendation", "final_recommendation", "recommendation", "decision", "summary", "answer"],
      "finalRecommendation",
      issues
    )
  );

  if (!selectedProposalId) {
    issues.push(error("selectedProposalId", "Verdict payload needs selectedProposalId."));
  }

  if (!finalRecommendation) {
    issues.push(error("finalRecommendation", "Verdict payload needs finalRecommendation."));
  }

  if (!selectedProposalId || !finalRecommendation) {
    return { ok: false, validationStatus: "invalid", issues };
  }

  return repairedAware(
    {
      selectedProposalId,
      finalRecommendation,
      whyItWon: normalizeStringList(firstField(payload, ["whyItWon", "why_it_won", "reasons", "rationale"], "whyItWon", issues), "whyItWon", issues),
      remainingDissent: normalizeStringList(
        firstField(payload, ["remainingDissent", "remaining_dissent", "dissent", "risks"], "remainingDissent", issues),
        "remainingDissent",
        issues
      )
    },
    issues
  );
}

function normalizeRankedProposalIds(payload: Record<string, unknown>, issues: ProviderValidationIssue[]): string[] {
  const direct = firstField(payload, ["rankedProposalIds", "ranked_proposal_ids", "proposalIds", "proposal_ids", "rankedIds", "ranking"], "rankedProposalIds", issues);

  if (Array.isArray(direct)) {
    let coercedObject = false;
    return direct.flatMap((item) => {
      const text = stringValue(item);
      if (text) {
        return [text];
      }

      if (isRecord(item)) {
        coercedObject = true;
        const id = stringValue(firstField(item, ["proposalId", "proposal_id", "id"], "rankedProposalIds[].proposalId", issues));
        if (coercedObject) {
          issues.push(warning("rankedProposalIds", "Coerced ranking objects into proposal id strings."));
          coercedObject = false;
        }
        return id ? [id] : [];
      }

      return [];
    });
  }

  return arrayOfStrings(direct);
}

function normalizeCriteriaScores(value: unknown, issues: ProviderValidationIssue[]): CriteriaScores {
  const record = isRecord(value) ? value : {};

  if (!isRecord(value)) {
    issues.push(warning("criteriaScores", "Missing criteria scores; using neutral defaults."));
  }

  return Object.fromEntries(
    criteriaKeys.map((key) => [
      key,
      boundedNumber(firstField(record, [key, snakeCase(key)], `criteriaScores.${key}`, issues), 50, 0, 100, `criteriaScores.${key}`, issues)
    ])
  ) as CriteriaScores;
}

function normalizeRegretByScenario(value: unknown, issues: ProviderValidationIssue[]): Record<string, number> {
  if (!isRecord(value)) {
    issues.push(warning("regretByScenario", "Missing regret map; using an empty map."));
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, score]) => {
      const numeric = numberValue(score);

      if (numeric === undefined) {
        issues.push(warning(`regretByScenario.${key}`, "Regret value must be numeric; dropping scenario."));
        return [];
      }

      return [[key, Math.round(Math.min(100, Math.max(0, numeric)))]];
    })
  );
}

function normalizeStringList(value: unknown, path: string, issues: ProviderValidationIssue[]): string[] {
  if (Array.isArray(value)) {
    let coercedObject = false;
    const items = value.flatMap((item) => {
      const directText = stringValue(item);
      if (directText) {
        return [directText];
      }

      const text = isRecord(item) ? stringValue(firstField(item, ["text", "reason", "description", "summary"], `${path}[]`, issues)) : undefined;
      coercedObject = coercedObject || Boolean(text);
      return text ? [text] : [];
    });

    if (coercedObject) {
      issues.push(warning(path, "Coerced object list items into strings."));
    }

    if (items.length !== value.length) {
      issues.push(warning(path, "Dropped non-string list items."));
    }

    return items;
  }

  const single = stringValue(value);

  if (single) {
    issues.push(warning(path, "Coerced string into a one-item list."));
    return [single];
  }

  issues.push(warning(path, "Missing list; using an empty list."));
  return [];
}

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  path: string,
  issues: ProviderValidationIssue[]
): number {
  const numeric = numberValue(value);

  if (numeric === undefined) {
    issues.push(warning(path, `Missing numeric value; using ${fallback}.`));
    return fallback;
  }

  if (typeof value === "string") {
    issues.push(warning(path, "Coerced numeric string into a number."));
  }

  const bounded = Math.min(max, Math.max(min, numeric));

  if (bounded !== numeric) {
    issues.push(warning(path, `Value ${numeric} was clamped to ${bounded}.`));
  }

  return Math.round(bounded * 100) / 100;
}

function repairedAware(normalized: NormalizedProviderPayload, issues: ProviderValidationIssue[]): ProviderSchemaResult {
  return {
    ok: true,
    validationStatus: issues.length > 0 ? "repaired" : "valid",
    normalized,
    issues
  };
}

function invalid(path: string, message: string): ProviderSchemaResult {
  return {
    ok: false,
    validationStatus: "invalid",
    issues: [error(path, message)]
  };
}

function warning(path: string, message: string): ProviderValidationIssue {
  return { path, severity: "warning", message };
}

function error(path: string, message: string): ProviderValidationIssue {
  return { path, severity: "error", message };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function firstField(record: Record<string, unknown>, keys: string[], path?: string, issues?: ProviderValidationIssue[]): unknown {
  for (const [index, key] of keys.entries()) {
    if (record[key] !== undefined) {
      if (index > 0 && path && issues) {
        issues.push(warning(path, `Used alias "${key}"; normalized to "${keys[0]}".`));
      }
      return record[key];
    }
  }

  return undefined;
}

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = stringValue(item);
        return text ? [text] : [];
      })
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
