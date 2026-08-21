import { parseQuorumMindGithubCommand, type QuorumMindGithubCommand } from "./quorummind-command";
import { fetchGithubPullRequestContext, type GithubPullRequestContext } from "./github-context";
import { buildRepoReviewEvidence, type RepoReviewEvidence } from "../repo/review-evidence";
import type { ProviderFetch } from "../providers/types";

export type QuorumMindGithubRunInput = {
  commentBody: string;
  repo: string;
  issueNumber: number;
  diffText?: string;
  changedFiles?: string[];
  dryRun?: boolean;
  repoRoot?: string;
  githubToken?: string;
  fetch?: ProviderFetch;
};

export type QuorumMindGithubEvidence = RepoReviewEvidence & {
  githubContext?: Pick<GithubPullRequestContext, "comments" | "labels" | "reviewHistory">;
  githubContextError?: string;
};

export type QuorumMindGithubCheckRunRequest = {
  owner: string;
  repo: string;
  name: string;
  conclusion: "success" | "neutral" | "failure";
  output: {
    title: string;
    summary: string;
    text: string;
    annotations: Array<{
      path: string;
      start_line: number;
      end_line: number;
      annotation_level: "notice" | "warning" | "failure";
      message: string;
    }>;
  };
};

export type QuorumMindGithubPullRequestReviewRequest = {
  owner: string;
  repo: string;
  pullNumber: number;
  event: "COMMENT" | "REQUEST_CHANGES";
  body: string;
  comments: Array<{
    path: string;
    line: number;
    body: string;
  }>;
};

export type QuorumMindGithubNativeReview = {
  checkRun: QuorumMindGithubCheckRunRequest;
  pullRequestReview: QuorumMindGithubPullRequestReviewRequest;
  productionChecks: {
    valid: boolean;
    errors: string[];
    lineMapping: "patch_hunk" | "fallback";
    duplicateAnnotationsRemoved: number;
    duplicateCommentsRemoved: number;
    minimumPermissions: string[];
  };
  statusWorkflow: Array<"queued" | "in_progress" | "completed">;
};

export type QuorumMindGithubRunResult =
  | {
      status: "ignored";
      reason: string;
    }
  | {
      status: "planned";
      command: QuorumMindGithubCommand;
      evidence: QuorumMindGithubEvidence;
      githubWriteMode: "dry_run" | "write";
      reviewMarkdown: string;
      githubNative: QuorumMindGithubNativeReview;
      writeRequest: {
        owner: string;
        repo: string;
        issueNumber: number;
        body: string;
      };
    };

export function createQuorumMindGithubReview(input: {
  repo: string;
  issueNumber: number;
  command: Extract<QuorumMindGithubCommand, { matched: true }>;
  evidence: Partial<QuorumMindGithubEvidence> & Pick<RepoReviewEvidence, "changedFiles" | "diffSummary">;
  dryRun?: boolean;
}): {
  markdown: string;
  githubWriteMode: "dry_run" | "write";
  writeRequest: {
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
  };
} {
  const markdown = renderReviewMarkdown(input.command, input.evidence, input.dryRun !== false);
  const [owner, repo] = input.repo.split("/");

  return {
    markdown,
    githubWriteMode: input.dryRun === false ? "write" : "dry_run",
    writeRequest: {
      owner: owner ?? "",
      repo: repo ?? input.repo,
      issueNumber: input.issueNumber,
      body: markdown
    }
  };
}

export async function planQuorumMindGithubRun(input: QuorumMindGithubRunInput): Promise<QuorumMindGithubRunResult> {
  const command = parseQuorumMindGithubCommand(input.commentBody);

  if (!command.matched) {
    return {
      status: "ignored",
      reason: "No /quorummind or /qm command was found."
    };
  }

  const githubContext = await loadGithubContext(input, command);
  const evidence: QuorumMindGithubEvidence = {
    ...buildRepoReviewEvidence({
    repoRoot: input.repoRoot ?? process.cwd(),
      diffText: mergeDiffText(input.diffText, githubContext.context?.diffText),
      changedFiles: mergeChangedFiles(input.changedFiles, githubContext.context?.changedFiles),
    focus: command.prompt
    }),
    ...(githubContext.context
      ? {
          githubContext: {
            comments: githubContext.context.comments.slice(0, 5),
            labels: githubContext.context.labels.slice(0, 12),
            reviewHistory: githubContext.context.reviewHistory.slice(0, 10)
          }
        }
      : {}),
    ...(githubContext.error ? { githubContextError: githubContext.error } : {})
  };
  const review = createQuorumMindGithubReview({
    repo: input.repo,
    issueNumber: input.issueNumber,
    command,
    evidence,
    dryRun: input.dryRun
  });
  const githubNative = createGithubNativeReview({
    repo: input.repo,
    issueNumber: input.issueNumber,
    command,
    evidence
  });

  return {
    status: "planned",
    command,
    evidence,
    githubWriteMode: review.githubWriteMode,
    reviewMarkdown: review.markdown,
    githubNative,
    writeRequest: review.writeRequest
  };
}

function renderReviewMarkdown(
  command: Extract<QuorumMindGithubCommand, { matched: true }>,
  evidence: Partial<QuorumMindGithubEvidence> & Pick<RepoReviewEvidence, "changedFiles" | "diffSummary">,
  dryRun: boolean
): string {
  const riskRadar = evidence.riskRadar ?? [];
  const adrReferences = evidence.adrReferences ?? [];
  const githubContext = evidence.githubContext;

  return [
    "# QuorumMind Architecture Review",
    "",
    `Command: ${command.trigger} ${command.command}`,
    `Focus: ${command.prompt}`,
    command.prNumber ? `PR: #${command.prNumber}` : "",
    "",
    "## Evidence",
    `Changed files: ${evidence.changedFiles.join(", ") || "None"}`,
    `Diff summary: ${evidence.diffSummary}`,
    "",
    "## Risk radar",
    ...riskRadar.map((risk) => `- [${risk.severity}] ${risk.category}: ${risk.reason}`),
    "",
    "## ADR references",
    ...(adrReferences.length > 0
      ? adrReferences.map((adr) => `- ${adr.title} (${adr.path})`)
      : ["- None found"]),
    "",
    "## GitHub context",
    githubContext?.labels.length ? `Labels: ${githubContext.labels.join(", ")}` : "Labels: none supplied",
    "Recent comments:",
    ...(githubContext?.comments.length
      ? githubContext.comments.map((comment) => `- ${comment.author}: ${comment.body.slice(0, 180)}`)
      : ["- None supplied"]),
    "Review history:",
    ...(githubContext?.reviewHistory.length
      ? githubContext.reviewHistory.map((review) => `- ${review.reviewer}: ${review.state}${review.body ? ` - ${review.body.slice(0, 180)}` : ""}`)
      : ["- None supplied"]),
    evidence.githubContextError ? `GitHub context warning: ${evidence.githubContextError}` : "",
    "",
    "## GitHub native outputs",
    `Check Run conclusion: ${checkRunConclusion(evidence.riskRadar ?? [])}`,
    `Annotations: ${annotationCount(evidence)}`,
    `PR review comments: ${reviewCommentCount(evidence)}`,
    "",
    dryRun ? "No GitHub comment or PR write was performed." : "Ready to post to GitHub."
  ].filter(Boolean).join("\n");
}

function createGithubNativeReview(input: {
  repo: string;
  issueNumber: number;
  command: Extract<QuorumMindGithubCommand, { matched: true }>;
  evidence: QuorumMindGithubEvidence;
}): QuorumMindGithubNativeReview {
  const [owner = "", repo = input.repo] = input.repo.split("/");
  const risks = input.evidence.riskRadar ?? [];
  const changedFiles = input.evidence.changedFiles.length > 0 ? input.evidence.changedFiles : ["README.md"];
  const lineMap = buildPatchLineMap(input.evidence.changedFiles, input.evidence.diffText);
  const rawAnnotations = risks.slice(0, 50).map((risk, index) => {
    const path = changedFiles[index % changedFiles.length] ?? changedFiles[0];
    const line = lineForRisk(path, risk.reason, lineMap);
    return {
      path,
      start_line: line,
      end_line: line,
      annotation_level: annotationLevelForRisk(risk.severity),
      message: `${risk.category} risk: ${risk.reason}`
    };
  });
  const rawComments = risks.slice(0, 10).map((risk, index) => {
    const path = changedFiles[index % changedFiles.length] ?? changedFiles[0];
    return {
      path,
      line: lineForRisk(path, risk.reason, lineMap),
      body: `QuorumMind architecture risk (${risk.severity}/${risk.category}): ${risk.reason}`
    };
  });
  const annotations = dedupeByKey(rawAnnotations, (annotation) => [
    annotation.path,
    String(annotation.start_line),
    annotation.annotation_level,
    annotation.message
  ].join("\0"));
  const comments = dedupeByKey(rawComments, (comment) => [
    comment.path,
    String(comment.line),
    comment.body
  ].join("\0"));
  const lineMapping = [...lineMap.values()].some((lines) => lines.length > 0) ? "patch_hunk" : "fallback";
  const duplicateAnnotationsRemoved = rawAnnotations.length - annotations.length;
  const duplicateCommentsRemoved = rawComments.length - comments.length;
  const minimumPermissions = ["contents: read", "pull-requests: write", "checks: write"];
  const body = [
    "# QuorumMind Architecture Review",
    "",
    `Focus: ${input.command.prompt}`,
    `Changed files: ${input.evidence.changedFiles.join(", ") || "None"}`,
    "",
    "## Risk radar",
    ...risks.map((risk) => `- [${risk.severity}] ${risk.category}: ${risk.reason}`),
    "",
    "## Suggested ADR",
    `Decision context: ${input.command.prompt}`,
    "Status: proposed",
    "Consequences: require explicit ownership, rollback notes, and follow-up validation for the highlighted architecture risks."
  ].join("\n");

  return {
    checkRun: {
      owner,
      repo,
      name: "QuorumMind Architecture Review",
      conclusion: checkRunConclusion(risks),
      output: {
        title: "QuorumMind Architecture Review",
        summary: `Reviewed ${input.evidence.diffSummary}; focus on ${input.command.prompt}.`,
        text: body,
        annotations
      }
    },
    pullRequestReview: {
      owner,
      repo,
      pullNumber: input.command.prNumber ?? input.issueNumber,
      event: risks.some((risk) => risk.severity === "high") ? "COMMENT" : "COMMENT",
      body,
      comments
    },
    productionChecks: {
      valid: true,
      errors: [],
      lineMapping,
      duplicateAnnotationsRemoved,
      duplicateCommentsRemoved,
      minimumPermissions
    },
    statusWorkflow: ["queued", "in_progress", "completed"]
  };
}

export function validateGithubNativeReview(review: QuorumMindGithubNativeReview): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!review.checkRun.owner || !review.checkRun.repo) {
    errors.push("Check Run owner and repo are required.");
  }
  if (!review.checkRun.name.trim()) {
    errors.push("Check Run name is required.");
  }
  if (!["success", "neutral", "failure"].includes(review.checkRun.conclusion)) {
    errors.push("Check Run conclusion is invalid.");
  }

  for (const annotation of review.checkRun.output.annotations) {
    if (!annotation.path || annotation.start_line < 1 || annotation.end_line < annotation.start_line) {
      errors.push(`Invalid Check Run annotation for ${annotation.path || "unknown path"}.`);
    }
  }

  if (!review.pullRequestReview.owner || !review.pullRequestReview.repo || review.pullRequestReview.pullNumber < 1) {
    errors.push("PR review owner, repo, and pull number are required.");
  }

  for (const comment of review.pullRequestReview.comments) {
    if (!comment.path || comment.line < 1 || !comment.body.trim()) {
      errors.push(`Invalid PR review comment for ${comment.path || "unknown path"}.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function checkRunConclusion(risks: Array<{ severity: "low" | "medium" | "high" }>): QuorumMindGithubCheckRunRequest["conclusion"] {
  if (risks.some((risk) => risk.severity === "high" || risk.severity === "medium")) {
    return "neutral";
  }

  return "success";
}

function annotationLevelForRisk(severity: "low" | "medium" | "high"): "notice" | "warning" | "failure" {
  if (severity === "high") {
    return "failure";
  }
  if (severity === "medium") {
    return "warning";
  }
  return "notice";
}

function annotationCount(evidence: Partial<QuorumMindGithubEvidence>): number {
  return Math.min(50, evidence.riskRadar?.length ?? 0);
}

function reviewCommentCount(evidence: Partial<QuorumMindGithubEvidence>): number {
  return Math.min(10, evidence.riskRadar?.length ?? 0);
}

function buildPatchLineMap(changedFiles: string[], diffText?: string): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const file of changedFiles) {
    map.set(file, []);
  }

  let currentPath = "";
  let newLine = 0;

  for (const line of (diffText ?? "").split("\n")) {
    const fileMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (fileMatch) {
      currentPath = fileMatch[2];
      if (!map.has(currentPath)) {
        map.set(currentPath, []);
      }
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLine = Number.parseInt(hunkMatch[1], 10);
      continue;
    }

    if (!currentPath || newLine <= 0) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      map.get(currentPath)?.push(newLine);
      newLine += 1;
      continue;
    }

    if (!line.startsWith("-")) {
      newLine += 1;
    }
  }

  return map;
}

function lineForRisk(path: string, reason: string, lineMap: Map<string, number[]>): number {
  const lines = lineMap.get(path) ?? [];
  if (lines.length === 0) {
    return 1;
  }

  const lower = reason.toLowerCase();
  if (/auth|token|secret|permission|credential/.test(lower)) {
    return lines[0] ?? 1;
  }

  return lines[Math.min(lines.length - 1, 0)] ?? 1;
}

function dedupeByKey<T>(items: T[], keyForItem: (item: T) => string): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = keyForItem(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

async function loadGithubContext(
  input: QuorumMindGithubRunInput,
  command: Extract<QuorumMindGithubCommand, { matched: true }>
): Promise<{ context?: GithubPullRequestContext; error?: string }> {
  if (!input.githubToken || command.command !== "review-pr") {
    return {};
  }

  const [owner, repo] = input.repo.split("/");
  const prNumber = command.prNumber ?? input.issueNumber;

  if (!owner || !repo || !prNumber) {
    return {};
  }

  try {
    return {
      context: await fetchGithubPullRequestContext({
        owner,
        repo,
        prNumber,
        token: input.githubToken,
        fetch: input.fetch
      })
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to fetch GitHub PR context."
    };
  }
}

function mergeChangedFiles(left: string[] | undefined, right: string[] | undefined): string[] | undefined {
  const merged = [...new Set([...(left ?? []), ...(right ?? [])])];
  return merged.length > 0 ? merged : undefined;
}

function mergeDiffText(left: string | undefined, right: string | undefined): string | undefined {
  const merged = [left, right].filter((item) => item && item.trim()).join("\n");
  return merged || undefined;
}
