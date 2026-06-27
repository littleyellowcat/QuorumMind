import { runDecisionRoom } from "../src/lib/workflow";
import { persistDecisionSummary } from "./decision-summarizer";
import { buildKnowledgeInjection } from "./knowledge-inject";
import { enrichBlueprintWithModelContributions, runBlueprintRoom } from "../src/lib/blueprint";
import type { AgentRole, DecisionContext, DecisionMode } from "../src/lib/domain";
import { decisionContextSchema, decisionModeSchema } from "../src/lib/domain";
import {
  createManualProviderBundle,
  defaultManualProviderAgents,
  type ManualProviderAgent
} from "../src/lib/manual-provider";
import { applyModelReputation, inferDecisionDomain, type DecisionDomain, type ModelReputationFeedback } from "../src/lib/model-reputation";
import { runAutonomousBlueprintGraph } from "./agent-platform/autonomous-blueprint";
import { GraphInterrupt } from "@langchain/langgraph";
import { aggregateLiveVerdict } from "./live-aggregation";
import { runLiveDecisionTrace } from "./live-decision";
import { renderHtmlToPdf } from "./pdf-export";
import { createSqliteDecisionRepository } from "./persistence/sqlite-repository";
import { testProviderConnections } from "./provider-connectivity";
import { createConfiguredProviders, getProviderStatus, type Env } from "./providers/registry";
import { buildSkillInjection } from "./skill-inject";
import { matchSkills, type SkillMeta } from "./skill-loader";
import {
  apiSecurityPosture,
  applySecurityHeaders,
  secureJson,
  validateApiToken,
  validateCors,
  validateRateLimit
} from "./security";
import { z } from "zod";

type DecisionPayload = {
  question?: unknown;
  mode?: unknown;
  locale?: unknown;
  context?: unknown;
  agentConfig?: unknown;
  reputationFeedback?: unknown;
  agentRuntime?: unknown;
  blueprintRuntime?: unknown;
};

type AgentRuntimeConfig = {
  threadId?: string;
  maxConsensusRounds?: number;
  humanReviewNote?: string;
};

type BlueprintExecutionMode = "deterministic" | "live";

type BlueprintRuntimeConfig = {
  executionMode: BlueprintExecutionMode;
  maxProviderRounds?: number;
};

type BlueprintExecutionSummary = {
  requested: BlueprintExecutionMode;
  actual: "deterministic" | "live";
  liveTraceRequired: boolean;
  liveTraceAttempted: boolean;
  liveTraceUsable: boolean;
  providerCalls: number;
  usableCalls: number;
  fallbackReason?:
    | "deterministic_mode"
    | "provider_mode_demo"
    | "no_configured_providers"
    | "no_usable_live_trace"
    | "live_trace_error";
};

// ── Request validation schema ──────────────────────────────

const decisionPayloadSchema = z.object({
  question: z.string().min(1),
  mode: decisionModeSchema.default("deep"),
  locale: z.enum(["en", "zh"]).default("en"),
  context: decisionContextSchema,
  agentConfig: z.array(z.object({
    id: z.enum(["gpt", "deepseek", "gemini"]),
    name: z.string(),
    providerLabel: z.string().default(""),
    role: z.enum(["principal_architect", "sre_reviewer", "security_reviewer", "cost_engineer", "pragmatic_builder"]),
    weight: z.number().min(0).max(2.5).default(1),
    scoringFocus: z.array(z.string()).default([])
  })).default(defaultManualProviderAgents),
  reputationFeedback: z.array(z.object({
    agentId: z.enum(["gpt", "deepseek", "gemini"]),
    domain: z.enum(["technical_architecture", "product_strategy", "career_strategy", "portfolio_packaging"]),
    outcome: z.enum(["helpful", "neutral", "unhelpful"]),
    confidence: z.number().min(0).max(1).optional(),
    createdAt: z.string()
  })).default([])
});

const pdfExportPayloadSchema = z.object({
  html: z.string().min(1).max(220_000),
  filename: z.string().min(1).max(180).default("quorummind-final-result.pdf")
});

export async function handleApiRequest(request: Request, env: Env = process.env): Promise<Response> {
  const corsError = validateCors(request, env);

  if (corsError) {
    return corsError;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: applySecurityHeaders(new Headers(), request, env)
    });
  }

  const authError = validateApiToken(request, env);

  if (authError) {
    return authError;
  }

  const rateLimitError = validateRateLimit(request, env);

  if (rateLimitError) {
    return rateLimitError;
  }

  const url = new URL(request.url);

  if (url.pathname === "/api/health" && request.method === "GET") {
    return json(request, env, {
      status: "ok",
      providerMode: providerModeForEnv(env),
      persistence: persistenceStatusForEnv(env),
      providerStatus: getProviderStatus(env)
    });
  }

  if (url.pathname === "/api/security" && request.method === "GET") {
    return json(request, env, apiSecurityPosture(env));
  }

  if (url.pathname === "/api/providers/test" && request.method === "POST") {
    return json(request, env, {
      providerMode: providerModeForEnv(env),
      providerStatus: getProviderStatus(env),
      results: await testProviderConnections(env)
    });
  }

  if (url.pathname === "/api/exports/pdf" && request.method === "POST") {
    return handlePdfExportRequest(request, env);
  }

  if (url.pathname === "/api/rooms" && request.method === "GET") {
    return listPersistedDecisionRooms(request, env);
  }

  if (url.pathname.startsWith("/api/rooms/") && request.method === "GET") {
    const roomId = decodeURIComponent(url.pathname.slice("/api/rooms/".length));
    return openPersistedDecisionRoom(request, env, roomId);
  }

  if (url.pathname === "/api/blueprints" && request.method === "POST") {
    return handleBlueprintRequest(request, env);
  }

  if (url.pathname === "/api/agent-runs/blueprint" && request.method === "POST") {
    return handleAutonomousBlueprintRequest(request, env);
  }

  if (url.pathname !== "/api/decisions" || request.method !== "POST") {
    return json(request, env, { error: "Not found" }, 404);
  }

  let payload: DecisionPayload;

  try {
    payload = (await request.json()) as DecisionPayload;
  } catch {
    return json(request, env, { error: "Request body must be valid JSON." }, 400);
  }

  const parsed = decisionPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    return json(request, env, {
      error: `Invalid request: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    }, 400);
  }

  const { question, mode, locale, context, agentConfig, reputationFeedback } = parsed.data;

  const providers = createConfiguredProviders(env);
  const createdAt = new Date().toISOString();
  const requestedProviderMode = providerModeForEnv(env);
  const shouldUseLiveProviders = requestedProviderMode === "live" && providers.length > 0;
  const reputationAdjustedAgents = applyModelReputation(agentConfig, {
    question,
    context
  }, reputationFeedback);
  const knowledgeInjection = buildKnowledgeInjection(question, context);
  const result = runDecisionRoom({ question, mode, context, knowledgeInjection });
  const providerTrace = shouldUseLiveProviders
    ? await runLiveDecisionTrace({
        providers,
        question,
        locale,
        mode,
        agentConfig: reputationAdjustedAgents,
        context
      })
    : [];
  const liveVerdict = shouldUseLiveProviders
    ? aggregateLiveVerdict({
        trace: providerTrace,
        context: context
      })
    : null;

  // Fire-and-forget: persist decision summary to ~/.quorummind/decisions/
  try {
    persistDecisionSummary(result, question, locale);
  } catch {
    // silent failure — decision summary is best-effort
  }

  const promptBundle = createManualProviderBundle({
    question: question,
    locale: locale,
    agents: reputationAdjustedAgents,
    context: context
  });
  const persistence = persistDecisionRoomIfConfigured(env, {
    id: `${result.roomId}-${createdAt}`,
    question: question,
    locale: locale,
    mode: mode,
    providerMode: shouldUseLiveProviders ? "live" : "demo",
    selectedProposalId: liveVerdict?.selectedProposalId ?? result.verdict.selectedProposalId,
    recommendation: liveVerdict?.finalRecommendation ?? result.verdict.finalRecommendation,
    quorumScore: liveVerdict?.quorumScore ?? result.verdict.quorumScore,
    dissentIndex: liveVerdict?.dissentIndex ?? result.verdict.dissentIndex,
    providerTrace,
    liveVerdict,
    promptBundle,
    result,
    reputationFeedback: reputationFeedback,
    createdAt
  });

  return json(request, env, {
    providerMode: shouldUseLiveProviders ? "live" : "demo",
    providerStatus: getProviderStatus(env),
    persistence,
    providerTrace,
    liveVerdict,
    promptBundle,
    result
  });
}

async function handleBlueprintRequest(request: Request, env: Env): Promise<Response> {
  let payload: DecisionPayload;

  try {
    payload = (await request.json()) as DecisionPayload;
  } catch {
    return json(request, env, { error: "Request body must be valid JSON." }, 400);
  }

  const parsed = decisionPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    return json(request, env, {
      error: `Invalid request: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    }, 400);
  }

  const { question, mode, locale, context, agentConfig, reputationFeedback } = parsed.data;

  const providers = createConfiguredProviders(env);
  const requestedProviderMode = providerModeForEnv(env);
  const blueprintRuntime = parseBlueprintRuntimeConfig(payload.blueprintRuntime);
  const shouldUseLiveProviders = blueprintRuntime.executionMode === "live" && requestedProviderMode === "live" && providers.length > 0;
  const reputationAdjustedAgents = applyModelReputation(agentConfig, {
    question,
    context
  }, reputationFeedback);
  const baseResult = runBlueprintRoom({
    question,
    mode,
    locale,
    context
  });
  const blueprintQuestion = blueprintProviderQuestion(question, locale, blueprintSkillContext(question, context));
  const providerTrace = shouldUseLiveProviders
    ? await runLiveDecisionTrace({
        providers,
        question: blueprintQuestion,
        locale: locale,
        mode: mode === "fast" ? "deep" : mode,
        maxPhases: blueprintRuntime.maxProviderRounds,
        agentConfig: reputationAdjustedAgents,
        context: context
      })
    : [];
  const blueprintExecution = summarizeBlueprintExecution({
    requested: blueprintRuntime.executionMode,
    requestedProviderMode,
    configuredProviderCount: providers.length,
    providerTrace
  });
  const result = enrichBlueprintWithModelContributions(baseResult, providerTrace, locale);
  const promptBundle = createManualProviderBundle({
    question: blueprintQuestion,
    locale: locale,
    agents: reputationAdjustedAgents,
    context: context
  });

  return json(request, env, {
    providerMode: shouldUseLiveProviders ? "live" : "demo",
    providerStatus: getProviderStatus(env),
    persistence: persistenceStatusForEnv(env),
    providerTrace,
    blueprintExecution,
    promptBundle,
    result
  });
}

async function handlePdfExportRequest(request: Request, env: Env): Promise<Response> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json(request, env, { error: "Request body must be valid JSON." }, 400);
  }

  const parsed = pdfExportPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    return json(request, env, {
      error: `Invalid PDF export request: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    }, 400);
  }

  try {
    const pdf = await renderHtmlToPdf(parsed.data.html);
    const filename = safePdfFilename(parsed.data.filename);
    const headers = applySecurityHeaders(
      new Headers({
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentDisposition(filename)
      }),
      request,
      env
    );

    const body = new ArrayBuffer(pdf.byteLength);
    new Uint8Array(body).set(pdf);

    return new Response(body, { status: 200, headers });
  } catch (error) {
    return json(request, env, {
      error: `PDF rendering failed: ${error instanceof Error ? error.message : "Unknown rendering error"}`
    }, 500);
  }
}

async function handleAutonomousBlueprintRequest(request: Request, env: Env): Promise<Response> {
  let payload: DecisionPayload;

  try {
    payload = (await request.json()) as DecisionPayload;
  } catch {
    return json(request, env, { error: "Request body must be valid JSON." }, 400);
  }

  const parsed = decisionPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    return json(request, env, {
      error: `Invalid request: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    }, 400);
  }

  const { question, mode, locale, context, agentConfig, reputationFeedback } = parsed.data;

  const providers = createConfiguredProviders(env);
  const requestedProviderMode = providerModeForEnv(env);
  const blueprintRuntime = parseBlueprintRuntimeConfig(payload.blueprintRuntime);
  const shouldUseLiveProviders = blueprintRuntime.executionMode === "live" && requestedProviderMode === "live" && providers.length > 0;
  const reputationAdjustedAgents = applyModelReputation(agentConfig, {
    question,
    context
  }, reputationFeedback);
  const blueprintQuestion = blueprintProviderQuestion(question, locale, blueprintSkillContext(question, context));
  const agentRuntime = parseAgentRuntimeConfig(payload.agentRuntime);

  try {
    const run = await runAutonomousBlueprintGraph({
      question,
      mode,
      locale,
      context,
      liveModel:
        blueprintRuntime.executionMode === "live"
          ? {
              requested: true,
              unavailableReason:
                requestedProviderMode !== "live"
                  ? "provider_mode_demo"
                  : providers.length === 0
                    ? "no_configured_providers"
                    : undefined,
              runner: shouldUseLiveProviders
                ? () =>
                    runLiveDecisionTrace({
                      providers,
                      question: blueprintQuestion,
                      locale: locale,
                      mode: mode === "fast" ? "deep" : mode,
                      maxPhases: blueprintRuntime.maxProviderRounds,
                      agentConfig: reputationAdjustedAgents,
                      context: context
                    })
                : undefined
            }
          : { requested: false, unavailableReason: "deterministic_mode" },
      ...agentRuntime
    });

    return json(request, env, {
      providerMode: run.liveModel.liveTraceAttempted ? "live" : "demo",
      providerStatus: getProviderStatus(env),
      persistence: persistenceStatusForEnv(env),
      run
    });
  } catch (error) {
    if (error instanceof GraphInterrupt) {
      // Human-in-the-loop: the graph paused at human_review_gate.
      // Return the interrupt payload so the user can review and resume.
      const interrupts = (error as any).interrupts ?? [];
      return json(request, env, {
        status: "paused_for_review",
        message:
          locale === "zh"
            ? "蓝图共识低于阈值，需要人工复审。请提供复审意见后重新提交。"
            : "Blueprint consensus is below threshold. Human review required.",
        threadId: agentRuntime.threadId ?? "quorummind-agent-thread",
        interrupts: interrupts.map((i: any) => ({
          gate: i.value?.gate ?? "human_review",
          consensusScore: i.value?.consensus_score,
          round: i.value?.round,
          blockingIssues: i.value?.blocking_issues ?? [],
          reviewWarnings: i.value?.review_warnings ?? []
        })),
        resumeHint:
          locale === "zh"
            ? `发送 POST /api/agent-runs/blueprint 并在 agentRuntime.humanReviewNote 中填写复审意见以继续。`
            : `POST /api/agent-runs/blueprint with agentRuntime.humanReviewNote set to your review to resume.`
      }, 200);
    }
    throw error;
  }
}

function blueprintProviderQuestion(question: string, locale: "en" | "zh", skillContext = ""): string {
  const skillInstruction =
    skillContext.length > 0
      ? locale === "zh"
        ? `\n\n项目方法论技能（必须吸收进蓝图，不要逐字复述）：\n${skillContext}`
        : `\n\nProject methodology skills to incorporate without copying verbatim:\n${skillContext}`
      : "";

  return locale === "zh"
    ? `请为下面这个开放式需求创建、互评并修订一份完整实施蓝图。不要只给概要，要按多轮共识流程回答：第 1 轮各模型/Agent 独立给方案；第 2 轮互相质询和挑刺；第 3 轮吸收质询后修订；如共识未达到 80%，继续说明还需要怎样复核。必须覆盖：目标输出、目标系统 Agent 分工、Agent 之间如何互相提问和挑刺、数据 Schema、工作流、人工复审、实施里程碑、验收标准、风险、待确认问题、共识阈值、剩余分歧、终局评估矩阵，以及非常详细的下一步优化建议。每条建议要包含负责方、原因、行动清单、预期影响和验收检查。最后补一份 issue 级实施任务清单，每个任务包含优先级、负责方、预估、依赖、交付物、验收标准和跳过风险。${skillInstruction}\n\n需求：${question}`
    : `Create, critique, and revise a complete implementation blueprint for this open-ended request. Do not provide only a summary. Use a multi-round consensus process: round 1 independent model/agent proposals, round 2 cross-critiques, round 3 revised proposals, and if consensus is below 80%, explain the next verification needed. Cover target outputs, target-system agent responsibilities, how agents question and critique each other, data schemas, workflow, human review, milestones, acceptance criteria, risks, open questions, consensus threshold, remaining disagreements, final evaluation matrix, and very detailed next-step recommendations. Each recommendation needs owner, reason, action list, expected impact, and acceptance check. Finish with an issue-level implementation backlog; each task needs priority, owner, effort, dependencies, deliverables, acceptance criteria, and risk if skipped.${skillInstruction}\n\nRequest: ${question}`;
}

function blueprintSkillContext(question: string, context: DecisionContext): string {
  const domain = inferDecisionDomain(question, context);
  const matches = matchSkills(question, domain, "principal_architect")
    .filter(isBlueprintSkill)
    .slice(0, 4);

  return buildSkillInjection(matches.map((skill) => skill.name), matches);
}

function isBlueprintSkill(skill: SkillMeta): boolean {
  return skill.inject === "blueprint" || skill.inject === "both";
}


function parseAgentRuntimeConfig(value: unknown): AgentRuntimeConfig {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const candidate = value as Partial<Record<keyof AgentRuntimeConfig, unknown>>;
  const threadId = nonEmptyString(candidate.threadId);
  const maxConsensusRounds =
    typeof candidate.maxConsensusRounds === "number" && Number.isInteger(candidate.maxConsensusRounds)
      ? candidate.maxConsensusRounds
      : undefined;
  const humanReviewNote = nonEmptyString(candidate.humanReviewNote);

  return {
    ...(threadId ? { threadId } : {}),
    ...(maxConsensusRounds ? { maxConsensusRounds } : {}),
    ...(humanReviewNote ? { humanReviewNote } : {})
  };
}

function parseBlueprintRuntimeConfig(value: unknown): BlueprintRuntimeConfig {
  if (typeof value !== "object" || value === null) {
    return { executionMode: "live" };
  }

  const candidate = value as Partial<Record<keyof BlueprintRuntimeConfig, unknown>>;

  return {
    executionMode: candidate.executionMode === "deterministic" ? "deterministic" : "live",
    maxProviderRounds:
      typeof candidate.maxProviderRounds === "number" && Number.isFinite(candidate.maxProviderRounds)
        ? Math.min(5, Math.max(1, Math.round(candidate.maxProviderRounds)))
        : undefined
  };
}

function summarizeBlueprintExecution(input: {
  requested: BlueprintExecutionMode;
  requestedProviderMode: "demo" | "live";
  configuredProviderCount: number;
  providerTrace: Awaited<ReturnType<typeof runLiveDecisionTrace>>;
}): BlueprintExecutionSummary {
  const providerCalls = input.providerTrace.length;
  const usableCalls = countUsableTraceEntries(input.providerTrace);
  const liveTraceAttempted = providerCalls > 0;
  const liveTraceUsable = usableCalls > 0;

  return {
    requested: input.requested,
    actual: liveTraceUsable ? "live" : "deterministic",
    liveTraceRequired: input.requested === "live",
    liveTraceAttempted,
    liveTraceUsable,
    providerCalls,
    usableCalls,
    fallbackReason: liveTraceUsable
      ? undefined
      : input.requested === "deterministic"
        ? "deterministic_mode"
        : input.requestedProviderMode !== "live"
          ? "provider_mode_demo"
          : input.configuredProviderCount === 0
            ? "no_configured_providers"
            : liveTraceAttempted
              ? "no_usable_live_trace"
              : "no_configured_providers"
  };
}

function countUsableTraceEntries(trace: Awaited<ReturnType<typeof runLiveDecisionTrace>>): number {
  return trace.filter(
    (entry) =>
      entry.status === "ok" &&
      entry.jsonParsed &&
      (entry.validationStatus === "valid" || entry.validationStatus === "repaired")
  ).length;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function providerModeForEnv(env: Env): "demo" | "live" {
  return env.QUORUMMIND_PROVIDER_MODE === "live" ? "live" : "demo";
}

function persistenceStatusForEnv(env: Env) {
  return env.QUORUMMIND_SQLITE_PATH
    ? {
        mode: "sqlite" as const,
        configured: true
      }
    : {
        mode: "browser_local" as const,
        configured: false
  };
}

function listPersistedDecisionRooms(request: Request, env: Env): Response {
  const persistence = persistenceStatusForEnv(env);

  if (!env.QUORUMMIND_SQLITE_PATH) {
    return json(request, env, {
      persistence,
      rooms: []
    });
  }

  const repository = createSqliteDecisionRepository({ databasePath: env.QUORUMMIND_SQLITE_PATH });

  try {
    return json(request, env, {
      persistence,
      rooms: repository.listDecisionRooms()
    });
  } catch (error) {
    return json(
      request,
      env,
      {
        persistence,
        rooms: [],
        error: error instanceof Error ? error.message : "Unknown SQLite persistence error"
      },
      500
    );
  } finally {
    repository.close();
  }
}

function openPersistedDecisionRoom(request: Request, env: Env, roomId: string): Response {
  const persistence = persistenceStatusForEnv(env);

  if (!roomId) {
    return json(request, env, { error: "Decision room id is required." }, 400);
  }

  if (!env.QUORUMMIND_SQLITE_PATH) {
    return json(request, env, { persistence, error: "SQLite persistence is not configured." }, 404);
  }

  const repository = createSqliteDecisionRepository({ databasePath: env.QUORUMMIND_SQLITE_PATH });

  try {
    const room = repository.findDecisionRoom(roomId);

    if (!room) {
      return json(request, env, { persistence, error: "Decision room not found." }, 404);
    }

    return json(request, env, {
      persistence,
      room
    });
  } catch (error) {
    return json(
      request,
      env,
      {
        persistence,
        error: error instanceof Error ? error.message : "Unknown SQLite persistence error"
      },
      500
    );
  } finally {
    repository.close();
  }
}

function persistDecisionRoomIfConfigured(
  env: Env,
  input: {
    id: string;
    question: string;
    locale: "en" | "zh";
    mode: DecisionMode;
    providerMode: "demo" | "live";
    selectedProposalId: string;
    recommendation: string;
    quorumScore: number;
    dissentIndex: number;
    providerTrace: Awaited<ReturnType<typeof runLiveDecisionTrace>>;
    liveVerdict: ReturnType<typeof aggregateLiveVerdict>;
    promptBundle: ReturnType<typeof createManualProviderBundle>;
    result: ReturnType<typeof runDecisionRoom>;
    reputationFeedback: ModelReputationFeedback[];
    createdAt: string;
  }
) {
  const base = persistenceStatusForEnv(env);

  if (!env.QUORUMMIND_SQLITE_PATH) {
    return {
      ...base,
      saved: false
    };
  }

  const repository = createSqliteDecisionRepository({ databasePath: env.QUORUMMIND_SQLITE_PATH });

  try {
    repository.saveDecisionRoom({
      id: input.id,
      question: input.question,
      locale: input.locale,
      mode: input.mode,
      providerMode: input.providerMode,
      selectedProposalId: input.selectedProposalId,
      recommendation: input.recommendation,
      quorumScore: input.quorumScore,
      dissentIndex: input.dissentIndex,
      providerTrace: input.providerTrace,
      liveVerdict: input.liveVerdict,
      promptBundle: input.promptBundle,
      result: input.result,
      createdAt: input.createdAt
    });

    if (input.reputationFeedback.length > 0) {
      repository.saveReputationFeedback(input.reputationFeedback, input.id);
    }

    return {
      ...base,
      saved: true
    };
  } catch (error) {
    return {
      ...base,
      saved: false,
      error: error instanceof Error ? error.message : "Unknown SQLite persistence error"
    };
  } finally {
    repository.close();
  }
}

function safePdfFilename(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 160);
  const fallback = cleaned || "quorummind-final-result.pdf";

  return fallback.toLowerCase().endsWith(".pdf") ? fallback : `${fallback}.pdf`;
}

function attachmentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function json(request: Request, env: Env, body: unknown, status = 200): Response {
  return secureJson(request, env, body, status);
}
