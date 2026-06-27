// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createOpenAIProvider } from "./openai";
import type { ProviderRequest } from "./types";

const request: ProviderRequest = {
  locale: "en",
  phase: "proposal",
  agentName: "GPT Architect",
  agentRole: "principal_architect",
  question: "Should we use shared tables or schema-per-tenant?",
  context: {
    productStage: "mvp",
    expectedScale: "50 tenants",
    teamProfile: "Small full-stack team",
    budgetSensitivity: "high",
    reliabilityRequirement: "medium",
    securityRequirement: "high",
    existingConstraints: ["Use PostgreSQL"],
    candidateOptions: ["Shared tables", "Schema per tenant"],
    assumptions: ["No strict compliance need at launch"]
  }
};

describe("createOpenAIProvider", () => {
  it("posts a Responses API request with the server-side API key only in the Authorization header", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: "{\"title\":\"Use shared tables\"}" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const provider = createOpenAIProvider({
      apiKey: "sk-server-only",
      model: "gpt-5.1",
      fetch: fetchImpl
    });

    const text = await provider.generateDecisionText(request);

    expect(text).toBe("{\"title\":\"Use shared tables\"}");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer sk-server-only",
      "Content-Type": "application/json"
    });
    expect(init?.body).not.toContain("sk-server-only");
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: "gpt-5.1"
    });
  });
});
