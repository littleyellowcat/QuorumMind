// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRunCoordinator } from "./run-coordinator";

describe("createRunCoordinator", () => {
  it("tracks active runs and rejects duplicate starts for the same run id", () => {
    const coordinator = createRunCoordinator({ rootDir: mkdtempSync(join(tmpdir(), "quorummind-coordinator-")) });

    expect(coordinator.start("run-1")).toMatchObject({ accepted: true });
    expect(coordinator.start("run-1")).toMatchObject({
      accepted: false,
      reason: "already_running"
    });
    expect(coordinator.activeRuns()).toEqual(["run-1"]);
  });

  it("interrupts active runs and lets waiters observe the terminal state", async () => {
    const coordinator = createRunCoordinator({ rootDir: mkdtempSync(join(tmpdir(), "quorummind-coordinator-")) });

    coordinator.start("run-1");
    const wait = coordinator.wait("run-1");
    coordinator.interrupt("run-1", "user cancelled");

    await expect(wait).resolves.toMatchObject({
      runId: "run-1",
      status: "interrupted",
      reason: "user cancelled"
    });
    expect(coordinator.activeRuns()).toEqual([]);
  });

  it("completes active runs and returns completed for later wait calls", async () => {
    const coordinator = createRunCoordinator({ rootDir: mkdtempSync(join(tmpdir(), "quorummind-coordinator-")) });

    coordinator.start("run-1");
    coordinator.complete("run-1");

    await expect(coordinator.wait("run-1")).resolves.toMatchObject({
      runId: "run-1",
      status: "completed"
    });
  });

  it("coalesces follow-up work through pending wake while a run is active", () => {
    const coordinator = createRunCoordinator({ rootDir: mkdtempSync(join(tmpdir(), "quorummind-coordinator-wake-")) });

    coordinator.start("run-1");
    expect(coordinator.wake("run-1", { source: "human_review", note: "补充约束" })).toMatchObject({
      accepted: true,
      pendingWake: true
    });

    expect(coordinator.pendingWake("run-1")).toMatchObject({
      runId: "run-1",
      pendingWake: true,
      wakeCount: 1,
      notes: ["补充约束"]
    });

    coordinator.complete("run-1");

    expect(coordinator.consumeWake("run-1")).toMatchObject({
      runId: "run-1",
      pendingWake: true,
      wakeCount: 1
    });
    expect(coordinator.pendingWake("run-1")).toBeUndefined();
  });
});
