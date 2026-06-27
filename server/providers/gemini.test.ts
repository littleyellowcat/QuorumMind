// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createGeminiProvider } from "./gemini";
import type { ProviderRequest } from "./types";

const request: ProviderRequest = {
  locale: "zh",
  phase: "revision",
  agentName: "Gemini Risk Reviewer",
  agentRole: "security_reviewer",
  question: "一个 B2B SaaS MVP 应该使用 schema-per-tenant，还是 shared tables + tenant_id？",
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

describe("createGeminiProvider", () => {
  it("posts to generateContent with the API key in the query string and not inside prompt content", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "{\"recommendation\":\"使用 shared tables\"}" }] } }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = createGeminiProvider({
      apiKey: "gemini-server-only",
      model: "gemini-2.5-pro",
      fetch: fetchImpl
    });

    const text = await provider.generateDecisionText(request);

    expect(text).toBe("{\"recommendation\":\"使用 shared tables\"}");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=gemini-server-only"
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json"
    });
    expect(init?.headers).not.toHaveProperty("Authorization");
    expect(init?.body).not.toContain("gemini-server-only");
  });
});
