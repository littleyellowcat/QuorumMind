import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RunEvent } from "./run-event-trace";

export type RunEventStoreOptions = {
  rootDir?: string;
};

export type RunEventStore = {
  appendEvent(event: RunEvent): void;
  appendEvents(events: RunEvent[]): void;
  listEvents(runId: string, options?: ListRunEventsOptions): RunEvent[];
  listRuns(): RunEventRunSummary[];
  cleanup(options: RunArtifactCleanupOptions): RunArtifactCleanupResult[];
  eventLogPath(runId: string): string;
};

export type ListRunEventsOptions = {
  after?: number;
};

export type RunEventRunSummary = {
  runId: string;
  eventCount: number;
  firstEventAt?: string;
  lastEventAt?: string;
};

export type RunArtifactCleanupOptions = {
  now?: string;
  maxAgeDays?: number;
  keepLast?: number;
};

export type RunArtifactCleanupResult = {
  runId: string;
  path: string;
  reason: "age" | "count";
};

export function createRunEventStore(options: RunEventStoreOptions = {}): RunEventStore {
  const rootDir = options.rootDir ?? defaultHarnessRootDir();

  function eventLogPath(runId: string): string {
    return join(rootDir, "runs", safeSegment(runId), "events.jsonl");
  }

  function appendEvent(event: RunEvent): void {
    const path = eventLogPath(event.runId);
    const nextEvent = {
      ...event,
      schemaVersion: 1 as const,
      seq: event.seq > 0 ? event.seq : listEvents(event.runId).length + 1
    };
    mkdirSync(join(rootDir, "runs", safeSegment(event.runId)), { recursive: true });
    writeFileSync(path, `${JSON.stringify(nextEvent)}\n`, { flag: "a", encoding: "utf8" });
  }

  function appendEvents(events: RunEvent[]): void {
    for (const event of events) {
      appendEvent(event);
    }
  }

  function listEvents(runId: string, options: ListRunEventsOptions = {}): RunEvent[] {
    const path = eventLogPath(runId);
    if (!existsSync(path)) {
      return [];
    }

    return readFileSync(path, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => parseRunEvent(line))
      .filter((event) => event.seq > (options.after ?? 0))
      .sort((a, b) => a.seq - b.seq);
  }

  function listRuns(): RunEventRunSummary[] {
    const runsDir = join(rootDir, "runs");
    if (!existsSync(runsDir)) {
      return [];
    }

    return readdirSync(runsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const events = listEvents(entry.name);
        return {
          runId: entry.name,
          eventCount: events.length,
          firstEventAt: events[0]?.timestamp,
          lastEventAt: events.at(-1)?.timestamp
        };
      })
      .sort((a, b) => timestampMs(b.lastEventAt) - timestampMs(a.lastEventAt));
  }

  function cleanup(options: RunArtifactCleanupOptions): RunArtifactCleanupResult[] {
    const nowMs = timestampMs(options.now ?? new Date().toISOString());
    const maxAgeDays = options.maxAgeDays ?? 30;
    const keepLast = options.keepLast ?? 100;
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const runs = listRuns();
    const toRemove: RunArtifactCleanupResult[] = [];
    const removedIds = new Set<string>();

    for (const run of [...runs].sort((a, b) => timestampMs(a.lastEventAt) - timestampMs(b.lastEventAt))) {
      const ageExpired = nowMs - timestampMs(run.lastEventAt ?? run.firstEventAt) > maxAgeMs;

      if (ageExpired) {
        removeRun(run.runId, "age");
      }
    }

    const remaining = runs.filter((run) => !removedIds.has(run.runId));
    const keptByCount = new Set(remaining.slice(0, keepLast).map((run) => run.runId));

    for (const run of remaining) {
      const countExpired = !keptByCount.has(run.runId);

      if (countExpired) {
        removeRun(run.runId, "count");
      }
    }

    return toRemove;

    function removeRun(runId: string, reason: RunArtifactCleanupResult["reason"]): void {
      const path = join(rootDir, "runs", safeSegment(runId));
      rmSync(path, { recursive: true, force: true });
      removedIds.add(runId);
      toRemove.push({ runId, path, reason });
    }
  }

  return {
    appendEvent,
    appendEvents,
    listEvents,
    listRuns,
    cleanup,
    eventLogPath
  };
}

export function defaultHarnessRootDir(): string {
  return process.env.QUORUMMIND_RUN_STORE_DIR ?? join(homedir(), ".quorummind", "runs");
}

export function runOutputDir(rootDir: string, runId: string): string {
  return join(rootDir, "runs", safeSegment(runId), "outputs");
}

export function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "run";
}

function parseRunEvent(line: string): RunEvent[] {
  try {
    const parsed = JSON.parse(line) as RunEvent;
    if (typeof parsed.schemaVersion === "number" && parsed.schemaVersion !== 1) {
      return [];
    }
    return [
      {
        ...parsed,
        schemaVersion: parsed.schemaVersion ?? 1
      }
    ];
  } catch {
    return [];
  }
}

function timestampMs(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}
