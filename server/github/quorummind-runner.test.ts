// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createQuorumMindGithubReview, planQuorumMindGithubRun, validateGithubNativeReview } from "./quorummind-runner";

describe("QuorumMind GitHub runner", () => {
  it("turns a review-pr comment into a dry-run architecture review package", async () => {
    const run = await planQuorumMindGithubRun({
      commentBody: "/qm review-pr --pr 42 focus on auth boundaries",
      repo: "kitten/quorummind",
      issueNumber: 42,
      diffText: "diff --git a/server/auth.ts b/server/auth.ts\n+export const token = req.query.token",
      changedFiles: ["server/auth.ts"],
      dryRun: true
    });

    expect(run.status).toBe("planned");
    expect(run.command).toMatchObject({
      matched: true,
      command: "review-pr",
      prNumber: 42
    });
    expect(run.githubWriteMode).toBe("dry_run");
    expect(run.reviewMarkdown).toContain("QuorumMind Architecture Review");
    expect(run.reviewMarkdown).toContain("focus on auth boundaries");
    expect(run.reviewMarkdown).toContain("server/auth.ts");
    expect(run.reviewMarkdown).toContain("No GitHub comment or PR write was performed");
  });

  it("rejects non QuorumMind comments without side effects", async () => {
    const run = await planQuorumMindGithubRun({
      commentBody: "looks good",
      repo: "kitten/quorummind",
      issueNumber: 7,
      dryRun: true
    });

    expect(run).toEqual({
      status: "ignored",
      reason: "No /quorummind or /qm command was found."
    });
  });

  it("can build a publishable GitHub comment request without posting it", () => {
    const review = createQuorumMindGithubReview({
      repo: "kitten/quorummind",
      issueNumber: 42,
      command: {
        matched: true,
        source: "github_comment",
        trigger: "/qm",
        command: "review-pr",
        prompt: "focus on data retention",
        prNumber: 42
      },
      evidence: {
        changedFiles: ["server/privacy.ts"],
        diffSummary: "1 file changed",
        adrReferences: ["ADR-001"]
      },
      dryRun: false
    });

    expect(review.writeRequest).toEqual({
      owner: "kitten",
      repo: "quorummind",
      issueNumber: 42,
      body: expect.stringContaining("focus on data retention")
    });
    expect(review.markdown).not.toContain("No GitHub comment or PR write was performed");
  });

  it("ingests deeper GitHub PR context when a token and fetch client are supplied", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/pulls/42/files")) {
        return json([{ filename: "server/auth.ts", patch: "+token" }]);
      }
      if (url.endsWith("/issues/42/comments")) {
        return json([{ user: { login: "alice" }, body: "please check auth", created_at: "2026-08-21T00:00:00Z" }]);
      }
      if (url.endsWith("/issues/42")) {
        return json({ labels: [{ name: "security" }] });
      }
      if (url.endsWith("/pulls/42/reviews")) {
        return json([{ user: { login: "bob" }, state: "CHANGES_REQUESTED", body: "tighten token handling" }]);
      }
      return json({}, 404);
    });

    const run = await planQuorumMindGithubRun({
      commentBody: "/qm review-pr --pr 42 focus on auth boundaries",
      repo: "kitten/quorummind",
      issueNumber: 42,
      githubToken: "gh-secret",
      fetch: fetchImpl,
      dryRun: true
    });

    expect(run.status).toBe("planned");
    expect(run.evidence.changedFiles).toEqual(["server/auth.ts"]);
    expect(run.evidence.githubContext).toMatchObject({
      labels: ["security"],
      comments: [expect.objectContaining({ author: "alice", body: "please check auth" })],
      reviewHistory: [expect.objectContaining({ reviewer: "bob", state: "CHANGES_REQUESTED" })]
    });
    expect(run.reviewMarkdown).toContain("GitHub context");
    expect(run.reviewMarkdown).toContain("security");
    expect(run.reviewMarkdown).toContain("CHANGES_REQUESTED");
    expect(JSON.stringify(run)).not.toContain("gh-secret");
  });

  it("builds GitHub Check Run and PR Review payloads without writing them", async () => {
    const run = await planQuorumMindGithubRun({
      commentBody: "/qm review-pr --pr 42 focus on auth boundaries and ADR",
      repo: "kitten/quorummind",
      issueNumber: 42,
      diffText: "diff --git a/server/auth.ts b/server/auth.ts\n+export const token = req.query.token",
      changedFiles: ["server/auth.ts"],
      dryRun: true
    });

    expect(run.status).toBe("planned");
    expect(run.githubNative.checkRun).toMatchObject({
      owner: "kitten",
      repo: "quorummind",
      name: "QuorumMind Architecture Review",
      conclusion: "neutral"
    });
    expect(run.githubNative.checkRun.output.summary).toContain("focus on auth boundaries");
    expect(run.githubNative.checkRun.output.annotations).toEqual([
      expect.objectContaining({
        path: "server/auth.ts",
        annotation_level: "failure",
        message: expect.stringContaining("auth")
      })
    ]);
    expect(run.githubNative.pullRequestReview).toMatchObject({
      owner: "kitten",
      repo: "quorummind",
      pullNumber: 42,
      event: "COMMENT"
    });
    expect(run.githubNative.pullRequestReview.body).toContain("## Suggested ADR");
    expect(run.githubNative.pullRequestReview.comments).toEqual([
      expect.objectContaining({
        path: "server/auth.ts",
        body: expect.stringContaining("architecture risk")
      })
    ]);
    expect(run.reviewMarkdown).toContain("GitHub native outputs");
    expect(run.reviewMarkdown).toContain("Check Run conclusion: neutral");
  });

  it("hardens native GitHub payloads with patch line mapping, duplicate suppression, status workflow, and permission notes", async () => {
    const run = await planQuorumMindGithubRun({
      commentBody: "/qm review-pr --pr 42 focus on auth boundary",
      repo: "kitten/quorummind",
      issueNumber: 42,
      diffText: [
        "diff --git a/server/auth.ts b/server/auth.ts",
        "@@ -9,2 +10,4 @@",
        " context",
        "+const token = req.query.token",
        "+const tokenAgain = req.query.token",
        "diff --git a/server/auth.ts b/server/auth.ts",
        "@@ -20,1 +30,2 @@",
        "+const permission = user.permission"
      ].join("\n"),
      changedFiles: ["server/auth.ts", "server/auth.ts"],
      dryRun: true
    });

    expect(run.status).toBe("planned");
    expect(run.githubNative.checkRun.output.annotations[0]).toMatchObject({
      path: "server/auth.ts",
      start_line: 11,
      end_line: 11
    });
    expect(run.githubNative.pullRequestReview.comments[0]).toMatchObject({
      path: "server/auth.ts",
      line: 11
    });
    expect(run.githubNative.productionChecks).toMatchObject({
      valid: true,
      lineMapping: "patch_hunk",
      duplicateAnnotationsRemoved: expect.any(Number),
      duplicateCommentsRemoved: expect.any(Number),
      minimumPermissions: ["contents: read", "pull-requests: write", "checks: write"]
    });
    expect(run.githubNative.statusWorkflow).toEqual([
      "queued",
      "in_progress",
      "completed"
    ]);
    expect(validateGithubNativeReview(run.githubNative)).toMatchObject({
      valid: true,
      errors: []
    });
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
