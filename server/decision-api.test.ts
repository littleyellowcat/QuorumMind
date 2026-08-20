// @vitest-environment node
import { existsSync, mkdtempSync } from "node:fs";
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
    const response = await handleApiRequest(new Request("http://127.0.0.1:8787/api/health"), {
      OPENAI_API_KEY: "sk-secret",
      ANTHROPIC_API_KEY: "anthropic-secret",
      OPENROUTER_API_KEY: "openrouter-secret"
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("sk-secret");
    expect(JSON.stringify(body)).not.toContain("anthropic-secret");
    expect(JSON.stringify(body)).not.toContain("openrouter-secret");
    expect(body.status).toBe("ok");
    expect(body.persistence).toMatchObject({
      mode: "browser_local",
      configured: false
    });
    expect(body.providerStatus.openai.configured).toBe(true);
    expect(body.providerStatus.deepseek.implemented).toBe(true);
    expect(body.providerStatus.anthropic).toMatchObject({
      configured: true,
      implemented: false,
      envKey: "ANTHROPIC_API_KEY"
    });
    expect(body.providerStatus.openrouter).toMatchObject({
      configured: true,
      implemented: false,
      envKey: "OPENROUTER_API_KEY"
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
      QUORUMMIND_API_TOKEN: "local-secret"
    });
    const allowed = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/health", {
        headers: { "X-QuorumMind-Token": "local-secret" }
      }),
      { QUORUMMIND_API_TOKEN: "local-secret" }
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
      QUORUMMIND_ALLOWED_ORIGINS: "http://localhost:5173"
    });
    const body = await response.json();

    expect(response.status).toBe(401);

    const authorized = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/security", {
        headers: { Authorization: "Bearer local-secret" }
      }),
      {
        QUORUMMIND_API_TOKEN: "local-secret",
        QUORUMMIND_ALLOWED_ORIGINS: "http://localhost:5173"
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
