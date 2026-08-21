// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkDistributionReadiness } from "./distribution-doctor";

describe("distribution doctor", () => {
  it("reports npm bin, GitHub Action, and quickstart template readiness", () => {
    const report = checkDistributionReadiness({
      packageJson: {
        name: "quorummind",
        version: "0.1.0",
        bin: { quorummind: "./bin/quorummind.mjs" }
      },
      files: new Set(["bin/quorummind.mjs", "github/action.yml", "examples/github-action/quorummind-review.yml", "docs/distribution/quickstart.md"]),
      viteConfigText: "manualChunks: { vendor: ['react'] }"
    });

    expect(report.ready).toBe(true);
    expect(report.checks).toContainEqual({ id: "npm_bin", passed: true });
    expect(report.checks).toContainEqual({ id: "github_action", passed: true });
    expect(report.checks).toContainEqual({ id: "quickstart_template", passed: true });
    expect(report.checks).toContainEqual({ id: "frontend_bundle_split", passed: true });
  });

  it("checks whether frontend bundle splitting is configured", () => {
    const report = checkDistributionReadiness({
      packageJson: {
        name: "quorummind",
        version: "0.1.0",
        bin: { quorummind: "./bin/quorummind.mjs" }
      },
      files: new Set([
        "bin/quorummind.mjs",
        "github/action.yml",
        "examples/github-action/quorummind-review.yml",
        "docs/distribution/quickstart.md"
      ]),
      viteConfigText: "manualChunks: { vendor: ['react', 'react-dom'], animation: ['gsap', '@gsap/react'] }"
    });

    expect(report.ready).toBe(true);
    expect(report.checks).toContainEqual({ id: "frontend_bundle_split", passed: true });
  });
});
