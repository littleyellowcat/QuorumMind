// @vitest-environment node
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRunEventStore } from "./harness/run-event-store";
import { createRunStatusStore } from "./harness/run-status-store";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runGarbageCollector", () => {
  it("cleans expired harness run storage through the GC entrypoint", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "quorummind-gc-data-"));
    const runStoreDir = mkdtempSync(join(tmpdir(), "quorummind-gc-runs-"));
    const eventStore = createRunEventStore({ rootDir: runStoreDir });
    const statusStore = createRunStatusStore({ rootDir: runStoreDir });

    statusStore.save({
      runId: "old-run",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:01.000Z"
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

    vi.stubEnv("QUORUMMIND_DATA_DIR", dataDir);
    vi.stubEnv("QUORUMMIND_RUN_STORE_DIR", runStoreDir);
    const { runGarbageCollector } = await import("./garbage-collector");

    const report = runGarbageCollector({
      now: "2026-08-20T12:00:00.000Z",
      runMaxAgeDays: 7,
      runKeepLast: 10
    });

    expect(report).toContain("cleaned 1 harness runs");
    expect(existsSync(join(runStoreDir, "runs", "old-run"))).toBe(false);
  });
});
