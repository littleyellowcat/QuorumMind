import { describe, expect, it } from "vitest";
import type { DecisionContext } from "./domain";
import { defaultManualProviderAgents } from "./manual-provider";
import { applyModelReputation, calibrateModelReputation, inferDecisionDomain } from "./model-reputation";

const context: DecisionContext = {
  productStage: "mvp",
  expectedScale: "50 tenants",
  teamProfile: "Small full-stack team",
  budgetSensitivity: "high",
  reliabilityRequirement: "medium",
  securityRequirement: "high",
  existingConstraints: ["Use PostgreSQL"],
  candidateOptions: ["Next.js", "Vue", "PostgreSQL"],
  assumptions: ["No strict compliance need at launch"]
};

describe("model reputation", () => {
  it("infers technical architecture questions from stack and context signals", () => {
    expect(inferDecisionDomain("Should I use Next.js or Vue for this MVP?", context)).toBe("technical_architecture");
  });

  it("adds explainable model reputation and effective weights", () => {
    const agents = applyModelReputation(defaultManualProviderAgents, {
      question: "Should I use Next.js or Vue for this MVP?",
      context
    });

    const deepseek = agents.find((agent) => agent.id === "deepseek");
    const gpt = agents.find((agent) => agent.id === "gpt");
    const gemini = agents.find((agent) => agent.id === "gemini");

    expect(deepseek?.reputation).toMatchObject({
      domain: "technical_architecture",
      score: 90
    });
    expect(deepseek?.effectiveWeight).toBeGreaterThan(deepseek?.baseWeight ?? 0);
    expect(gpt?.reputation.reasons.join(" ")).toContain("architecture coherence");
    expect(gemini?.reputation.reasons.join(" ")).toContain("long-term strategy");
  });

  it("calibrates model reputation from historical feedback records", () => {
    const agents = applyModelReputation(
      defaultManualProviderAgents,
      {
        question: "Should I use Next.js or Vue for this MVP?",
        context
      },
      [
        {
          agentId: "deepseek",
          domain: "technical_architecture",
          outcome: "helpful",
          confidence: 0.9,
          createdAt: "2026-06-15T00:00:00.000Z"
        },
        {
          agentId: "gpt",
          domain: "technical_architecture",
          outcome: "unhelpful",
          confidence: 0.8,
          createdAt: "2026-06-15T00:00:00.000Z"
        }
      ]
    );
    const deepseek = agents.find((agent) => agent.id === "deepseek");
    const gpt = agents.find((agent) => agent.id === "gpt");

    expect(deepseek?.reputation.score).toBeGreaterThan(90);
    expect(deepseek?.effectiveWeight).toBeGreaterThan(deepseek?.baseWeight ?? 0);
    expect(deepseek?.reputation.reasons.join(" ")).toContain("feedback calibration");
    expect(gpt?.reputation.score).toBeLessThan(88);
  });

  it("keeps feedback calibration bounded and domain-specific", () => {
    const calibrated = calibrateModelReputation(
      {
        domain: "technical_architecture",
        score: 90,
        weightMultiplier: 1.08,
        reasons: ["Base reason"]
      },
      "deepseek",
      [
        {
          agentId: "deepseek",
          domain: "product_strategy",
          outcome: "unhelpful",
          confidence: 1,
          createdAt: "2026-06-15T00:00:00.000Z"
        }
      ]
    );

    expect(calibrated.score).toBe(90);
    expect(calibrated.weightMultiplier).toBe(1.08);
  });
});
