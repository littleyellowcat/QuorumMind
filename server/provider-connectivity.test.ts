// @vitest-environment node
import { describe, expect, it } from "vitest";
import { providerTestTimeoutMs, testProviderConnections } from "./provider-connectivity";

describe("provider connectivity", () => {
  it("allows a 300 second provider connection test timeout", () => {
    expect(providerTestTimeoutMs({ QUORUMMIND_PROVIDER_TEST_TIMEOUT_MS: "300000" })).toBe(300000);
  });

  it("tests the configured live seats instead of fixed provider names", async () => {
    const results = await testProviderConnections({
      QUORUMMIND_MOCK_PROVIDERS: "1",
      QUORUMMIND_DISABLED_LIVE_MODELS: "gemini:mock-gemini-seat"
    });

    expect(results.map((result) => result.provider)).toEqual(["openai", "deepseek"]);
    expect(results.every((result) => result.configured)).toBe(true);
  });
});
