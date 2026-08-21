// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getProviderCapabilityMatrix } from "./capabilities";

describe("provider capability matrix", () => {
  it("describes implemented, reserved, API, and local provider capabilities conservatively", () => {
    const matrix = getProviderCapabilityMatrix();

    expect(matrix.openai).toMatchObject({
      providerId: "openai",
      implementationStatus: "implemented",
      transport: "api",
      supportsJsonSchema: true,
      supportsToolCalls: true,
      supportsLongContext: true,
      supportsLowCostMode: true
    });
    expect(matrix.deepseek).toMatchObject({
      providerId: "deepseek",
      implementationStatus: "implemented",
      transport: "api",
      supportsJsonSchema: true,
      supportsLowCostMode: true
    });
    expect(matrix.gemini).toMatchObject({
      providerId: "gemini",
      implementationStatus: "implemented",
      transport: "api",
      supportsLongContext: true
    });
    expect(matrix.model_gateway).toMatchObject({
      providerId: "model_gateway",
      implementationStatus: "implemented",
      transport: "api",
      supportsJsonSchema: "proxy_dependent"
    });
    expect(matrix.openrouter).toMatchObject({
      providerId: "openrouter",
      implementationStatus: "implemented",
      transport: "api",
      supportsToolCalls: "model_dependent"
    });
    expect(matrix.anthropic).toMatchObject({
      providerId: "anthropic",
      implementationStatus: "implemented",
      transport: "api",
      capabilitySource: "adapter_verified"
    });
    expect(matrix.ollama).toMatchObject({
      providerId: "ollama",
      implementationStatus: "implemented",
      transport: "local",
      supportsLowCostMode: true
    });
    expect(matrix.lmstudio).toMatchObject({
      providerId: "lmstudio",
      implementationStatus: "implemented",
      transport: "local",
      supportsToolCalls: "model_dependent"
    });
  });
});
