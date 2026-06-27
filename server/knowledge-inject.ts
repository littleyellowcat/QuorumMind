import { resolveDataDir, loadIndex, searchIndex } from "./knowledge-index";
import type { DecisionContext } from "../src/lib/domain";
import { inferDecisionDomain } from "../src/lib/model-reputation";

const MAX_INJECTION_CHARS = 1500; // ~400 tokens

export function buildKnowledgeInjection(
  question: string,
  context: DecisionContext,
  dir?: string
): string {
  let dataDir: string;
  try {
    dataDir = dir ?? resolveDataDir();
  } catch {
    return "";
  }

  let index;
  try {
    index = loadIndex(dataDir);
  } catch {
    return "";
  }

  if (index.entries.length === 0) return "";

  const domain = inferDecisionDomain(question, context);
  const matches = searchIndex(index, question, domain, 6);

  if (matches.length === 0) return "";

  const snippets: string[] = [];
  let charBudget = 0;

  // Prioritize injecting team constraints from KNOWLEDGE.md
  for (const entry of matches) {
    if (charBudget >= MAX_INJECTION_CHARS) break;
    const content = entry.file === "KNOWLEDGE.md"
      ? "(永久知识) " + entry.section
      : "(历史决策) " + entry.section;
    if (charBudget + content.length <= MAX_INJECTION_CHARS) {
      snippets.push(content);
      charBudget += content.length;
    }
  }

  if (snippets.length === 0) return "";

  return [
    "## 历史上下文与团队知识",
    "以下是本项目的已知架构原则和过往决策偏好，请在提案时参考这些背景：",
    ...snippets.map((s, i) => `${i + 1}. ${s}`),
    ""
  ].join("\n");
}
