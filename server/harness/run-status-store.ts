import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultHarnessRootDir, safeSegment } from "./run-event-store";

export type RunStatusValue = "running" | "paused" | "completed" | "failed" | "interrupted";

export type RunStatusRecord = {
  runId: string;
  kind: "live_decision" | "autonomous_blueprint";
  status: RunStatusValue;
  threadId?: string;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  resumeHint?: string;
  checkpoint?: {
    enabled: boolean;
    saver: string;
    threadId: string;
  };
  requestSnapshot?: Record<string, unknown>;
  error?: string;
};

export type RunStatusStoreOptions = {
  rootDir?: string;
};

export type RunStatusStore = {
  save(record: RunStatusRecord): void;
  update(runId: string, patch: Partial<Omit<RunStatusRecord, "runId" | "createdAt">>): RunStatusRecord | undefined;
  find(runId: string): RunStatusRecord | undefined;
  list(options?: { limit?: number }): RunStatusRecord[];
  recordPath(runId: string): string;
};

export function createRunStatusStore(options: RunStatusStoreOptions = {}): RunStatusStore {
  const rootDir = options.rootDir ?? defaultHarnessRootDir();

  function recordPath(runId: string): string {
    return join(rootDir, "runs", safeSegment(runId), "status.json");
  }

  function save(record: RunStatusRecord): void {
    const path = recordPath(record.runId);
    mkdirSync(join(rootDir, "runs", safeSegment(record.runId)), { recursive: true });
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }

  function find(runId: string): RunStatusRecord | undefined {
    const path = recordPath(runId);
    if (!existsSync(path)) {
      return undefined;
    }

    return JSON.parse(readFileSync(path, "utf8")) as RunStatusRecord;
  }

  function update(runId: string, patch: Partial<Omit<RunStatusRecord, "runId" | "createdAt">>): RunStatusRecord | undefined {
    const current = find(runId);
    if (!current) {
      return undefined;
    }

    const next = {
      ...current,
      ...patch,
      runId: current.runId,
      createdAt: current.createdAt,
      updatedAt: patch.updatedAt ?? new Date().toISOString()
    };
    save(next);
    return next;
  }

  function list(options: { limit?: number } = {}): RunStatusRecord[] {
    const runsDir = join(rootDir, "runs");
    if (!existsSync(runsDir)) {
      return [];
    }

    const records = readdirSync(runsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const record = find(entry.name);
        return record ? [record] : [];
      })
      .sort((a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt));

    return records.slice(0, Math.max(0, options.limit ?? 20));
  }

  return {
    save,
    update,
    find,
    list,
    recordPath
  };
}

function timestampMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}
