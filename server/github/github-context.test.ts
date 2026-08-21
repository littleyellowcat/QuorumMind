// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchGithubPullRequestContext } from "./github-context";

describe("GitHub context ingestion", () => {
  it("fetches PR files, comments, labels, and review history without exposing the token", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/pulls/42/files")) {
        return json([{ filename: "server/auth.ts", patch: "+token" }]);
      }
      if (url.endsWith("/issues/42/comments")) {
        return json([{ user: { login: "alice" }, body: "please check auth", created_at: "2026-08-21T00:00:00Z" }]);
      }
      if (url.endsWith("/issues/42")) {
        return json({ labels: [{ name: "security" }, { name: "architecture" }] });
      }
      if (url.endsWith("/pulls/42/reviews")) {
        return json([{ user: { login: "bob" }, state: "CHANGES_REQUESTED", body: "tighten token handling" }]);
      }
      return json({}, 404);
    });

    const context = await fetchGithubPullRequestContext({
      owner: "kitten",
      repo: "quorummind",
      prNumber: 42,
      token: "gh-secret",
      fetch: fetchImpl
    });

    expect(context.changedFiles).toEqual(["server/auth.ts"]);
    expect(context.diffText).toContain("server/auth.ts");
    expect(context.comments).toEqual([
      expect.objectContaining({ author: "alice", body: "please check auth" })
    ]);
    expect(context.labels).toEqual(["security", "architecture"]);
    expect(context.reviewHistory).toEqual([
      expect.objectContaining({ reviewer: "bob", state: "CHANGES_REQUESTED" })
    ]);
    expect(JSON.stringify(context)).not.toContain("gh-secret");
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer gh-secret"
    });
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
