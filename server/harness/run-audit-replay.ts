import { createPermissionApprovalStore } from "./permission-approval-store";
import { createPermissionAuditReport, type PermissionAuditReport } from "./permission-audit";
import { createRunArtifactIndex, type RunArtifactRecord } from "./run-artifact-index";
import { createRunEventStore, defaultHarnessRootDir } from "./run-event-store";
import type { RunEvent } from "./run-event-trace";
import { projectRunReadModel, type RunReadModelMetrics, type RunReadModelSummary, type RunReadModelTimelineItem } from "./run-read-model";
import { createRunStatusStore, type RunStatusRecord } from "./run-status-store";

export type RunAuditReplaySummary = RunReadModelSummary & {
  kind?: RunStatusRecord["kind"];
  status?: RunStatusRecord["status"];
};

export type RunAuditProviderCall = {
  seq?: number;
  timestamp?: string;
  phase?: string;
  provider?: string;
  model?: string;
  status: "ok" | "error" | "unknown";
  durationMs?: number;
  summary: string;
};

export type RunAuditGithubReview = {
  label: string;
  createdAt?: string;
  checkRunName?: string;
  checkRunConclusion?: string;
  reviewEvent?: string;
  reviewCommentCount: number;
  annotationCount: number;
};

export type RunAuditReplay = {
  summary: RunAuditReplaySummary;
  metrics: RunReadModelMetrics & {
    permissionDecisionCount: number;
    githubReviewCount: number;
  };
  timeline: RunReadModelTimelineItem[];
  providerCalls: RunAuditProviderCall[];
  artifacts: RunArtifactRecord[];
  githubReviews: RunAuditGithubReview[];
  permissionAudit: PermissionAuditReport;
  replayPackage: string;
};

export type RunAuditReplayListItem = {
  runId: string;
  kind?: RunStatusRecord["kind"];
  status?: RunStatusRecord["status"];
  updatedAt?: string;
  summary?: string;
  eventCount: number;
  artifactCount: number;
  providers: string[];
  linkedPullRequests: number[];
  linkedAdrPaths: string[];
  riskLevels: string[];
};

export type RunAuditReplayListFilters = {
  query?: string;
  status?: RunStatusRecord["status"];
  kind?: RunStatusRecord["kind"];
  provider?: string;
  prNumber?: number;
  adrPath?: string;
  riskLevel?: string;
};

export type RunAuditReplayDiff = {
  baseRunId: string;
  targetRunId: string;
  statusChanged: boolean;
  summaryChanged: boolean;
  metricDelta: {
    eventCount: number;
    artifactCount: number;
    providerCallCount: number;
    permissionDecisionCount: number;
    githubReviewCount: number;
    durationMs: number;
  };
  providerChanges: {
    added: string[];
    removed: string[];
    unchanged: string[];
  };
  artifactChanges: {
    added: string[];
    removed: string[];
    unchanged: string[];
  };
  riskLevelChanges: {
    added: string[];
    removed: string[];
    unchanged: string[];
  };
};

export type RunAuditBundle = {
  manifest: {
    formatVersion: 1;
    runId: string;
    createdAt: string;
    status?: RunStatusRecord["status"];
    kind?: RunStatusRecord["kind"];
    linkedPullRequests: number[];
    linkedAdrPaths: string[];
    eventCount: number;
    artifactCount: number;
    providerCallCount: number;
    permissionDecisionCount: number;
    githubReviewCount: number;
  };
  replay: RunAuditReplay;
  files: Array<{
    label: string;
    kind: RunArtifactRecord["kind"];
    path?: string;
    sha256?: string;
  }>;
  markdown: string;
};

export function buildRunAuditReplay(input: { rootDir?: string; runId: string }): RunAuditReplay {
  const rootDir = input.rootDir ?? defaultHarnessRootDir();
  const readModel = projectRunReadModel({ rootDir, runId: input.runId });
  const events = createRunEventStore({ rootDir }).listEvents(input.runId);
  const artifacts = createRunArtifactIndex({ rootDir }).list(input.runId);
  const permissionRecords = createPermissionApprovalStore({ rootDir }).list().filter((record) => record.runId === input.runId);
  const permissionAudit = createPermissionAuditReport(permissionRecords);
  const githubReviews = githubReviewsFromArtifacts(artifacts);
  const providerCalls = providerCallsFromEvents(events);

  return {
    summary: readModel.summary,
    metrics: {
      ...readModel.metrics,
      permissionDecisionCount: permissionRecords.length,
      githubReviewCount: githubReviews.length
    },
    timeline: readModel.timeline,
    providerCalls: providerCalls.length > 0 ? providerCalls : providerCallsFromArtifacts(artifacts),
    artifacts,
    githubReviews,
    permissionAudit,
    replayPackage: renderReplayPackage({
      summary: readModel.summary,
      metrics: readModel.metrics,
      providerCalls: providerCalls.length > 0 ? providerCalls : providerCallsFromArtifacts(artifacts),
      githubReviews,
      permissionAudit
    })
  };
}

export function listRunAuditReplays(input: { rootDir?: string; limit?: number } & RunAuditReplayListFilters = {}): RunAuditReplayListItem[] {
  const rootDir = input.rootDir ?? defaultHarnessRootDir();
  const limit = Math.max(0, input.limit ?? 20);

  return createRunStatusStore({ rootDir })
    .list({ limit: Math.max(limit, 200) })
    .map((run) => {
      const readModel = projectRunReadModel({ rootDir, runId: run.runId });
      const artifacts = createRunArtifactIndex({ rootDir }).list(run.runId);
      const events = createRunEventStore({ rootDir }).listEvents(run.runId);
      const metadata = collectReplayMetadata(artifacts, events);
      return {
        runId: run.runId,
        kind: run.kind,
        status: run.status,
        updatedAt: run.updatedAt,
        ...(run.summary ? { summary: run.summary } : {}),
        eventCount: readModel.summary.eventCount,
        artifactCount: readModel.summary.artifactCount,
        providers: metadata.providers,
        linkedPullRequests: metadata.linkedPullRequests,
        linkedAdrPaths: metadata.linkedAdrPaths,
        riskLevels: metadata.riskLevels
      };
    })
    .filter((item) => matchesReplayFilters(item, input))
    .slice(0, limit);
}

export function diffRunAuditReplays(input: { rootDir?: string; baseRunId: string; targetRunId: string }): RunAuditReplayDiff {
  const rootDir = input.rootDir ?? defaultHarnessRootDir();
  const base = buildRunAuditReplay({ rootDir, runId: input.baseRunId });
  const target = buildRunAuditReplay({ rootDir, runId: input.targetRunId });

  return {
    baseRunId: input.baseRunId,
    targetRunId: input.targetRunId,
    statusChanged: base.summary.status !== target.summary.status,
    summaryChanged: base.summary.summary !== target.summary.summary,
    metricDelta: {
      eventCount: target.metrics.eventCount - base.metrics.eventCount,
      artifactCount: target.metrics.artifactCount - base.metrics.artifactCount,
      providerCallCount: target.providerCalls.length - base.providerCalls.length,
      permissionDecisionCount: target.metrics.permissionDecisionCount - base.metrics.permissionDecisionCount,
      githubReviewCount: target.metrics.githubReviewCount - base.metrics.githubReviewCount,
      durationMs: target.metrics.durationMs - base.metrics.durationMs
    },
    providerChanges: compareStringSets(providersFromReplay(base), providersFromReplay(target)),
    artifactChanges: compareStringSets(
      artifactLabelsFromReplay(base),
      artifactLabelsFromReplay(target)
    ),
    riskLevelChanges: compareStringSets(
      riskLevelsFromArtifacts(base.artifacts),
      riskLevelsFromArtifacts(target.artifacts)
    )
  };
}

export function createRunAuditBundle(input: { rootDir?: string; runId: string }): RunAuditBundle {
  const replay = buildRunAuditReplay(input);
  const metadata = collectReplayMetadata(replay.artifacts, []);
  const createdAt = new Date().toISOString();
  const files = replay.artifacts.map((artifact) => ({
    label: artifact.label,
    kind: artifact.kind,
    ...(artifact.path ? { path: artifact.path } : {}),
    ...(artifact.sha256 ? { sha256: artifact.sha256 } : {})
  }));
  const manifest = {
    formatVersion: 1 as const,
    runId: replay.summary.runId,
    createdAt,
    ...(replay.summary.status ? { status: replay.summary.status } : {}),
    ...(replay.summary.kind ? { kind: replay.summary.kind } : {}),
    linkedPullRequests: metadata.linkedPullRequests,
    linkedAdrPaths: metadata.linkedAdrPaths,
    eventCount: replay.metrics.eventCount,
    artifactCount: replay.metrics.artifactCount,
    providerCallCount: replay.metrics.providerCallCount,
    permissionDecisionCount: replay.metrics.permissionDecisionCount,
    githubReviewCount: replay.metrics.githubReviewCount
  };

  return {
    manifest,
    replay,
    files,
    markdown: renderBundleMarkdown({
      manifest,
      files,
      replay
    })
  };
}

function providerCallsFromEvents(events: RunEvent[]): RunAuditProviderCall[] {
  return events
    .filter((event) => event.type.startsWith("provider_attempt_"))
    .map((event) => ({
      seq: event.seq,
      timestamp: event.timestamp,
      ...(event.phase ? { phase: event.phase } : {}),
      ...(event.provider ? { provider: event.provider } : {}),
      ...(event.model ? { model: event.model } : {}),
      status: event.type === "provider_attempt_failure" ? "error" : event.type === "provider_attempt_success" ? "ok" : "unknown",
      ...(typeof event.durationMs === "number" ? { durationMs: event.durationMs } : {}),
      summary: event.summary
    }));
}

function providerCallsFromArtifacts(artifacts: RunArtifactRecord[]): RunAuditProviderCall[] {
  return artifacts.flatMap((artifact) => {
    if (artifact.kind !== "provider_trace" || !Array.isArray(artifact.inline)) {
      return [];
    }

    return artifact.inline.flatMap((entry): RunAuditProviderCall[] => {
      if (typeof entry !== "object" || entry === null) {
        return [];
      }

      const candidate = entry as {
        phase?: unknown;
        provider?: unknown;
        model?: unknown;
        status?: unknown;
        durationMs?: unknown;
        text?: unknown;
      };

      return [{
        ...(typeof candidate.phase === "string" ? { phase: candidate.phase } : {}),
        ...(typeof candidate.provider === "string" ? { provider: candidate.provider } : {}),
        ...(typeof candidate.model === "string" ? { model: candidate.model } : {}),
        status: candidate.status === "ok" || candidate.status === "error" ? candidate.status : "unknown",
        ...(typeof candidate.durationMs === "number" ? { durationMs: candidate.durationMs } : {}),
        summary: typeof candidate.text === "string" && candidate.text.trim() ? candidate.text.slice(0, 180) : artifact.label
      }];
    });
  });
}

function githubReviewsFromArtifacts(artifacts: RunArtifactRecord[]): RunAuditGithubReview[] {
  return artifacts.flatMap((artifact) => {
    const github = githubPayloadFromArtifact(artifact);

    if (!github) {
      return [];
    }

    return [{
      label: artifact.label,
      ...(artifact.createdAt ? { createdAt: artifact.createdAt } : {}),
      ...(typeof github.checkRun?.name === "string" ? { checkRunName: github.checkRun.name } : {}),
      ...(typeof github.checkRun?.conclusion === "string" ? { checkRunConclusion: github.checkRun.conclusion } : {}),
      ...(typeof github.pullRequestReview?.event === "string" ? { reviewEvent: github.pullRequestReview.event } : {}),
      reviewCommentCount: Array.isArray(github.pullRequestReview?.comments) ? github.pullRequestReview.comments.length : 0,
      annotationCount: Array.isArray(github.checkRun?.annotations) ? github.checkRun.annotations.length : 0
    }];
  });
}

function githubPayloadFromArtifact(artifact: RunArtifactRecord): {
  checkRun?: {
    name?: unknown;
    conclusion?: unknown;
    annotations?: unknown;
  };
  pullRequestReview?: {
    event?: unknown;
    comments?: unknown;
  };
} | undefined {
  if (typeof artifact.inline !== "object" || artifact.inline === null) {
    return undefined;
  }

  const inline = artifact.inline as { github?: unknown };

  if (typeof inline.github !== "object" || inline.github === null) {
    return undefined;
  }

  return inline.github as {
    checkRun?: {
      name?: unknown;
      conclusion?: unknown;
      annotations?: unknown;
    };
    pullRequestReview?: {
      event?: unknown;
      comments?: unknown;
    };
  };
}

function renderReplayPackage(input: {
  summary: RunReadModelSummary;
  metrics: RunReadModelMetrics;
  providerCalls: RunAuditProviderCall[];
  githubReviews: RunAuditGithubReview[];
  permissionAudit: PermissionAuditReport;
}): string {
  return [
    "# QuorumMind Run Audit Replay",
    "",
    `Run: ${input.summary.runId}`,
    input.summary.status ? `Status: ${input.summary.status}` : "",
    input.summary.summary ? `Summary: ${input.summary.summary}` : "",
    `Events: ${input.summary.eventCount}`,
    `Artifacts: ${input.summary.artifactCount}`,
    `Duration: ${input.metrics.durationMs}ms`,
    "",
    "## Provider Calls",
    ...(input.providerCalls.length > 0
      ? input.providerCalls.map((call) => `- ${call.status}: ${call.provider ?? "unknown"}/${call.model ?? "unknown"} ${call.phase ?? "unknown"} - ${call.summary}`)
      : ["- None recorded."]),
    "",
    "## GitHub Review Outputs",
    ...(input.githubReviews.length > 0
      ? input.githubReviews.map((review) => `- ${review.label}: ${review.checkRunConclusion ?? "no check"} / ${review.reviewCommentCount} review comments`)
      : ["- None recorded."]),
    "",
    "## Permission Decisions",
    ...(input.permissionAudit.items.length > 0
      ? input.permissionAudit.items.map((item) => `- ${item.outcome}: ${item.toolName} - ${item.whyAllowedOrDenied}`)
      : ["- None recorded."])
  ].filter(Boolean).join("\n");
}

function collectReplayMetadata(artifacts: RunArtifactRecord[], events: RunEvent[]): {
  providers: string[];
  linkedPullRequests: number[];
  linkedAdrPaths: string[];
  riskLevels: string[];
} {
  return {
    providers: sortedUnique([
      ...events.flatMap((event) => event.provider ? [event.provider] : []),
      ...providerCallsFromArtifacts(artifacts).flatMap((call) => call.provider ? [call.provider] : [])
    ]),
    linkedPullRequests: sortedNumbers(artifacts.flatMap((artifact) => numbersFromMetadata(artifact.metadata?.prNumber))),
    linkedAdrPaths: sortedUnique(artifacts.flatMap((artifact) => stringsFromMetadata(artifact.metadata?.adrPath))),
    riskLevels: sortedUnique(riskLevelsFromArtifacts(artifacts))
  };
}

function matchesReplayFilters(item: RunAuditReplayListItem, filters: RunAuditReplayListFilters): boolean {
  if (filters.status && item.status !== filters.status) {
    return false;
  }

  if (filters.kind && item.kind !== filters.kind) {
    return false;
  }

  if (filters.provider && !item.providers.some((provider) => provider.toLowerCase().includes(filters.provider!.toLowerCase()))) {
    return false;
  }

  if (typeof filters.prNumber === "number" && !item.linkedPullRequests.includes(filters.prNumber)) {
    return false;
  }

  if (filters.adrPath && !item.linkedAdrPaths.some((path) => path.toLowerCase().includes(filters.adrPath!.toLowerCase()))) {
    return false;
  }

  if (filters.riskLevel && !item.riskLevels.some((risk) => risk.toLowerCase() === filters.riskLevel!.toLowerCase())) {
    return false;
  }

  if (filters.query) {
    const haystack = [
      item.runId,
      item.summary ?? "",
      item.kind ?? "",
      item.status ?? "",
      ...item.providers,
      ...item.linkedAdrPaths,
      ...item.linkedPullRequests.map(String),
      ...item.riskLevels
    ].join(" ").toLowerCase();

    return haystack.includes(filters.query.toLowerCase());
  }

  return true;
}

function providersFromReplay(replay: RunAuditReplay): string[] {
  return uniqueInOrder(replay.providerCalls.flatMap((call) => call.provider ? [call.provider] : []));
}

function artifactLabelsFromReplay(replay: RunAuditReplay): string[] {
  return sortedUnique(replay.artifacts.map((artifact) => artifact.path ?? artifact.label));
}

function riskLevelsFromArtifacts(artifacts: RunArtifactRecord[]): string[] {
  return sortedUnique(artifacts.flatMap((artifact) => stringsFromMetadata(artifact.metadata?.riskLevels)));
}

function compareStringSets(base: string[], target: string[]): RunAuditReplayDiff["providerChanges"] {
  const baseSet = new Set(base);
  const targetSet = new Set(target);

  return {
    added: target.filter((item) => !baseSet.has(item)),
    removed: base.filter((item) => !targetSet.has(item)),
    unchanged: target.filter((item) => baseSet.has(item))
  };
}

function stringsFromMetadata(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(stringsFromMetadata);
  }

  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function numbersFromMetadata(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.flatMap(numbersFromMetadata);
  }

  return typeof value === "number" && Number.isFinite(value) ? [Math.round(value)] : [];
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function sortedNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function renderBundleMarkdown(input: {
  manifest: RunAuditBundle["manifest"];
  files: RunAuditBundle["files"];
  replay: RunAuditReplay;
}): string {
  return [
    "# QuorumMind Run Audit Bundle",
    "",
    `Run: ${input.manifest.runId}`,
    input.manifest.status ? `Status: ${input.manifest.status}` : "",
    input.manifest.linkedPullRequests.length ? `PRs: ${input.manifest.linkedPullRequests.map((pr) => `#${pr}`).join(", ")}` : "PRs: none",
    input.manifest.linkedAdrPaths.length ? `ADRs: ${input.manifest.linkedAdrPaths.join(", ")}` : "ADRs: none",
    `Events: ${input.manifest.eventCount}`,
    `Artifacts: ${input.manifest.artifactCount}`,
    `Provider calls: ${input.manifest.providerCallCount}`,
    "",
    "## Files",
    ...(input.files.length > 0
      ? input.files.map((file) => `- ${file.kind}: ${file.path ?? file.label}${file.sha256 ? ` (${file.sha256})` : ""}`)
      : ["- None recorded."]),
    "",
    "## Replay",
    input.replay.replayPackage
  ].filter(Boolean).join("\n");
}
