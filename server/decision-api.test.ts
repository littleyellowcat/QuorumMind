// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { handleApiRequest } from "./decision-api";
import type { DecisionContext } from "../src/lib/domain";
import { createSqliteDecisionRepository } from "./persistence/sqlite-repository";

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
