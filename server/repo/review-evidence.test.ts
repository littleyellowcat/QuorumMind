// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRepoReviewEvidence } from "./review-evidence";

describe("repo review evidence", () => {
  it("summarizes changed files, diff text, and ADR references without reading outside the repo", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qm-evidence-"));
    writeFileSync(join(rootDir, "ADR-001.md"), "# ADR-001\nKeep auth middleware centralized", "utf8");

    const evidence = buildRepoReviewEvidence({
      repoRoot: rootDir,
      diffText: [
        "diff --git a/server/auth.ts b/server/auth.ts",
        "+++ b/server/auth.ts",
        "+const token = req.query.token",
        "diff --git a/src/App.tsx b/src/App.tsx",
        "+++ b/src/App.tsx",
        "+render(<App />)"
      ].join("\n"),
      focus: "auth boundary"
    });

    expect(evidence.changedFiles).toEqual(["server/auth.ts", "src/App.tsx"]);
    expect(evidence.diffSummary).toContain("2 files changed");
    expect(evidence.evidenceIds).toEqual(["change:server/auth.ts", "change:src/App.tsx", "adr:ADR-001.md"]);
    expect(evidence.changeImpact).toEqual([
      expect.objectContaining({
        evidenceId: "change:server/auth.ts",
        path: "server/auth.ts",
        touchedBoundaries: ["server"],
        apiSurfaceTouched: true
      }),
      expect.objectContaining({
        evidenceId: "change:src/App.tsx",
        path: "src/App.tsx",
        touchedBoundaries: ["src"],
        apiSurfaceTouched: true
      })
    ]);
    expect(evidence.riskRadar).toContainEqual(expect.objectContaining({
      category: "security",
      severity: "high"
    }));
    expect(evidence.adrReferences).toEqual([
      expect.objectContaining({
        path: "ADR-001.md",
        title: "ADR-001"
      })
    ]);
    expect(JSON.stringify(evidence)).not.toContain("..");
  });
});
