// @vitest-environment node
import { describe, expect, it } from "vitest";
import { estimateRunUsage } from "./usage-accounting";

describe("estimateRunUsage", () => {
  it("estimates token, cost, retry, fallback, and human review usage for a run", () => {
    const usage = estimateRunUsage({
      providerTrace: [
        {
          provider: "openai",
          model: "gpt-test",
          text: "a".repeat(800),
          durationMs: 100,
          status: "ok",
          retryCount: 1
        },
        {
          provider: "deepseek",
          model: "deepseek-test",
          text: "b".repeat(400),
          durationMs: 100,
          status: "error",
          retryCount: 2
        }
      ],
      events: [
        { type: "provider_attempt_retry" },
        { type: "provider_attempt_failure" },
        { type: "human_review_pause" }
      ],
      liveTraceRequired: true,
      liveTraceUsable: false
    });

    expect(usage).toMatchObject({
      providerCallCount: 2,
      retryCount: 3,
      failureCount: 1,
      humanReviewCount: 1,
      estimatedInputTokens: expect.any(Number),
      estimatedOutputTokens: expect.any(Number),
      estimatedCostUsd: expect.any(Number),
      retryCostUsd: expect.any(Number),
      fallbackSavedCostUsd: expect.any(Number)
    });
    expect(usage.estimatedOutputTokens).toBeGreaterThan(0);
    expect(usage.fallbackSavedCostUsd).toBeGreaterThan(0);
  });
});
