import { describe, expect, it, vi } from "vitest";
import { createModelGatewayProvider, modelGatewayEndpoint } from "./model-gateway";

describe("model gateway provider", () => {
  it("normalizes base URLs to the OpenAI-compatible chat completions endpoint", () => {
    expect(modelGatewayEndpoint("http://gateway.local")).toBe("http://gateway.local/v1/chat/completions");
    expect(modelGatewayEndpoint("http://gateway.local/v1")).toBe("http://gateway.local/v1/chat/completions");
    expect(modelGatewayEndpoint("http://gateway.local/v1/chat/completions")).toBe(
      "http://gateway.local/v1/chat/completions"
    );
  });

  it("reports a clear provider error when the gateway returns an HTML admin page", async () => {
    const fetchImpl = vi.fn(async () => new Response("<!doctype html><title>Admin</title>", { status: 200 }));
    const provider = createModelGatewayProvider({
      apiKey: "key",
      baseUrl: "http://gateway.local",
      model: "gpt-4o-mini",
      providerId: "openai",
      fetch: fetchImpl
    });

    await expect(
      provider.generateDecisionText({
        phase: "proposal",
        locale: "zh",
        agentName: "Architect",
        agentRole: "principal_architect",
        question: "Should we split the Node.js monolith?",
        context: {
          productStage: "mvp",
          expectedScale: "small team",
          teamProfile: "5 engineers",
          budgetSensitivity: "high",
          reliabilityRequirement: "medium",
          securityRequirement: "medium",
          existingConstraints: ["ship fast"],
          candidateOptions: ["Modular monolith", "Microservices"],
          assumptions: ["No hard service isolation requirement"]
        }
      })
    ).rejects.toThrow(/OpenAI-compatible \/v1 endpoint/);

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://gateway.local/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
  });
});
