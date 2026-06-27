import { loadSkillBody, type SkillMeta } from "./skill-loader";

const MAX_CANDIDATE_SKILLS = 6;
const MAX_AGENT_SKILLS = 3;
export const MAX_SKILL_CHARS = 1500;

export function buildSkillCandidateList(matches: SkillMeta[]): string {
  if (matches.length === 0) return "";

  const items = matches.slice(0, MAX_CANDIDATE_SKILLS).map((s, i) =>
    `${i + 1}. **${s.name}** — ${s.description}`,
  );

  return [
    "## 可用技能（按需调用）",
    "",
    "以下是与当前决策问题相关的领域技能。选择 0-3 个最能增强你分析的技能，",
    `在回复的 JSON 中注明 "skills_used": ["name1", "name2"]。`,
    "",
    ...items,
  ].join("\n");
}

export function buildSkillInjection(
  chosenNames: string[],
  matches: SkillMeta[],
): string {
  if (chosenNames.length === 0 || matches.length === 0) return "";

  const chosen = chosenNames
    .slice(0, MAX_AGENT_SKILLS)
    .map((name) => matches.find((m) => m.name === name))
    .filter((m): m is SkillMeta => m != null);

  if (chosen.length === 0) return "";

  const bodies: string[] = [];
  let charBudget = 0;

  for (const skill of chosen) {
    if (charBudget >= MAX_SKILL_CHARS) break;
    const body = loadSkillBody(skill.path);
    const header = `## 技能: ${skill.name}\n`;
    const content = header + body;
    if (charBudget + content.length <= MAX_SKILL_CHARS) {
      bodies.push(content);
      charBudget += content.length;
    }
  }

  return bodies.join("\n\n---\n\n");
}
