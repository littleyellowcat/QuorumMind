// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseQuorumMindGithubCommand } from "./quorummind-command";

describe("parseQuorumMindGithubCommand", () => {
  it("parses a /quorummind decide comment", () => {
    expect(parseQuorumMindGithubCommand("/quorummind decide Should we use shared tables?")).toMatchObject({
      matched: true,
      command: "decide",
      prompt: "Should we use shared tables?",
      source: "github_comment",
      trigger: "/quorummind"
    });
  });

  it("parses the /qm shortcut for blueprint requests", () => {
    expect(parseQuorumMindGithubCommand("/qm blueprint Design a VN agent workflow")).toMatchObject({
      matched: true,
      command: "blueprint",
      prompt: "Design a VN agent workflow",
      source: "github_comment",
      trigger: "/qm"
    });
  });

  it("extracts PR number and remaining focus from review-pr comments", () => {
    expect(parseQuorumMindGithubCommand("/quorummind review-pr --pr 42 focus on auth boundaries")).toMatchObject({
      matched: true,
      command: "review-pr",
      prNumber: 42,
      prompt: "focus on auth boundaries",
      source: "github_comment"
    });
  });

  it("rejects ambiguous review-pr comments before runner integration", () => {
    expect(parseQuorumMindGithubCommand("/qm review-pr --pr nope focus on auth")).toEqual({
      matched: false
    });
    expect(parseQuorumMindGithubCommand("/qm review-pr --pr 42")).toEqual({
      matched: false
    });
  });

  it("ignores ordinary comments", () => {
    expect(parseQuorumMindGithubCommand("Could someone review this manually?")).toEqual({
      matched: false
    });
  });
});
