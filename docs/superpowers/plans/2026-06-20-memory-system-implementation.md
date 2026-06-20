# QuorumMind 记忆系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 QuorumMind 构建文件层（知识记忆）+ SQLite 层（工作记忆）+ 注入层（system prompt 拼接）的记忆系统架构。

**Architecture:** 知识记忆用 `~/.quorummind/` 文件系统（KNOWLEDGE.md + decisions/*.md + .index.json），工作记忆用 SQLite `quorummind.db`（checkpoints + context_summaries + pressure_log），注入层在会话启动时检索知识拼接 system prompt。

**Tech Stack:** TypeScript 6.0, Node.js 24 (node:sqlite), LangGraph 1.4.4, React 19.2

## Global Constraints

- Node.js 24 `node:sqlite` (DatabaseSync) 作为唯一 SQLite 依赖
- 知识文件使用 Markdown + YAML frontmatter
- 索引用 JSON 文件，不引入嵌入模型
- LangGraph `BaseCheckpointSaver` 接口
- QUORUMMIND_DATA_DIR 环境变量控制数据目录

---

### Task 1: SqliteSaver — LangGraph 检查点持久化

**Files:**
- Create: `server/persistence/sqlite-saver.ts`
- Modify: `server/agent-platform/autonomous-blueprint.ts:338,464`
- Modify: `server/persistence/sqlite-schema.sql`

**Interfaces:**
- Consumes: `BaseCheckpointSaver` from `@langchain/langgraph-checkpoint`
- Produces: `createSqliteSaver(dbPath: string): BaseCheckpointSaver`

- [ ] **Step 1: 扩展 schema**

在 `server/persistence/sqlite-schema.sql` 末尾追加:

```sql
CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  checkpoint_data TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_thread ON langgraph_checkpoints(thread_id, created_at DESC);
```

- [ ] **Step 2: 实现 SqliteSaver**

创建 `server/persistence/sqlite-saver.ts`:

```typescript
import { DatabaseSync } from "node:sqlite";
import type { BaseCheckpointSaver, CheckpointTuple } from "@langchain/langgraph-checkpoint";

export function createSqliteSaver(db: DatabaseSync): BaseCheckpointSaver {
  return {
    async getTuple(config) {
      const row = db.prepare(
        `SELECT checkpoint_data, metadata_json, parent_checkpoint_id
         FROM langgraph_checkpoints
         WHERE thread_id = ? AND checkpoint_id = ?
         ORDER BY created_at DESC LIMIT 1`
      ).get(config.configurable.thread_id, config.configurable.checkpoint_id) as Record<string,unknown> | undefined;

      if (!row) return undefined;
      return {
        checkpoint: JSON.parse(row.checkpoint_data as string),
        metadata: JSON.parse(row.metadata_json as string),
        parentCheckpointId: row.parent_checkpoint_id as string | undefined
      } as CheckpointTuple;
    },

    async putTuple(config, checkpoint, metadata) {
      db.prepare(
        `INSERT OR REPLACE INTO langgraph_checkpoints
         (thread_id, checkpoint_id, parent_checkpoint_id, checkpoint_data, metadata_json)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        config.configurable.thread_id,
        checkpoint.id,
        metadata.parent_checkpoint_id ?? null,
        JSON.stringify(checkpoint),
        JSON.stringify(metadata)
      );
    },

    async list(config, options) {
      const rows = db.prepare(
        `SELECT checkpoint_data, metadata_json, parent_checkpoint_id
         FROM langgraph_checkpoints
         WHERE thread_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      ).all(config.configurable.thread_id, options?.limit ?? 10) as Record<string,unknown>[];

      return rows.map(row => ({
        checkpoint: JSON.parse(row.checkpoint_data as string),
        metadata: JSON.parse(row.metadata_json as string),
        parentCheckpointId: row.parent_checkpoint_id as string | undefined
      })) as CheckpointTuple[];
    }
  };
}
```

- [ ] **Step 3: 在 autonomous-blueprint.ts 中接入**

修改第 338 行和 464 行:

```typescript
// 之前
import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
const autonomousBlueprintCheckpointer = new MemorySaver();

// 改为
import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { createSqliteSaver } from "../persistence/sqlite-saver";
import { DatabaseSync } from "node:sqlite";

function getCheckpointer() {
  const dbPath = process.env.QUORUMMIND_SQLITE_PATH;
  if (dbPath) {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON");
    return createSqliteSaver(db);
  }
  return new MemorySaver(); // 无 SQLite 时回退内存
}

const autonomousBlueprintCheckpointer = getCheckpointer();
```

- [ ] **Step 4: 验证**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add server/persistence/sqlite-saver.ts server/persistence/sqlite-schema.sql server/agent-platform/autonomous-blueprint.ts
git commit -m "feat: SqliteSaver — LangGraph checkpoint persistence"
```

---

### Task 2: 知识记忆文件层

**Files:**
- Create: `src/lib/knowledge-index.ts`
- Create: `src/lib/knowledge-store.ts`

**Interfaces:**
- Produces: `KnowledgeIndex { search(query, domain?, limit?): KnowledgeEntry[]; rebuild(): void }`
- Produces: `writeDecisionSummary(summary, dataDir): string` — 返回写入文件路径
- Produces: `readKnowledgeFile(dataDir): string` — 读取 KNOWLEDGE.md 全文

- [ ] **Step 1: 定义类型和索引结构**

创建 `src/lib/knowledge-index.ts`:

```typescript
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
```

- [ ] **Step 2: 实现决策摘要写入和索引重建**

继续在 `src/lib/knowledge-index.ts` 中:

```typescript
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
```

- [ ] **Step 3: 实现知识文件读取和决策摘要写入**

创建 `src/lib/knowledge-store.ts`:

```typescript
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
```

- [ ] **Step 4: 初始化默认 KNOWLEDGE.md**

```bash
mkdir -p ~/.quorummind/decisions
```

在 `~/.quorummind/KNOWLEDGE.md` 写入初始模板（通过代码 `ensureDataDir` + 首次初始化自动创建）。

- [ ] **Step 5: 验证**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/knowledge-index.ts src/lib/knowledge-store.ts
git commit -m "feat: knowledge memory file layer — KNOWLEDGE.md + decisions/ + .index.json"
```

---

### Task 3: 注入层 — System Prompt 拼接

**Files:**
- Create: `src/lib/knowledge-inject.ts`
- Modify: `src/lib/workflow.ts` (Decision Room 入口注入)
- Modify: `server/agent-platform/autonomous-blueprint.ts` (Blueprint 入口注入)

**Interfaces:**
- Produces: `buildKnowledgeInjection(question: string, context: DecisionContext, dir?: string): string`

- [ ] **Step 1: 实现注入逻辑**

创建 `src/lib/knowledge-inject.ts`:

```typescript
import { resolveDataDir, loadIndex, searchIndex } from "./knowledge-index";
import { readKnowledgeFile } from "./knowledge-store";
import type { DecisionContext } from "./domain";
import { inferDecisionDomain } from "./model-reputation";

const MAX_INJECTION_CHARS = 1500; // ~400 tokens

export function buildKnowledgeInjection(
  question: string,
  context: DecisionContext,
  dir?: string
): string {
  const dataDir = dir ?? resolveDataDir();
  const index = loadIndex(dataDir);

  if (index.entries.length === 0) return "";

  const domain = inferDecisionDomain(question, context);
  const matches = searchIndex(index, question, domain, 6);

  if (matches.length === 0) return "";

  const snippets: string[] = [];
  let charBudget = 0;

  // 优先注入 KNOWLEDGE.md 中的团队约束
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
```

- [ ] **Step 2: Decision Room 入口注入**

修改 `src/lib/workflow.ts` 中 `runDecisionRoom` 函数:

在 prompt 生成时调用 `buildKnowledgeInjection`，将结果拼接到系统提示头部。

```typescript
import { buildKnowledgeInjection } from "./knowledge-inject";

// 在 runDecisionRoom 内部，生成 agent prompts 之前:
const knowledgeInjection = buildKnowledgeInjection(question, context);
```

（具体拼接位置取决于当前 workflow.ts 的 prompt 构建逻辑）

- [ ] **Step 3: Blueprint 入口注入**

修改 `server/agent-platform/autonomous-blueprint.ts`:

在 `understand_request` 节点的 prompt 中注入 knowledge。

- [ ] **Step 4: 验证**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge-inject.ts src/lib/workflow.ts server/agent-platform/autonomous-blueprint.ts
git commit -m "feat: knowledge injection layer — system prompt enrichment"
```

---

### Task 4: 上下文压缩 (WBC)

**Files:**
- Create: `server/context-compressor.ts`
- Modify: `server/agent-platform/autonomous-blueprint.ts`
- Modify: `server/persistence/sqlite-schema.sql`

**Interfaces:**
- Produces: `compressContext(state: BlueprintState): BlueprintState`
- Produces: `estimateTokenCount(state: BlueprintState): number`

- [ ] **Step 1: 添加 schema**

在 `server/persistence/sqlite-schema.sql` 末尾追加:

```sql
CREATE TABLE IF NOT EXISTS context_summaries (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  summary_type TEXT NOT NULL CHECK(summary_type IN ('incremental','consolidated')),
  content TEXT NOT NULL,
  compressed_at TEXT NOT NULL,
  token_count_before INTEGER,
  token_count_after INTEGER
);

CREATE TABLE IF NOT EXISTS pressure_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  fill_ratio REAL NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('none','compressed','emergency'))
);
```

- [ ] **Step 2: 实现上下文压缩器**

创建 `server/context-compressor.ts`:

```typescript
const COMPRESSION_THRESHOLD = 0.65;
const TAIL_ROUNDS = 3;

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 3.5); // 粗略估计: ~3.5 chars/token
}

export type CompressionResult = {
  didCompress: boolean;
  summary: string | null;
  constraints: string[];
};

export function extractConstraints(messages: string[]): string[] {
  const constraints: string[] = [];
  const hardPatterns = [
    /不接受.*超过/g,
    /必须.*(?:之前|以内)/g,
    /不能.*(?:超过|使用|依赖)/g,
    /P99.*<\s*\d+/g,
    /延迟.*<\s*\d+/g,
  ];
  for (const msg of messages) {
    for (const pattern of hardPatterns) {
      const matches = msg.match(pattern);
      if (matches) constraints.push(...matches);
    }
  }
  return [...new Set(constraints)].slice(0, 10);
}

export function shouldCompress(stateMessages: string[], maxTokens: number): boolean {
  const totalChars = stateMessages.reduce((sum, m) => sum + m.length, 0);
  const estimatedTokens = estimateTokenCount(String(totalChars));
  return estimatedTokens / maxTokens >= COMPRESSION_THRESHOLD;
}

export function assembleCompressedContext(
  systemPrompt: string,
  knowledgeInjection: string,
  summary: string | null,
  tailMessages: string[]
): string {
  const parts: string[] = [systemPrompt];
  if (knowledgeInjection) parts.push(knowledgeInjection);
  if (summary) parts.push(`[Context Summary]\n${summary}`);
  parts.push(...tailMessages);
  return parts.join("\n\n---\n\n");
}
```

- [ ] **Step 3: 接入 Blueprint**

在 `autonomous-blueprint.ts` 的 `cross_review` 或 `validate_result` 节点中，检查上下文使用量，达到 65% 时触发压缩，调用 `extractConstraints` 和 `assembleCompressedContext`。

- [ ] **Step 4: 记录压力日志**

```typescript
function logPressure(threadId: string, fillRatio: number, action: string, db: DatabaseSync) {
  db.prepare(
    `INSERT INTO pressure_log (thread_id, fill_ratio, action) VALUES (?, ?, ?)`
  ).run(threadId, fillRatio, action);
}
```

- [ ] **Step 5: 验证**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add server/context-compressor.ts server/agent-platform/autonomous-blueprint.ts server/persistence/sqlite-schema.sql
git commit -m "feat: WBC context compression — 65% threshold, constraint extraction, pressure logging"
```

---

### Task 5: 决策摘要自动生成

**Files:**
- Create: `server/decision-summarizer.ts`
- Modify: `server/decision-api.ts`

**Interfaces:**
- Produces: `summarizeDecision(result: DecisionRoomResult, locale: string): DecisionSummary`

- [ ] **Step 1: 实现摘要生成器**

创建 `server/decision-summarizer.ts`:

```typescript
import type { DecisionRoomResult } from "../src/lib/domain";
import { writeDecisionSummary } from "../src/lib/knowledge-store";
import { resolveDataDir } from "../src/lib/knowledge-index";
import { rebuildIndex } from "../src/lib/knowledge-index";
import { inferDecisionDomain } from "../src/lib/model-reputation";

export function summarizeDecision(result: DecisionRoomResult, question: string, locale: string) {
  const verdict = result.verdict;
  const winner = verdict.rankedProposals[0];
  const selectedProposal = result.proposals.find(p => p.id === verdict.selectedProposalId);

  const body = [
    `# Decision: ${verdict.finalRecommendation.split(".")[0]}`,
    "",
    "## 选择",
    verdict.finalRecommendation,
    "",
    "## 关键权衡",
    ...verdict.rankedProposals.slice(0, 3).map(p =>
      `- ${p.proposalId}: Quorum ${p.quorumScore}`
    ),
    "",
    "## 分歧点（未解决）",
    ...(verdict.preMortem?.slice(0, 3).map(p => `- ${p}`) ?? ["- 无显著分歧"]),
    "",
    "## 假设账本",
    ...verdict.assumptionLedger.map(a =>
      `- [${a.riskLevel.toUpperCase()}] ${a.assumption}`
    )
  ].join("\n");

  return {
    date: new Date().toISOString(),
    question,
    verdict: selectedProposal?.proposalId ?? "unknown",
    quorumScore: winner?.quorumScore ?? 0,
    domain: inferDecisionDomain(question, { productStage: "mvp" } as any),
    locale,
    body
  };
}

export function persistDecisionSummary(result: DecisionRoomResult, question: string, locale: string): string {
  const summary = summarizeDecision(result, question, locale);
  const dir = resolveDataDir();
  const path = writeDecisionSummary(summary, dir);
  rebuildIndex(dir);
  return path;
}
```

- [ ] **Step 2: 接入决策 API**

修改 `server/decision-api.ts` — 在决策完成（`handleApiRequest` 中 Decision Room 路径）后调用 `persistDecisionSummary`:

```typescript
import { persistDecisionSummary } from "./decision-summarizer";

// 在 decision result 生成后:
if (result) {
  persistDecisionSummary(result, question, locale).catch(() => {
    // 静默失败 — 摘要写入是 best-effort
  });
}
```

- [ ] **Step 3: 验证**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add server/decision-summarizer.ts server/decision-api.ts
git commit -m "feat: decision summary auto-generation → decisions/*.md"
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
# 设置数据目录并运行一次决策
QUORUMMIND_DATA_DIR=~/.quorummind npm run dev

# 检查文件生成
ls ~/.quorummind/
ls ~/.quorummind/decisions/
cat ~/.quorummind/.index.json

# 设置 SQLite 并验证检查点持久化
QUORUMMIND_SQLITE_PATH=.quorummind/quorummind.db npm run server
```
