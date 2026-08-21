// @vitest-environment node
import { pathToFileURL } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createRunStatusStore } from "../server/harness/run-status-store";
import { isDirectCliInvocation, parseCliArgs, runCliCommand } from "./quorummind-cli";

describe("quorummind CLI", () => {
  it("parses decide prompts", () => {
    expect(parseCliArgs(["decide", "Should we split services?"])).toMatchObject({
      ok: true,
      command: "decide",
      prompt: "Should we split services?"
    });
  });

  it("parses blueprint prompts", () => {
    expect(parseCliArgs(["blueprint", "Design a VN agent workflow"])).toMatchObject({
      ok: true,
      command: "blueprint",
      prompt: "Design a VN agent workflow"
    });
  });

  it("parses review-pr options and focus text", () => {
    expect(parseCliArgs(["review-pr", "--pr", "42", "focus on auth boundaries"])).toMatchObject({
      ok: true,
      command: "review-pr",
      prNumber: 42,
      prompt: "focus on auth boundaries"
    });
  });

  it("rejects ambiguous review-pr commands", () => {
    expect(parseCliArgs(["review-pr", "--pr", "nope", "focus on auth"])).toMatchObject({
      ok: false,
      error: expect.stringContaining("valid PR number")
    });
    expect(parseCliArgs(["review-pr", "--pr", "42"])).toMatchObject({
      ok: false,
      error: expect.stringContaining("focus")
    });
  });

  it("parses export formats", () => {
    expect(parseCliArgs(["export", "--json"])).toMatchObject({
      ok: true,
      command: "export",
      format: "json"
    });
    expect(parseCliArgs(["export", "--adr"])).toMatchObject({
      ok: true,
      command: "export",
      format: "adr"
    });
    expect(parseCliArgs(["export", "--pdf"])).toMatchObject({
      ok: true,
      command: "export",
      format: "pdf"
    });
  });

  it("parses audit, provider route, eval, and team commands", () => {
    expect(parseCliArgs(["audit", "--run", "run-1"])).toMatchObject({
      ok: true,
      command: "audit",
      runId: "run-1"
    });
    expect(parseCliArgs(["audit", "--diff", "run-a", "run-b"])).toMatchObject({
      ok: true,
      command: "audit",
      diff: ["run-a", "run-b"]
    });
    expect(parseCliArgs(["route-provider", "--task", "architecture_review", "--json-schema", "--long-context"])).toMatchObject({
      ok: true,
      command: "route-provider",
      task: "architecture_review",
      requirements: expect.objectContaining({
        jsonSchema: true,
        longContext: true
      })
    });
    expect(parseCliArgs(["eval", "--suite", "offline-smoke"])).toMatchObject({
      ok: true,
      command: "eval",
      suiteName: "offline-smoke"
    });
    expect(parseCliArgs(["team", "--workspace", "architecture", "--user", "alice", "--action", "approve_adr"])).toMatchObject({
      ok: true,
      command: "team",
      workspaceId: "architecture",
      userId: "alice",
      action: "approve_adr"
    });
  });

  it("prints version and distribution doctor output", async () => {
    const version = await runCliCommand(["--version"], {
      packageJson: { name: "quorummind", version: "0.2.0", bin: { quorummind: "./bin/quorummind.mjs" } },
      files: new Set(["bin/quorummind.mjs", "github/action.yml", "examples/github-action/quorummind-review.yml", "docs/distribution/quickstart.md"])
    });
    const doctor = await runCliCommand(["doctor"], {
      packageJson: { name: "quorummind", version: "0.2.0", bin: { quorummind: "./bin/quorummind.mjs" } },
      files: new Set(["bin/quorummind.mjs", "github/action.yml", "examples/github-action/quorummind-review.yml", "docs/distribution/quickstart.md"])
    });

    expect(version.stdout).toBe("quorummind 0.2.0");
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toContain("Distribution readiness: ready");
    expect(doctor.stdout).toContain("npm_bin: pass");
  });

  it("prints a GitHub Action scaffold from init", async () => {
    const result = await runCliCommand(["init", "--github-action"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(".github/workflows/quorummind-review.yml");
    expect(result.stdout).toContain("uses: ./github");
    expect(result.stdout).toContain("output_mode: all");
  });

  it("calls the local API for decide commands", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ result: { verdict: { finalRecommendation: "Use modular monolith first." } } }), {
        status: 200
      })
    );

    const result = await runCliCommand(["decide", "Use OpenRouter or local Ollama?"], {
      apiBaseUrl: "http://127.0.0.1:8787",
      fetch: fetchImpl
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Use modular monolith first.");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/decisions",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(fetchImpl.mock.calls[0][1]?.body).toContain("Use OpenRouter or local Ollama?");
    expect(fetchImpl.mock.calls[0][1]?.body).not.toContain("apiKey");
  });

  it("supports stdin, file input, and session metadata for API commands", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ result: { verdict: { finalRecommendation: "Use API route." } } }), {
        status: 200
      })
    );

    const result = await runCliCommand(["decide", "--stdin", "--session", "arch-1"], {
      apiBaseUrl: "http://127.0.0.1:8787",
      stdin: "Should we introduce an API route?",
      fetch: fetchImpl
    });

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
    expect(body.question).toBe("Should we introduce an API route?");
    expect(body.cli).toMatchObject({
      sessionId: "arch-1"
    });
  });

  it("reads prompts from --file when provided", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await runCliCommand(["blueprint", "--file", "/tmp/request.md"], {
      apiBaseUrl: "http://127.0.0.1:8787",
      readFile: () => "Design workspace model",
      fetch: fetchImpl
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string).question).toBe("Design workspace model");
  });

  it("calls the local API for blueprint commands", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ result: { finalSpec: { title: "Agent review workflow" } } }), { status: 200 })
    );

    const result = await runCliCommand(["blueprint", "Design the review workflow"], {
      apiBaseUrl: "http://127.0.0.1:8787",
      fetch: fetchImpl
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Agent review workflow");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/blueprints",
      expect.objectContaining({
        method: "POST"
      })
    );
  });

  it("creates a local PR review package for review-pr commands", async () => {
    const result = await runCliCommand(["review-pr", "--pr", "42", "focus on auth boundaries"], {
      repoRoot: "/repo"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("QuorumMind Architecture Review");
    expect(result.stdout).toContain("focus on auth boundaries");
    expect(result.stdout).toContain("No GitHub comment or PR write was performed");
  });

  it("exports latest run JSON or ADR from a local file", async () => {
    const result = await runCliCommand(["export", "--adr", "--from", "/tmp/latest-run.json"], {
      readFile: (path) => {
        expect(path).toBe("/tmp/latest-run.json");
        return JSON.stringify({
          result: {
            verdict: {
              adrMarkdown: "# ADR: Test decision"
            }
          }
        });
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# ADR: Test decision");
  });

  it("prints starter config for init", async () => {
    const result = await runCliCommand(["init", "--print"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("quorummind.config.json");
    expect(result.stdout).toContain("mcpServers");
  });

  it("lists local run history and opens status from run files", async () => {
    const result = await runCliCommand(["runs", "--from", "/tmp/runs"], {
      listFiles: () => ["/tmp/runs/run-a.json"],
      readFile: () => JSON.stringify({
        runId: "run-a",
        status: "completed",
        summary: "Architecture review"
      })
    });
    const status = await runCliCommand(["status", "--from", "/tmp/runs/run-a.json"], {
      readFile: () => JSON.stringify({
        runId: "run-a",
        status: "completed",
        summary: "Architecture review"
      })
    });

    expect(result.stdout).toContain("run-a");
    expect(status.stdout).toContain("completed");
  });

  it("prints audit bundles, provider routing, eval summaries, and team access summaries", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qm-cli-audit-"));
    createRunStatusStore({ rootDir }).save({
      runId: "run-1",
      kind: "autonomous_blueprint",
      status: "completed",
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T08:00:01.000Z",
      summary: "Architecture review"
    });
    const audit = await runCliCommand(["audit", "--run", "run-1"], {
      repoRoot: rootDir
    });
    const route = await runCliCommand(["route-provider", "--task", "architecture_review", "--json-schema", "--long-context"], {
      packageJson: { name: "quorummind", version: "0.2.0", bin: { quorummind: "./bin/quorummind.mjs" } }
    });
    const evalResult = await runCliCommand(["eval", "--suite", "offline-smoke"]);
    const team = await runCliCommand(["team", "--workspace", "architecture", "--user", "alice", "--action", "approve_adr"], {
      repoRoot: mkdtempSync(join(tmpdir(), "qm-cli-team-"))
    });

    expect(audit.stdout).toContain("QuorumMind Run Audit Bundle");
    expect(route.stdout).toContain("Provider route for architecture_review");
    expect(evalResult.stdout).toContain("Decision quality eval");
    expect(team.stdout).toContain("workspace: architecture");
  });

  it("detects direct tsx execution even when the path needs URL escaping", () => {
    const scriptPath = "/tmp/VN文本/QuorumMind/scripts/quorummind-cli.ts";

    expect(isDirectCliInvocation(pathToFileURL(scriptPath).href, scriptPath)).toBe(true);
  });
});
