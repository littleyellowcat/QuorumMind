import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRunArtifactIndex } from "./run-artifact-index";
import { createRunEventStore, defaultHarnessRootDir, safeSegment } from "./run-event-store";
import type { RunEvent } from "./run-event-trace";
import { createRunStatusStore, type RunStatusRecord } from "./run-status-store";
import { estimateRunUsage } from "./usage-accounting";

export type RunReadModelSummary = {
  runId: string;
  kind?: RunStatusRecord["kind"];
  status?: RunStatusRecord["status"];
  createdAt?: string;
  updatedAt?: string;
  summary?: string;
  eventCount: number;
  artifactCount: number;
  lastEventType?: RunEvent["type"];
  lastEventAt?: string;
};

export type RunReadModelMetrics = ReturnType<typeof estimateRunUsage> & {
  runId: string;
  durationMs: number;
  artifactCount: number;
  truncatedOutputCount: number;
  eventCount: number;
};

export type RunReadModelTimelineItem = {
  seq: number;
  timestamp: string;
  type: RunEvent["type"];
  severity: RunEvent["severity"];
  summary: string;
  phase?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
};

export type RunReadModelProjection = {
  summary: RunReadModelSummary;
  metrics: RunReadModelMetrics;
  timeline: RunReadModelTimelineItem[];
  paths: {
    summaryPath: string;
    metricsPath: string;
    timelinePath: string;
  };
};

export type ProjectRunReadModelInput = {
  rootDir?: string;
  runId: string;
};

export function projectRunReadModel(input: ProjectRunReadModelInput): RunReadModelProjection {
  const rootDir = input.rootDir ?? defaultHarnessRootDir();
  const runId = input.runId;
  const status = createRunStatusStore({ rootDir }).find(runId);
  const events = createRunEventStore({ rootDir }).listEvents(runId);
  const artifacts = createRunArtifactIndex({ rootDir }).list(runId);
  const providerTrace = artifacts.flatMap((artifact) => {
    if (artifact.kind !== "provider_trace") {
      return [];
    }

    if (Array.isArray(artifact.inline)) {
      return artifact.inline;
    }

    const inline = artifact.inline as { providerCalls?: unknown; usableCalls?: unknown } | undefined;
    const providerCalls = typeof inline?.providerCalls === "number" ? inline.providerCalls : 1;
    return Array.from({ length: Math.max(0, providerCalls) }, () => ({
      status: "ok" as const,
      text: ""
    }));
  });
  const usage = estimateRunUsage({
    providerTrace,
    events,
    liveTraceRequired: providerTrace.length > 0,
    liveTraceUsable: providerTrace.length > 0
  });
  const timeline = events.map((event): RunReadModelTimelineItem => ({
    seq: event.seq,
    timestamp: event.timestamp,
    type: event.type,
    severity: event.severity,
    summary: event.summary,
    ...(event.phase ? { phase: event.phase } : {}),
    ...(event.provider ? { provider: event.provider } : {}),
    ...(event.model ? { model: event.model } : {}),
    ...(typeof event.durationMs === "number" ? { durationMs: event.durationMs } : {})
  }));
  const durationMs = durationFrom(status, events);
  const truncatedOutputCount = artifacts.filter(
    (artifact) => artifact.kind === "bounded_output" && artifact.metadata?.truncated === true
  ).length;
  const summary: RunReadModelSummary = {
    runId,
    ...(status?.kind ? { kind: status.kind } : {}),
    ...(status?.status ? { status: status.status } : {}),
    ...(status?.createdAt ? { createdAt: status.createdAt } : {}),
    ...(status?.updatedAt ? { updatedAt: status.updatedAt } : {}),
    ...(status?.summary ? { summary: status.summary } : {}),
    eventCount: events.length,
    artifactCount: artifacts.length,
    ...(events.at(-1)?.type ? { lastEventType: events.at(-1)?.type } : {}),
    ...(events.at(-1)?.timestamp ? { lastEventAt: events.at(-1)?.timestamp } : {})
  };
  const metrics: RunReadModelMetrics = {
    runId,
    durationMs,
    artifactCount: artifacts.length,
    truncatedOutputCount,
    eventCount: events.length,
    ...usage
  };
  const paths = readModelPaths(rootDir, runId);

  mkdirSync(join(rootDir, "runs", safeSegment(runId)), { recursive: true });
  writeJson(paths.summaryPath, summary);
  writeJson(paths.metricsPath, metrics);
  writeJson(paths.timelinePath, timeline);

  return {
    summary,
    metrics,
    timeline,
    paths
  };
}

function readModelPaths(rootDir: string, runId: string): RunReadModelProjection["paths"] {
  const runDir = join(rootDir, "runs", safeSegment(runId));
  return {
    summaryPath: join(runDir, "run-summary.json"),
    metricsPath: join(runDir, "run-metrics.json"),
    timelinePath: join(runDir, "run-timeline.json")
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function durationFrom(status: RunStatusRecord | undefined, events: RunEvent[]): number {
  const startedAt = status?.createdAt ?? events[0]?.timestamp;
  const endedAt = status?.updatedAt ?? events.at(-1)?.timestamp;

  if (!startedAt || !endedAt) {
    return 0;
  }

  const duration = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}
