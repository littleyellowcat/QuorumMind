import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type DistributionDoctorInput = {
  packageJson: {
    name?: string;
    version?: string;
    bin?: Record<string, string>;
  };
  files: Set<string>;
  viteConfigText?: string;
};

export type DistributionDoctorReport = {
  ready: boolean;
  checks: Array<{
    id: "npm_bin" | "github_action" | "quickstart_template" | "frontend_bundle_split";
    passed: boolean;
  }>;
};

export function checkDistributionReadiness(input: DistributionDoctorInput): DistributionDoctorReport {
  const checks: DistributionDoctorReport["checks"] = [
    {
      id: "npm_bin",
      passed: Boolean(
        input.packageJson.name &&
          input.packageJson.version &&
          input.packageJson.bin?.quorummind === "./bin/quorummind.mjs" &&
          input.files.has("bin/quorummind.mjs")
      )
    },
    {
      id: "github_action",
      passed: input.files.has("github/action.yml")
    },
    {
      id: "quickstart_template",
      passed: input.files.has("examples/github-action/quorummind-review.yml") && input.files.has("docs/distribution/quickstart.md")
    },
    {
      id: "frontend_bundle_split",
      passed: input.viteConfigText === undefined || input.viteConfigText.includes("manualChunks")
    }
  ];

  return {
    ready: checks.every((check) => check.passed),
    checks
  };
}

export function checkCurrentDistributionReadiness(rootDir = process.cwd()): DistributionDoctorReport {
  const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as DistributionDoctorInput["packageJson"];
  const viteConfigPath = join(rootDir, "vite.config.ts");
  const requiredFiles = [
    "bin/quorummind.mjs",
    "github/action.yml",
    "examples/github-action/quorummind-review.yml",
    "docs/distribution/quickstart.md"
  ];

  return checkDistributionReadiness({
    packageJson,
    files: new Set(requiredFiles.filter((path) => existsSync(join(rootDir, path)))),
    viteConfigText: existsSync(viteConfigPath) ? readFileSync(viteConfigPath, "utf8") : ""
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = checkCurrentDistributionReadiness();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ready ? 0 : 1;
}
