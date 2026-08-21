// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadQuorumMindConfig, summarizeQuorumMindConfig } from "./quorummind-config";

describe("quorummind config", () => {
  it("loads MCP servers, custom tools, agent tool access, and provider overrides", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qm-config-"));
    writeFileSync(
      join(rootDir, "quorummind.config.json"),
      JSON.stringify({
        mcpServers: {
          github: {
            command: "npx",
            args: ["@modelcontextprotocol/server-github"],
            env: {
              GITHUB_TOKEN: "secret-token"
            }
          }
        },
        customTools: [
          {
            name: "risk_ledger",
            description: "Summarize architecture risks",
            inputSchema: {
              type: "object",
              properties: {
                question: { type: "string" }
              }
            }
          }
        ],
        agents: {
          blueprint: {
            tools: ["risk_ledger", "mcp:github"]
          }
        },
        providers: {
          openrouter: {
            model: "anthropic/claude-sonnet-4.5",
            enabled: true
          },
          ollama: {
            baseUrl: "http://127.0.0.1:11434",
            model: "llama3.1",
            enabled: true
          }
        }
      }),
      "utf8"
    );

    const config = loadQuorumMindConfig(rootDir);

    expect(config.loaded).toBe(true);
    expect(config.mcpServers.github).toMatchObject({
      command: "npx",
      args: ["@modelcontextprotocol/server-github"]
    });
    expect(config.customTools[0]).toMatchObject({
      name: "risk_ledger",
      description: "Summarize architecture risks"
    });
    expect(config.agents.blueprint?.tools).toEqual(["risk_ledger", "mcp:github"]);
    expect(config.providers.openrouter).toMatchObject({
      model: "anthropic/claude-sonnet-4.5",
      enabled: true
    });
    expect(config.providers.ollama).toMatchObject({
      baseUrl: "http://127.0.0.1:11434",
      model: "llama3.1"
    });
  });

  it("summarizes config without exposing env secrets", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qm-config-"));
    writeFileSync(
      join(rootDir, "quorummind.config.json"),
      JSON.stringify({
        mcpServers: {
          github: {
            command: "npx",
            env: {
              GITHUB_TOKEN: "secret-token"
            }
          }
        }
      }),
      "utf8"
    );

    const summary = summarizeQuorumMindConfig(loadQuorumMindConfig(rootDir));

    expect(summary.loaded).toBe(true);
    expect(summary.mcpServers).toEqual([{ name: "github", command: "npx", configuredEnvKeys: ["GITHUB_TOKEN"] }]);
    expect(JSON.stringify(summary)).not.toContain("secret-token");
  });
});
