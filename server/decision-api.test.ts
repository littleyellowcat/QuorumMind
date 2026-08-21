// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { handleApiRequest } from "./decision-api";
import type { DecisionContext } from "../src/lib/domain";
import { createSqliteDecisionRepository } from "./persistence/sqlite-repository";
import { createRunArtifactIndex } from "./harness/run-artifact-index";
import { createRunEventStore } from "./harness/run-event-store";
import { createRunStatusStore } from "./harness/run-status-store";
import { createPermissionApprovalStore } from "./harness/permission-approval-store";
import { createPermissionApprovalRecord, decideToolPermission } from "./harness/tool-governance";

const context: DecisionContext = {
  productStage: "mvp",
  expectedScale: "50 tenants",
  teamProfile: "Small full-stack team",
  budgetSensitivity: "high",
  reliabilityRequirement: "medium",
  securityRequirement: "high",
  existingConstraints: ["Use PostgreSQL"],
  candidateOptions: ["Shared tables", "Schema per tenant"],
  assumptions: ["No strict compliance need at launch"]
};

describe("handleApiRequest", () => {
  it("returns a demo decision result when provider mode is demo", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/decisions", {
        method: "POST",
        body: JSON.stringify({
          question: "Should we use shared tables or schema-per-tenant?",
          mode: "deep",
          locale: "en",
          context
        })
      }),
      { QUORUMMIND_PROVIDER_MODE: "demo" }
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerMode).toBe("demo");
    expect(body.result.verdict.adrMarkdown).toContain("# ADR:");
    expect(body.result.verdict.rankedProposals.length).toBeGreaterThan(0);
    expect(body.contextLedger).toMatchObject({
      schemaVersion: 1,
      fallback: {
        used: true,
        reason: "provider_mode_demo"
      },
      providerEvidence: {
        attempted: false,
        usableCalls: 0
      }
    });
    expect(body.contextLedger.contextHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns a demo blueprint result for open-ended blueprint requests", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/blueprints", {
        method: "POST",
        body: JSON.stringify({
          question: "我想做一个视觉类游戏，用多 agent 处理小说文本，工作流和字段怎么设计？",
          mode: "deep",
          locale: "zh",
          context
        })
      }),
      { QUORUMMIND_PROVIDER_MODE: "demo" }
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerMode).toBe("demo");
    expect(body.providerTrace).toEqual([]);
    expect(body.blueprintExecution).toMatchObject({
      requested: "live",
      actual: "deterministic",
      liveTraceRequired: true,
      liveTraceAttempted: false,
      liveTraceUsable: false,
      providerCalls: 0,
      usableCalls: 0,
      fallbackReason: "provider_mode_demo"
    });
    expect(body.result.finalSpec.title).toContain("视觉小说");
    expect(body.result.finalSpec.schemas.map((schema: { name: string }) => schema.name)).toContain("CharacterCard");
    expect(body.promptBundle.prompts[0].prompt).toContain("完整实施蓝图");
  });

  it("keeps non-game multi-agent blueprint API requests grounded in the current question", async () => {
    const question =
      "我想做一个面向中小跨境电商团队的 AI 运营助手。它需要根据店铺订单、商品库存、广告投放数据和客服对话，自动生成每日运营简报，并给出补货建议、广告预算调整建议、差评处理优先级和客服话术优化方案。请设计 Agent 分工、数据流、Schema、风险控制、MVP 路线和评估指标。";
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/blueprints", {
        method: "POST",
        body: JSON.stringify({
          question,
          mode: "deep",
          locale: "zh",
          context,
          blueprintRuntime: {
            executionMode: "deterministic",
            maxProviderRounds: 2
          }
        })
      }),
      { QUORUMMIND_PROVIDER_MODE: "demo" }
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.finalSpec.title).toContain("跨境电商");
    expect(body.result.finalSpec.title).toContain("AI 运营助手");
    expect(body.result.finalSpec.workflowStages).toHaveLength(6);
    expect(body.result.finalSpec.schemas.map((schema: { name: string }) => schema.name)).toContain("RecommendationItem");
    expect(body.result.finalSpec.markdown).toContain("订单数据");
    expect(body.result.finalSpec.markdown).toContain("库存数据");
    expect(body.result.finalSpec.markdown).toContain("广告投放数据");
    expect(body.result.finalSpec.markdown).toContain("客服对话");
    expect(body.result.finalSpec.markdown).not.toContain("视觉小说");
    expect(body.result.finalSpec.markdown).not.toContain("章节解析");
    expect(body.result.finalSpec.markdown).not.toContain("CharacterCard");
  });

  it("returns an autonomous LangGraph blueprint run with live fallback evidence when providers are unavailable", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/agent-runs/blueprint", {
        method: "POST",
        body: JSON.stringify({
          question: "我想做一个视觉类游戏，用多 agent 处理小说文本，工作流和字段怎么设计？",
          mode: "deep",
          locale: "zh",
          context,
          agentRuntime: {
            threadId: "api-agent-thread",
            maxConsensusRounds: 2,
            humanReviewNote: "Test review note — override consensus check"
          }
        })
      }),
      { QUORUMMIND_PROVIDER_MODE: "demo" }
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerMode).toBe("demo");
    expect(body.run.platform.orchestrator).toBe("langgraph");
    expect(body.run.platform.toolLayer).toBe("langchain-core");
    expect(body.run.providerTrace).toEqual([]);
    expect(body.run.liveModel).toMatchObject({
      requested: "live",
      actual: "deterministic",
      liveTraceRequired: true,
      liveTraceAttempted: false,
      liveTraceUsable: false,
      fallbackReason: "provider_mode_demo"
    });
    expect(body.run.checkpoint.threadId).toBe("api-agent-thread");
    expect(body.run.runtimeLimits.maxConsensusRounds).toBe(2);
    expect(body.run.summary.humanReviewRequired).toBe(true);
    expect(body.run.toolCalls.map((entry: { toolName: string }) => entry.toolName)).toContain("quorummind_create_blueprint");
    expect(body.run.summary.nextActions).toHaveLength(3);
    expect(body.run.result.finalSpec.title).toContain("视觉小说");
  });

  it("returns a human-review package instead of failing when the autonomous round budget is exhausted", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/agent-runs/blueprint", {
        method: "POST",
        body: JSON.stringify({
          question: "我想做一个视觉类游戏，用多 agent 处理小说文本，工作流和字段怎么设计？",
          mode: "deep",
          locale: "zh",
          context,
          agentRuntime: {
            threadId: "api-agent-thread-needs-review",
            maxConsensusRounds: 2
          }
        })
      }),
      { QUORUMMIND_PROVIDER_MODE: "demo" }
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run.summary).toMatchObject({
      consensusPassed: false,
      humanReviewRequired: true,
      terminationReason: "round_budget_exhausted"
    });
    expect(body.run.trace.find((entry: { node: string }) => entry.node === "human_review_gate")).toMatchObject({
      status: "needs_review"
    });
  });

  it("rejects invalid PDF export payloads before rendering", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/exports/pdf", {
        method: "POST",
        body: JSON.stringify({
          html: "",
          filename: "../bad.pdf"
        })
      }),
      { QUORUMMIND_PROVIDER_MODE: "demo" }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid PDF export request");
  });

  it("runs a keyless mock live decision trace for deterministic E2E demos", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/decisions", {
        method: "POST",
        headers: { "X-Forwarded-For": "198.51.100.42" },
        body: JSON.stringify({
          question: "Should we use shared tables or schema-per-tenant?",
          mode: "fast",
          locale: "en",
          context
        })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "live",
        QUORUMMIND_MOCK_PROVIDERS: "1"
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerMode).toBe("live");
    expect(body.providerTrace).toHaveLength(9);
    expect(body.providerTrace[0]).toMatchObject({
      provider: "openai",
      model: "mock-gpt-seat",
      validationStatus: "valid",
      normalized: expect.objectContaining({
        proposalId: expect.any(String)
      })
    });
    expect(body.providerRun).toMatchObject({
      summary: {
        providerCount: 3,
        entryCount: 9,
        failureCount: 0
      }
    });
    expect(body.providerRun.events.map((event: { type: string }) => event.type)).toContain("run_complete");
    expect(body.liveVerdict).toMatchObject({
      source: "live",
      selectedProposalId: expect.any(String),
      rankedProposals: expect.any(Array)
    });
  });

  it("returns prompt bundle agents resolved from live provider models when no custom names are supplied", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/decisions", {
        method: "POST",
        headers: { "X-Forwarded-For": "198.51.100.43" },
        body: JSON.stringify({
          question: "Should we use shared tables or schema-per-tenant?",
          mode: "fast",
          locale: "en",
          context
        })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "live",
        QUORUMMIND_MOCK_PROVIDERS: "1"
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.promptBundle.agents.map((agent: { name: string }) => agent.name)).toEqual([
      "Mock GPT Seat Product Architect",
      "Mock DeepSeek Seat Cost/Risk Critic",
      "Mock Gemini Seat Strategic Reviewer"
    ]);
    expect(body.providerTrace.slice(0, 3).map((entry: { agentName: string }) => entry.agentName)).toEqual(
      body.promptBundle.agents.map((agent: { name: string }) => agent.name)
    );
  });

  it("passes the configured live provider retry budget into decision traces", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/decisions", {
        method: "POST",
        body: JSON.stringify({
          question: "Should we use shared tables or schema-per-tenant?",
          mode: "fast",
          locale: "en",
          context
        })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "live",
        QUORUMMIND_MOCK_PROVIDERS: "1",
        QUORUMMIND_LIVE_PROVIDER_MAX_ATTEMPTS: "2"
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerTrace.every((entry: { maxAttempts: number }) => entry.maxAttempts === 2)).toBe(true);
  });

  it("runs a keyless mock live blueprint trace without exposing secrets", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/blueprints", {
        method: "POST",
        body: JSON.stringify({
          question: "How should we design a multi-agent visual novel workflow?",
          mode: "fast",
          locale: "en",
          context
        })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "live",
        QUORUMMIND_MOCK_PROVIDERS: "1",
        OPENAI_API_KEY: "sk-secret"
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerMode).toBe("live");
    expect(body.providerTrace).toHaveLength(15);
    expect(body.providerRun.summary).toMatchObject({
      providerCount: 3,
      entryCount: 15,
      failureCount: 0
    });
    expect(body.blueprintExecution).toMatchObject({
      requested: "live",
      actual: "live",
      liveTraceRequired: true,
      liveTraceAttempted: true,
      liveTraceUsable: true,
      providerCalls: 15,
      usableCalls: 15
    });
    expect(body.result.finalSpec.workflowStages.length).toBeGreaterThan(0);
    expect(body.promptBundle.prompts[0].prompt).toContain("complete implementation blueprint");
    expect(JSON.stringify(body)).not.toContain("sk-secret");
  });

  it("skips provider calls for explicitly deterministic blueprint runs even when mock live providers exist", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/blueprints", {
        method: "POST",
        body: JSON.stringify({
          question: "How should we design a multi-agent visual novel workflow?",
          mode: "deep",
          locale: "en",
          context,
          blueprintRuntime: {
            executionMode: "deterministic"
          }
        })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "live",
        QUORUMMIND_MOCK_PROVIDERS: "1"
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerMode).toBe("demo");
    expect(body.providerTrace).toEqual([]);
    expect(body.blueprintExecution).toMatchObject({
      requested: "deterministic",
      actual: "deterministic",
      liveTraceRequired: false,
      liveTraceAttempted: false,
      liveTraceUsable: false,
      providerCalls: 0,
      usableCalls: 0,
      fallbackReason: "deterministic_mode"
    });
  });

  it("caps live blueprint provider phases when maxProviderRounds is set", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/blueprints", {
        method: "POST",
        body: JSON.stringify({
          question: "How should we design a multi-agent visual novel workflow?",
          mode: "deep",
          locale: "en",
          context,
          blueprintRuntime: {
            executionMode: "live",
            maxProviderRounds: 2
          }
        })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "live",
        QUORUMMIND_MOCK_PROVIDERS: "1"
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerMode).toBe("live");
    expect(body.providerTrace).toHaveLength(6);
    expect([...new Set(body.providerTrace.map((entry: { phase: string }) => entry.phase))]).toEqual(["proposal", "critique"]);
    expect(body.blueprintExecution).toMatchObject({
      requested: "live",
      actual: "live",
      providerCalls: 6,
      usableCalls: 6
    });
  });

  it("runs autonomous Agent platform blueprint with mock live provider trace", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/agent-runs/blueprint", {
        method: "POST",
        body: JSON.stringify({
          question: "How should we design a multi-agent visual novel workflow?",
          mode: "fast",
          locale: "en",
          context,
          blueprintRuntime: {
            executionMode: "live"
          },
          agentRuntime: {
            threadId: "api-live-agent-thread",
            maxConsensusRounds: 2,
            humanReviewNote: "Test note"
          }
        })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "live",
        QUORUMMIND_MOCK_PROVIDERS: "1"
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerMode).toBe("live");
    expect(body.run.providerTrace).toHaveLength(15);
    expect(body.run.liveModel).toMatchObject({
      requested: "live",
      actual: "live",
      liveTraceRequired: true,
      liveTraceAttempted: true,
      liveTraceUsable: true,
      providerCalls: 15,
      usableCalls: 15
    });
    expect(body.run.platform.source).toBe("live_model_trace_with_deterministic_synthesis");
    expect(body.run.trace.find((entry: { node: string }) => entry.node === "understand_request")).toMatchObject({
      status: "complete"
    });
    expect(body.run.toolCalls.map((entry: { toolName: string }) => entry.toolName)).toContain(
      "quorummind_live_understand_request_trace"
    );
    expect(body.run.toolCalls.map((entry: { source: string }) => entry.source)).toContain("live_model_provider");
  });

  it("replays agent run events incrementally and as an SSE stream", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-api-events-"));
    const eventStore = createRunEventStore({ rootDir });

    eventStore.appendEvent({
      runId: "run-1",
      seq: 0,
      timestamp: "2026-08-20T12:00:00.000Z",
      type: "run_start",
      severity: "info",
      summary: "started",
      truncated: false
    });
    eventStore.appendEvent({
      runId: "run-1",
      seq: 0,
      timestamp: "2026-08-20T12:00:01.000Z",
      type: "planner_complete",
      severity: "info",
      summary: "planned",
      truncated: false
    });

    const jsonResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/agent-runs/run-1/events?after=1"),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const jsonBody = await jsonResponse.json();
    const sseResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/agent-runs/run-1/events?after=1&stream=sse"),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const sseText = await sseResponse.text();

    expect(jsonResponse.status).toBe(200);
    expect(jsonBody.events).toEqual([
      expect.objectContaining({ seq: 2, type: "planner_complete", schemaVersion: 1 })
    ]);
    expect(jsonBody.nextAfter).toBe(2);
    expect(sseResponse.headers.get("Content-Type")).toContain("text/event-stream");
    expect(sseText).toContain("event: planner_complete");
    expect(sseText).toContain("\"seq\":2");
  });

  it("exposes run artifacts and supports interrupt and wait runtime coordination endpoints", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-api-coordinator-"));
    const statusStore = createRunStatusStore({ rootDir });
    const artifacts = createRunArtifactIndex({ rootDir });

    statusStore.save({
      runId: "run-1",
      kind: "autonomous_blueprint",
      status: "running",
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z"
    });
    artifacts.add("run-1", {
      kind: "prompt_bundle",
      label: "prompt bundle",
      inline: { promptCount: 3 }
    });

    const detailResponse = await handleApiRequest(new Request("http://127.0.0.1:8787/api/agent-runs/run-1"), {
      QUORUMMIND_RUN_STORE_DIR: rootDir
    });
    const detailBody = await detailResponse.json();
    const interruptResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/agent-runs/run-1/interrupt", {
        method: "POST",
        body: JSON.stringify({ reason: "manual stop" })
      }),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const interruptBody = await interruptResponse.json();
    const waitResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/agent-runs/run-1/wait"),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const waitBody = await waitResponse.json();

    expect(detailBody.artifacts).toEqual([
      expect.objectContaining({ kind: "prompt_bundle", label: "prompt bundle" })
    ]);
    expect(interruptResponse.status).toBe(200);
    expect(interruptBody.status).toBe("interrupted");
    expect(waitBody).toMatchObject({
      runId: "run-1",
      status: "interrupted",
      reason: "manual stop"
    });
  });

  it("projects an agent run read model through the API", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-api-read-model-"));
    const statusStore = createRunStatusStore({ rootDir });
    const eventStore = createRunEventStore({ rootDir });
    const artifacts = createRunArtifactIndex({ rootDir });

    statusStore.save({
      runId: "run-1",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:04.000Z",
      summary: "read model test"
    });
    eventStore.appendEvent({
      runId: "run-1",
      seq: 0,
      timestamp: "2026-08-20T12:00:00.000Z",
      type: "run_start",
      severity: "info",
      summary: "start",
      truncated: false
    });
    eventStore.appendEvent({
      runId: "run-1",
      seq: 0,
      timestamp: "2026-08-20T12:00:01.000Z",
      type: "provider_attempt_success",
      severity: "info",
      summary: "provider ok",
      truncated: false
    });
    artifacts.add("run-1", {
      kind: "provider_trace",
      label: "provider trace",
      inline: { providerCalls: 1 }
    });

    const response = await handleApiRequest(new Request("http://127.0.0.1:8787/api/agent-runs/run-1/read-model"), {
      QUORUMMIND_RUN_STORE_DIR: rootDir
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary).toMatchObject({
      runId: "run-1",
      status: "completed",
      eventCount: 2,
      artifactCount: 1
    });
    expect(body.metrics).toMatchObject({
      providerCallCount: 1,
      artifactCount: 1
    });
    expect(body.timeline.map((item: { type: string }) => item.type)).toEqual(["run_start", "provider_attempt_success"]);
  });

  it("exposes an audit replay list and detailed replay package through the API", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-api-audit-replay-"));
    const statusStore = createRunStatusStore({ rootDir });
    const eventStore = createRunEventStore({ rootDir });
    const artifacts = createRunArtifactIndex({ rootDir });
    const approvals = createPermissionApprovalStore({ rootDir });

    statusStore.save({
      runId: "run-1",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T08:00:04.000Z",
      summary: "GitHub architecture review"
    });
    eventStore.appendEvent({
      runId: "run-1",
      seq: 0,
      timestamp: "2026-08-21T08:00:01.000Z",
      type: "provider_attempt_success",
      severity: "info",
      phase: "proposal",
      provider: "openrouter",
      model: "anthropic/claude",
      summary: "provider ok",
      truncated: false
    });
    artifacts.add("run-1", {
      kind: "bounded_output",
      label: "GitHub native review package",
      inline: {
        github: {
          checkRun: { name: "QuorumMind Architecture Review", conclusion: "neutral", annotations: [{ path: "server/auth.ts" }] },
          pullRequestReview: { event: "COMMENT", comments: [{ path: "server/auth.ts", body: "Review boundary." }] }
        }
      }
    });
    approvals.add(createPermissionApprovalRecord(
      decideToolPermission({
        toolName: "mcp:github:list_pull_requests",
        node: "github_context"
      }),
      {
        runId: "run-1",
        requestedBy: "executor_agent",
        status: "approved",
        createdAt: "2026-08-21T08:00:02.000Z"
      }
    ));

    const listResponse = await handleApiRequest(new Request("http://127.0.0.1:8787/api/agent-runs/audit"), {
      QUORUMMIND_RUN_STORE_DIR: rootDir
    });
    const detailResponse = await handleApiRequest(new Request("http://127.0.0.1:8787/api/agent-runs/run-1/audit"), {
      QUORUMMIND_RUN_STORE_DIR: rootDir
    });
    const listBody = await listResponse.json();
    const detailBody = await detailResponse.json();

    expect(listResponse.status).toBe(200);
    expect(listBody.replays).toEqual([
      expect.objectContaining({
        runId: "run-1",
        status: "completed",
        eventCount: 1
      })
    ]);
    expect(detailResponse.status).toBe(200);
    expect(detailBody.replay).toMatchObject({
      summary: expect.objectContaining({ runId: "run-1" }),
      metrics: expect.objectContaining({
        permissionDecisionCount: 1,
        githubReviewCount: 1
      }),
      githubReviews: [
        expect.objectContaining({
          checkRunConclusion: "neutral",
          reviewCommentCount: 1,
          annotationCount: 1
        })
      ]
    });
    expect(detailBody.replay.replayPackage).toContain("GitHub architecture review");
  });

  it("filters audit archives, returns bundles, and diffs two audit replays through the API", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-api-audit-archive-"));
    const statusStore = createRunStatusStore({ rootDir });
    const eventStore = createRunEventStore({ rootDir });
    const artifacts = createRunArtifactIndex({ rootDir });

    statusStore.save({
      runId: "base-run",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-21T07:00:00.000Z",
      updatedAt: "2026-08-21T07:00:01.000Z",
      summary: "Base auth review"
    });
    statusStore.save({
      runId: "target-run",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T08:00:01.000Z",
      summary: "Target auth PR review"
    });
    eventStore.appendEvent({
      runId: "target-run",
      seq: 0,
      timestamp: "2026-08-21T08:00:01.000Z",
      type: "provider_attempt_success",
      severity: "info",
      provider: "openrouter",
      model: "claude",
      summary: "provider ok",
      truncated: false
    });
    artifacts.add("target-run", {
      kind: "bounded_output",
      label: "ADR draft",
      path: "docs/ADR-042-auth.md",
      sha256: "abc",
      metadata: {
        prNumber: 42,
        adrPath: "docs/ADR-042-auth.md",
        riskLevels: ["high"]
      }
    });

    const listResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/agent-runs/audit?query=auth&status=completed&provider=openrouter&pr=42&adr=ADR-042&risk=high"),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const bundleResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/agent-runs/target-run/audit?bundle=true"),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const diffResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/agent-runs/audit/diff?base=base-run&target=target-run"),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const listBody = await listResponse.json();
    const bundleBody = await bundleResponse.json();
    const diffBody = await diffResponse.json();

    expect(listBody.replays).toEqual([
      expect.objectContaining({
        runId: "target-run",
        linkedPullRequests: [42],
        linkedAdrPaths: ["docs/ADR-042-auth.md"]
      })
    ]);
    expect(bundleBody.bundle).toMatchObject({
      manifest: expect.objectContaining({
        runId: "target-run",
        linkedPullRequests: [42]
      }),
      files: [
        expect.objectContaining({
          path: "docs/ADR-042-auth.md",
          sha256: "abc"
        })
      ]
    });
    expect(diffResponse.status).toBe(200);
    expect(diffBody.diff).toMatchObject({
      baseRunId: "base-run",
      targetRunId: "target-run",
      metricDelta: expect.objectContaining({
        providerCallCount: 1
      })
    });
  });

  it("accepts approval reply decisions through the API", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-api-approval-reply-"));
    const store = createPermissionApprovalStore({ rootDir });
    const record = createPermissionApprovalRecord(
      decideToolPermission({
        toolName: "quorummind_live_blueprint_provider_trace",
        node: "live_model_review"
      }),
      {
        runId: "run-1",
        requestedBy: "supervisor_agent",
        createdAt: "2026-08-20T12:00:00.000Z"
      }
    );

    store.add(record);

    const response = await handleApiRequest(
      new Request(`http://127.0.0.1:8787/api/agent-runs/run-1/approvals/${encodeURIComponent(record.id)}/reply`, {
        method: "POST",
        body: JSON.stringify({
          reply: "always",
          message: "本工具后续允许自动执行"
        })
      }),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.approval).toMatchObject({
      id: record.id,
      status: "approved",
      scope: "tool",
      replyMessage: "本工具后续允许自动执行"
    });
    expect(store.savedApprovals()).toEqual([
      expect.objectContaining({
        id: record.id,
        scope: "tool"
      })
    ]);
  });

  it("returns a read-only permission audit report", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-permission-audit-"));
    const store = createPermissionApprovalStore({ rootDir });
    const record = createPermissionApprovalRecord(
      decideToolPermission({
        toolName: "quorummind_live_blueprint_provider_trace",
        objective: "call provider",
        node: "live_model_review"
      }),
      {
        runId: "run-1",
        requestedBy: "executor_agent",
        createdAt: "2026-08-20T12:00:00.000Z"
      }
    );
    store.add(record);

    const response = await handleApiRequest(new Request("http://127.0.0.1:8787/api/permissions/audit"), {
      QUORUMMIND_RUN_STORE_DIR: rootDir
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary).toMatchObject({
      total: 1,
      humanGated: 1
    });
    expect(body.items[0]).toMatchObject({
      id: record.id,
      requiresHumanConfirmation: true,
      outputHandling: {
        redacted: true
      }
    });
    expect(body.approvalPackage).toContain("run-1");
  });

  it("returns permission lifecycle summary and can revoke saved approvals", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-permission-lifecycle-api-"));
    const store = createPermissionApprovalStore({ rootDir });
    const record = createPermissionApprovalRecord(
      decideToolPermission({
        toolName: "quorummind_live_blueprint_provider_trace",
        objective: "call provider",
        node: "live_model_review"
      }),
      {
        runId: "run-lifecycle",
        requestedBy: "executor_agent",
        status: "approved",
        scope: "tool",
        createdAt: "2026-08-20T12:00:00.000Z"
      }
    );
    store.add(record);

    const revokeResponse = await handleApiRequest(
      new Request(`http://127.0.0.1:8787/api/permissions/approvals/${encodeURIComponent(record.id)}/revoke`, {
        method: "POST"
      }),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const lifecycleResponse = await handleApiRequest(new Request("http://127.0.0.1:8787/api/permissions/lifecycle"), {
      QUORUMMIND_RUN_STORE_DIR: rootDir
    });
    const lifecycle = await lifecycleResponse.json();

    expect(revokeResponse.status).toBe(200);
    expect(lifecycleResponse.status).toBe(200);
    expect(lifecycle.summary).toMatchObject({
      total: 1,
      approved: 1,
      revoked: 1
    });
    expect(store.savedApprovals()).toEqual([]);
  });

  it("accepts approval replies through the permission audit center route", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-permission-reply-"));
    const store = createPermissionApprovalStore({ rootDir });
    const record = createPermissionApprovalRecord(
      decideToolPermission({
        toolName: "quorummind_live_blueprint_provider_trace",
        objective: "call provider",
        node: "live_model_review"
      }),
      {
        runId: "run-approval-center",
        requestedBy: "executor_agent",
        createdAt: "2026-08-20T12:00:00.000Z"
      }
    );
    store.add(record);

    const response = await handleApiRequest(
      new Request(`http://127.0.0.1:8787/api/permissions/approvals/${encodeURIComponent(record.id)}/reply`, {
        method: "POST",
        body: JSON.stringify({
          reply: "approve",
          message: "Approved for this run."
        })
      }),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.approval).toMatchObject({
      id: record.id,
      status: "approved",
      scope: "run",
      replyMessage: "Approved for this run."
    });
  });

  it("lists configured MCP and custom tool manifests without secrets", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-api-tools-"));
    writeFileSync(
      join(rootDir, "quorummind.config.json"),
      JSON.stringify({
        mcpServers: {
          github: {
            command: "npx",
            env: { GITHUB_TOKEN: "secret-token" }
          }
        },
        customTools: [{ name: "repo_diff_summary", description: "Summarize a supplied repo diff" }]
      }),
      "utf8"
    );

    const response = await handleApiRequest(new Request("http://127.0.0.1:8787/api/tools/manifests"), {
      QUORUMMIND_CONFIG_DIR: rootDir
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tools).toContainEqual(expect.objectContaining({
      name: "mcp:github",
      kind: "mcp_server",
      envKeys: ["GITHUB_TOKEN"]
    }));
    expect(body.tools).toContainEqual(expect.objectContaining({
      name: "repo_diff_summary",
      kind: "custom_tool"
    }));
    expect(JSON.stringify(body)).not.toContain("secret-token");
  });

  it("executes configured read-only custom tools through the API and permission policy", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-api-tool-exec-"));
    writeFileSync(
      join(rootDir, "quorummind.config.json"),
      JSON.stringify({
        customTools: [{ name: "repo_diff_summary", description: "Summarize a supplied repo diff" }],
        agents: {
          blueprint: {
            tools: ["repo_diff_summary"]
          }
        }
      }),
      "utf8"
    );

    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/tools/read-only", {
        method: "POST",
        body: JSON.stringify({
          runId: "run-tool-api",
          agentId: "blueprint",
          toolName: "repo_diff_summary",
          input: {
            diffText: "diff --git a/server/auth.ts b/server/auth.ts\n+++ b/server/auth.ts\n+token"
          }
        })
      }),
      {
        QUORUMMIND_CONFIG_DIR: rootDir,
        QUORUMMIND_RUN_STORE_DIR: rootDir
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("executed");
    expect(body.permission).toMatchObject({
      category: "read_only",
      decision: "auto"
    });
    expect(body.output).toMatchObject({
      changedFiles: ["server/auth.ts"]
    });
  });

  it("builds a repository workspace model from selected files and review evidence", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-workspace-api-"));
    writeFileSync(join(rootDir, "package.json"), JSON.stringify({ dependencies: { zod: "^4.0.0" } }), "utf8");
    mkdirSync(join(rootDir, "docs"));
    writeFileSync(join(rootDir, "docs", "ADR-001-boundary.md"), "# ADR: Boundary model\n", "utf8");
    writeFileSync(join(rootDir, "src.ts"), "export const answer = 42;\n", "utf8");

    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/repo/workspace", {
        method: "POST",
        body: JSON.stringify({
          selectedFiles: ["src.ts"],
          diffText: "diff --git a/src.ts b/src.ts\n+++ b/src.ts\n+export const answer = 42;",
          testOutput: "1 passed",
          ciStatus: "passing"
        })
      }),
      { QUORUMMIND_CONFIG_DIR: rootDir }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspace.selectedFiles).toContainEqual(expect.objectContaining({ path: "src.ts" }));
    expect(body.workspace.adrHistory).toContainEqual(expect.objectContaining({ path: "docs/ADR-001-boundary.md" }));
    expect(body.workspace.testEvidence.status).toBe("passed");
    expect(body.workspace.ciEvidence.status).toBe("passing");
  });

  it("plans a GitHub review run from a slash command without writing to GitHub by default", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/github/run", {
        method: "POST",
        body: JSON.stringify({
          commentBody: "/quorummind review-pr --pr 42 focus on auth boundaries",
          repo: "kitten/quorummind",
          issueNumber: 42,
          diffText: "diff --git a/server/auth.ts b/server/auth.ts\n+++ b/server/auth.ts\n+token",
          changedFiles: ["server/auth.ts"]
        })
      }),
      { QUORUMMIND_PROVIDER_MODE: "demo" }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("planned");
    expect(body.githubWriteMode).toBe("dry_run");
    expect(body.reviewMarkdown).toContain("QuorumMind Architecture Review");
    expect(body.reviewMarkdown).toContain("focus on auth boundaries");
  });

  it("tests configured provider connectivity with mock live providers", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/providers/test", {
        method: "POST"
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "live",
        QUORUMMIND_MOCK_PROVIDERS: "1"
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providerMode).toBe("live");
    expect(body.results).toHaveLength(3);
    expect(body.results.every((result: { configured: boolean; responded: boolean; schemaUsable: boolean }) => result.configured)).toBe(true);
    expect(body.results.every((result: { configured: boolean; responded: boolean; schemaUsable: boolean }) => result.responded)).toBe(true);
    expect(body.results.every((result: { configured: boolean; responded: boolean; schemaUsable: boolean }) => result.schemaUsable)).toBe(true);
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("runs a bounded provider capability probe only when mock or explicitly enabled providers are available", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/providers/probe", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openai",
          sampleCount: 2
        })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "live",
        QUORUMMIND_MOCK_PROVIDERS: "1"
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.probe).toMatchObject({
      providerId: "openai",
      sampleCount: 2,
      jsonSchemaStable: true,
      failureRate: 0
    });
  });

  it("routes provider seats for a requested task through the API", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/providers/route", {
        method: "POST",
        body: JSON.stringify({
          task: "architecture_review",
          requirements: {
            jsonSchema: true,
            longContext: true,
            maxSeats: 2
          }
        })
      }),
      {
        OPENROUTER_API_KEY: "secret",
        OLLAMA_BASE_URL: "http://127.0.0.1:11434"
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.route.selectedSeats).toEqual([
      expect.objectContaining({ providerId: "openrouter" }),
      expect.objectContaining({ providerId: "ollama" })
    ]);
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("runs decision quality eval through the API", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/quality/eval", {
        method: "POST",
        body: JSON.stringify({
          suiteName: "offline-smoke",
          outputs: {
            "tenant-architecture-review": {
              providerId: "openrouter",
              model: "anthropic/claude",
              text: "Use shared tenant_id tables, include risk radar, ADR, consensus disagreement, validation tests, rollback, and migration trigger."
            }
          }
        })
      }),
      {}
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.summary).toMatchObject({
      suiteName: "offline-smoke",
      totalCases: expect.any(Number)
    });
    expect(body.trend.providerReputation).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: "openrouter" })
    ]));
  });

  it("keeps LLM-as-a-Judge opt-in and records a skip reason when disabled", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/quality/eval", {
        method: "POST",
        body: JSON.stringify({
          suiteName: "judge-skipped",
          judge: {
            enabled: true
          },
          outputs: {
            "tenant-architecture-review": {
              providerId: "openrouter",
              model: "anthropic/claude",
              text: "Use shared tenant tables with ADR, risk radar, rollback, validation, consensus, and migration trigger."
            }
          }
        })
      }),
      {}
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.judgeSummary).toMatchObject({
      requested: true,
      status: "skipped",
      reason: "QUORUMMIND_LLM_JUDGE_ENABLED is not set."
    });
  });

  it("validates the GitHub E2E loop through the API without external writes by default", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/github/e2e", {
        method: "POST",
        body: JSON.stringify({
          commentBody: "/qm review-pr --pr 42 focus on auth boundaries and ADR",
          repo: "kitten/quorummind",
          issueNumber: 42,
          changedFiles: ["server/auth.ts"],
          diffText: "diff --git a/server/auth.ts b/server/auth.ts\n@@ -1,1 +1,2 @@\n+const token = req.query.token"
        })
      }),
      {}
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report).toMatchObject({
      mode: "mock",
      passed: true,
      readyToWrite: false
    });
    expect(body.report.postedRequests).toHaveLength(2);
  });

  it("creates team workspaces and evaluates access through the API", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-api-team-"));
    const createResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/team/workspaces", {
        method: "POST",
        body: JSON.stringify({
          id: "architecture",
          name: "Architecture Council",
          persistenceMode: "postgres",
          members: [
            { userId: "alice", role: "owner" },
            { userId: "eve", role: "viewer" }
          ]
        })
      }),
      { QUORUMMIND_RUN_STORE_DIR: rootDir, QUORUMMIND_POSTGRES_URL: "postgres://local/redacted" }
    );
    const accessResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/team/access", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "architecture",
          userId: "eve",
          action: "approve_adr"
        })
      }),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const adrResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/team/adr-approvals", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "architecture",
          adrId: "ADR-042",
          title: "Auth boundary",
          requestedBy: "alice",
          requiredApprovers: ["alice"]
        })
      }),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const openResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/team/workspaces/architecture", {
        method: "GET"
      }),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const replyResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/team/adr-approvals/adr-architecture-ADR-042/reply", {
        method: "POST",
        body: JSON.stringify({
          userId: "alice",
          decision: "approve",
          note: "Ready."
        })
      }),
      { QUORUMMIND_RUN_STORE_DIR: rootDir }
    );
    const createBody = await createResponse.json();
    const accessBody = await accessResponse.json();
    const adrBody = await adrResponse.json();
    const openBody = await openResponse.json();
    const replyBody = await replyResponse.json();

    expect(createResponse.status).toBe(200);
    expect(createBody.workspace).toMatchObject({ id: "architecture", persistenceMode: "postgres" });
    expect(createBody.persistenceContract).toMatchObject({
      mode: "postgres",
      configured: true,
      repository: {
        available: true,
        driver: "external_query_client"
      }
    });
    expect(JSON.stringify(createBody)).not.toContain("postgres://local/redacted");
    expect(accessBody.access).toMatchObject({ allowed: false });
    expect(adrBody.approval).toMatchObject({ adrId: "ADR-042", status: "pending" });
    expect(openBody.approvals).toEqual([
      expect.objectContaining({ adrId: "ADR-042" })
    ]);
    expect(replyBody.approval).toMatchObject({
      adrId: "ADR-042",
      status: "approved"
    });
  });

  it("lists the autonomous blueprint endpoint in the sanitized security posture", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/security", {
        method: "GET",
        headers: {
          "X-QuorumMind-Token": "secret"
        }
      }),
      {
        QUORUMMIND_API_TOKEN: "secret"
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.endpoints).toContainEqual(
      expect.objectContaining({
        method: "POST",
        path: "/api/agent-runs/blueprint",
        documented: true,
        authentication: "required"
      })
    );
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("rejects an empty architecture question", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/decisions", {
        method: "POST",
        body: JSON.stringify({
          question: "",
          mode: "deep",
          locale: "en",
          context
        })
      }),
      { QUORUMMIND_PROVIDER_MODE: "demo" }
    );

    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("question");
  });

  it("uses custom agent configuration in the returned prompt bundle", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/decisions", {
        method: "POST",
        body: JSON.stringify({
          question: "Should we use shared tables or schema-per-tenant?",
          mode: "deep",
          locale: "en",
          context,
          agentConfig: [
            {
              id: "gpt",
              name: "GPT Staff Platform Architect",
              providerLabel: "Unified gateway GPT seat",
              role: "principal_architect",
              weight: 1.4,
              scoringFocus: ["platform evolution", "security boundary"]
            },
            {
              id: "deepseek",
              name: "DeepSeek Cost Sentinel",
              providerLabel: "Unified gateway DeepSeek seat",
              role: "cost_engineer",
              weight: 0.9,
              scoringFocus: ["cost ceiling"]
            },
            {
              id: "gemini",
              name: "Gemini Strategy Reviewer",
              providerLabel: "Unified gateway Gemini seat",
              role: "sre_reviewer",
              weight: 1.1,
              scoringFocus: ["migration timing"]
            }
          ]
        })
      }),
      { QUORUMMIND_PROVIDER_MODE: "demo" }
    );

    const body = await response.json();

    expect(body.promptBundle.agents[0].name).toBe("GPT Staff Platform Architect");
    expect(body.promptBundle.prompts[0].prompt).toContain("Agent weight: 1.4");
    expect(body.promptBundle.prompts[0].prompt).toContain("Model reputation:");
    expect(body.promptBundle.prompts[0].prompt).toContain("Effective agent weight:");
    expect(body.promptBundle.prompts[0].prompt).toContain("platform evolution");
  });

  it("applies model reputation feedback to returned prompt metadata", async () => {
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/decisions", {
        method: "POST",
        body: JSON.stringify({
          question: "Should we use shared tables or schema-per-tenant?",
          mode: "deep",
          locale: "en",
          context,
          reputationFeedback: [
            {
              agentId: "deepseek",
              domain: "technical_architecture",
              outcome: "helpful",
              confidence: 1,
              createdAt: "2026-06-15T00:00:00.000Z"
            }
          ]
        })
      }),
      { QUORUMMIND_PROVIDER_MODE: "demo" }
    );

    const body = await response.json();
    const deepseekPrompt = body.promptBundle.prompts.find((prompt: { agentId: string }) => prompt.agentId === "deepseek");

    expect(response.status).toBe(200);
    expect(deepseekPrompt.prompt).toContain("feedback calibration +4 from 1 historical signal");
  });

  it("persists decision rooms and reputation feedback when sqlite is configured", async () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), "quorummind-api-sqlite-")), "quorummind.db");
    const response = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/decisions", {
        method: "POST",
        body: JSON.stringify({
          question: "Should we use shared tables or schema-per-tenant?",
          mode: "fast",
          locale: "en",
          context,
          reputationFeedback: [
            {
              agentId: "gpt",
              domain: "technical_architecture",
              outcome: "helpful",
              confidence: 1,
              createdAt: "2026-06-15T00:00:00.000Z"
            }
          ]
        })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "demo",
        QUORUMMIND_SQLITE_PATH: databasePath
      }
    );
    const body = await response.json();
    const repository = createSqliteDecisionRepository({ databasePath });

    expect(response.status).toBe(200);
    expect(body.persistence).toMatchObject({ mode: "sqlite", saved: true });
    expect(repository.listDecisionRooms()).toHaveLength(1);
    expect(repository.listReputationFeedback()).toHaveLength(1);

    repository.close();
  });

  it("lists and opens sqlite-persisted decision rooms", async () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), "quorummind-api-rooms-")), "quorummind.db");
    await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/decisions", {
        method: "POST",
        body: JSON.stringify({
          question: "Should we persist server-side history?",
          mode: "fast",
          locale: "en",
          context
        })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "demo",
        QUORUMMIND_SQLITE_PATH: databasePath
      }
    );

    const listResponse = await handleApiRequest(new Request("http://127.0.0.1:8787/api/rooms"), {
      QUORUMMIND_SQLITE_PATH: databasePath
    });
    const listBody = await listResponse.json();
    const roomId = listBody.rooms[0].id;
    const detailResponse = await handleApiRequest(new Request(`http://127.0.0.1:8787/api/rooms/${roomId}`), {
      QUORUMMIND_SQLITE_PATH: databasePath
    });
    const detailBody = await detailResponse.json();

    expect(listResponse.status).toBe(200);
    expect(listBody.persistence).toMatchObject({ mode: "sqlite", configured: true });
    expect(listBody.rooms[0]).toMatchObject({
      question: "Should we persist server-side history?",
      mode: "fast",
      providerMode: "demo",
      quorumScore: expect.any(Number)
    });
    expect(detailResponse.status).toBe(200);
    expect(detailBody.room).toMatchObject({
      id: roomId,
      question: "Should we persist server-side history?",
      result: expect.objectContaining({ roomId: expect.any(String) }),
      promptBundle: expect.objectContaining({ version: "manual-v1" }),
      providerTrace: []
    });
  });

  it("returns an empty server history when sqlite is not configured", async () => {
    const response = await handleApiRequest(new Request("http://127.0.0.1:8787/api/rooms"), {
      QUORUMMIND_PROVIDER_MODE: "demo"
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      persistence: { mode: "browser_local", configured: false },
      rooms: []
    });
  });

  it("persists autonomous agent run status and exposes lightweight resume semantics", async () => {
    const runStoreDir = mkdtempSync(join(tmpdir(), "quorummind-api-runs-"));
    const createResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/agent-runs/blueprint", {
        method: "POST",
        body: JSON.stringify({
          question: "帮我设计一个多 Agent 技术选型流程",
          mode: "fast",
          locale: "zh",
          context,
          blueprintRuntime: { executionMode: "deterministic" }
        })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "demo",
        QUORUMMIND_RUN_STORE_DIR: runStoreDir
      }
    );
    const createBody = await createResponse.json();
    const runId = createBody.run.runId;

    const detailResponse = await handleApiRequest(new Request(`http://127.0.0.1:8787/api/agent-runs/${runId}`), {
      QUORUMMIND_RUN_STORE_DIR: runStoreDir
    });
    const detailBody = await detailResponse.json();
    const resumeResponse = await handleApiRequest(
      new Request(`http://127.0.0.1:8787/api/agent-runs/${runId}/resume`, {
        method: "POST",
        body: JSON.stringify({ humanReviewNote: "认可当前方案" })
      }),
      {
        QUORUMMIND_RUN_STORE_DIR: runStoreDir
      }
    );
    const resumeBody = await resumeResponse.json();

    expect(createResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(detailBody.run).toMatchObject({
      runId,
      kind: "autonomous_blueprint",
      status: "paused"
    });
    expect(detailBody.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ runId, seq: 1, type: "run_start" }),
        expect.objectContaining({ runId, type: "human_review_pause" })
      ])
    );
    expect(existsSync(join(runStoreDir, "runs", runId, "run-summary.json"))).toBe(true);
    expect(existsSync(join(runStoreDir, "runs", runId, "run-metrics.json"))).toBe(true);
    expect(existsSync(join(runStoreDir, "runs", runId, "run-timeline.json"))).toBe(true);
    expect(resumeResponse.status).toBe(200);
    expect(resumeBody).toMatchObject({
      status: "resumed",
      run: expect.objectContaining({ runId })
    });
  });

  it("lists recent autonomous agent runs newest first", async () => {
    const runStoreDir = mkdtempSync(join(tmpdir(), "quorummind-api-run-list-"));

    for (const question of ["第一个方案", "第二个方案"]) {
      await handleApiRequest(
        new Request("http://127.0.0.1:8787/api/agent-runs/blueprint", {
          method: "POST",
          body: JSON.stringify({
            question,
            mode: "fast",
            locale: "zh",
            context,
            blueprintRuntime: { executionMode: "deterministic" }
          })
        }),
        {
          QUORUMMIND_PROVIDER_MODE: "demo",
          QUORUMMIND_RUN_STORE_DIR: runStoreDir
        }
      );
    }

    const listResponse = await handleApiRequest(new Request("http://127.0.0.1:8787/api/agent-runs"), {
      QUORUMMIND_RUN_STORE_DIR: runStoreDir
    });
    const body = await listResponse.json();

    expect(listResponse.status).toBe(200);
    expect(body.runs).toHaveLength(2);
    expect(body.runs[0].summary).toContain("第二个方案");
    expect(body.runs[1].summary).toContain("第一个方案");
  });

  it("resumes a paused autonomous agent run through its saved thread checkpoint context", async () => {
    const runStoreDir = mkdtempSync(join(tmpdir(), "quorummind-api-resume-"));
    const createResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/agent-runs/blueprint", {
        method: "POST",
        body: JSON.stringify({
          question: "我想做一个视觉类游戏，用多 agent 拆解小说文本，工作流和人物字段怎么设计？",
          mode: "deep",
          locale: "zh",
          context,
          blueprintRuntime: { executionMode: "deterministic" },
          agentRuntime: {
            threadId: "resume-thread",
            maxConsensusRounds: 2
          }
        })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "demo",
        QUORUMMIND_RUN_STORE_DIR: runStoreDir
      }
    );
    const createBody = await createResponse.json();
    const runId = createBody.run.runId;

    const pausedResponse = await handleApiRequest(new Request(`http://127.0.0.1:8787/api/agent-runs/${runId}`), {
      QUORUMMIND_RUN_STORE_DIR: runStoreDir
    });
    const pausedBody = await pausedResponse.json();
    const resumeResponse = await handleApiRequest(
      new Request(`http://127.0.0.1:8787/api/agent-runs/${runId}/resume`, {
        method: "POST",
        body: JSON.stringify({ humanReviewNote: "人工确认 Schema 方向，继续收敛。" })
      }),
      {
        QUORUMMIND_PROVIDER_MODE: "demo",
        QUORUMMIND_RUN_STORE_DIR: runStoreDir
      }
    );
    const resumeBody = await resumeResponse.json();

    expect(createResponse.status).toBe(200);
    expect(pausedBody.run).toMatchObject({
      runId,
      status: "paused",
      threadId: "resume-thread",
      checkpoint: expect.objectContaining({ threadId: "resume-thread" })
    });
    expect(pausedBody.events.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(["route_intent_start", "planner_complete", "critic_warn", "human_review_pause"])
    );
    expect(resumeResponse.status).toBe(200);
    expect(resumeBody).toMatchObject({
      status: "resumed",
      run: expect.objectContaining({
        runId,
        checkpoint: expect.objectContaining({ threadId: "resume-thread" }),
        summary: expect.objectContaining({ humanReviewRequired: false })
      })
    });
  });

  it("returns health status without exposing provider keys", async () => {
    const configRoot = mkdtempSync(join(tmpdir(), "qm-api-config-"));
    writeFileSync(
      join(configRoot, "quorummind.config.json"),
      JSON.stringify({
        mcpServers: {
          github: {
            command: "npx",
            env: {
              GITHUB_TOKEN: "github-secret"
            }
          }
        },
        providers: {
          openrouter: {
            model: "anthropic/claude-sonnet-4.5",
            enabled: true
          }
        }
      }),
      "utf8"
    );
    const response = await handleApiRequest(new Request("http://127.0.0.1:8787/api/health"), {
      OPENAI_API_KEY: "sk-secret",
      ANTHROPIC_API_KEY: "anthropic-secret",
      OPENROUTER_API_KEY: "openrouter-secret",
      QUORUMMIND_CONFIG_DIR: configRoot,
      QUORUMMIND_RATE_LIMIT_MAX: "1000"
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("sk-secret");
    expect(JSON.stringify(body)).not.toContain("anthropic-secret");
    expect(JSON.stringify(body)).not.toContain("openrouter-secret");
    expect(JSON.stringify(body)).not.toContain("github-secret");
    expect(body.status).toBe("ok");
    expect(body.persistence).toMatchObject({
      mode: "browser_local",
      configured: false
    });
    expect(body.providerStatus.openai.configured).toBe(true);
    expect(body.providerStatus.deepseek.implemented).toBe(true);
    expect(body.providerStatus.anthropic).toMatchObject({
      configured: true,
      implemented: true,
      envKey: "ANTHROPIC_API_KEY"
    });
    expect(body.providerStatus.openrouter).toMatchObject({
      configured: true,
      implemented: true,
      envKey: "OPENROUTER_API_KEY"
    });
    expect(body.providerCapabilities.openrouter).toMatchObject({
      implementationStatus: "implemented",
      supportsToolCalls: "model_dependent"
    });
    expect(body.providerCapabilities.ollama).toMatchObject({
      implementationStatus: "implemented",
      supportsLowCostMode: true
    });
    expect(body.configSummary).toMatchObject({
      loaded: true,
      mcpServers: [{ name: "github", command: "npx", configuredEnvKeys: ["GITHUB_TOKEN"] }],
      providerOverrides: [{ providerId: "openrouter", enabled: true, model: "anthropic/claude-sonnet-4.5" }]
    });
  });

  it("applies security headers and strict CORS allowlist", async () => {
    const allowedResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/health", {
        headers: { Origin: "http://localhost:5173" }
      }),
      { QUORUMMIND_PROVIDER_MODE: "demo" }
    );
    const blockedResponse = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/health", {
        headers: { Origin: "https://evil.example" }
      }),
      { QUORUMMIND_PROVIDER_MODE: "demo" }
    );

    expect(allowedResponse.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(allowedResponse.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
    expect(allowedResponse.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(allowedResponse.headers.get("X-Frame-Options")).toBe("DENY");
    expect(blockedResponse.status).toBe(403);
  });

  it("requires an API token when configured", async () => {
    const denied = await handleApiRequest(new Request("http://127.0.0.1:8787/api/health"), {
      QUORUMMIND_API_TOKEN: "local-secret",
      QUORUMMIND_RATE_LIMIT_MAX: "1000"
    });
    const allowed = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/health", {
        headers: { "X-QuorumMind-Token": "local-secret" }
      }),
      { QUORUMMIND_API_TOKEN: "local-secret", QUORUMMIND_RATE_LIMIT_MAX: "1000" }
    );

    expect(denied.status).toBe(401);
    expect(denied.headers.get("WWW-Authenticate")).toContain("Bearer");
    expect(allowed.status).toBe(200);
  });

  it("rate limits repeated API requests", async () => {
    const env = {
      QUORUMMIND_RATE_LIMIT_MAX: "1",
      QUORUMMIND_RATE_LIMIT_WINDOW_MS: "60000"
    };
    const request = () =>
      handleApiRequest(
        new Request("http://127.0.0.1:8787/api/health", {
          headers: { "X-Forwarded-For": "203.0.113.99" }
        }),
        env
      );

    const first = await request();
    const second = await request();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });

  it("exposes a sanitized API security posture summary", async () => {
    const response = await handleApiRequest(new Request("http://127.0.0.1:8787/api/security"), {
      QUORUMMIND_API_TOKEN: "local-secret",
      QUORUMMIND_ALLOWED_ORIGINS: "http://localhost:5173",
      QUORUMMIND_RATE_LIMIT_MAX: "1000"
    });
    const body = await response.json();

    expect(response.status).toBe(401);

    const authorized = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/security", {
        headers: { Authorization: "Bearer local-secret" }
      }),
      {
        QUORUMMIND_API_TOKEN: "local-secret",
        QUORUMMIND_ALLOWED_ORIGINS: "http://localhost:5173",
        QUORUMMIND_RATE_LIMIT_MAX: "1000"
      }
    );
    const authorizedBody = await authorized.json();

    expect(body.error).toContain("token");
    expect(authorized.status).toBe(200);
    expect(authorizedBody.controls).toMatchObject({
      securityHeaders: true,
      corsAllowlist: true,
      wildcardCors: false,
      rateLimiting: true,
      authenticationRequired: true
    });
    expect(JSON.stringify(authorizedBody)).not.toContain("local-secret");
  });
});
