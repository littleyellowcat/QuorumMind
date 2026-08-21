// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { planQuorumMindGithubRun } from "./quorummind-runner";
import { postGithubNativeOutputs, renderGithubActionOutput } from "./run-github-action";

describe("runGithubAction output modes", () => {
  it("renders check-run and PR-review payloads for dry-run summaries", async () => {
    const run = await planQuorumMindGithubRun({
      commentBody: "/qm review-pr --pr 42 focus on auth boundaries",
      repo: "kitten/quorummind",
      issueNumber: 42,
      changedFiles: ["server/auth.ts"],
      diffText: "diff --git a/server/auth.ts b/server/auth.ts\n+token",
      dryRun: true
    });

    expect(run.status).toBe("planned");
    expect(renderGithubActionOutput(run, "check")).toContain("Check Run payload");
    expect(renderGithubActionOutput(run, "check")).toContain("QuorumMind Architecture Review");
    expect(renderGithubActionOutput(run, "pr_review")).toContain("PR Review payload");
    expect(renderGithubActionOutput(run, "pr_review")).toContain("Suggested ADR");
    expect(renderGithubActionOutput(run, "all")).toContain("Issue Comment payload");
    expect(renderGithubActionOutput(run, "all")).toContain("Production checks");
    expect(renderGithubActionOutput(run, "all")).toContain("minimumPermissions");
  });

  it("posts native Check Run and PR Review outputs only when explicitly requested", async () => {
    const run = await planQuorumMindGithubRun({
      commentBody: "/qm review-pr --pr 42 focus on auth boundaries",
      repo: "kitten/quorummind",
      issueNumber: 42,
      changedFiles: ["server/auth.ts"],
      diffText: "diff --git a/server/auth.ts b/server/auth.ts\n+token",
      dryRun: true
    });
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 201 }));

    expect(run.status).toBe("planned");
    await postGithubNativeOutputs(run.githubNative, "all", {
      GITHUB_TOKEN: "gh-token",
      GITHUB_SHA: "abc123"
    }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/kitten/quorummind/check-runs",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"head_sha\":\"abc123\"")
      })
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/kitten/quorummind/pulls/42/reviews",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"event\":\"COMMENT\"")
      })
    );
  });
});
