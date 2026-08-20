import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createRunArtifactIndex } from "./run-artifact-index";
import { createRunEventStore, defaultHarnessRootDir, safeSegment } from "./run-event-store";
import { createRunStatusStore } from "./run-status-store";

export type RunRetentionRemovedKind =
  | "event_log"
  | "run_status"
  | "artifact_index"
  | "bounded_output"
  | "resume_snapshot"
  | "read_model"
  | "coordinator_state";

export type CleanupRunStorageOptions = {
  rootDir?: string;
  now?: string;
  maxAgeDays?: number;
  keepLast?: number;
};

export type CleanupRunStorageResult = {
  runId: string;
  path: string;
  reason: "age" | "count";
  removedKinds: RunRetentionRemovedKind[];
};

type RunRetentionCandidate = {
  runId: string;
  lastActivityMs: number;
  removedKinds: RunRetentionRemovedKind[];
};

export function cleanupRunStorage(options: CleanupRunStorageOptions = {}): CleanupRunStorageResult[] {
  const rootDir = options.rootDir ?? defaultHarnessRootDir();
  const nowMs = timestampMs(options.now ?? new Date().toISOString());
  const maxAgeDays = options.maxAgeDays ?? 30;
  const keepLast = options.keepLast ?? 100;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const candidates = listCandidates(rootDir);
  const removed: CleanupRunStorageResult[] = [];
  const removedIds = new Set<string>();

  for (const candidate of [...candidates].sort((a, b) => a.lastActivityMs - b.lastActivityMs)) {
    if (nowMs - candidate.lastActivityMs > maxAgeMs) {
      removeCandidate(candidate, "age");
    }
  }

  const remaining = candidates
    .filter((candidate) => !removedIds.has(candidate.runId))
    .sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  const keptByCount = new Set(remaining.slice(0, Math.max(0, keepLast)).map((candidate) => candidate.runId));

  for (const candidate of remaining) {
    if (!keptByCount.has(candidate.runId)) {
      removeCandidate(candidate, "count");
    }
  }

  return removed;

  function removeCandidate(candidate: RunRetentionCandidate, reason: CleanupRunStorageResult["reason"]): void {
    const path = join(rootDir, "runs", safeSegment(candidate.runId));
    rmSync(path, { recursive: true, force: true });
    removedIds.add(candidate.runId);
    removed.push({
      runId: candidate.runId,
      path,
      reason,
      removedKinds: candidate.removedKinds
    });
  }
}

function listCandidates(rootDir: string): RunRetentionCandidate[] {
  const runsDir = join(rootDir, "runs");
  if (!existsSync(runsDir)) {
    return [];
  }

  const eventStore = createRunEventStore({ rootDir });
  const statusStore = createRunStatusStore({ rootDir });
  const artifactIndex = createRunArtifactIndex({ rootDir });

  return readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const runId = entry.name;
      const runDir = join(runsDir, runId);
      const status = statusStore.find(runId);
      const events = eventStore.listEvents(runId);
      const artifacts = artifactIndex.list(runId);
      const lastEvent = events.at(-1);
      const removedKinds = new Set<RunRetentionRemovedKind>();

      if (existsSync(join(runDir, "events.jsonl")) || events.length > 0) {
        removedKinds.add("event_log");
      }
      if (existsSync(join(runDir, "status.json")) || status) {
        removedKinds.add("run_status");
      }
      if (existsSync(join(runDir, "artifacts.json"))) {
        removedKinds.add("artifact_index");
      }
      if (existsSync(join(runDir, "outputs")) || artifacts.some((artifact) => artifact.kind === "bounded_output")) {
        removedKinds.add("bounded_output");
      }
      if (artifacts.some((artifact) => artifact.kind === "resume_snapshot") || status?.requestSnapshot) {
        removedKinds.add("resume_snapshot");
      }
      if (
        existsSync(join(runDir, "run-summary.json")) ||
        existsSync(join(runDir, "run-metrics.json")) ||
        existsSync(join(runDir, "run-timeline.json"))
      ) {
        removedKinds.add("read_model");
      }
      if (existsSync(join(runDir, "active.json")) || existsSync(join(runDir, "terminal.json")) || existsSync(join(runDir, "wake.json"))) {
        removedKinds.add("coordinator_state");
      }

      return {
        runId,
        lastActivityMs: Math.max(
          timestampMs(lastEvent?.timestamp),
          timestampMs(status?.updatedAt),
          timestampMs(status?.createdAt)
        ),
        removedKinds: [...removedKinds].sort()
      };
    })
    .sort((a, b) => b.lastActivityMs - a.lastActivityMs);
}

function timestampMs(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}
