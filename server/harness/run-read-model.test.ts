// @vitest-environment node
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRunArtifactIndex } from "./run-artifact-index";
import { projectRunReadModel } from "./run-read-model";
import { createRunEventStore } from "./run-event-store";
import { createRunStatusStore } from "./run-status-store";

describe("projectRunReadModel", () => {
  it("projects events, status, and artifacts into summary, metrics, and timeline read models", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-read-model-"));
    const events = createRunEventStore({ rootDir });
    const status = createRunStatusStore({ rootDir });
    const artifacts = createRunArtifactIndex({ rootDir });

    status.save({
      runId: "run-1",
      kind: "autonomous_blueprint",
      status: "paused",
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:05.000Z",
      summary: "视觉小说 Agent 蓝图"
    });
    events.appendEvent({
      runId: "run-1",
      seq: 0,
      timestamp: "2026-08-20T12:00:00.000Z",
      type: "run_start",
      severity: "info",
      summary: "started",
      truncated: false
    });
    events.appendEvent({
      runId: "run-1",
      seq: 0,
      timestamp: "2026-08-20T12:00:02.000Z",
      type: "provider_attempt_success",
      severity: "info",
      provider: "openai",
      model: "gpt-test",
      durationMs: 1200,
      summary: "provider ok",
      truncated: false
    });
    events.appendEvent({
      runId: "run-1",
      seq: 0,
      timestamp: "2026-08-20T12:00:04.000Z",
      type: "human_review_pause",
      severity: "warning",
      summary: "needs review",
      truncated: false
    });
    artifacts.add("run-1", {
      kind: "provider_trace",
      label: "provider trace",
      inline: { providerCalls: 1, usableCalls: 1 }
    });
    artifacts.add("run-1", {
      kind: "bounded_output",
      label: "final markdown",
      metadata: { truncated: true }
    });

    const projected = projectRunReadModel({ rootDir, runId: "run-1" });

    expect(projected.summary).toMatchObject({
      runId: "run-1",
      status: "paused",
      eventCount: 3,
      artifactCount: 2
    });
    expect(projected.metrics).toMatchObject({
      runId: "run-1",
      durationMs: 5000,
      providerCallCount: 1,
      humanReviewCount: 1,
      artifactCount: 2,
      truncatedOutputCount: 1
    });
    expect(projected.timeline.map((item) => item.type)).toEqual([
      "run_start",
      "provider_attempt_success",
      "human_review_pause"
    ]);
    expect(existsSync(projected.paths.summaryPath)).toBe(true);
    expect(existsSync(projected.paths.metricsPath)).toBe(true);
    expect(existsSync(projected.paths.timelinePath)).toBe(true);
  });
});
