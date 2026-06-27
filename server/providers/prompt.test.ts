// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DecisionContext } from "../../src/lib/domain";
import { buildSystemPrompt } from "./prompt";

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

describe("provider prompts", () => {
  it("includes phase-specific JSON schema instructions for ranking", () => {
    const prompt = buildSystemPrompt({
      locale: "en",
      phase: "ranking",
      agentName: "openai ranking agent",
      agentRole: "principal_architect",
      question: "Should we use shared tables?",
      context
    });

    expect(prompt).toContain("rankedProposalIds");
    expect(prompt).toContain("rationale");
  });

  it("includes final verdict fields for verdict phase", () => {
    const prompt = buildSystemPrompt({
      locale: "en",
      phase: "verdict",
      agentName: "openai verdict agent",
      agentRole: "principal_architect",
      question: "Should we use shared tables?",
      context
    });

    expect(prompt).toContain("selectedProposalId");
    expect(prompt).toContain("finalRecommendation");
    expect(prompt).toContain("remainingDissent");
  });

  it("adds adversarial review instructions in red-team mode", () => {
    const prompt = buildSystemPrompt({
      locale: "en",
      mode: "red_team",
      phase: "critique",
      agentName: "openai critique agent",
      agentRole: "principal_architect",
      question: "Should we use shared tables?",
      context
    });

    expect(prompt).toContain("Red-team mode");
    expect(prompt).toContain("failure paths");
    expect(prompt).toContain("counterexamples");
  });

  it("instructs critique agents to evaluate blind proposal labels only", () => {
    const prompt = buildSystemPrompt({
      locale: "en",
      phase: "critique",
      agentName: "openai critique agent",
      agentRole: "principal_architect",
      question: "Should we use shared tables?",
      context
    });

    expect(prompt).toContain("Blind review");
    expect(prompt).toContain("Proposal A/B/C");
    expect(prompt).toContain("Do not infer or mention which model authored a proposal");
  });

  it("requires Simplified Chinese user-facing strings for Chinese runs", () => {
    const prompt = buildSystemPrompt({
      locale: "zh",
      phase: "verdict",
      agentName: "openai verdict agent",
      agentRole: "principal_architect",
      question: "是否拆成微服务？",
      context
    });

    expect(prompt).toContain("every user-facing string value must be written in Simplified Chinese");
    expect(prompt).toContain("technical identifiers unchanged");
    expect(prompt).toContain("Do not answer in English except for unavoidable technical terms");
  });

  it("requires ranking and verdict phases to preserve proposal ids from payload", () => {
    const prompt = buildSystemPrompt({
      locale: "en",
      phase: "ranking",
      agentName: "openai ranking agent",
      agentRole: "principal_architect",
      question: "Should we split services?",
      context
    });

    expect(prompt).toContain("Use only proposalId values that appear in the payload");
    expect(prompt).toContain("Do not invent new proposal ids");
  });

  it("requires canonical JSON fields and a schema self-check", () => {
    const prompt = buildSystemPrompt({
      locale: "zh",
      phase: "proposal",
      agentName: "deepseek proposal agent",
      agentRole: "pragmatic_builder",
      question: "如何设计多 Agent 视觉游戏制作工作流？",
      context
    });

    expect(prompt).toContain("Use the canonical field names shown in the schema exactly");
    expect(prompt).toContain("Do not substitute aliases");
    expect(prompt).toContain("self-check that the JSON parses");
    expect(prompt).toContain("contains every required canonical field");
    expect(prompt).toContain("must be Simplified Chinese");
  });
});
