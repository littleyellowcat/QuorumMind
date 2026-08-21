import { assertOkResponse, readJsonResponse } from "../providers/prompt";
import type { ProviderFetch } from "../providers/types";

export type GithubPullRequestContextInput = {
  owner: string;
  repo: string;
  prNumber: number;
  token: string;
  fetch?: ProviderFetch;
};

export type GithubPullRequestContext = {
  changedFiles: string[];
  diffText: string;
  comments: Array<{
    author: string;
    body: string;
    createdAt?: string;
  }>;
  labels: string[];
  reviewHistory: Array<{
    reviewer: string;
    state: string;
    body?: string;
  }>;
};

export async function fetchGithubPullRequestContext(
  input: GithubPullRequestContextInput
): Promise<GithubPullRequestContext> {
  const fetchImpl = input.fetch ?? fetch;
  const base = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`;
  const [files, issue, comments, reviews] = await Promise.all([
    githubJson(fetchImpl, `${base}/pulls/${input.prNumber}/files`, input.token),
    githubJson(fetchImpl, `${base}/issues/${input.prNumber}`, input.token),
    githubJson(fetchImpl, `${base}/issues/${input.prNumber}/comments`, input.token),
    githubJson(fetchImpl, `${base}/pulls/${input.prNumber}/reviews`, input.token)
  ]);

  const fileItems = Array.isArray(files) ? files : [];

  return {
    changedFiles: fileItems.flatMap((file) => stringField(file, "filename") ? [stringField(file, "filename") as string] : []),
    diffText: fileItems
      .flatMap((file) => {
        const filename = stringField(file, "filename");
        const patch = stringField(file, "patch");
        return filename ? [`diff --git a/${filename} b/${filename}`, patch ?? ""].filter(Boolean).join("\n") : [];
      })
      .join("\n"),
    comments: (Array.isArray(comments) ? comments : []).flatMap((comment) => {
      const body = stringField(comment, "body");
      const author = nestedStringField(comment, ["user", "login"]) ?? "unknown";
      return body ? [{ author, body, ...(stringField(comment, "created_at") ? { createdAt: stringField(comment, "created_at") } : {}) }] : [];
    }),
    labels: Array.isArray((issue as { labels?: unknown }).labels)
      ? ((issue as { labels: unknown[] }).labels).flatMap((label) => stringField(label, "name") ? [stringField(label, "name") as string] : [])
      : [],
    reviewHistory: (Array.isArray(reviews) ? reviews : []).flatMap((review) => {
      const state = stringField(review, "state");
      return state
        ? [{
            reviewer: nestedStringField(review, ["user", "login"]) ?? "unknown",
            state,
            ...(stringField(review, "body") ? { body: stringField(review, "body") } : {})
          }]
        : [];
    })
  };
}

async function githubJson(fetchImpl: ProviderFetch, url: string, token: string): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  const body = await readJsonResponse(response);
  assertOkResponse(response, "GitHub", body);
  return body;
}

function stringField(value: unknown, field: string): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" ? candidate : undefined;
}

function nestedStringField(value: unknown, path: string[]): string | undefined {
  let current = value;
  for (const part of path) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}
