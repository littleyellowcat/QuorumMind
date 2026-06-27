import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

export type KnowledgeEntry = {
  file: string;
  section: string;
  line: number;
  tokens: string[];
  domain: string;
};

export type KnowledgeIndex = {
  entries: KnowledgeEntry[];
  updated: string;
};

export function resolveDataDir(): string {
  return process.env.QUORUMMIND_DATA_DIR ?? join(process.env.HOME ?? "~", ".quorummind");
}

export function ensureDataDir(dir: string): void {
  mkdirSync(join(dir, "decisions"), { recursive: true });
}

export function loadIndex(dir: string): KnowledgeIndex {
  const indexPath = join(dir, ".index.json");
  if (!existsSync(indexPath)) {
    return { entries: [], updated: new Date().toISOString() };
  }
  try {
    return JSON.parse(readFileSync(indexPath, "utf8"));
  } catch {
    return { entries: [], updated: new Date().toISOString() };
  }
}

export function searchIndex(
  index: KnowledgeIndex,
  query: string,
  domain?: string,
  limit = 8
): KnowledgeEntry[] {
  const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const scored = index.entries
    .filter(e => !domain || e.domain === domain)
    .map(e => ({
      entry: e,
      score: e.tokens.filter(t => queryTokens.some(qt => t.includes(qt))).length
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.entry);
}

export function rebuildIndex(dir: string): KnowledgeIndex {
  ensureDataDir(dir);
  const entries: KnowledgeEntry[] = [];
  const knowledgePath = join(dir, "KNOWLEDGE.md");

  // 索引 KNOWLEDGE.md
  if (existsSync(knowledgePath)) {
    const content = readFileSync(knowledgePath, "utf8");
    const sections = content.split(/^## /m).filter(Boolean);
    let line = 1;
    for (const section of sections) {
      const headingEnd = section.indexOf("\n");
      const heading = headingEnd > 0 ? section.slice(0, headingEnd).trim() : section.trim();
      const tokens = extractTokens(section);
      entries.push({
        file: "KNOWLEDGE.md",
        section: heading,
        line,
        tokens,
        domain: "all"
      });
      line += section.split("\n").length;
    }
  }

  // 索引 decisions/
  const decisionsDir = join(dir, "decisions");
  if (existsSync(decisionsDir)) {
    for (const file of readdirSync(decisionsDir)) {
      if (!file.endsWith(".md")) continue;
      const content = readFileSync(join(decisionsDir, file), "utf8");
      const frontmatter = parseFrontmatter(content);
      const domain = frontmatter?.domain ?? "technical_architecture";
      entries.push({
        file: `decisions/${file}`,
        section: frontmatter?.verdict ?? file,
        line: 1,
        tokens: extractTokens(content),
        domain
      });
    }
  }

  const index: KnowledgeIndex = {
    entries,
    updated: new Date().toISOString()
  };
  writeFileSync(join(dir, ".index.json"), JSON.stringify(index, null, 2));
  return index;
}

function extractTokens(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9一-鿿\s-]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1)
    .slice(0, 30);
}

function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) result[key.trim()] = rest.join(":").trim();
  }
  return result;
}
