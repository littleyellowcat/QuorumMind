// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearSkillCache, loadAllSkills, loadSkillBody, matchSkills } from "./skill-loader";

const tempDirs: string[] = [];

afterEach(() => {
  clearSkillCache();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("skill-loader", () => {
  it("loads flat markdown skills and directory SKILL.md files", () => {
    const root = createTempRoot();
    writeFileSync(
      join(root, "flat-skill.md"),
      [
        "---",
        "name: flat-skill",
        "description: Flat runtime skill.",
        "---",
        "<!-- quorummind-skill",
        "domain: all",
        "roles: [all]",
        "triggers: [flat]",
        "inject: both",
        "-->",
        "",
        "# Flat Skill",
      ].join("\n"),
    );

    const nested = join(root, "quorummind-nested-skill");
    mkdirSync(nested);
    writeFileSync(
      join(nested, "SKILL.md"),
      [
        "---",
        "name: quorummind-nested-skill",
        "description: Nested runtime skill.",
        "---",
        "<!-- quorummind-skill",
        "domain: all",
        "roles: [all]",
        "triggers: [nested]",
        "inject: blueprint",
        "-->",
        "",
        "# Nested Skill",
        "",
        "Use the nested method.",
      ].join("\n"),
    );

    const skills = loadAllSkills(root);

    expect(skills.map((skill) => skill.name)).toEqual([
      "flat-skill",
      "quorummind-nested-skill",
    ]);
    expect(skills.find((skill) => skill.name === "quorummind-nested-skill")?.inject).toBe("blueprint");
    expect(loadSkillBody(join(nested, "SKILL.md"))).not.toContain("quorummind-skill");
  });

  it("matches Chinese trigger phrases by substring without whitespace tokenization", () => {
    const skills = [
      {
        name: "quorummind-risk-matrix",
        description: "Risk matrix skill.",
        domain: "all",
        roles: ["all"],
        triggers: ["风险矩阵"],
        inject: "both" as const,
        path: "/tmp/quorummind-risk-matrix.md",
      },
    ];

    const matched = matchSkills("请把高分歧背后的原因做成风险矩阵", "technical_architecture", "principal_architect", skills);

    expect(matched.map((skill) => skill.name)).toEqual(["quorummind-risk-matrix"]);
  });
});

function createTempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "quorummind-skills-"));
  tempDirs.push(dir);
  return dir;
}
