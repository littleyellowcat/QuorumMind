// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createToolRegistry } from "./tool-registry";

describe("createToolRegistry", () => {
  it("registers tools with schema, owner, risk, and permission metadata", () => {
    const registry = createToolRegistry();

    registry.register({
      name: "blueprint_generate",
      description: "Generate deterministic blueprint",
      ownerAgent: "executor_agent",
      permissionCategory: "read_only",
      risk: "low",
      schema: { question: "string" }
    });

    expect(registry.list()).toEqual([
      expect.objectContaining({
        name: "blueprint_generate",
        ownerAgent: "executor_agent",
        permissionCategory: "read_only",
        risk: "low"
      })
    ]);
  });

  it("materializes only tools allowed by permission policy", () => {
    const registry = createToolRegistry();

    registry.register({
      name: "blueprint_generate",
      description: "Generate deterministic blueprint",
      ownerAgent: "executor_agent",
      permissionCategory: "read_only",
      risk: "low",
      schema: { question: "string" }
    });
    registry.register({
      name: "live_model_call",
      description: "Call live provider",
      ownerAgent: "executor_agent",
      permissionCategory: "live_model_call",
      risk: "medium",
      schema: { prompt: "string" }
    });
    registry.register({
      name: "production_deploy",
      description: "Deploy to production",
      ownerAgent: "executor_agent",
      permissionCategory: "production_operation",
      risk: "high",
      schema: { target: "string" }
    });

    expect(
      registry.materialize({
        runId: "run-1",
        role: "executor_agent",
        locale: "zh",
        liveModelPreapproved: false
      }).map((tool) => tool.name)
    ).toEqual(["blueprint_generate"]);
    expect(
      registry.materialize({
        runId: "run-1",
        role: "executor_agent",
        locale: "zh",
        liveModelPreapproved: true
      }).map((tool) => tool.name)
    ).toEqual(["blueprint_generate", "live_model_call"]);
  });
});
