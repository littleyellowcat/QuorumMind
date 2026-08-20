// @vitest-environment node
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRunArtifactIndex } from "./run-artifact-index";

describe("createRunArtifactIndex", () => {
  it("persists an auditable artifact manifest for each run", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "quorummind-artifacts-"));
    const index = createRunArtifactIndex({ rootDir });

    index.add("run-1", {
      kind: "prompt_bundle",
      label: "blueprint prompt bundle",
      path: "/tmp/prompt.json",
      sha256: "abc123",
      metadata: { promptCount: 3 }
    });
    index.add("run-1", {
      kind: "resume_snapshot",
      label: "checkpoint resume snapshot",
      inline: { threadId: "thread-1" }
    });

    expect(index.list("run-1")).toEqual([
      expect.objectContaining({
        kind: "prompt_bundle",
        label: "blueprint prompt bundle",
        path: "/tmp/prompt.json"
      }),
      expect.objectContaining({
        kind: "resume_snapshot",
        inline: { threadId: "thread-1" }
      })
    ]);
    expect(existsSync(index.indexPath("run-1"))).toBe(true);
  });

  it("returns an empty artifact list for unknown runs", () => {
    const index = createRunArtifactIndex({ rootDir: mkdtempSync(join(tmpdir(), "quorummind-artifacts-empty-")) });

    expect(index.list("missing")).toEqual([]);
  });
});
