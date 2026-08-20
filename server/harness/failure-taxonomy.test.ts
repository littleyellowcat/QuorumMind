// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyFailure } from "./failure-taxonomy";

describe("classifyFailure", () => {
  it("classifies timeout failures as retryable", () => {
    expect(classifyFailure(new Error("upstream request timeout"))).toMatchObject({
      category: "timeout",
      retryability: "retryable",
      severity: "warning"
    });
  });

  it("classifies rate limit failures as retryable with high severity", () => {
    expect(classifyFailure({ status: 429, message: "Too many requests" })).toMatchObject({
      category: "rate_limit",
      retryability: "retryable",
      severity: "warning"
    });
  });

  it("classifies safety refusals as terminal", () => {
    expect(classifyFailure("safety rejected by provider")).toMatchObject({
      category: "safety_rejected",
      retryability: "terminal",
      severity: "error"
    });
  });

  it("preserves phase-specific validation categories", () => {
    expect(classifyFailure("invalid schema", { fallbackCategory: "schema_validation_error" })).toMatchObject({
      category: "schema_validation_error",
      retryability: "repairable",
      severity: "warning"
    });
    expect(classifyFailure("not json", { fallbackCategory: "json_parse_error" })).toMatchObject({
      category: "json_parse_error",
      retryability: "repairable",
      severity: "warning"
    });
  });

  it("classifies missing references and QA failures as non-retryable business failures", () => {
    expect(classifyFailure("missing reference asset")).toMatchObject({
      category: "missing_reference",
      retryability: "human_action_required"
    });
    expect(classifyFailure("visual QA failed")).toMatchObject({
      category: "qa_failed",
      retryability: "human_action_required"
    });
  });

  it("uses provider_error before falling back to unknown", () => {
    expect(classifyFailure(new Error("provider returned 500"))).toMatchObject({
      category: "provider_error",
      retryability: "retryable"
    });
    expect(classifyFailure({ nope: true })).toMatchObject({
      category: "unknown",
      retryability: "terminal"
    });
  });
});
