import { describe, expect, it } from "vitest";
import type { DecisionContext } from "./domain";
import { createManualProviderBundle, type ManualProviderAgent } from "./manual-provider";

const context: DecisionContext = {
  productStage: "mvp",
  expectedScale: "50 tenants",
  teamProfile: "Small full-stack team",
  budgetSensitivity: "high",
  reliabilityRequirement: "medium",
  securityRequirement: "high",
  existingConstraints: ["Use PostgreSQL"],
  candidateOptions: ["Shared tables", "Schema per tenant"],
  assumptions: ["No strict compliance need at launch"]
};

describe("createManualProviderBundle", () => {
  it("creates copy-ready prompts for GPT, DeepSeek, and Gemini across all decision phases", () => {
    const bundle = createManualProviderBundle({
      question: "Should we use shared tables?",
      locale: "en",
      context
    });

    expect(bundle.agents.map((agent) => agent.id)).toEqual(["gpt", "deepseek", "gemini"]);
    expect(bundle.prompts).toHaveLength(15);
    expect(bundle.prompts.map((prompt) => prompt.phase)).toContain("proposal");
    expect(bundle.prompts.map((prompt) => prompt.phase)).toContain("final_verdict");
    expect(bundle.prompts[0].prompt).toContain("Return JSON only");
    expect(bundle.prompts[0].prompt).toContain("Should we use shared tables?");
    expect(bundle.prompts[0].prompt).toContain("\"criteriaScores\"");
  });

  it("uses custom agent roles, weights, and scoring focus in generated prompts", () => {
    const agents: ManualProviderAgent[] = [
      {
        id: "gpt",
        name: "GPT Staff Platform Architect",
        providerLabel: "Unified gateway GPT seat",
        role: "principal_architect",
        weight: 1.4,
        scoringFocus: ["platform evolution", "security boundary"]
      },
      {
        id: "deepseek",
        name: "DeepSeek Cost Sentinel",
        providerLabel: "Unified gateway DeepSeek seat",
        role: "cost_engineer",
        weight: 0.9,
        scoringFocus: ["cost ceiling", "implementation drag"]
      },
      {
        id: "gemini",
        name: "Gemini Strategy Reviewer",
        providerLabel: "Unified gateway Gemini seat",
        role: "sre_reviewer",
        weight: 1.1,
        scoringFocus: ["reliability", "migration timing"]
      }
    ];

    const bundle = createManualProviderBundle({
      question: "Should we use shared tables?",
      locale: "en",
      context,
      agents
    });

    expect(bundle.agents).toEqual(agents);
    expect(bundle.prompts[0].prompt).toContain("Agent name: GPT Staff Platform Architect");
    expect(bundle.prompts[0].prompt).toContain("Agent weight: 1.4");
    expect(bundle.prompts[0].prompt).toContain("Scoring focus: platform evolution, security boundary");
  });

  it("marks critique prompts as blind review prompts", () => {
    const bundle = createManualProviderBundle({
      question: "Should we use shared tables?",
      locale: "en",
      context
    });
    const critiquePrompt = bundle.prompts.find((prompt) => prompt.phase === "critique");

    expect(critiquePrompt?.prompt).toContain("Blind review");
    expect(critiquePrompt?.prompt).toContain("Proposal A/B/C");
    expect(critiquePrompt?.prompt).toContain("Do not infer or mention which model authored a proposal");
  });
});
