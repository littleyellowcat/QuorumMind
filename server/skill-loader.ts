import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Browser safety guard — node:fs is only available in Node.js. In a Vite
// browser build the imports above resolve to empty stubs (undefined).
// Every `node:fs` call is gated behind this boolean.
// ---------------------------------------------------------------------------
const isNode = typeof process !== "undefined" && process.versions?.node;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillMeta = {
  name: string;
  description: string;
  domain: string;
  roles: string[];
  triggers: string[];
  inject: "decision_room" | "blueprint" | "both";
  path: string; // file path, for on-demand body loading
};

// ---------------------------------------------------------------------------
// Zod schema for YAML frontmatter validation
// ---------------------------------------------------------------------------

const skillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  domain: z.string().default("all"),
  roles: z.array(z.string()).default(["all"]),
  triggers: z.array(z.string()).default([]),
  inject: z.enum(["decision_room", "blueprint", "both"]).default("decision_room"),
});

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

function parseSkillFrontmatter(content: string): SkillMeta | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const runtimeMatch = content.match(/<!--\s*quorummind-skill\s*([\s\S]*?)-->/i);
  const raw: Record<string, unknown> = {};
  for (const line of [...match[1].split("\n"), ...(runtimeMatch?.[1].split("\n") ?? [])]) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (value.startsWith("[") && value.endsWith("]")) {
      raw[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""));
    } else {
      raw[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  const parsed = skillFrontmatterSchema.safeParse(raw);
  return parsed.success ? { ...parsed.data, path: "" } : null;
}

function extractSkillBody(content: string): string {
  const parts = content.split("---\n");
  const body = parts.length >= 3 ? parts.slice(2).join("---\n") : content;
  return body.replace(/<!--\s*quorummind-skill[\s\S]*?-->\s*/i, "").trim();
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

const skillIndexCache = new Map<string, SkillMeta[]>();
const bodyCache = new Map<string, { body: string; ts: number }>();
const matchCache = new Map<string, { result: SkillMeta[]; ts: number }>();

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Scan a directory for `.md` skill files, parse their frontmatter, and
 * return a sorted index of `SkillMeta` objects. Results are cached until
 * `clearSkillCache()` is called.
 *
 * In browser environments this always returns an empty array.
 */
export function loadAllSkills(dir?: string): SkillMeta[] {
  if (!isNode) return [];

  const defaultUserSkillsDir = join(
    process.env.QUORUMMIND_DATA_DIR ??
      join(process.env.HOME ?? "~", ".quorummind"),
    "skills",
  );
  const defaultProjectSkillsDir = join(process.cwd(), "skills");
  const cacheKey = dir ?? `${defaultProjectSkillsDir}::${defaultUserSkillsDir}`;

  const cached = skillIndexCache.get(cacheKey);
  if (cached) return cached;

  const loaded = dir
    ? loadSkillsFromDirectory(dir)
    : [
        ...loadSkillsFromDirectory(defaultProjectSkillsDir, { projectOnly: true }),
        ...loadSkillsFromDirectory(defaultUserSkillsDir),
      ];

  const byName = new Map<string, SkillMeta>();
  for (const skill of loaded) byName.set(skill.name, skill);

  const result = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  skillIndexCache.set(cacheKey, result);
  return result;
}

function loadSkillsFromDirectory(
  skillsDir: string,
  options: { projectOnly?: boolean } = {},
): SkillMeta[] {
  if (!existsSync(skillsDir)) return [];

  return readdirSync(skillsDir)
    .flatMap((entry) => {
      const path = join(skillsDir, entry);
      const isProjectSkill = entry.startsWith("quorummind-");
      if (options.projectOnly && !isProjectSkill) return [];

      const stat = statSync(path);
      if (stat.isFile() && entry.endsWith(".md")) return [path];
      if (stat.isDirectory()) {
        const skillPath = join(path, "SKILL.md");
        return existsSync(skillPath) ? [skillPath] : [];
      }
      return [];
    })
    .flatMap((path) => {
      const meta = parseSkillFrontmatter(readFileSync(path, "utf8"));
      return meta ? [{ ...meta, path }] : [];
    });
}

/**
 * Read the body (everything after frontmatter) of a skill file by its
 * absolute path. Truncated to 2000 characters. Results are cached with a
 * 5-minute TTL and LRU eviction (max 20 entries).
 *
 * In browser environments this always returns an empty string.
 */
export function loadSkillBody(path: string): string {
  if (!isNode) return "";

  const cached = bodyCache.get(path);
  if (cached && Date.now() - cached.ts < 300_000) return cached.body;

  const content = readFileSync(path, "utf8");
  const body = extractSkillBody(content).slice(0, 2000);

  // LRU eviction — evict oldest when over capacity
  if (bodyCache.size >= 20) {
    const oldest = [...bodyCache.entries()].sort(
      (a, b) => a[1].ts - b[1].ts,
    )[0];
    if (oldest) bodyCache.delete(oldest[0]);
  }
  bodyCache.set(path, { body, ts: Date.now() });
  return body;
}

/**
 * Clear all cached skill indices and bodies.
 */
export function clearSkillCache(): void {
  skillIndexCache.clear();
  bodyCache.clear();
  matchCache.clear();
}

// ---------------------------------------------------------------------------
// Coarse matching
// ---------------------------------------------------------------------------

/**
 * Given a question, domain, and agent role, return up to 6 matching skills.
 *
 * Matching rules (in order):
 * 1. Role must match (or skill has `roles: ["all"]`).
 * 2. Domain must match (or skill has `domain: "all"`).
 * 3. If the skill declares triggers, at least one trigger must appear as a
 *    substring or whitespace token in the lowercased question.
 * 4. Skills with no triggers always pass the trigger filter.
 *
 * Results are cached with a 5-minute TTL.
 */
export function matchSkills(
  question: string,
  domain: string,
  agentRole: string,
  skills?: SkillMeta[],
): SkillMeta[] {
  const all = skills ?? loadAllSkills();
  const cacheKey = `${question}::${domain}::${agentRole}`;

  const cached = matchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 300_000) return cached.result;

  const tokens = question
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  const questionLower = question.toLowerCase();

  const matched = all
    .filter(
      (s) => s.roles.includes(agentRole) || s.roles.includes("all"),
    )
    .filter((s) => s.domain === domain || s.domain === "all")
    .filter(
      (s) =>
        s.triggers.length === 0 ||
        s.triggers.some((t) => {
          const trigger = t.toLowerCase();
          return questionLower.includes(trigger) || tokens.includes(trigger);
        }),
    )
    .slice(0, 6);

  matchCache.set(cacheKey, { result: matched, ts: Date.now() });
  return matched;
}
