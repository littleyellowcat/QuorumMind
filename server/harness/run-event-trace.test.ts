// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRunEventRecorder } from "./run-event-trace";

describe("createRunEventRecorder", () => {
  it("records ordered run events with compact summaries", () => {
    const recorder = createRunEventRecorder({
      runId: "run-1",
      clock: () => "2026-08-20T12:00:00.000Z",
      maxSummaryChars: 20
    });

    recorder.record({
      phase: "proposal",
      provider: "openai",
      model: "gpt-test",
      type: "provider_attempt_start",
      severity: "info",
      summary: "starting provider call"
    });
    recorder.record({
      phase: "proposal",
      provider: "openai",
      model: "gpt-test",
      type: "provider_attempt_success",
      severity: "info",
      summary: "this is a very long model output summary",
      durationMs: 123
    });

    expect(recorder.events()).toEqual([
      expect.objectContaining({
        runId: "run-1",
        seq: 1,
        type: "provider_attempt_start",
        summary: "starting provider...",
        truncated: true
      }),
      expect.objectContaining({
        runId: "run-1",
        seq: 2,
        type: "provider_attempt_success",
        durationMs: 123,
        summary: "this is a very lo...",
        truncated: true
      })
    ]);
  });

  it("can create child recorders without losing sequence order", () => {
    const parent = createRunEventRecorder({
      runId: "run-2",
      clock: () => "2026-08-20T12:00:00.000Z"
    });
    const child = parent.child({ phase: "ranking", provider: "deepseek", model: "deepseek-test" });

    child.record({ type: "provider_attempt_start", severity: "info", summary: "start" });
    parent.record({ type: "run_complete", severity: "info", summary: "complete" });

    expect(parent.events().map((event) => event.seq)).toEqual([1, 2]);
    expect(parent.events()[0]).toMatchObject({
      phase: "ranking",
      provider: "deepseek"
    });
  });

  it("records context compaction lifecycle events as first-class trace events", () => {
    const recorder = createRunEventRecorder({
      runId: "run-3",
      clock: () => "2026-08-20T12:00:00.000Z"
    });

    recorder.record({
      type: "context_compaction_start",
      severity: "info",
      summary: "context fill ratio reached 0.72; compacting accumulated state"
    });
    recorder.record({
      type: "context_compaction_complete",
      severity: "info",
      summary: "context compacted and tail messages preserved",
      durationMs: 42
    });

    expect(recorder.events().map((event) => event.type)).toEqual([
      "context_compaction_start",
      "context_compaction_complete"
    ]);
    expect(recorder.events()[1]).toMatchObject({
      durationMs: 42,
      truncated: false
    });
  });
});
