// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createOpenRouterProvider } from "./openrouter";
import type { ProviderRequest } from "./types";

const request: ProviderRequest = {
  locale: "en",
  phase: "proposal",
  agentName: "OpenRouter Architect",
  agentRole: "principal_architect",
  question: "Should we introduce an event bus?",
  context: {
    productStage: "mvp",
    expectedScale: "50 tenants",
    teamProfile: "Small full-stack team",
    budgetSensitivity: "medium",
    reliabilityRequirement: "high",
    securityRequirement: "medium",
    existingConstraints: ["Keep auditability"],
    candidateOptions: ["Direct calls", "Event bus"],
    assumptions: ["No strict latency SLO yet"]
  }
};

describe("createOpenRouterProvider", () => {
  it("calls the OpenRouter chat completions API without leaking the key into the body", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "{\"title\":\"Add event bus\"}" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const provider = createOpenRouterProvider({
      apiKey: "or-secret",
      model: "anthropic/claude-sonnet-4.5",
      fetch: fetchImpl
    });

    const text = await provider.generateDecisionText(request);

    expect(text).toBe("{\"title\":\"Add event bus\"}");
    expect(provider.id).toBe("openrouter");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer or-secret",
          "Content-Type": "application/json",
          "X-Title": "QuorumMind"
        })
      })
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
    expect(body.model).toBe("anthropic/claude-sonnet-4.5");
    expect(JSON.stringify(body)).not.toContain("or-secret");
  });
});
