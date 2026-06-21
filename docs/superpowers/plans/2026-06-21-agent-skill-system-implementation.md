# Agent Skill System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dynamic skill system where QuorumMind's 5 expert agents can load domain-specific skills (SKILL.md format) at runtime to enhance analysis quality.

**Architecture:** Skills stored as Markdown files with YAML frontmatter in `~/.quorummind/skills/`. A loader parses frontmatter for fast indexing, a matcher does coarse filtering by domain/role/triggers, and an injector builds the skill portion of the system prompt. Agents see a candidate list and choose which skills to activate.

**Tech Stack:** TypeScript 6.0, Node.js 24 (node:fs), Zod 4.4.3

## Global Constraints

- Skill files: YAML frontmatter + Markdown body in `~/.quorummind/skills/`
- Frontmatter fields: name, description, domain, roles, triggers, inject
- Roles: AgentRole[] or `["all"]` for all agents
- Inject values: `"decision_room"` | `"blueprint"` | `"both"`
- Coarse filtering: by domain, role, trigger keywords, max 6 candidates
- Agent selection: 0-3 skills per call
- Single skill max: 2000 chars (~500 tokens)
- Skill budget: ≤30% of system prompt (shared with knowledge injection)
- Cache: index in memory, bodies LRU (max 20), match results TTL 5 minutes

---

### Task 1: Skill Loader — 文件解析 + 索引 + 粗筛

**Files:**
- Create: `src/lib/skill-loader.ts`
- Create: `~/.quorummind/skills/tenant-isolation.md` (示例技能)

**Interfaces:**
- Produces: `SkillMeta { name, description, domain, roles, triggers, inject, path }`
- Produces: `loadAllSkills(dir): SkillMeta[]`
- Produces: `loadSkillBody(path): string`
- Produces: `matchSkills(question, domain, agentRole, skills): SkillMeta[]`

- [ ] **Step 1: 定义类型和 Zod schema**

创建 `src/lib/skill-loader.ts`:

```typescript
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export type SkillMeta = {
  name: string;
  description: string;
  domain: string;
  roles: string[];
  triggers: string[];
  inject: "decision_room" | "blueprint" | "both";
  path: string; // 文件路径，用于按需加载正文
};

const skillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  domain: z.string().default("all"),
  roles: z.array(z.string()).default(["all"]),
  triggers: z.array(z.string()).default([]),
  inject: z.enum(["decision_room", "blueprint", "both"]).default("decision_room"),
});
```

- [ ] **Step 2: 实现 YAML frontmatter 解析器**

继续在 `skill-loader.ts`:

```typescript
function parseSkillFrontmatter(content: string): SkillMeta | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  
  const raw: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    
    if (value.startsWith("[") && value.endsWith("]")) {
      raw[key] = value.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, ""));
    } else {
      raw[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  
  const parsed = skillFrontmatterSchema.safeParse(raw);
  return parsed.success ? { ...parsed.data, path: "" } : null;
}

function extractSkillBody(content: string): string {
  const parts = content.split("---\n");
  return parts.length >= 3 ? parts.slice(2).join("---\n").trim() : content;
}
```

- [ ] **Step 3: 实现加载和缓存**

```typescript
let skillIndexCache: SkillMeta[] | null = null;
const bodyCache = new Map<string, { body: string; ts: number }>();
const matchCache = new Map<string, { result: SkillMeta[]; ts: number }>();

export function loadAllSkills(dir?: string): SkillMeta[] {
  const skillsDir = dir ?? join(process.env.QUORUMMIND_DATA_DIR ?? join(process.env.HOME ?? "~", ".quorummind"), "skills");
  
  if (skillIndexCache) return skillIndexCache;
  if (!existsSync(skillsDir)) return [];
  
  const files = readdirSync(skillsDir).filter(f => f.endsWith(".md"));
  skillIndexCache = files.flatMap(file => {
    const content = readFileSync(join(skillsDir, file), "utf8");
    const meta = parseSkillFrontmatter(content);
    return meta ? [{ ...meta, path: join(skillsDir, file) }] : [];
  });
  
  return skillIndexCache;
}

export function loadSkillBody(path: string): string {
  const cached = bodyCache.get(path);
  if (cached && Date.now() - cached.ts < 300000) return cached.body;
  
  const content = readFileSync(path, "utf8");
  const body = extractSkillBody(content).slice(0, 2000);
  
  // LRU eviction
  if (bodyCache.size >= 20) {
    const oldest = [...bodyCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) bodyCache.delete(oldest[0]);
  }
  bodyCache.set(path, { body, ts: Date.now() });
  return body;
}

export function clearSkillCache(): void {
  skillIndexCache = null;
  bodyCache.clear();
  matchCache.clear();
}
```

- [ ] **Step 4: 实现粗筛匹配**

```typescript
export function matchSkills(
  question: string,
  domain: string,
  agentRole: string,
  skills?: SkillMeta[]
): SkillMeta[] {
  const all = skills ?? loadAllSkills();
  const cacheKey = `${question}::${domain}::${agentRole}`;
  
  const cached = matchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 300000) return cached.result;
  
  const tokens = question.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  
  const matched = all
    .filter(s => s.roles.includes(agentRole) || s.roles.includes("all"))
    .filter(s => s.domain === domain || s.domain === "all")
    .filter(s => s.triggers.length === 0 || s.triggers.some(t => tokens.includes(t.toLowerCase())))
    .slice(0, 6);
  
  matchCache.set(cacheKey, { result: matched, ts: Date.now() });
  return matched;
}
```

- [ ] **Step 5: 创建示例技能文件**

创建 `~/.quorummind/skills/tenant-isolation.md`:

```markdown
---
name: tenant-isolation
description: Multi-tenant data isolation evaluation framework — shared tables vs schema-per-tenant vs database-per-tenant
domain: technical_architecture
roles: [principal_architect, security_reviewer, sre_reviewer, cost_engineer]
triggers: [tenant, postgresql, schema-per-tenant, shared-tables, database-per-tenant, 多租户, 隔离, RLS]
inject: decision_room
---

# 多租户数据隔离评估框架

## 分析维度
按以下四个维度评估每个候选方案：

1. **安全边界**: 租户数据的隔离强度。shared < schema < database。检查是否满足最小权限原则、跨租户查询是否被 RLS/应用层拦截。
2. **运维成本**: 租户生命周期管理的复杂度。备份、恢复、迁移的租户粒度。
3. **扩展性**: 单租户资源隔离能力。噪声邻居问题如何缓解？
4. **合规**: 是否有监管要求（GDPR、HIPAA、SOC2）强制物理或逻辑隔离？

## 关键检查清单
- [ ] Row-Level Security (RLS) 是否覆盖所有查询路径（包括 JOIN、子查询、聚合）？
- [ ] 如果使用 shared tables，tenant_id 的索引策略是否包含在复合索引中？
- [ ] 连接池是否支持 tenant-aware 路由？
- [ ] 租户数据导出/删除是否符合 GDPR 的 data portability 和 right-to-erasure？
- [ ] schema-per-tenant 的 migration 策略是什么？（每个 schema 独立迁移 vs 统一迁移）

## 推荐决策路径
MVP 阶段：shared tables + RLS + tenant-aware repository layer
Scale 阶段：schema-per-tenant for premium tenants
Enterprise 阶段：database-per-tenant only if regulatory isolation required
```

- [ ] **Step 6: 验证**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/skill-loader.ts
git commit -m "feat: skill loader — frontmatter parsing, indexing, coarse matching, caching"
```

---

### Task 2: Skill Injector — Prompt 拼接

**Files:**
- Create: `src/lib/skill-inject.ts`

**Interfaces:**
- Consumes: `SkillMeta[]`, `loadSkillBody` from Task 1
- Produces: `buildSkillCandidateList(matches): string` — Agent 看到的候选清单
- Produces: `buildSkillInjection(chosenNames, matches): string` — 选定技能的正文
- Produces: `MAX_SKILL_CHARS = 1500`

- [ ] **Step 1: 实现注入逻辑**

创建 `src/lib/skill-inject.ts`:

```typescript
import { loadSkillBody, type SkillMeta } from "./skill-loader";

const MAX_CANDIDATE_SKILLS = 6;
const MAX_AGENT_SKILLS = 3;
export const MAX_SKILL_CHARS = 1500;

export function buildSkillCandidateList(matches: SkillMeta[]): string {
  if (matches.length === 0) return "";

  const items = matches.slice(0, MAX_CANDIDATE_SKILLS).map((s, i) =>
    `${i + 1}. **${s.name}** — ${s.description}`
  );

  return [
    "## 可用技能（按需调用）",
    "",
    "以下是与当前决策问题相关的领域技能。选择 0-3 个最能增强你分析的技能，",
    `在回复的 JSON 中注明 "skills_used": ["name1", "name2"]。`,
    "",
    ...items
  ].join("\n");
}

export function buildSkillInjection(
  chosenNames: string[],
  matches: SkillMeta[]
): string {
  if (chosenNames.length === 0 || matches.length === 0) return "";

  const chosen = chosenNames
    .slice(0, MAX_AGENT_SKILLS)
    .map(name => matches.find(m => m.name === name))
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
```

- [ ] **Step 2: 验证**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/skill-inject.ts
git commit -m "feat: skill injector — candidate list + body injection"
```

---

### Task 3: 集成到 live-agents.ts

**Files:**
- Modify: `server/live-agents.ts`

**Interfaces:**
- Consumes: `matchSkills`, `buildSkillCandidateList`, `buildSkillInjection` from Tasks 1-2
- Modifies: `generateLiveProposal`, `generateLiveCritique`, `reviseLiveProposal`

- [ ] **Step 1: 修改 `generateLiveProposal` 注入技能**

在 `server/live-agents.ts` 中，`buildLiveRequest` 调用前添加技能逻辑:

```typescript
// 在 generateLiveProposal 中，buildLiveRequest 调用之前:
const domain = inferDecisionDomain(question, context);
const skillMatches = matchSkills(question, domain, agent.role);
const skillCandidateList = buildSkillCandidateList(skillMatches);
const enhancedQuestion = [
  knowledgeInjection,
  skillCandidateList
].filter(Boolean).join("\n\n");

// 在 LLM 返回后，解析 skills_used:
const skillsUsed = extractSkillsUsed(text); // 从 JSON 中提取 "skills_used" 字段
if (skillsUsed) {
  const skillBody = buildSkillInjection(skillsUsed, skillMatches);
  // 将 skillBody 也注入到 proposal 的 reasoning 前缀
}
```

- [ ] **Step 2: 修改 `generateLiveCritique` 复用提案技能**

```typescript
// 在 generateLiveCritique 中，复用提案阶段的 skillMatches
// 额外添加盲审相关技能:
const reviewSkills = skillMatches.filter(s => 
  s.triggers.some(t => ["review", "critique", "audit", "评审"].includes(t))
);
```

- [ ] **Step 3: 修改 `reviseLiveProposal` 保持原技能**

```typescript
// 在 reviseLiveProposal 中，保持原 skillMatches
// 根据 critiques 中的反馈决定是否额外加载技能
```

- [ ] **Step 4: 验证**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add server/live-agents.ts
git commit -m "feat: integrate skill system into live agents"
```

---

### Task 4: 集成到 demo-agents.ts + 更多示例技能

**Files:**
- Modify: `src/lib/demo-agents.ts`
- Create: `~/.quorummind/skills/service-decomposition.md`
- Create: `~/.quorummind/skills/owasp-top10.md`

- [ ] **Step 1: Demo agent 技能注入**

在 `src/lib/demo-agents.ts` 的 `generateProposal` 中:

```typescript
// 在 reasoning 生成前，添加技能注入
const skillMatches = matchSkills(question ?? "", domainFromContext(context), agent.role);
const skillCandidateList = buildSkillCandidateList(skillMatches);
// 对于 demo agent，自动选择前 2 个最匹配的技能
const autoChosen = skillMatches.slice(0, 2).map(s => s.name);
const skillBody = buildSkillInjection(autoChosen, skillMatches);

const enhancedKnowledge = [knowledgeInjection, skillBody].filter(Boolean).join("\n\n---\n\n");
```

- [ ] **Step 2: 创建 service-decomposition.md**

技能文件包含: 微服务拆分评估框架、模块边界测试清单、拆分触发条件、推荐决策路径。

- [ ] **Step 3: 创建 owasp-top10.md**

技能文件包含: OWASP Top 10 检查清单、安全评审框架、常见架构反模式。

- [ ] **Step 4: 验证**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo-agents.ts
git commit -m "feat: integrate skill system into demo agents + example skills"
```

---

## 验证清单

全部完成后运行:

```bash
npx tsc --noEmit        # 零类型错误
npx vitest run          # 全部测试通过
npm run build           # 生产构建成功
```

手动验证:

```bash
# 确认技能文件存在
ls ~/.quorummind/skills/

# 启动项目并触发一次决策，检查 Agent trace 中是否有 "skills_used"
QUORUMMIND_PROVIDER_MODE=live npm run dev
```
