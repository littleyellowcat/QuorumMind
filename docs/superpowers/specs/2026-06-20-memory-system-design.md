# QuorumMind 记忆系统设计

> 状态: 设计确认 | 日期: 2026-06-20 | 基于: OpenClaw + Hermes + Claude Code 参考分析

## 参考系统分析

### OpenClaw — 四层计算机存储类比

```
Bootstrap Files (硬盘) → Session Transcript (日志) → Context Window (RAM) → Retrieval Index (搜索引擎)
```

核心洞察：明确哪一层记忆出了问题，就能解决 90% 的"Agent 忘事"问题。

### Hermes — 1 窗口 + 3 数据源 + 1 索引

- 上下文窗口是唯一的推理入口
- 三类数据源拼入工作集送给模型
- 索引只在数据源 1 中按需搜索
- 关键创新：Write-Before-Compaction（压缩前先提取事实）

### Claude Code — 五层配置收敛

Enterprise → User → Project → Rules(Glob) → Local
越往下越精细、管理越灵活。

---

## 架构决策

选择**轻量混合架构**：文件层做知识记忆（透明、Git 友好），SQLite 做工作记忆（实时压缩、检查点）。

### 为什么不是纯文件或纯 SQLite

| 方案 | 问题 |
|------|------|
| 纯文件 (类 OpenClaw) | 文件多了检索困难；压缩摘要不适合文件存储 |
| 纯 SQLite (类 hermes-memory) | 知识原则不透明、不可 Git 追踪、人类难以直接审查 |
| **混合（采用）** | 知识归文件，工作归数据库，各得其所 |

---

## 顶层架构

```
┌─────────────────────────────────────────────────────────┐
│                   QuorumMind 记忆系统                      │
└──────────────────────────┬──────────────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    ▼                      ▼                      ▼
┌──────────┐    ┌──────────────────┐    ┌──────────────────┐
│ 注入层    │    │   知识记忆        │    │   工作记忆        │
│ Inject   │    │   文件系统        │    │   SQLite          │
└──────────┘    └──────────────────┘    └──────────────────┘
```

| 层 | 存储 | 生命周期 | 内容 |
|----|------|---------|------|
| 知识记忆 | `~/.quorummind/` 文件系统 | 跨会话持久 | 架构原则、团队约束、决策模式 |
| 工作记忆 | `quorummind.db` SQLite | 会话内 + 检查点持久 | LangGraph 状态、上下文摘要、压缩快照 |
| 注入层 | 逻辑层（无独立存储） | 会话启动 + 触发时 | 检索 + 拼接 system prompt |

---

## 知识记忆：文件层

### 目录结构

```
~/.quorummind/
├── KNOWLEDGE.md              ← 核心：永久架构原则（人工维护）
├── .index.json               ← 轻量检索索引（自动更新）
└── decisions/                ← 决策存档（自动写入）
    ├── 2026-06-20-tenant-isolation.md
    └── 2026-06-21-service-split.md
```

### KNOWLEDGE.md 格式

Markdown 文件，YAML frontmatter 记录更新时间。按标题层级组织：
- `## 团队约束` — 不可变的团队背景
- `## 架构偏好` — 从多次决策中归纳的模式
- `## 已验证的洞察` — 经实践检验的原则
- `## 废弃的假设` — 过去认为正确但已被推翻

人工维护为主，决策摘要自动生成 `[待审核]` 候选条目。

### decisions/*.md 格式

每次 Decision Room 运行后自动生成。YAML frontmatter 承载结构化元数据（检索用），Markdown 正文承载人类可读的决策叙述。每个文件 ≤ 2KB。

### .index.json

轻量关键词索引。每次文件写入后自动重建。提供标题→文件+行号映射，用简单关键词匹配做召回，不引入嵌入模型。

---

## 工作记忆：SQLite 层

### Schema

```sql
CREATE TABLE context_summaries (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  summary_type TEXT NOT NULL CHECK(summary_type IN ('incremental','consolidated')),
  content TEXT NOT NULL,
  compressed_at TEXT NOT NULL,
  token_count_before INTEGER,
  token_count_after INTEGER
);

CREATE TABLE checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  checkpoint_data BLOB NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_id)
);

CREATE TABLE pressure_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  fill_ratio REAL NOT NULL,
  action TEXT NOT NULL
);
```

### 压缩策略：简化的 WBC (Write-Before-Compaction)

触发条件：上下文窗口估算达到 65%。

**Phase 1 — 提取关键约束（无需 LLM）**：扫描历史消息，提取硬约束、数值、决策理由，写入 incremental 摘要。

**Phase 2 — 生成结构化摘要（辅助 LLM 调用）**：生成 JSON 摘要覆盖 Goal / Constraints / Progress / Key Decisions / Remaining Dissent，写入 consolidated 摘要。

**Phase 3 — 装配上下文**：头部（system prompt + 知识注入）+ 中部（摘要）+ 尾部（最近 3 轮完整消息），总量控制在 50% 窗口预算内。

### 检查点持久化

用 `SqliteSaver` 替代当前 `MemorySaver`。每次蓝图节点完成自动检查点。支持 thread_id 跨会话恢复。7 天 TTL 自动清理。

---

## 注入层

会话启动时，从 `.index.json` 检索相关知识，拼入 system prompt：

- 检索匹配 domain + 关键词的知识条目（上限 8 条）
- 总注入量 ≤ system prompt 的 30%
- 注入内容包括：团队约束、历史偏好、已验证洞察

---

## 完整生命周期

```
会话启动 → 索引检索相关知识 → 注入 system prompt
    ↓
运行时 → 上下文达 65% → WBC 压缩 → 检查点持久化
    ↓
决策完成 → 生成决策摘要 → 提取候选原则 [待审核] → 更新索引
    ↓
离线 → 人工审核候选原则 → 确认/拒绝/修正
```

---

## 文件清单

| 操作 | 文件 | 用途 |
|------|------|------|
| 新建 | `~/.quorummind/KNOWLEDGE.md` | 永久知识 |
| 新建 | `~/.quorummind/.index.json` | 轻量检索索引 |
| 新建 | `~/.quorummind/decisions/*.md` | 决策摘要存档 |
| 新建 | `quorummind.db::context_summaries` | 压缩摘要 |
| 新建 | `quorummind.db::checkpoints` | LangGraph 检查点 |
| 新建 | `quorummind.db::pressure_log` | 窗口压力日志 |
| 新建 | `src/lib/knowledge-index.ts` | 索引构建/检索 |
| 新建 | `src/lib/knowledge-inject.ts` | System prompt 注入 |
| 新建 | `server/context-compressor.ts` | WBC 压缩 |
| 新建 | `server/checkpoint-store.ts` | SqliteSaver 封装 |
| 修改 | `server/decision-api.ts` | 决策完成时写摘要 |
| 修改 | `server/agent-platform/autonomous-blueprint.ts` | 接入压缩 + 持久化检查点 |

---

## 实现顺序

1. **Phase 1 — 检查点持久化**（1-2 天）：MemorySaver → SqliteSaver，最小改动，立即可用
2. **Phase 2 — 知识记忆文件层**（1 天）：KNOWLEDGE.md + decisions/ + .index.json 基础结构
3. **Phase 3 — 注入层**（1 天）：检索 + 拼入 system prompt
4. **Phase 4 — 上下文压缩**（2-3 天）：WBC 三阶段实现
5. **Phase 5 — 决策摘要自动生成**（1 天）：决策完成时写 decisions/*.md
