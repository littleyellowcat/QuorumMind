// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createLMStudioProvider, createOllamaProvider } from "./local-openai-compatible";
import type { ProviderRequest } from "./types";

const request: ProviderRequest = {
  locale: "en",
  phase: "ranking",
  agentName: "Local Model",
  agentRole: "pragmatic_builder",
  question: "Which implementation path is safest?",
  context: {
    productStage: "mvp",
    expectedScale: "local review",
    teamProfile: "solo maintainer",
    budgetSensitivity: "high",
    reliabilityRequirement: "medium",
    securityRequirement: "medium",
    existingConstraints: ["No external calls"],
    candidateOptions: ["Path A", "Path B"],
    assumptions: ["Local model is already running"]
  }
};

describe("local OpenAI-compatible providers", () => {
  it("calls Ollama through its local OpenAI-compatible endpoint without requiring an API key", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "{\"rankedProposalIds\":[\"A\",\"B\"]}" } }] }), {
        status: 200
      })
    );
    const provider = createOllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "llama3.1",
      fetch: fetchImpl
    });

    await expect(provider.generateDecisionText(request)).resolves.toContain("rankedProposalIds");

    expect(provider.id).toBe("ollama");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      })
    );
  });

  it("calls LM Studio through a configurable local OpenAI-compatible endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "{\"rankedProposalIds\":[\"B\",\"A\"]}" } }] }), {
        status: 200
      })
    );
    const provider = createLMStudioProvider({
      baseUrl: "http://localhost:1234/v1",
      apiKey: "lmstudio-key",
      model: "local-model",
      fetch: fetchImpl
    });

    await provider.generateDecisionText(request);

    expect(provider.id).toBe("lmstudio");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:1234/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer lmstudio-key"
        })
      })
    );
  });
});
