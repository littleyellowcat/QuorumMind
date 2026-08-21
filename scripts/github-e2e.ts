#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { runGithubE2EValidation } from "../server/github/github-e2e-validation";

export async function runGithubE2EFromEnv(env: Record<string, string | undefined> = process.env): Promise<number> {
  const prNumber = Number(env.QUORUMMIND_GITHUB_E2E_PR ?? env.INPUT_ISSUE_NUMBER ?? "1");
  const report = await runGithubE2EValidation({
    commentBody:
      env.QUORUMMIND_GITHUB_E2E_COMMENT ??
      `/qm review-pr --pr ${Number.isFinite(prNumber) && prNumber > 0 ? prNumber : 1} architecture risk, ADR, and rollback`,
    repo: env.QUORUMMIND_GITHUB_E2E_REPO ?? env.GITHUB_REPOSITORY ?? "local/quorummind",
    issueNumber: Number.isFinite(prNumber) && prNumber > 0 ? prNumber : 1,
    changedFiles: csv(env.QUORUMMIND_GITHUB_E2E_FILES) ?? ["README.md"],
    diffText:
      env.QUORUMMIND_GITHUB_E2E_DIFF ??
      [
        "diff --git a/README.md b/README.md",
        "@@ -1,1 +1,2 @@",
        "+Architecture risk, ADR handoff, rollback trigger"
      ].join("\n"),
    write: env.QUORUMMIND_GITHUB_E2E_WRITE === "1",
    token: env.GITHUB_TOKEN,
    headSha: env.GITHUB_SHA
  });

  console.log(JSON.stringify(report, null, 2));
  return report.passed ? 0 : 1;
}

function csv(value: string | undefined): string[] | undefined {
  const values = value?.split(",").map((item) => item.trim()).filter(Boolean);
  return values && values.length > 0 ? values : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runGithubE2EFromEnv().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
