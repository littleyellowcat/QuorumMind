// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createQuorumMindToolRegistry } from "./quorummind-tools";

describe("createQuorumMindToolRegistry", () => {
  it("registers default QuorumMind tools as explicit governed capabilities", () => {
    const registry = createQuorumMindToolRegistry();

    expect(registry.list().map((tool) => tool.name)).toEqual([
      "quorummind_read_architecture_context",
      "quorummind_score_decision_lenses",
      "quorummind_generate_context_source_ledger",
      "quorummind_generate_adr_export",
      "quorummind_live_provider_trace"
    ]);
  });

  it("materializes tools by role and keeps live provider calls gated", () => {
    const registry = createQuorumMindToolRegistry();

    expect(
      registry.materialize({
        runId: "run-1",
        role: "planner_agent",
        locale: "zh",
        liveModelPreapproved: true
      }).map((tool) => tool.name)
    ).toEqual(["quorummind_read_architecture_context"]);
    expect(
      registry.materialize({
        runId: "run-1",
        role: "executor_agent",
        locale: "zh",
        liveModelPreapproved: false
      }).map((tool) => tool.name)
    ).toEqual(["quorummind_score_decision_lenses", "quorummind_generate_context_source_ledger"]);
    expect(
      registry.materialize({
        runId: "run-1",
        role: "executor_agent",
        locale: "zh",
        liveModelPreapproved: true
      }).map((tool) => tool.name)
    ).toEqual([
      "quorummind_score_decision_lenses",
      "quorummind_generate_context_source_ledger",
      "quorummind_live_provider_trace"
    ]);
  });
});
