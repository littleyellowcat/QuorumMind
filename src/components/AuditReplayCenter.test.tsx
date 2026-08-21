import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuditReplayCenter } from "./AuditReplayCenter";
import type { RunAuditReplay, RunAuditReplayListItem } from "../lib/api-client";

const replays: RunAuditReplayListItem[] = [
  {
    runId: "run-1",
    kind: "autonomous_blueprint",
    status: "completed",
    updatedAt: "2026-08-21T08:00:00.000Z",
    summary: "Architecture review",
    eventCount: 4,
    artifactCount: 2,
    providers: ["openrouter"],
    linkedPullRequests: [42],
    linkedAdrPaths: ["docs/ADR-042-auth.md"],
    riskLevels: ["high"]
  }
];

const replay: RunAuditReplay = {
  summary: {
    runId: "run-1",
    kind: "autonomous_blueprint",
    status: "completed",
    eventCount: 4,
    artifactCount: 2
  },
  metrics: {
    runId: "run-1",
    durationMs: 4000,
    providerCallCount: 2,
    retryCount: 0,
    failureCount: 0,
    humanReviewCount: 1,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    estimatedTotalTokens: 0,
    estimatedCostUsd: 0,
    retryCostUsd: 0,
    fallbackSavedCostUsd: 0,
    artifactCount: 2,
    truncatedOutputCount: 0,
    eventCount: 4,
    permissionDecisionCount: 1,
    githubReviewCount: 1
  },
  timeline: [
    {
      seq: 1,
      timestamp: "2026-08-21T08:00:00.000Z",
      type: "run_start",
      severity: "info",
      summary: "started"
    }
  ],
  providerCalls: [
    {
      provider: "openrouter",
      model: "anthropic/claude",
      phase: "proposal",
      status: "ok",
      summary: "provider ok"
    }
  ],
  artifacts: [],
  githubReviews: [
    {
      label: "GitHub native review package",
      checkRunConclusion: "neutral",
      reviewCommentCount: 1,
      annotationCount: 2
    }
  ],
  permissionAudit: {
    generatedAt: "2026-08-21T08:00:00.000Z",
    summary: { total: 1, allowed: 1, humanGated: 0, blocked: 0, redactedOrTruncated: 0 },
    items: [],
    approvalPackage: ""
  },
  replayPackage: "# QuorumMind Run Audit Replay"
};

describe("AuditReplayCenter", () => {
  it("shows replay metrics and copy action", async () => {
    const copy = vi.fn();

    render(
      <AuditReplayCenter
        locale="en"
        replays={replays}
        selectedReplay={replay}
        selectedBundle={{
          manifest: {
            formatVersion: 1,
            runId: "run-1",
            createdAt: "2026-08-21T08:01:00.000Z",
            linkedPullRequests: [42],
            linkedAdrPaths: ["docs/ADR-042-auth.md"],
            eventCount: 4,
            artifactCount: 2,
            providerCallCount: 2,
            permissionDecisionCount: 1,
            githubReviewCount: 1
          },
          replay,
          files: [
            {
              label: "GitHub native review package",
              kind: "provider_trace",
              sha256: "abc"
            }
          ],
          markdown: "# QuorumMind Run Audit Bundle"
        }}
        replayDiff={{
          baseRunId: "run-0",
          targetRunId: "run-1",
          statusChanged: true,
          summaryChanged: true,
          metricDelta: {
            eventCount: 2,
            artifactCount: 1,
            providerCallCount: 1,
            permissionDecisionCount: 1,
            githubReviewCount: 1,
            durationMs: 1200
          },
          providerChanges: { added: ["openrouter"], removed: [], unchanged: [] },
          artifactChanges: { added: ["GitHub native review package"], removed: [], unchanged: [] },
          riskLevelChanges: { added: ["high"], removed: [], unchanged: [] }
        }}
        loading={false}
        onRefresh={vi.fn()}
        onSelectReplay={vi.fn()}
        onCopyReplayPackage={copy}
        onCopyBundle={vi.fn()}
        onLoadBundle={vi.fn()}
        onCompareReplay={vi.fn()}
      />
    );

    expect(screen.getByText("Run audit replay")).toBeInTheDocument();
    expect(screen.getByText("Architecture review")).toBeInTheDocument();
    expect(screen.getByText("PR #42 · docs/ADR-042-auth.md · openrouter · high")).toBeInTheDocument();
    expect(screen.getByText("2 provider calls")).toBeInTheDocument();
    expect(screen.getByText("1 permission decisions")).toBeInTheDocument();
    expect(screen.getByText("1 GitHub outputs")).toBeInTheDocument();
    expect(screen.getByText("neutral")).toBeInTheDocument();
    expect(screen.getByText("Bundle manifest")).toBeInTheDocument();
    expect(screen.getAllByText(/PR #42/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Run diff")).toBeInTheDocument();
    expect(screen.getAllByText(/\+1.*GitHub outputs/).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Copy replay package" }));

    expect(copy).toHaveBeenCalledTimes(1);
  });
});
