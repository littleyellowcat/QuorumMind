import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ensureDataDir } from "./knowledge-index";

export function readKnowledgeFile(dir: string): string {
  const path = join(dir, "KNOWLEDGE.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

export function writeDecisionSummary(
  summary: {
    date: string;
    question: string;
    verdict: string;
    quorumScore: number;
    domain: string;
    locale: string;
    body: string;
  },
  dir: string
): string {
  ensureDataDir(dir);
  const slug = summary.date.slice(0, 10) + "-" +
    summary.question.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  const path = join(dir, "decisions", `${slug}.md`);

  const frontmatter = [
    "---",
    `date: ${summary.date.slice(0, 10)}`,
    `question: "${summary.question}"`,
    `verdict: ${summary.verdict}`,
    `quorum_score: ${summary.quorumScore}`,
    `domain: ${summary.domain}`,
    `locale: ${summary.locale}`,
    "---",
    ""
  ].join("\n");

  writeFileSync(path, frontmatter + summary.body);
  return path;
}
