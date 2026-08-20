// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { boundOutput } from "./bounded-output-store";

describe("boundOutput", () => {
  it("keeps short output inline", () => {
    const bounded = boundOutput("short answer", { label: "provider-output", maxInlineChars: 20 });

    expect(bounded).toMatchObject({
      label: "provider-output",
      inline: "short answer",
      truncated: false,
      originalChars: 12
    });
    expect(bounded.preview).toBe("short answer");
  });

  it("stores long output as preview plus hash metadata", () => {
    const bounded = boundOutput("A".repeat(80) + "B".repeat(80), {
      label: "provider-output",
      maxInlineChars: 20,
      previewHeadChars: 12,
      previewTailChars: 8
    });

    expect(bounded.inline).toBeUndefined();
    expect(bounded.truncated).toBe(true);
    expect(bounded.originalChars).toBe(160);
    expect(bounded.omittedChars).toBe(140);
    expect(bounded.preview).toBe("AAAAAAAAAAAA...BBBBBBBB");
    expect(bounded.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("serializes unknown values without throwing", () => {
    const bounded = boundOutput({ answer: "Use modular monolith", score: 0.82 }, { label: "json" });

    expect(bounded.preview).toContain("Use modular monolith");
    expect(bounded.mime).toBe("application/json");
  });

  it("writes long output to a run-scoped artifact file when storage is configured", () => {
    const storageDir = join(tmpdir(), `quorummind-output-${Date.now()}`);
    const text = "A".repeat(120) + "B".repeat(120);
    const bounded = boundOutput(text, {
      label: "provider-output",
      maxInlineChars: 20,
      previewHeadChars: 12,
      previewTailChars: 8,
      storageDir,
      runId: "run-abc"
    });

    expect(bounded.inline).toBeUndefined();
    expect(bounded.path).toBeTruthy();
    expect(bounded.path).toContain("run-abc");
    expect(existsSync(bounded.path!)).toBe(true);
    expect(readFileSync(bounded.path!, "utf8")).toBe(text);
  });

  it("redacts secrets in previews and artifact files while hashing the original output", () => {
    const storageDir = join(tmpdir(), `quorummind-redacted-${Date.now()}`);
    const text = [
      "OPENAI_API_KEY=sk-secret123456789",
      "email kitten@example.com",
      "/Users/kitten/private/project/path",
      "A".repeat(160)
    ].join("\n");
    const bounded = boundOutput(text, {
      label: "provider-output",
      maxInlineChars: 40,
      previewHeadChars: 80,
      previewTailChars: 20,
      storageDir,
      runId: "run-redact",
      redactSecrets: true
    });
    const artifact = readFileSync(bounded.path!, "utf8");

    expect(bounded.preview).toContain("[REDACTED_API_KEY]");
    expect(bounded.preview).toContain("[REDACTED_EMAIL]");
    expect(bounded.preview).toContain("[REDACTED_PATH]");
    expect(artifact).not.toContain("sk-secret");
    expect(artifact).not.toContain("kitten@example.com");
    expect(artifact).not.toContain("/Users/kitten");
    expect(bounded.redacted).toBe(true);
    expect(bounded.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
