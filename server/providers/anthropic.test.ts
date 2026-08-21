// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "./anthropic";
import type { ProviderRequest } from "./types";

const request: ProviderRequest = {
  locale: "zh",
  phase: "critique",
  agentName: "Claude Reviewer",
  agentRole: "security_reviewer",
  question: "这次 PR 的认证边界是否合理？",
  context: {
    productStage: "mvp",
    expectedScale: "小团队",
    teamProfile: "4 名工程师",
    budgetSensitivity: "medium",
    reliabilityRequirement: "medium",
    securityRequirement: "high",
    existingConstraints: ["不能泄露 token"],
    candidateOptions: ["保留现状", "强化鉴权中间件"],
    assumptions: ["PR 还未发布"]
  }
};

describe("createAnthropicProvider", () => {
  it("calls the Anthropic Messages API and extracts text content", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "{\"targetProposalId\":\"Proposal A\"}" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const provider = createAnthropicProvider({
      apiKey: "anthropic-secret",
      model: "claude-sonnet-4.5",
      fetch: fetchImpl
    });

    const text = await provider.generateDecisionText(request);

    expect(text).toBe("{\"targetProposalId\":\"Proposal A\"}");
    expect(provider.id).toBe("anthropic");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "anthropic-secret",
          "anthropic-version": expect.any(String),
          "Content-Type": "application/json"
        })
      })
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
    expect(body.model).toBe("claude-sonnet-4.5");
    expect(body.messages[0].role).toBe("user");
    expect(JSON.stringify(body)).not.toContain("anthropic-secret");
  });
});
