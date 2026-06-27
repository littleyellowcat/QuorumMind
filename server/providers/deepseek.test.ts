// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createDeepSeekProvider } from "./deepseek";
import type { ProviderRequest } from "./types";

const request: ProviderRequest = {
  locale: "en",
  phase: "critique",
  agentName: "DeepSeek Reviewer",
  agentRole: "sre_reviewer",
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

describe("createDeepSeekProvider", () => {
  it("uses the OpenAI-compatible chat completions endpoint without putting the key in the prompt body", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"strongestArgument\":\"Simple operations\"}" } }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = createDeepSeekProvider({
      apiKey: "deepseek-server-only",
      model: "deepseek-chat",
      fetch: fetchImpl
    });

    const text = await provider.generateDecisionText(request);

    expect(text).toBe("{\"strongestArgument\":\"Simple operations\"}");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer deepseek-server-only",
      "Content-Type": "application/json"
    });
    expect(init?.body).not.toContain("deepseek-server-only");
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: "deepseek-chat"
    });
  });
});
