// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRunArtifactIndex } from "./run-artifact-index";
import { createRunEventStore } from "./run-event-store";
import { createRunStatusStore } from "./run-status-store";
import { cleanupRunStorage } from "./run-retention";

describe("cleanupRunStorage", () => {
  it("removes status, artifacts, bounded output, resume snapshots, and event logs through one retention pass", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-retention-"));
    const eventStore = createRunEventStore({ rootDir });
    const statusStore = createRunStatusStore({ rootDir });
    const artifactIndex = createRunArtifactIndex({ rootDir });

    statusStore.save({
      runId: "old-run",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:01.000Z",
      requestSnapshot: { question: "old snapshot" }
    });
    eventStore.appendEvent({
      runId: "old-run",
      seq: 0,
      timestamp: "2026-08-01T00:00:01.000Z",
      type: "run_complete",
      severity: "info",
      summary: "done",
      truncated: false
    });
    artifactIndex.add("old-run", {
      kind: "resume_snapshot",
      label: "resume snapshot",
      inline: { threadId: "thread-old" }
    });
    artifactIndex.add("old-run", {
      kind: "bounded_output",
      label: "large output",
      path: join(rootDir, "runs", "old-run", "outputs", "large.txt")
    });
    mkdirSync(join(rootDir, "runs", "old-run", "outputs"), { recursive: true });
    writeFileSync(join(rootDir, "runs", "old-run", "outputs", "large.txt"), "large output", "utf8");

    statusStore.save({
      runId: "new-run",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:01.000Z"
    });
    eventStore.appendEvent({
      runId: "new-run",
      seq: 0,
      timestamp: "2026-08-20T00:00:01.000Z",
      type: "run_complete",
      severity: "info",
      summary: "done",
      truncated: false
    });

    const removed = cleanupRunStorage({
      rootDir,
      now: "2026-08-20T12:00:00.000Z",
      maxAgeDays: 7,
      keepLast: 10
    });

    expect(removed).toEqual([
      expect.objectContaining({
        runId: "old-run",
        reason: "age",
        removedKinds: expect.arrayContaining([
          "event_log",
          "run_status",
          "artifact_index",
          "bounded_output",
          "resume_snapshot"
        ])
      })
    ]);
    expect(existsSync(join(rootDir, "runs", "old-run"))).toBe(false);
    expect(existsSync(join(rootDir, "runs", "new-run", "status.json"))).toBe(true);
  });
});
