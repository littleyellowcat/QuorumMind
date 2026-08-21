// @vitest-environment node
import { describe, expect, it } from "vitest";
import { routeProviderSeats } from "./capability-router";
import { getProviderCapabilityMatrix } from "./capabilities";
import type { ProviderStatus } from "./registry";

describe("provider capability router", () => {
  it("selects task-specific provider seats and explains included and excluded providers", () => {
    const status: Partial<Record<string, ProviderStatus>> = {
      openrouter: {
        id: "openrouter",
        displayName: "OpenRouter",
        kind: "api",
        configured: true,
        implemented: true,
        envKey: "OPENROUTER_API_KEY",
        modelEnvKey: "OPENROUTER_MODEL",
        model: "anthropic/claude-sonnet-4.5",
        notes: "router"
      },
      ollama: {
        id: "ollama",
        displayName: "Ollama",
        kind: "local",
        configured: true,
        implemented: true,
        modelEnvKey: "OLLAMA_MODEL",
        model: "llama3.1",
        notes: "local"
      },
      xai: {
        id: "xai",
        displayName: "xAI",
        kind: "api",
        configured: false,
        implemented: false,
        envKey: "XAI_API_KEY",
        modelEnvKey: "XAI_MODEL",
        model: "grok-4",
        notes: "reserved"
      }
    };

    const route = routeProviderSeats({
      task: "architecture_review",
      requirements: {
        jsonSchema: true,
        toolCalls: false,
        longContext: true,
        lowCost: false,
        localOnly: false,
        maxSeats: 2
      },
      providerStatus: status as Record<string, ProviderStatus>,
      capabilityMatrix: getProviderCapabilityMatrix()
    });

    expect(route.selectedSeats).toEqual([
      expect.objectContaining({
        providerId: "openrouter",
        model: "anthropic/claude-sonnet-4.5",
        rationale: expect.arrayContaining([expect.stringContaining("configured")])
      }),
      expect.objectContaining({
        providerId: "ollama",
        model: "llama3.1"
      })
    ]);
    expect(route.excludedSeats).toContainEqual(expect.objectContaining({
      providerId: "xai",
      reason: expect.stringContaining("not implemented")
    }));
    expect(route.explanation).toContain("architecture_review");
    expect(route.capabilityWarnings).toEqual(expect.arrayContaining([
      expect.stringContaining("model-dependent")
    ]));
  });

  it("honors local-only and low-cost requirements", () => {
    const status: Partial<Record<string, ProviderStatus>> = {
      openai: {
        id: "openai",
        displayName: "OpenAI",
        kind: "api",
        configured: true,
        implemented: true,
        envKey: "OPENAI_API_KEY",
        modelEnvKey: "OPENAI_MODEL",
        model: "gpt-4o-mini",
        notes: "api"
      },
      ollama: {
        id: "ollama",
        displayName: "Ollama",
        kind: "local",
        configured: true,
        implemented: true,
        modelEnvKey: "OLLAMA_MODEL",
        model: "llama3.1",
        notes: "local"
      }
    };

    const route = routeProviderSeats({
      task: "offline_private_review",
      requirements: {
        jsonSchema: false,
        toolCalls: false,
        longContext: false,
        lowCost: true,
        localOnly: true,
        maxSeats: 3
      },
      providerStatus: status as Record<string, ProviderStatus>,
      capabilityMatrix: getProviderCapabilityMatrix()
    });

    expect(route.selectedSeats).toEqual([
      expect.objectContaining({ providerId: "ollama" })
    ]);
    expect(route.excludedSeats).toContainEqual(expect.objectContaining({
      providerId: "openai",
      reason: expect.stringContaining("local-only")
    }));
  });
});
