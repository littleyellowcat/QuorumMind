#!/usr/bin/env tsx

import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { planQuorumMindGithubRun, type QuorumMindGithubNativeReview, type QuorumMindGithubRunResult } from "./quorummind-runner";

type GithubEventPayload = {
  repository?: {
    full_name?: string;
  };
  issue?: {
    number?: number;
  };
  pull_request?: {
    number?: number;
  };
  comment?: {
    body?: string;
  };
};

type GithubWriteRequest = {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
};

export type GithubActionOutputMode = "comment" | "check" | "pr_review" | "all";

export async function runGithubAction(env: Record<string, string | undefined> = process.env): Promise<number> {
  const event = readGithubEvent(env);
  const commentBody = env.INPUT_COMMENT_BODY ?? event.comment?.body ?? "";
  const repo = env.INPUT_REPO ?? env.GITHUB_REPOSITORY ?? event.repository?.full_name ?? "";
  const issueNumber = Number(env.INPUT_ISSUE_NUMBER ?? event.issue?.number ?? event.pull_request?.number ?? 0);
  const result = await planQuorumMindGithubRun({
    commentBody,
    repo,
    issueNumber,
    repoRoot: env.GITHUB_WORKSPACE ?? process.cwd(),
    dryRun: env.INPUT_WRITE_COMMENT !== "true",
    githubToken: env.GITHUB_TOKEN
  });
  const outputMode = parseOutputMode(env.INPUT_OUTPUT_MODE);
  const markdown = renderGithubActionOutput(result, outputMode);

  writeSummary(markdown, env);

  if (result.status === "planned" && result.githubWriteMode === "write") {
    await postGithubComment(result.writeRequest, env);
  }

  if (result.status === "planned" && env.INPUT_WRITE_GITHUB === "true") {
    await postGithubNativeOutputs(result.githubNative, outputMode, env);
  }

  console.log(markdown);
  return 0;
}

export function renderGithubActionOutput(result: QuorumMindGithubRunResult, mode: GithubActionOutputMode): string {
  if (result.status !== "planned") {
    return `QuorumMind ignored event: ${result.reason}`;
  }

  const sections = [
    mode === "comment" || mode === "all"
      ? [
          "## Issue Comment payload",
          "",
          result.reviewMarkdown
        ].join("\n")
      : "",
    mode === "check" || mode === "all"
      ? [
          "## Check Run payload",
          "",
          "```json",
          JSON.stringify(result.githubNative.checkRun, null, 2),
          "```"
        ].join("\n")
      : "",
    mode === "pr_review" || mode === "all"
      ? [
          "## PR Review payload",
          "",
          "```json",
          JSON.stringify(result.githubNative.pullRequestReview, null, 2),
          "```"
        ].join("\n")
      : "",
    mode === "check" || mode === "pr_review" || mode === "all"
      ? [
          "## Production checks",
          "",
          "```json",
          JSON.stringify({
            productionChecks: result.githubNative.productionChecks,
            statusWorkflow: result.githubNative.statusWorkflow
          }, null, 2),
          "```"
        ].join("\n")
      : ""
  ].filter(Boolean);

  return [
    "# QuorumMind GitHub Runner",
    "",
    ...sections
  ].join("\n");
}

function parseOutputMode(value: string | undefined): GithubActionOutputMode {
  if (value === "check" || value === "pr_review" || value === "all" || value === "comment") {
    return value;
  }

  return "comment";
}

export async function postGithubNativeOutputs(
  native: QuorumMindGithubNativeReview,
  mode: GithubActionOutputMode,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  if (mode === "check" || mode === "all") {
    await postGithubCheckRun(native.checkRun, env, fetchImpl);
  }

  if (mode === "pr_review" || mode === "all") {
    await postGithubPullRequestReview(native.pullRequestReview, env, fetchImpl);
  }
}

async function postGithubCheckRun(
  request: QuorumMindGithubNativeReview["checkRun"],
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch
): Promise<void> {
  const token = env.GITHUB_TOKEN;
  const headSha = env.GITHUB_SHA;

  if (!token || !headSha) {
    throw new Error("GITHUB_TOKEN and GITHUB_SHA are required when write_github posts Check Run output.");
  }

  const response = await fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/check-runs`,
    {
      method: "POST",
      headers: githubHeaders(token),
      body: JSON.stringify({
        name: request.name,
        head_sha: headSha,
        status: "completed",
        conclusion: request.conclusion,
        output: request.output
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub Check Run write failed with ${response.status}: ${await response.text()}`);
  }
}

async function postGithubPullRequestReview(
  request: QuorumMindGithubNativeReview["pullRequestReview"],
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch
): Promise<void> {
  const token = env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("GITHUB_TOKEN is required when write_github posts PR Review output.");
  }

  const response = await fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/pulls/${request.pullNumber}/reviews`,
    {
      method: "POST",
      headers: githubHeaders(token),
      body: JSON.stringify({
        event: request.event,
        body: request.body,
        comments: request.comments
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub PR Review write failed with ${response.status}: ${await response.text()}`);
  }
}

function readGithubEvent(env: Record<string, string | undefined>): GithubEventPayload {
  if (!env.GITHUB_EVENT_PATH) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")) as GithubEventPayload;
  } catch {
    return {};
  }
}

function writeSummary(markdown: string, env: Record<string, string | undefined>): void {
  if (!env.GITHUB_STEP_SUMMARY) {
    return;
  }

  appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n`, "utf8");
}

async function postGithubComment(
  request: GithubWriteRequest,
  env: Record<string, string | undefined>
): Promise<void> {
  const token = env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("GITHUB_TOKEN is required when write_comment is true.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/issues/${request.issueNumber}/comments`,
    {
      method: "POST",
      headers: {
        ...githubHeaders(token)
      },
      body: JSON.stringify({ body: request.body })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub comment write failed with ${response.status}: ${await response.text()}`);
  }
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runGithubAction().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
