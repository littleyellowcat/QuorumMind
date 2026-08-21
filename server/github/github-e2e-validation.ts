import { postGithubNativeOutputs } from "./run-github-action";
import { planQuorumMindGithubRun, validateGithubNativeReview, type QuorumMindGithubRunInput } from "./quorummind-runner";
import type { ProviderFetch } from "../providers/types";

export type GithubE2EValidationStep = {
  id:
    | "command_planned"
    | "native_payload_valid"
    | "check_run_roundtrip"
    | "pr_review_roundtrip"
    | "write_guard";
  passed: boolean;
  detail: string;
};

export type GithubE2EPostedRequest = {
  kind: "check_run" | "pr_review";
  url: string;
  method: string;
  bodyPreview: string;
};

export type GithubE2EValidationReport = {
  mode: "mock" | "live";
  passed: boolean;
  readyToWrite: boolean;
  repo: string;
  issueNumber: number;
  steps: GithubE2EValidationStep[];
  postedRequests: GithubE2EPostedRequest[];
  nativeOutput?: {
    checkRunName: string;
    checkRunConclusion: string;
    prReviewEvent: string;
    annotationCount: number;
    reviewCommentCount: number;
  };
};

export async function runGithubE2EValidation(input: QuorumMindGithubRunInput & {
  write?: boolean;
  token?: string;
  headSha?: string;
  fetch?: ProviderFetch;
}): Promise<GithubE2EValidationReport> {
  const postedRequests: GithubE2EPostedRequest[] = [];
  const writeRequested = input.write === true;
  const mode: GithubE2EValidationReport["mode"] = writeRequested ? "live" : "mock";
  const fetchImpl = captureGithubFetch(postedRequests, input.fetch ?? mockGithubFetch());
  const steps: GithubE2EValidationStep[] = [];
  const result = await planQuorumMindGithubRun({
    ...input,
    dryRun: true,
    githubToken: input.githubToken
  });

  if (result.status !== "planned") {
    steps.push({
      id: "command_planned",
      passed: false,
      detail: result.reason
    });
    return {
      mode,
      passed: false,
      readyToWrite: false,
      repo: input.repo,
      issueNumber: input.issueNumber,
      steps,
      postedRequests
    };
  }

  steps.push({
    id: "command_planned",
    passed: true,
    detail: `${result.command.matched ? `${result.command.trigger} ${result.command.command}` : "QuorumMind command"} planned for PR #${result.githubNative.pullRequestReview.pullNumber}.`
  });

  const nativeValidation = validateGithubNativeReview(result.githubNative);
  steps.push({
    id: "native_payload_valid",
    passed: nativeValidation.valid,
    detail: nativeValidation.valid ? "Check Run and PR Review payloads are valid." : nativeValidation.errors.join("; ")
  });

  const token = writeRequested ? input.token : "mock-token";
  const headSha = writeRequested ? input.headSha : "mock-head-sha";
  const readyToWrite = Boolean(writeRequested && token && headSha && nativeValidation.valid);
  steps.push({
    id: "write_guard",
    passed: writeRequested ? readyToWrite : true,
    detail: writeRequested
      ? readyToWrite
        ? "Live write was explicitly enabled with token and head SHA."
        : "Live write requires explicit token and head SHA."
      : "Mock validation mode prevents external GitHub writes."
  });

  if (nativeValidation.valid && (token && headSha)) {
    const before = postedRequests.length;
    await postGithubNativeOutputs(result.githubNative, "all", {
      GITHUB_TOKEN: token,
      GITHUB_SHA: headSha
    }, fetchImpl as typeof fetch);
    const written = postedRequests.slice(before);
    steps.push({
      id: "check_run_roundtrip",
      passed: written.some((request) => request.kind === "check_run"),
      detail: "Check Run request reached the GitHub write adapter."
    });
    steps.push({
      id: "pr_review_roundtrip",
      passed: written.some((request) => request.kind === "pr_review"),
      detail: "PR Review request reached the GitHub write adapter."
    });
  } else {
    steps.push({
      id: "check_run_roundtrip",
      passed: false,
      detail: "Skipped because native payload validation or write credentials failed."
    });
    steps.push({
      id: "pr_review_roundtrip",
      passed: false,
      detail: "Skipped because native payload validation or write credentials failed."
    });
  }

  return {
    mode,
    passed: steps.every((step) => step.passed),
    readyToWrite,
    repo: input.repo,
    issueNumber: input.issueNumber,
    steps,
    postedRequests,
    nativeOutput: {
      checkRunName: result.githubNative.checkRun.name,
      checkRunConclusion: result.githubNative.checkRun.conclusion,
      prReviewEvent: result.githubNative.pullRequestReview.event,
      annotationCount: result.githubNative.checkRun.output.annotations.length,
      reviewCommentCount: result.githubNative.pullRequestReview.comments.length
    }
  };
}

function captureGithubFetch(postedRequests: GithubE2EPostedRequest[], fetchImpl: ProviderFetch): ProviderFetch {
  return async (url, init) => {
    const target = String(url);
    postedRequests.push({
      kind: target.includes("/check-runs") ? "check_run" : "pr_review",
      url: target,
      method: init?.method ?? "GET",
      bodyPreview: typeof init?.body === "string" ? init.body.slice(0, 500) : ""
    });
    return fetchImpl(url, init);
  };
}

function mockGithubFetch(): ProviderFetch {
  return async () => new Response("{}", { status: 201 });
}
