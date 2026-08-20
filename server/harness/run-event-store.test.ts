// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRunEventStore } from "./run-event-store";
import type { RunEvent } from "./run-event-trace";

const event = (overrides: Partial<RunEvent> = {}): RunEvent => ({
  runId: "run-1",
  seq: 1,
  timestamp: "2026-08-20T12:00:00.000Z",
  type: "run_start",
  severity: "info",
  summary: "started",
  truncated: false,
  ...overrides
});

describe("createRunEventStore", () => {
  it("persists run events as replayable JSONL records", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-events-"));
    const store = createRunEventStore({ rootDir });

    store.appendEvent(event({ seq: 1, type: "run_start", summary: "start" }));
    store.appendEvent(event({ seq: 2, type: "provider_attempt_success", phase: "proposal", provider: "openai" }));

    expect(store.listEvents("run-1")).toEqual([
      expect.objectContaining({ runId: "run-1", seq: 1, type: "run_start" }),
      expect.objectContaining({ runId: "run-1", seq: 2, type: "provider_attempt_success", provider: "openai" })
    ]);
    expect(store.eventLogPath("run-1")).toContain("events.jsonl");
  });

  it("adds schema version metadata and supports incremental event replay", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-events-versioned-"));
    const store = createRunEventStore({ rootDir });

    store.appendEvent(event({ seq: 0, type: "run_start", summary: "start" }));
    store.appendEvent(event({ seq: 0, type: "planner_complete", summary: "planned" }));
    store.appendEvent(event({ seq: 0, type: "run_complete", summary: "done" }));

    expect(store.listEvents("run-1")[0]).toMatchObject({
      schemaVersion: 1,
      seq: 1,
      type: "run_start"
    });
    expect(store.listEvents("run-1", { after: 1 }).map((item) => item.type)).toEqual([
      "planner_complete",
      "run_complete"
    ]);
  });

  it("returns an empty replay for a run without persisted events", () => {
    const store = createRunEventStore({ rootDir: mkdtempSync(join(tmpdir(), "quorummind-events-empty-")) });

    expect(store.listEvents("missing-run")).toEqual([]);
  });

  it("keeps newest run artifacts within count and age retention limits", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-events-retention-"));
    const store = createRunEventStore({ rootDir });

    store.appendEvent(event({ runId: "old-run", timestamp: "2026-08-01T00:00:00.000Z" }));
    store.appendEvent(event({ runId: "middle-run", timestamp: "2026-08-18T00:00:00.000Z" }));
    store.appendEvent(event({ runId: "new-run", timestamp: "2026-08-20T00:00:00.000Z" }));

    const removed = store.cleanup({
      now: "2026-08-20T12:00:00.000Z",
      maxAgeDays: 7,
      keepLast: 1
    });

    expect(removed.map((item) => item.runId)).toEqual(["old-run", "middle-run"]);
    expect(store.listRuns().map((run) => run.runId)).toEqual(["new-run"]);
    expect(existsSync(join(rootDir, "runs", "old-run"))).toBe(false);
  });

  it("skips malformed event lines during replay instead of crashing", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-events-malformed-"));
    mkdirSync(join(rootDir, "runs", "run-1"), { recursive: true });
    writeFileSync(
      join(rootDir, "runs", "run-1", "events.jsonl"),
      `${JSON.stringify(event({ seq: 1, type: "run_start" }))}\nnot-json\n${JSON.stringify(event({ seq: 2, type: "run_complete" }))}\n`
    );
    const store = createRunEventStore({ rootDir });

    expect(store.listEvents("run-1").map((item) => item.type)).toEqual(["run_start", "run_complete"]);
  });

  it("skips unsupported event schema versions during replay", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-events-schema-skip-"));
    mkdirSync(join(rootDir, "runs", "run-1"), { recursive: true });
    writeFileSync(
      join(rootDir, "runs", "run-1", "events.jsonl"),
      [
        JSON.stringify(event({ seq: 1, type: "run_start" })),
        JSON.stringify({ ...event({ seq: 2, type: "critic_warn" }), schemaVersion: 999 }),
        JSON.stringify(event({ seq: 3, type: "run_complete" }))
      ].join("\n")
    );
    const store = createRunEventStore({ rootDir });

    expect(store.listEvents("run-1").map((item) => item.type)).toEqual(["run_start", "run_complete"]);
  });
});
