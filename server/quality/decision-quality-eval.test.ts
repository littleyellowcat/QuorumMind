// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createDecisionQualityTrendEntry,
  defaultDecisionQualityGoldenCases,
  evaluateDecisionQuality,
  evaluateDecisionQualityWithOptionalJudge,
  judgeDecisionOutput,
  summarizeProviderReputation
} from "./decision-quality-eval";

describe("decision quality eval", () => {
  it("judges a decision output against a rubric and golden case expectations", () => {
    const finding = judgeDecisionOutput({
      case: defaultDecisionQualityGoldenCases[0],
      output: [
        "Recommend shared tables with tenant_id for the MVP.",
        "Risks: tenant boundary bug, noisy-neighbor growth, rollback if compliance changes.",
        "ADR: record the guardrails, ownership, validation tests, and migration trigger.",
        "Consensus: GPT and Claude disagree on schema-per-tenant timing, but both accept staged isolation."
      ].join("\n"),
      providerId: "openrouter",
      model: "anthropic/claude-sonnet-4.5"
    });

    expect(finding).toMatchObject({
      caseId: "tenant-architecture-review",
      verdict: "passed",
      providerId: "openrouter",
      model: "anthropic/claude-sonnet-4.5"
    });
    expect(finding.rubric.total).toBeGreaterThanOrEqual(85);
    expect(finding.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("ADR"),
      expect.stringContaining("risk")
    ]));
  });

  it("evaluates golden cases, provider reputation, and trend metadata", () => {
    const report = evaluateDecisionQuality({
      suiteName: "offline-smoke",
      cases: defaultDecisionQualityGoldenCases.slice(0, 2),
      outputs: {
        "tenant-architecture-review": {
          providerId: "openrouter",
          model: "anthropic/claude-sonnet-4.5",
          text: "Use shared tables with tenant_id. Include ADR, risk radar, rollback, tests, consensus disagreement, and migration trigger."
        },
        "agent-system-blueprint-review": {
          providerId: "ollama",
          model: "llama3.1",
          text: "Blueprint should define Planner, Executor, Critic, Memory, and Supervisor agents. Include tool permission audit, schema, eval matrix, human review, and ADR handoff."
        }
      },
      startedAt: "2026-08-21T08:00:00.000Z"
    });
    const reputation = summarizeProviderReputation(report.findings);
    const trend = createDecisionQualityTrendEntry(report);

    expect(report.summary).toMatchObject({
      totalCases: 2,
      passedCases: 2,
      suiteName: "offline-smoke"
    });
    expect(reputation).toEqual([
      expect.objectContaining({
        providerId: "ollama",
        sampleCount: 1,
        qualityBand: "strong"
      }),
      expect.objectContaining({
        providerId: "openrouter",
        sampleCount: 1,
        qualityBand: "strong"
      })
    ]);
    expect(trend).toMatchObject({
      suiteName: "offline-smoke",
      totalCases: 2,
      passedCases: 2,
      providerReputation: expect.any(Array)
    });
  });

  it("can attach an opt-in LLM judge without replacing the deterministic rubric", async () => {
    const report = await evaluateDecisionQualityWithOptionalJudge({
      suiteName: "judge-smoke",
      cases: defaultDecisionQualityGoldenCases.slice(0, 1),
      outputs: {
        "tenant-architecture-review": {
          providerId: "openrouter",
          model: "anthropic/claude",
          text: "Use shared tenant_id tables. Include ADR, risk radar, rollback, validation tests, consensus disagreement, and migration trigger."
        }
      },
      judgeRequested: true,
      llmJudge: {
        providerId: "openai",
        model: "gpt-judge",
        async evaluate() {
          return {
            status: "used",
            score: 91,
            rationale: "The answer covers evidence, risks, ADR readiness, and actionable validation.",
            concerns: ["Keep tenant-boundary tests explicit."]
          };
        }
      }
    });

    expect(report.summary.passedCases).toBe(1);
    expect(report.judgeSummary).toMatchObject({
      requested: true,
      status: "used",
      providerId: "openai",
      model: "gpt-judge"
    });
    expect(report.findings[0].llmJudge).toMatchObject({
      status: "used",
      score: 91,
      deterministicScore: expect.any(Number),
      agreement: "agreed"
    });
  });

  it("records an explicit skip reason when LLM judge is requested but unavailable", async () => {
    const report = await evaluateDecisionQualityWithOptionalJudge({
      suiteName: "judge-skipped",
      cases: defaultDecisionQualityGoldenCases.slice(0, 1),
      outputs: {},
      judgeRequested: true,
      judgeSkipReason: "QUORUMMIND_LLM_JUDGE_ENABLED is not set."
    });

    expect(report.judgeSummary).toMatchObject({
      requested: true,
      status: "skipped",
      reason: "QUORUMMIND_LLM_JUDGE_ENABLED is not set."
    });
    expect(report.findings[0].llmJudge).toMatchObject({
      status: "skipped"
    });
  });
});
