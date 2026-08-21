// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRepoWorkspaceModel } from "./workspace-model";

describe("repo workspace model", () => {
  it("builds file tree, selected file summaries, ADR history, dependency graph, hotspots, test and CI evidence", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qm-workspace-"));
    mkdirSync(join(rootDir, "server"));
    mkdirSync(join(rootDir, "docs"));
    writeFileSync(join(rootDir, "package.json"), JSON.stringify({ dependencies: { react: "19.2.7" } }), "utf8");
    writeFileSync(join(rootDir, "server", "auth.ts"), "import React from 'react';\nexport const auth = true;\n", "utf8");
    writeFileSync(join(rootDir, "docs", "ADR-001-auth.md"), "# ADR-001 Auth\nCentralize auth.", "utf8");

    const workspace = buildRepoWorkspaceModel({
      repoRoot: rootDir,
      selectedFiles: ["server/auth.ts"],
      diffText: "diff --git a/server/auth.ts b/server/auth.ts\n+++ b/server/auth.ts\n+token\n-token2",
      testOutput: "252 passed",
      ciStatus: "passing"
    });

    expect(workspace.fileTree).toContainEqual(expect.objectContaining({
      path: "server/auth.ts",
      kind: "file"
    }));
    expect(workspace.selectedFiles).toEqual([
      expect.objectContaining({
        path: "server/auth.ts",
        lineCount: 2
      })
    ]);
    expect(workspace.adrHistory).toEqual([
      expect.objectContaining({
        path: "docs/ADR-001-auth.md",
        title: "ADR-001 Auth"
      })
    ]);
    expect(workspace.dependencyGraph.nodes).toContainEqual({ id: "react", kind: "package" });
    expect(workspace.dependencyGraph.edges).toContainEqual(expect.objectContaining({
      from: "server/auth.ts",
      to: "react",
      kind: "imports"
    }));
    expect(workspace.evidenceIndex).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "file:server/auth.ts", type: "file" }),
      expect.objectContaining({ id: "api:server/auth.ts:auth", type: "api_surface" })
    ]));
    expect(workspace.architectureBoundaries).toContainEqual(expect.objectContaining({
      id: "boundary:server",
      pathPrefix: "server"
    }));
    expect(workspace.apiSurface).toContainEqual(expect.objectContaining({
      id: "api:server/auth.ts:auth",
      file: "server/auth.ts",
      exportName: "auth"
    }));
    expect(workspace.changeImpact).toContainEqual(expect.objectContaining({
      evidenceId: "change:server/auth.ts",
      path: "server/auth.ts",
      touchedBoundaries: ["server"]
    }));
    expect(workspace.codeHotspots).toContainEqual(expect.objectContaining({
      path: "server/auth.ts",
      churn: 2
    }));
    expect(workspace.testEvidence).toMatchObject({ status: "passed", raw: "252 passed" });
    expect(workspace.ciEvidence).toMatchObject({ status: "passing" });
  });
});
