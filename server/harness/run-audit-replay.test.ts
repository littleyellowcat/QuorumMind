// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPermissionApprovalStore } from "./permission-approval-store";
import { createRunArtifactIndex } from "./run-artifact-index";
import { buildRunAuditReplay, createRunAuditBundle, diffRunAuditReplays, listRunAuditReplays } from "./run-audit-replay";
import { createRunEventStore } from "./run-event-store";
import { createRunStatusStore } from "./run-status-store";

describe("run audit replay", () => {
  it("merges status, timeline, artifacts, provider calls, GitHub review payloads, and permission audit", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-audit-replay-"));
    const status = createRunStatusStore({ rootDir });
    const events = createRunEventStore({ rootDir });
    const artifacts = createRunArtifactIndex({ rootDir });
    const permissions = createPermissionApprovalStore({ rootDir });

    status.save({
      runId: "run-audit-1",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T08:00:07.000Z",
      summary: "Architecture review for auth boundary PR"
    });
    events.appendEvents([
      {
        runId: "run-audit-1",
        seq: 0,
        timestamp: "2026-08-21T08:00:00.000Z",
        type: "run_start",
        severity: "info",
        summary: "started",
        truncated: false
      },
      {
        runId: "run-audit-1",
        seq: 0,
        timestamp: "2026-08-21T08:00:03.000Z",
        type: "provider_attempt_success",
        severity: "info",
        phase: "proposal",
        provider: "openrouter",
        model: "anthropic/claude",
        durationMs: 1500,
        summary: "provider ok",
        truncated: false
      },
      {
        runId: "run-audit-1",
        seq: 0,
        timestamp: "2026-08-21T08:00:07.000Z",
        type: "run_complete",
        severity: "info",
        summary: "completed",
        truncated: false
      }
    ]);
    artifacts.add("run-audit-1", {
      kind: "provider_trace",
      label: "provider trace",
      inline: [{ status: "ok", provider: "openrouter", model: "anthropic/claude", text: "review" }]
    });
    artifacts.add("run-audit-1", {
      kind: "bounded_output",
      label: "GitHub native review package",
      inline: {
        github: {
          checkRun: { name: "QuorumMind Architecture Review", conclusion: "neutral" },
          pullRequestReview: { event: "COMMENT", comments: [{ path: "server/auth.ts", body: "Clarify auth boundary." }] }
        }
      },
      metadata: { truncated: false }
    });
    permissions.add({
      id: "approval-1",
      runId: "run-audit-1",
      toolName: "mcp:github:list_pull_requests",
      node: "mcp_read_only_tool",
      category: "read_only",
      risk: "low",
      decision: "auto",
      reason: "Read-only GitHub context lookup.",
      status: "approved",
      scope: "run",
      requestedBy: "executor_agent",
      createdAt: "2026-08-21T08:00:02.000Z"
    });

    const replay = buildRunAuditReplay({ rootDir, runId: "run-audit-1" });

    expect(replay.summary).toMatchObject({
      runId: "run-audit-1",
      status: "completed",
      eventCount: 3,
      artifactCount: 2
    });
    expect(replay.metrics).toMatchObject({
      providerCallCount: 1,
      permissionDecisionCount: 1,
      githubReviewCount: 1
    });
    expect(replay.providerCalls).toEqual([
      expect.objectContaining({
        provider: "openrouter",
        model: "anthropic/claude",
        phase: "proposal"
      })
    ]);
    expect(replay.githubReviews[0]).toMatchObject({
      label: "GitHub native review package",
      checkRunConclusion: "neutral",
      reviewCommentCount: 1
    });
    expect(replay.permissionAudit.summary.allowed).toBe(1);
    expect(replay.replayPackage).toContain("Architecture review for auth boundary PR");
    expect(replay.replayPackage).toContain("mcp:github:list_pull_requests");
  });

  it("lists recent replay summaries sorted by update time", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-audit-replay-list-"));
    const status = createRunStatusStore({ rootDir });

    status.save({
      runId: "older",
      kind: "live_decision",
      status: "completed",
      createdAt: "2026-08-20T08:00:00.000Z",
      updatedAt: "2026-08-20T08:00:01.000Z"
    });
    status.save({
      runId: "newer",
      kind: "autonomous_blueprint",
      status: "paused",
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T08:00:01.000Z"
    });

    const replays = listRunAuditReplays({ rootDir, limit: 2 });

    expect(replays.map((item) => item.runId)).toEqual(["newer", "older"]);
    expect(replays[0]).toMatchObject({
      runId: "newer",
      status: "paused",
      kind: "autonomous_blueprint"
    });
  });

  it("searches and filters replay archive by status, provider, PR number, ADR path, and text", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-audit-replay-filter-"));
    const status = createRunStatusStore({ rootDir });
    const events = createRunEventStore({ rootDir });
    const artifacts = createRunArtifactIndex({ rootDir });

    status.save({
      runId: "run-pr-auth",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T08:00:07.000Z",
      summary: "Review auth PR #42"
    });
    status.save({
      runId: "run-local-cost",
      kind: "live_decision",
      status: "failed",
      createdAt: "2026-08-21T07:00:00.000Z",
      updatedAt: "2026-08-21T07:00:07.000Z",
      summary: "Cost decision"
    });
    events.appendEvent({
      runId: "run-pr-auth",
      seq: 0,
      timestamp: "2026-08-21T08:00:02.000Z",
      type: "provider_attempt_success",
      severity: "info",
      provider: "openrouter",
      model: "anthropic/claude",
      phase: "proposal",
      summary: "openrouter reviewed auth",
      truncated: false
    });
    artifacts.add("run-pr-auth", {
      kind: "bounded_output",
      label: "GitHub native review package",
      inline: {
        github: {
          checkRun: { conclusion: "neutral", annotations: [{ path: "server/auth.ts", start_line: 12 }] },
          pullRequestReview: { event: "COMMENT", comments: [{ path: "server/auth.ts", line: 12, body: "Auth risk" }] }
        }
      },
      metadata: {
        prNumber: 42,
        adrPath: "docs/ADR-042-auth-boundary.md",
        riskLevels: ["high"]
      }
    });

    const filtered = listRunAuditReplays({
      rootDir,
      status: "completed",
      provider: "openrouter",
      prNumber: 42,
      adrPath: "ADR-042",
      query: "auth",
      riskLevel: "high"
    });

    expect(filtered).toEqual([
      expect.objectContaining({
        runId: "run-pr-auth",
        linkedPullRequests: [42],
        linkedAdrPaths: ["docs/ADR-042-auth-boundary.md"],
        providers: ["openrouter"],
        riskLevels: ["high"]
      })
    ]);
  });

  it("diffs two replays and creates an exportable audit bundle", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-audit-replay-bundle-"));
    const status = createRunStatusStore({ rootDir });
    const events = createRunEventStore({ rootDir });
    const artifacts = createRunArtifactIndex({ rootDir });

    status.save({
      runId: "base",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-21T06:00:00.000Z",
      updatedAt: "2026-08-21T06:00:02.000Z",
      summary: "Base review"
    });
    status.save({
      runId: "target",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T08:00:07.000Z",
      summary: "Target review"
    });
    events.appendEvent({
      runId: "base",
      seq: 0,
      timestamp: "2026-08-21T06:00:01.000Z",
      type: "provider_attempt_success",
      severity: "info",
      provider: "openai",
      model: "gpt",
      summary: "base provider",
      truncated: false
    });
    events.appendEvents([
      {
        runId: "target",
        seq: 0,
        timestamp: "2026-08-21T08:00:01.000Z",
        type: "provider_attempt_success",
        severity: "info",
        provider: "openrouter",
        model: "claude",
        summary: "target provider",
        truncated: false
      },
      {
        runId: "target",
        seq: 0,
        timestamp: "2026-08-21T08:00:02.000Z",
        type: "provider_attempt_failure",
        severity: "warning",
        provider: "gemini",
        model: "flash",
        summary: "schema failed",
        truncated: false
      }
    ]);
    artifacts.add("target", {
      kind: "bounded_output",
      label: "ADR draft",
      path: "docs/ADR-100-target.md",
      sha256: "abc123",
      metadata: {
        adrPath: "docs/ADR-100-target.md",
        prNumber: 100
      }
    });

    const diff = diffRunAuditReplays({ rootDir, baseRunId: "base", targetRunId: "target" });
    const bundle = createRunAuditBundle({ rootDir, runId: "target" });

    expect(diff.statusChanged).toBe(false);
    expect(diff.metricDelta.providerCallCount).toBe(1);
    expect(diff.providerChanges.added).toEqual(["openrouter", "gemini"]);
    expect(diff.providerChanges.removed).toEqual(["openai"]);
    expect(bundle.manifest).toMatchObject({
      runId: "target",
      formatVersion: 1,
      linkedPullRequests: [100],
      linkedAdrPaths: ["docs/ADR-100-target.md"]
    });
    expect(bundle.files).toEqual([
      expect.objectContaining({
        label: "ADR draft",
        path: "docs/ADR-100-target.md",
        sha256: "abc123"
      })
    ]);
    expect(bundle.markdown).toContain("# QuorumMind Run Audit Bundle");
    expect(bundle.markdown).toContain("PRs: #100");
  });
});
