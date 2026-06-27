import type { AgentRole, DecisionContext, DecisionMode } from "../src/lib/domain";
import { defaultManualProviderAgents, type ManualProviderAgent } from "../src/lib/manual-provider";
import type { ModelReputation } from "../src/lib/model-reputation";
import { createBlindReviewPayload, type BlindReviewPayload } from "./blind-review";
import { parseProviderJson } from "./provider-json";
import { normalizeProviderPayload, type NormalizedProviderPayload, type ProviderValidationIssue } from "./provider-schema";
import type { ModelProvider, ProviderPhase } from "./providers";

export type LiveDecisionTraceEntry = {
  runId: string;
  id: string;
  provider: ModelProvider["id"];
  model: string;
  phase: ProviderPhase;
  attempt: number;
  maxAttempts: number;
  retryCount: number;
  attempts: LiveDecisionTraceAttempt[];
  agentName: string;
  agentRole: AgentRole;
  agentWeight?: number;
  modelReputation?: ModelReputation;
  status: "ok" | "error";
  text: string;
  durationMs: number;
  jsonParsed: boolean;
  validationStatus: "valid" | "repaired" | "invalid" | "unparsed";
  validationIssues: ProviderValidationIssue[];
  normalized?: NormalizedProviderPayload;
  failureClass?: "provider_error" | "json_parse_error" | "schema_validation_error";
  parsed?: unknown;
  error?: string;
};

export type LiveDecisionTraceAttempt = {
  attempt: number;
  status: "ok" | "error";
  durationMs: number;
  jsonParsed: boolean;
  validationStatus: "valid" | "repaired" | "invalid" | "unparsed";
  validationIssues: ProviderValidationIssue[];
  failureClass?: "provider_error" | "json_parse_error" | "schema_validation_error";
  error?: string;
};

type RunLiveDecisionTraceInput = {
  providers: ModelProvider[];
  question: string;
  locale: "en" | "zh";
  mode?: DecisionMode;
  agentConfig?: ManualProviderAgent[];
  maxPhases?: number;
  retryPolicy?: {
    maxAttempts?: number;
  };
  context: DecisionContext;
};

type PhasePayload = {
  proposals?: LiveDecisionTraceEntry[];
  blindReview?: BlindReviewPayload["blindReview"];
  blindProposals?: BlindReviewPayload["blindProposals"];
  critiques?: LiveDecisionTraceEntry[];
  revisions?: LiveDecisionTraceEntry[];
  rankings?: LiveDecisionTraceEntry[];
};

const fullLivePhases: ProviderPhase[] = ["proposal", "critique", "revision", "ranking", "verdict"];
const fastLivePhases: ProviderPhase[] = ["proposal", "ranking", "verdict"];
const providerRoles: AgentRole[] = ["principal_architect", "cost_engineer", "sre_reviewer"];
const providerAgentIds: Record<ModelProvider["id"], ManualProviderAgent["id"] | undefined> = {
  model_gateway: undefined,
  openai: "gpt",
  deepseek: "deepseek",
  gemini: "gemini"
};

export async function runLiveDecisionTrace(input: RunLiveDecisionTraceInput): Promise<LiveDecisionTraceEntry[]> {
  const providers = input.providers.slice(0, 3);
  const trace: LiveDecisionTraceEntry[] = [];
  const runId = createRunId();

  for (const phase of phasesForMode(input.mode, input.maxPhases)) {
    const phaseEntries = await Promise.all(
      providers.map((provider, index) =>
        runProviderPhase({
          runId,
          provider,
          index,
          phase,
          input,
          payload: payloadForPhase(phase, trace)
        })
      )
    );

    trace.push(...phaseEntries);
  }

  return trace;
}

async function runProviderPhase(input: {
  runId: string;
  provider: ModelProvider;
  index: number;
  phase: ProviderPhase;
  input: RunLiveDecisionTraceInput;
  payload: PhasePayload;
}): Promise<LiveDecisionTraceEntry> {
  const agent = agentForProvider(input.provider, input.index, input.input.agentConfig);
  const agentRole = agent?.role ?? providerRoles[input.index] ?? "principal_architect";
  const agentName = agent?.name ?? `${input.provider.id} ${phaseAgentLabel(input.phase)}`;
  const agentWeight = agent?.effectiveWeight ?? agent?.weight;
  const maxAttempts = retryAttemptsForInput(input.input);
  const baseEntry = {
    runId: input.runId,
    id: `${input.phase}-${input.provider.id}-${input.index}`,
    provider: input.provider.id,
    model: input.provider.model,
    phase: input.phase,
    maxAttempts,
    agentName,
    agentRole,
    agentWeight,
    modelReputation: agent?.reputation
  };
  const attempts: LiveDecisionTraceAttempt[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();

    try {
      const text = await input.provider.generateDecisionText({
        locale: input.input.locale,
        mode: input.input.mode,
        phase: input.phase,
        agentName,
        agentRole,
        agentWeight,
        modelReputation: agent?.reputation,
        scoringFocus: agent?.scoringFocus,
        question: input.input.question,
        context: input.input.context,
        payload: input.payload
      });
      const parsed = parseProviderJson(text);
      const schema = parsed === undefined ? undefined : normalizeProviderPayload(input.phase, parsed);
      const failureClass =
        parsed === undefined ? "json_parse_error" : schema && !schema.ok ? "schema_validation_error" : undefined;
      const attemptResult: LiveDecisionTraceAttempt = {
        attempt,
        status: "ok",
        durationMs: Date.now() - startedAt,
        jsonParsed: parsed !== undefined,
        validationStatus: schema?.validationStatus ?? "unparsed",
        validationIssues: schema?.issues ?? [],
        failureClass
      };

      attempts.push(attemptResult);

      if (!failureClass || attempt === maxAttempts) {
        return {
          ...baseEntry,
          attempt,
          retryCount: attempt - 1,
          attempts,
          status: "ok",
          text,
          durationMs: attempts.reduce((sum, item) => sum + item.durationMs, 0),
          jsonParsed: parsed !== undefined,
          validationStatus: attemptResult.validationStatus,
          validationIssues: attemptResult.validationIssues,
          normalized: schema?.ok ? schema.normalized : undefined,
          failureClass,
          parsed
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      const attemptResult: LiveDecisionTraceAttempt = {
        attempt,
        status: "error",
        durationMs: Date.now() - startedAt,
        jsonParsed: false,
        validationStatus: "unparsed",
        validationIssues: [],
        failureClass: "provider_error",
        error: message
      };

      attempts.push(attemptResult);

      if (attempt === maxAttempts) {
        return {
          ...baseEntry,
          attempt,
          retryCount: attempt - 1,
          attempts,
          status: "error",
          text: "",
          durationMs: attempts.reduce((sum, item) => sum + item.durationMs, 0),
          jsonParsed: false,
          validationStatus: "unparsed",
          validationIssues: [],
          failureClass: "provider_error",
          error: message
        };
      }
    }
  }

  throw new Error("Unreachable provider retry state.");
}

function createRunId(): string {
  return `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function retryAttemptsForInput(input: RunLiveDecisionTraceInput): number {
  const configured = input.retryPolicy?.maxAttempts ?? 1;

  return Math.min(3, Math.max(1, Math.round(configured)));
}

function agentForProvider(
  provider: ModelProvider,
  index: number,
  agentConfig: ManualProviderAgent[] | undefined
): ManualProviderAgent | undefined {
  const agents = agentConfig ?? defaultManualProviderAgents;
  const mappedId = providerAgentIds[provider.id];

  return agents.find((agent) => agent.id === mappedId) ?? agents[index];
}

function phasesForMode(mode: DecisionMode | undefined, maxPhases: number | undefined): ProviderPhase[] {
  const phases = mode === "fast" ? fastLivePhases : fullLivePhases;

  if (typeof maxPhases !== "number" || !Number.isFinite(maxPhases)) {
    return phases;
  }

  return phases.slice(0, Math.min(phases.length, Math.max(1, Math.round(maxPhases))));
}

function payloadForPhase(phase: ProviderPhase, trace: LiveDecisionTraceEntry[]): PhasePayload {
  const proposals = trace.filter((entry) => entry.phase === "proposal");
  const critiques = trace.filter((entry) => entry.phase === "critique");
  const revisions = trace.filter((entry) => entry.phase === "revision");
  const rankings = trace.filter((entry) => entry.phase === "ranking");

  if (phase === "critique") {
    return createBlindReviewPayload(proposals);
  }

  if (phase === "revision") {
    return { proposals, critiques };
  }

  if (phase === "ranking") {
    return { proposals, critiques, revisions };
  }

  if (phase === "verdict") {
    return { proposals, critiques, revisions, rankings };
  }

  return {};
}

function phaseAgentLabel(phase: ProviderPhase): string {
  if (phase === "proposal") {
    return "proposal agent";
  }

  if (phase === "critique") {
    return "critique agent";
  }

  if (phase === "revision") {
    return "revision agent";
  }

  if (phase === "ranking") {
    return "ranking agent";
  }

  return "verdict agent";
}
