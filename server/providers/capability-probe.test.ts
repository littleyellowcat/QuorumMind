// @vitest-environment node
import { describe, expect, it } from "vitest";
import { probeProviderCapability } from "./capability-probe";
import type { ModelProvider } from "./types";

describe("provider capability probe", () => {
  it("measures JSON stability, latency, failures, and repair rate from a bounded probe", async () => {
    let calls = 0;
    const provider: ModelProvider = {
      id: "openrouter",
      model: "anthropic/claude-sonnet-4.5",
      async generateDecisionText() {
        calls += 1;
        if (calls === 2) {
          return "{\"proposalId\":\"p2\",\"recommendation\":\"Use staged rollout\",\"criteriaScores\":{\"scalability\":120}}";
        }
        return JSON.stringify({
          proposalId: `p${calls}`,
          recommendation: "Use staged rollout",
          criteriaScores: {
            scalability: 80,
            reliability: 80,
            security: 80,
            costEfficiency: 80,
            implementationComplexity: 80,
            maintainability: 80,
            migrationFlexibility: 80,
            teamFit: 80,
            timeToMarket: 80,
            reversibility: 80
          },
          regretByScenario: { scaleSpike: 20 },
          confidence: 0.8
        });
      }
    };

    const probe = await probeProviderCapability({
      provider,
      sampleCount: 3,
      now: (() => {
        let value = 0;
        return () => {
          value += 25;
          return value;
        };
      })()
    });

    expect(probe.providerId).toBe("openrouter");
    expect(probe.model).toBe("anthropic/claude-sonnet-4.5");
    expect(probe.jsonSchemaStable).toBe(true);
    expect(probe.sampleCount).toBe(3);
    expect(probe.failureRate).toBe(0);
    expect(probe.repairRate).toBeGreaterThan(0);
    expect(probe.averageLatencyMs).toBe(25);
    expect(probe.recommendedUseCases).toContain("architecture_review");
  });
});
