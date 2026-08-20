// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRunStatusStore } from "./run-status-store";

describe("createRunStatusStore", () => {
  it("persists and updates lightweight run status records", () => {
    const store = createRunStatusStore({ rootDir: mkdtempSync(join(tmpdir(), "quorummind-run-status-")) });

    store.save({
      runId: "run-1",
      kind: "autonomous_blueprint",
      status: "running",
      threadId: "thread-1",
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z"
    });
    store.update("run-1", {
      status: "completed",
      updatedAt: "2026-08-20T12:01:00.000Z",
      summary: "Blueprint finalized"
    });

    expect(store.find("run-1")).toMatchObject({
      runId: "run-1",
      kind: "autonomous_blueprint",
      status: "completed",
      threadId: "thread-1",
      summary: "Blueprint finalized"
    });
  });

  it("returns undefined for unknown run ids", () => {
    const store = createRunStatusStore({ rootDir: mkdtempSync(join(tmpdir(), "quorummind-run-status-empty-")) });

    expect(store.find("missing")).toBeUndefined();
  });

  it("lists newest run records first with a configurable limit", () => {
    const store = createRunStatusStore({ rootDir: mkdtempSync(join(tmpdir(), "quorummind-run-status-list-")) });

    store.save({
      runId: "run-old",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z"
    });
    store.save({
      runId: "run-new",
      kind: "autonomous_blueprint",
      status: "paused",
      createdAt: "2026-08-20T12:02:00.000Z",
      updatedAt: "2026-08-20T12:02:00.000Z"
    });

    expect(store.list({ limit: 1 })).toEqual([
      expect.objectContaining({ runId: "run-new", status: "paused" })
    ]);
  });
});
