import { afterEach, describe, expect, it, vi } from "vitest";
import type { DecisionContext } from "./domain";
import {
  downloadRenderedPdf,
  listServerDecisionRooms,
  openServerDecisionRoom,
  requestAutonomousBlueprintRun,
  requestBlueprintRoom,
  requestDecisionRoom,
  testProviderConnections
} from "./api-client";
import type { ManualProviderAgent } from "./manual-provider";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestDecisionRoom", () => {
  it("posts the decision payload to the local API", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ providerMode: "demo", result: { roomId: "demo-room" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const response = await requestDecisionRoom(
      {
        question: "Should we use shared tables?",
        mode: "deep",
        locale: "en",
        context
      },
      fetchImpl
    );

    expect(response.providerMode).toBe("demo");
    expect(response.result.roomId).toBe("demo-room");
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/decisions",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("Should we use shared tables?")
      })
    );
  });

  it("sends custom agent configuration to the decision API", async () => {
    const agents: ManualProviderAgent[] = [
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
        scoringFocus: ["cost ceiling", "implementation drag"]
      },
      {
        id: "gemini",
        name: "Gemini Strategy Reviewer",
        providerLabel: "Unified gateway Gemini seat",
        role: "sre_reviewer",
        weight: 1.1,
        scoringFocus: ["reliability", "migration timing"]
      }
    ];
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ providerMode: "demo", result: { roomId: "demo-room" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await requestDecisionRoom(
      {
        question: "Should we use shared tables?",
        mode: "deep",
        locale: "en",
        context,
        agentConfig: agents
      },
      fetchImpl
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.agentConfig).toEqual(agents);
  });

  it("throws the API error message when the request fails", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: "A non-empty architecture question is required." }), {
        status: 400,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(
      requestDecisionRoom(
        {
          question: "",
          mode: "deep",
          locale: "en",
          context
        },
        fetchImpl
      )
    ).rejects.toThrow("architecture question");
  });
});

describe("requestBlueprintRoom", () => {
  it("posts the blueprint payload to the local API", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ providerMode: "demo", result: { roomId: "blueprint-room" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const response = await requestBlueprintRoom(
      {
        question: "How should we design a multi-agent visual novel workflow?",
        mode: "deep",
        locale: "en",
        blueprintRuntime: {
          executionMode: "live",
          maxProviderRounds: 3
        },
        context
      },
      fetchImpl
    );
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(response.providerMode).toBe("demo");
    expect(response.result.roomId).toBe("blueprint-room");
    expect(body.blueprintRuntime).toEqual({ executionMode: "live", maxProviderRounds: 3 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/blueprints",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("multi-agent visual novel workflow")
      })
    );
  });
});

describe("requestAutonomousBlueprintRun", () => {
  it("posts agent runtime controls to the autonomous blueprint endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          providerMode: "demo",
          providerStatus: {},
          run: {
            runId: "agent-run-1",
            checkpoint: { enabled: true, saver: "MemorySaver", threadId: "stable-thread" },
            runtimeLimits: { maxConsensusRounds: 2, recursionLimit: 24 },
            result: { roomId: "blueprint-room" }
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const response = await requestAutonomousBlueprintRun(
      {
        question: "Design a multi-agent workflow",
        mode: "deep",
        locale: "en",
        context,
        blueprintRuntime: {
          executionMode: "live",
          maxProviderRounds: 2
        },
        agentRuntime: {
          threadId: "stable-thread",
          maxConsensusRounds: 2,
          humanReviewNote: "Reviewer approved the schema direction."
        }
      },
      fetchImpl
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(response.run.checkpoint.threadId).toBe("stable-thread");
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/agent-runs/blueprint",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })
    );
    expect(body.agentRuntime).toEqual({
      threadId: "stable-thread",
      maxConsensusRounds: 2,
      humanReviewNote: "Reviewer approved the schema direction."
    });
    expect(body.blueprintRuntime).toEqual({ executionMode: "live", maxProviderRounds: 2 });
  });
});

describe("server decision history client", () => {
  it("lists server-persisted decision rooms", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          persistence: { mode: "sqlite", configured: true },
          rooms: [
            {
              id: "room-1",
              question: "Should we persist server history?",
              locale: "en",
              mode: "fast",
              providerMode: "demo",
              selectedProposalId: "shared",
              recommendation: "Use shared tables",
              quorumScore: 83,
              dissentIndex: 22,
              createdAt: "2026-06-15T00:00:00.000Z",
              updatedAt: "2026-06-15T00:00:00.000Z"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const response = await listServerDecisionRooms(fetchImpl);

    expect(response.rooms).toHaveLength(1);
    expect(response.persistence).toMatchObject({ mode: "sqlite", configured: true });
    expect(fetchImpl).toHaveBeenCalledWith("/api/rooms", expect.objectContaining({ method: "GET" }));
  });

  it("opens a server-persisted decision room snapshot", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          room: {
            id: "room-1",
            question: "Should we persist server history?",
            locale: "en",
            mode: "fast",
            providerMode: "demo",
            selectedProposalId: "shared",
            recommendation: "Use shared tables",
            quorumScore: 83,
            dissentIndex: 22,
            createdAt: "2026-06-15T00:00:00.000Z",
            updatedAt: "2026-06-15T00:00:00.000Z",
            providerTrace: [],
            liveVerdict: null,
            promptBundle: { version: "manual-v1", agents: [], prompts: [] },
            result: { roomId: "demo-room" },
            adrMarkdown: "# ADR"
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const room = await openServerDecisionRoom("room-1", fetchImpl);

    expect(room.result.roomId).toBe("demo-room");
    expect(fetchImpl).toHaveBeenCalledWith("/api/rooms/room-1", expect.objectContaining({ method: "GET" }));
  });
});

describe("downloadRenderedPdf", () => {
  it("posts simple HTML to the PDF export endpoint and downloads the returned PDF blob", async () => {
    const anchor = {
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn()
    };
    const append = vi.fn();
    const createObjectURL = vi.fn(() => "blob:pdf-result");
    const revokeObjectURL = vi.fn();
    const fetchImpl = vi.fn(async () =>
      new Response(new Blob(["%PDF-1.4"], { type: "application/pdf" }), {
        status: 200,
        headers: { "content-type": "application/pdf" }
      })
    );

    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { append }
    });
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL
    });

    await downloadRenderedPdf(
      {
        html: "<!doctype html><html><body>Final plan</body></html>",
        filename: "quorummind-final.pdf"
      },
      fetchImpl
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/exports/pdf",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("Final plan")
      })
    );
    expect(anchor.download).toBe("quorummind-final.pdf");
    expect(anchor.href).toBe("blob:pdf-result");
    expect(append).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalled();
    expect(anchor.remove).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pdf-result");
  });
});

describe("testProviderConnections", () => {
  it("posts to the provider connection test endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          providerMode: "live",
          providerStatus: {},
          results: [
            {
              provider: "openai",
              model: "gpt-test",
              configured: true,
              responded: true,
              jsonParsed: true,
              schemaUsable: true,
              validationStatus: "valid",
              durationMs: 100,
              validationIssues: []
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const response = await testProviderConnections(fetchImpl);

    expect(response.results[0].schemaUsable).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("/api/providers/test", expect.objectContaining({ method: "POST" }));
  });

  it("throws the provider test API error message", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Provider test unavailable." }), {
        status: 500,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(testProviderConnections(fetchImpl)).rejects.toThrow("Provider test unavailable");
  });
});
