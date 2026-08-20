import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultHarnessRootDir, safeSegment } from "./run-event-store";

export type RunArtifactKind =
  | "prompt_bundle"
  | "provider_trace"
  | "bounded_output"
  | "exported_pdf"
  | "resume_snapshot"
  | "run_status"
  | "event_log";

export type RunArtifactRecord = {
  kind: RunArtifactKind;
  label: string;
  createdAt?: string;
  path?: string;
  inline?: unknown;
  sha256?: string;
  metadata?: Record<string, unknown>;
};

export type RunArtifactIndexOptions = {
  rootDir?: string;
};

export type RunArtifactIndex = {
  add(runId: string, record: RunArtifactRecord): RunArtifactRecord;
  list(runId: string): RunArtifactRecord[];
  indexPath(runId: string): string;
};

export function createRunArtifactIndex(options: RunArtifactIndexOptions = {}): RunArtifactIndex {
  const rootDir = options.rootDir ?? defaultHarnessRootDir();

  function indexPath(runId: string): string {
    return join(rootDir, "runs", safeSegment(runId), "artifacts.json");
  }

  function list(runId: string): RunArtifactRecord[] {
    const path = indexPath(runId);
    if (!existsSync(path)) {
      return [];
    }

    return JSON.parse(readFileSync(path, "utf8")) as RunArtifactRecord[];
  }

  function add(runId: string, record: RunArtifactRecord): RunArtifactRecord {
    const path = indexPath(runId);
    const next = {
      ...record,
      createdAt: record.createdAt ?? new Date().toISOString()
    };
    const records = [...list(runId), next];

    mkdirSync(join(rootDir, "runs", safeSegment(runId)), { recursive: true });
    writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`, "utf8");
    return next;
  }

  return {
    add,
    list,
    indexPath
  };
}
