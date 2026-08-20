import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderPolicyStatusPanel } from "./ProviderPolicyStatusPanel";
import type { DecisionApiResponse } from "../lib/api-client";

const providerStatus: DecisionApiResponse["providerStatus"] = {
  openai: {
    id: "openai",
    displayName: "OpenAI",
    kind: "api",
    configured: true,
    implemented: true,
    envKey: "OPENAI_API_KEY",
    modelEnvKey: "OPENAI_MODEL",
    model: "gpt-4o-mini",
    notes: "Configured but denied",
    policy: {
      effect: "deny",
      matchedAction: "provider.use",
      matchedResource: "openai:gpt-4o-mini",
      reason: "Matched provider policy deny provider.use openai:gpt-4o-mini."
    }
  },
  deepseek: {
    id: "deepseek",
    displayName: "DeepSeek",
    kind: "api",
    configured: true,
    implemented: true,
    envKey: "DEEPSEEK_API_KEY",
    modelEnvKey: "DEEPSEEK_MODEL",
    model: "deepseek-chat",
    notes: "Allowed",
    policy: {
      effect: "allow",
      matchedAction: "provider.use",
      matchedResource: "deepseek",
      reason: "Matched provider policy allow provider.use deepseek."
    }
  }
} as DecisionApiResponse["providerStatus"];

describe("ProviderPolicyStatusPanel", () => {
  it("shows configured providers denied by policy and the matched rule", () => {
    render(<ProviderPolicyStatusPanel locale="en" providerStatus={providerStatus} />);

    expect(screen.getByText("Provider policy")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("configured but denied")).toBeInTheDocument();
    expect(screen.getByText(/openai:gpt-4o-mini/)).toBeInTheDocument();
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    expect(screen.getByText("allowed")).toBeInTheDocument();
  });
});
