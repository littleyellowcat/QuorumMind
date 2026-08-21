import type { AgentRole, DecisionContext, DecisionMode } from "../src/lib/domain";
import { defaultManualProviderAgents, type ManualProviderAgent } from "../src/lib/manual-provider";
import type { ModelReputation } from "../src/lib/model-reputation";
import { boundOutput, type BoundedOutputRef } from "./harness/bounded-output-store";
import { classifyFailure, type FailureClassification } from "./harness/failure-taxonomy";
import { createRunEventStore, defaultHarnessRootDir } from "./harness/run-event-store";
import { createRunEventRecorder, type RunEvent, type RunEventRecorder } from "./harness/run-event-trace";
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
  failure?: FailureClassification;
  normalized?: NormalizedProviderPayload;
  failureClass?: "provider_error" | "json_parse_error" | "schema_validation_error";
  parsed?: unknown;
  outputRef?: BoundedOutputRef;
  events?: RunEvent[];
  error?: string;
};

export type LiveDecisionTraceAttempt = {
  attempt: number;
  status: "ok" | "error";
  durationMs: number;
  jsonParsed: boolean;
  validationStatus: "valid" | "repaired" | "invalid" | "unparsed";
  validationIssues: ProviderValidationIssue[];
  failure?: FailureClassification;
  failureClass?: "provider_error" | "json_parse_error" | "schema_validation_error";
  outputRef?: BoundedOutputRef;
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
  runStoreDir?: string;
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

export type LiveDecisionTraceRunResult = {
  runId: string;
  trace: LiveDecisionTraceEntry[];
  events: RunEvent[];
  summary: {
    providerCount: number;
    entryCount: number;
    failureCount: number;
    retryCount: number;
    truncatedOutputCount: number;
  };
};

const fullLivePhases: ProviderPhase[] = ["proposal", "critique", "revision", "ranking", "verdict"];
const fastLivePhases: ProviderPhase[] = ["proposal", "ranking", "verdict"];
const providerRoles: AgentRole[] = ["principal_architect", "cost_engineer", "sre_reviewer"];
const fallbackAgentIds: ManualProviderAgent["id"][] = ["gpt", "deepseek", "gemini"];

type LiveProviderFamily = "openai" | "deepseek" | "gemini" | "anthropic" | "generic";

type LiveProviderAgentProfile = {
  id: ManualProviderAgent["id"];
  role: AgentRole;
  suffix: string;
  providerLabel: string;
  scoringFocus: string[];
};

const providerAgentIds: Partial<Record<ModelProvider["id"], ManualProviderAgent["id"]>> = {
  openai: "gpt",
  deepseek: "deepseek",
  gemini: "gemini"
};

const providerFamilyProfiles: Record<LiveProviderFamily, LiveProviderAgentProfile> = {
  openai: {
    id: "gpt",
    role: "principal_architect",
    suffix: "Product Architect",
    providerLabel: "OpenAI-compatible",
    scoringFocus: ["product fit", "architecture coherence", "team feasibility"]
  },
  deepseek: {
    id: "deepseek",
    role: "cost_engineer",
    suffix: "Cost/Risk Critic",
    providerLabel: "DeepSeek-compatible",
    scoringFocus: ["cost efficiency", "implementation complexity", "risk exposure"]
  },
  gemini: {
    id: "gemini",
    role: "sre_reviewer",
    suffix: "Strategic Reviewer",
    providerLabel: "Gemini-compatible",
    scoringFocus: ["long-term strategy", "reliability", "migration flexibility"]
  },
  anthropic: {
    id: "gemini",
    role: "sre_reviewer",
    suffix: "Safety Reviewer",
    providerLabel: "Anthropic-compatible",
    scoringFocus: ["safety", "reliability", "migration flexibility"]
  },
  generic: {
    id: "gpt",
    role: "principal_architect",
    suffix: "Architecture Reviewer",
    providerLabel: "OpenAI-compatible",
    scoringFocus: ["architecture coherence", "risk exposure", "team feasibility"]
  }
};

export async function runLiveDecisionTrace(input: RunLiveDecisionTraceInput): Promise<LiveDecisionTraceEntry[]> {
  return (await runLiveDecisionTraceDetailed(input)).trace;
}

export function createLiveProviderAgents(
  providers: ModelProvider[],
  agentConfig?: ManualProviderAgent[]
): ManualProviderAgent[] {
  return providers.slice(0, 3).map((provider, index) => agentForProvider(provider, index, agentConfig));
}

export async function runLiveDecisionTraceDetailed(input: RunLiveDecisionTraceInput): Promise<LiveDecisionTraceRunResult> {
  const providers = input.providers.slice(0, 3);
  const trace: LiveDecisionTraceEntry[] = [];
  const runId = createRunId();
  const runStoreDir = input.runStoreDir ?? defaultHarnessRootDir();
  const eventRecorder = createRunEventRecorder({ runId });

  eventRecorder.record({
    type: "run_start",
    severity: "info",
    summary: `Live decision trace started with ${providers.length} provider(s).`
  });

  for (const phase of phasesForMode(input.mode, input.maxPhases)) {
    const phaseEntries = await Promise.all(
      providers.map((provider, index) =>
        runProviderPhase({
          runId,
          provider,
          index,
          phase,
          input,
          payload: payloadForPhase(phase, trace),
          eventRecorder,
          runStoreDir
        })
      )
    );

    trace.push(...phaseEntries);
  }

  eventRecorder.record({
    type: "run_complete",
    severity: "info",
    summary: `Live decision trace completed with ${trace.length} provider phase entries.`
  });
  const allEvents = eventRecorder.events();

  for (const entry of trace) {
    entry.events = allEvents.filter((event) => event.phase === entry.phase && event.provider === entry.provider);
  }

  createRunEventStore({ rootDir: runStoreDir }).appendEvents(allEvents);

  return {
    runId,
    trace,
    events: allEvents,
    summary: {
      providerCount: providers.length,
      entryCount: trace.length,
      failureCount: trace.filter((entry) => entry.failure).length,
      retryCount: trace.reduce((sum, entry) => sum + entry.retryCount, 0),
      truncatedOutputCount: trace.filter((entry) => entry.outputRef?.truncated).length
    }
  };
}

async function runProviderPhase(input: {
  runId: string;
  provider: ModelProvider;
  index: number;
  phase: ProviderPhase;
  input: RunLiveDecisionTraceInput;
  payload: PhasePayload;
  eventRecorder: RunEventRecorder;
  runStoreDir: string;
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
  const events = input.eventRecorder.child({
    phase: input.phase,
    provider: input.provider.id,
    model: input.provider.model
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    events.record({
      type: "provider_attempt_start",
      severity: "info",
      attempt,
      maxAttempts,
      summary: `${input.provider.id}/${input.phase} attempt ${attempt} started.`
    });

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
      const failure = failureClass
        ? classifyFailure(failureClass, { fallbackCategory: failureClass })
        : undefined;
      const outputRef = boundOutput(text, {
        label: `${input.provider.id}:${input.phase}:raw_output`,
        storageDir: input.runStoreDir,
        runId: input.runId,
        redactSecrets: true
      });
      const boundedText = outputRef.inline ?? outputRef.preview;
      const attemptResult: LiveDecisionTraceAttempt = {
        attempt,
        status: "ok",
        durationMs: Date.now() - startedAt,
        jsonParsed: parsed !== undefined,
        validationStatus: schema?.validationStatus ?? "unparsed",
        validationIssues: schema?.issues ?? [],
        ...(failure ? { failure } : {}),
        failureClass,
        outputRef
      };

      attempts.push(attemptResult);
      events.record({
        type: failure ? attempt < maxAttempts ? "provider_attempt_retry" : "provider_attempt_failure" : "provider_attempt_success",
        severity: failure ? failure.severity : "info",
        attempt,
        maxAttempts,
        durationMs: attemptResult.durationMs,
        summary: failure
          ? `${input.provider.id}/${input.phase} returned ${failure.category}; ${attempt < maxAttempts ? "retrying" : "using bounded fallback"}.`
          : `${input.provider.id}/${input.phase} produced ${schema?.validationStatus ?? "unparsed"} output.`,
        ...(failure ? { failure } : {})
      });

      if (!failureClass || attempt === maxAttempts) {
        return {
          ...baseEntry,
          attempt,
          retryCount: attempt - 1,
          attempts,
          status: "ok",
          text: boundedText,
          durationMs: attempts.reduce((sum, item) => sum + item.durationMs, 0),
          jsonParsed: parsed !== undefined,
          validationStatus: attemptResult.validationStatus,
          validationIssues: attemptResult.validationIssues,
          ...(failure ? { failure } : {}),
          normalized: schema?.ok ? schema.normalized : undefined,
          failureClass,
          parsed,
          outputRef,
          events: events.events()
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provider error";
      const failure = classifyFailure(error, { fallbackCategory: "provider_error" });
      const attemptResult: LiveDecisionTraceAttempt = {
        attempt,
        status: "error",
        durationMs: Date.now() - startedAt,
        jsonParsed: false,
        validationStatus: "unparsed",
        validationIssues: [],
        failure,
        failureClass: "provider_error",
        error: message
      };

      attempts.push(attemptResult);
      events.record({
        type: attempt === maxAttempts ? "provider_attempt_failure" : "provider_attempt_retry",
        severity: failure.severity,
        attempt,
        maxAttempts,
        durationMs: attemptResult.durationMs,
        summary: `${input.provider.id}/${input.phase} failed with ${failure.category}; ${attempt < maxAttempts ? "retrying" : "attempt budget exhausted"}.`,
        failure
      });

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
          failure,
          failureClass: "provider_error",
          events: events.events(),
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
): ManualProviderAgent {
  const agents = agentConfig ?? defaultManualProviderAgents;
  const configuredAgent = configuredAgentForProvider(provider, index, agents);
  const dynamicAgent = defaultAgentForProvider(provider, index);

  if (!configuredAgent) {
    return dynamicAgent;
  }

  const defaultConfiguredAgent = defaultManualProviderAgents.find((agent) => agent.id === configuredAgent.id);
  const hasCustomName = !defaultConfiguredAgent || configuredAgent.name !== defaultConfiguredAgent.name;
  const hasCustomProviderLabel =
    !defaultConfiguredAgent || configuredAgent.providerLabel !== defaultConfiguredAgent.providerLabel;
  const hasCustomRole = !defaultConfiguredAgent || configuredAgent.role !== defaultConfiguredAgent.role;
  const hasCustomScoringFocus =
    !defaultConfiguredAgent || !sameStrings(configuredAgent.scoringFocus, defaultConfiguredAgent.scoringFocus);

  return {
    ...dynamicAgent,
    name: hasCustomName ? configuredAgent.name : dynamicAgent.name,
    providerLabel: hasCustomProviderLabel ? configuredAgent.providerLabel : dynamicAgent.providerLabel,
    role: hasCustomRole ? configuredAgent.role : dynamicAgent.role,
    weight: configuredAgent.weight,
    baseWeight: configuredAgent.baseWeight,
    effectiveWeight: configuredAgent.effectiveWeight,
    reputation: configuredAgent.reputation,
    scoringFocus: hasCustomScoringFocus ? configuredAgent.scoringFocus : dynamicAgent.scoringFocus
  };
}

function configuredAgentForProvider(
  provider: ModelProvider,
  index: number,
  agents: ManualProviderAgent[]
): ManualProviderAgent | undefined {
  const mappedId = providerAgentIds[provider.id];

  return (mappedId ? agents.find((agent) => agent.id === mappedId) : undefined) ?? agents[index];
}

function defaultAgentForProvider(provider: ModelProvider, index: number): ManualProviderAgent {
  const profile = profileForProvider(provider, index);
  const modelName = displayNameForModel(provider.model || provider.id);

  return {
    id: profile.id,
    name: `${modelName} ${profile.suffix}`,
    providerLabel: `${profile.providerLabel} / ${modelName}`,
    role: profile.role,
    weight: 1,
    scoringFocus: profile.scoringFocus
  };
}

function profileForProvider(provider: ModelProvider, index: number): LiveProviderAgentProfile {
  const family = familyForProvider(provider);

  if (family !== "generic") {
    return providerFamilyProfiles[family];
  }

  return {
    ...providerFamilyProfiles.generic,
    id: fallbackAgentIds[index] ?? "gpt",
    role: providerRoles[index] ?? providerFamilyProfiles.generic.role,
    providerLabel: providerLabelForProvider(provider.id)
  };
}

function familyForProvider(provider: ModelProvider): LiveProviderFamily {
  const modelTokens = provider.model
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);

  if (modelTokens.some((token) => token === "claude" || token === "anthropic")) {
    return "anthropic";
  }

  if (modelTokens.some((token) => token === "deepseek" || token.startsWith("deepseek"))) {
    return "deepseek";
  }

  if (modelTokens.some((token) => token === "gemini" || token.startsWith("gemini"))) {
    return "gemini";
  }

  if (modelTokens.some((token) => token === "gpt" || token.startsWith("gpt") || /^o\d/.test(token))) {
    return "openai";
  }

  if (provider.id === "anthropic") {
    return "anthropic";
  }

  if (provider.id === "deepseek") {
    return "deepseek";
  }

  if (provider.id === "gemini") {
    return "gemini";
  }

  if (provider.id === "openai") {
    return "openai";
  }

  return "generic";
}

function displayNameForModel(model: string): string {
  const modelName = model.trim().split("/").filter(Boolean).at(-1) ?? model;
  const tokens = modelName
    .replace(/^models\//i, "")
    .split(/[^a-zA-Z0-9.]+/)
    .filter(Boolean);
  const mergedTokens: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    const next = tokens[index + 1];

    if (/^\d+$/.test(current) && next && /^\d+$/.test(next) && current.length <= 2 && next.length <= 2) {
      mergedTokens.push(`${current}.${next}`);
      index += 1;
      continue;
    }

    mergedTokens.push(current);
  }

  return mergedTokens.map(formatModelToken).join(" ") || "Model";
}

function formatModelToken(token: string): string {
  const lower = token.toLowerCase();
  const exactNames: Record<string, string> = {
    ai: "AI",
    api: "API",
    gpt: "GPT",
    lm: "LM",
    llm: "LLM",
    openai: "OpenAI",
    deepseek: "DeepSeek",
    gemini: "Gemini",
    claude: "Claude",
    qwen: "Qwen",
    kimi: "Kimi",
    llama: "Llama",
    lmstudio: "LMStudio"
  };

  if (exactNames[lower]) {
    return exactNames[lower];
  }

  if (lower.startsWith("gpt")) {
    return `GPT${token.slice(3)}`;
  }

  if (lower.startsWith("qwen")) {
    return `Qwen${token.slice(4)}`;
  }

  if (/^v\d/i.test(token)) {
    return `V${token.slice(1)}`;
  }

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function providerLabelForProvider(providerId: ModelProvider["id"]): string {
  const labels: Record<ModelProvider["id"], string> = {
    model_gateway: "Model gateway",
    openai: "OpenAI-compatible",
    deepseek: "DeepSeek-compatible",
    gemini: "Gemini-compatible",
    anthropic: "Anthropic-compatible",
    openrouter: "OpenRouter",
    ollama: "Ollama",
    lmstudio: "LM Studio"
  };

  return labels[providerId] ?? "Model provider";
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
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
