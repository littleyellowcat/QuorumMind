// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { runGithubE2EValidation } from "./github-e2e-validation";

describe("GitHub E2E validation harness", () => {
  it("validates the /qm review-pr to Check Run and PR Review loop without writing GitHub by default", async () => {
    const report = await runGithubE2EValidation({
      commentBody: "/qm review-pr --pr 42 focus on auth boundaries and ADR",
      repo: "kitten/quorummind",
      issueNumber: 42,
      changedFiles: ["server/auth.ts"],
      diffText: [
        "diff --git a/server/auth.ts b/server/auth.ts",
        "@@ -1,1 +1,2 @@",
        "+const token = req.query.token"
      ].join("\n")
    });

    expect(report).toMatchObject({
      mode: "mock",
      passed: true,
      readyToWrite: false
    });
    expect(report.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "command_planned", passed: true }),
      expect.objectContaining({ id: "native_payload_valid", passed: true }),
      expect.objectContaining({ id: "check_run_roundtrip", passed: true }),
      expect.objectContaining({ id: "pr_review_roundtrip", passed: true })
    ]));
    expect(report.postedRequests.map((request) => request.kind)).toEqual(["check_run", "pr_review"]);
    expect(JSON.stringify(report)).not.toContain("mock-token");
  });

  it("uses supplied GitHub credentials only when live write mode is explicitly enabled", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 201 }));
    const report = await runGithubE2EValidation({
      commentBody: "/qm review-pr --pr 42 focus on auth boundaries and ADR",
      repo: "kitten/quorummind",
      issueNumber: 42,
      changedFiles: ["server/auth.ts"],
      diffText: "diff --git a/server/auth.ts b/server/auth.ts\n@@ -1,1 +1,2 @@\n+token",
      write: true,
      token: "gh-live-token",
      headSha: "abc123",
      fetch: fetchImpl
    });

    expect(report).toMatchObject({
      mode: "live",
      passed: true,
      readyToWrite: true
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.github.com/repos/kitten/quorummind/check-runs");
    expect(fetchImpl.mock.calls[1][0]).toBe("https://api.github.com/repos/kitten/quorummind/pulls/42/reviews");
    expect(JSON.stringify(report)).not.toContain("gh-live-token");
  });
});
