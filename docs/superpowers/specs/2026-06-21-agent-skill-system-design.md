# QuorumMind Agent Skill 系统设计

> 状态: 设计确认 | 日期: 2026-06-21 | 基于: Claude Code SKILL.md 格式参考

## 概述

为 QuorumMind 的 5 位专家 Agent（Principal Architect / SRE Reviewer / Security Reviewer / Cost Engineer / Pragmatic Builder）设计一套动态技能（Skill）系统。Agent 可以在决策运行时按需加载领域技能，增强推理质量和知识深度。

---

## Skill 文件格式

```markdown
---
name: tenant-isolation
description: 多租户数据隔离方案评估 — shared tables vs schema-per-tenant vs database-per-tenant
domain: technical_architecture
roles: [principal_architect, security_reviewer, sre_reviewer]
triggers: [tenant, postgresql, schema-per-tenant, shared-tables, 多租户, 隔离]
inject: decision_room
---

# 多租户数据隔离评估框架

## 分析维度
...
```

| 字段 | 类型 | 作用 |
|------|------|------|
| `name` | string | 唯一标识，Agent 报告引用了哪个技能 |
| `description` | string | 一句话描述，Agent 判断是否相关 |
| `domain` | DecisionDomain | 所属领域，系统自动匹配 |
| `roles` | AgentRole[] | 哪些角色可以加载（`"all"` 表示所有角色） |
| `triggers` | string[] | 关键词列表，自动粗筛用 |
| `inject` | "decision_room" \| "blueprint" \| "both" | 在哪个工作区生效 |
| 正文 | markdown | 技能内容，注入 Agent 的 system prompt |

### 存储位置

```
~/.quorummind/skills/
  tenant-isolation.md
  service-decomposition.md
  cost-modeling-aws.md
  owasp-top10.md
  compliance-gdpr.md
  ...
```

与 `~/.quorummind/KNOWLEDGE.md` 同目录树下，职责分离——知识记忆是"过去学了什么"，技能是"怎么分析问题"。

---

## 发现与匹配机制

### 触发方式：混合模式

- **系统自动粗筛**：根据问题领域 + 关键词，从全部技能中筛选 3-6 个候选
- **Agent 自主选择**：LLM 从候选清单中选择 0-3 个需要的技能

### 第一层：自动粗筛（系统负责）

```typescript
function matchSkills(question: string, domain: string, agentRole: string): SkillMeta[] {
  const all = loadAllSkills();
  const tokens = question.toLowerCase().split(/\s+/);

  return all
    .filter(s => s.roles.includes(agentRole) || s.roles.includes("all"))
    .filter(s => s.domain === domain || s.domain === "all")
    .filter(s => s.triggers.some(t => tokens.includes(t)))
    .slice(0, 6);
}
```

### 第二层：Agent 选择（LLM 负责）

注入候选清单（仅名称+描述，无正文）到 system prompt：

```
## 可用技能（按需调用）

1. **tenant-isolation** — 多租户数据隔离方案评估 (匹配: tenant, postgresql)
2. **cost-modeling** — 云基础设施成本建模 (匹配: mvp, cost)
...
选择 0-3 个最能增强你分析的技能，回复中注明 "skills_used": ["name1", "name2"]
```

### 第三层：正文加载

Agent 选定后，系统读取技能正文，拼接到 prompt 中。

### 缓存

- **技能索引**：启动时加载，存 `Map<name, SkillMeta>`
- **技能正文**：按需读取，LRU 缓存（最多 20 个）
- **匹配结果**：同 `question + agentRole` 缓存 5 分钟

---

## 与 Agent 工作流集成

### Decision Room 集成点

```
runDecisionRoom / runLiveDecisionRoom
│
├── 1. generateProposal()
│       ↓ 提案前 → 粗筛技能 → Agent选择 → 加载正文 → 注入prompt
│
├── 2. generateCritique()
│       ↓ 复用提案阶段的技能选择 + 注入盲审相关技能
│
├── 3. reviseProposal()
│       ↓ 保持原技能 + 根据 critiques 决定是否额外加载
│
└── 评分/ADR → 不涉及技能
```

### Prompt 注入位置

```
┌──────────────────────────────────┐
│ 1. Agent 角色指令 (已有)           │
│ 2. 知识注入 (knowledge-inject)    │
│ 3. 技能正文 ← 新增                 │
│ 4. 任务指令 (已有)                 │
└──────────────────────────────────┘
```

### 预算控制

| 约束 | 值 |
|------|-----|
| 候选清单上限 | 6 个 |
| Agent 最大选择 | 3 个 |
| 单个技能最大长度 | 2000 字符 (~500 tokens) |
| 技能占 system prompt 上限 | 30%（与知识注入共享） |

### 追踪

Agent 回复中的 `"skills_used"` 记录到 `DecisionRoomResult` 和 Provider trace，用于审计和技能质量反馈。

---

## 文件清单

| 操作 | 文件 | 用途 |
|------|------|------|
| 新建 | `~/.quorummind/skills/` | 技能文件目录 |
| 新建 | `src/lib/skill-loader.ts` | 技能发现 + 粗筛 + 缓存 |
| 新建 | `src/lib/skill-inject.ts` | Prompt 注入逻辑 |
| 修改 | `server/live-agents.ts` | 提案/评审/修订时调用技能系统 |
| 修改 | `src/lib/demo-agents.ts` | Demo 模式下的技能注入 |
| 新建 | `~/.quorummind/skills/tenant-isolation.md` | 示例技能 |
| 新建 | `~/.quorummind/skills/service-decomposition.md` | 示例技能 |

## 实现顺序

1. **Skill 文件格式 + 加载器** — `skill-loader.ts`：解析 frontmatter、建立索引、实现粗筛
2. **Skill 注入器** — `skill-inject.ts`：构建候选清单 prompt、加载正文、拼接到 system prompt
3. **集成到 live-agents.ts** — 提案/评审/修订三个阶段接入技能系统
4. **示例技能** — 创建 3-5 个初始技能文件（tenant-isolation、service-decomposition、cost-modeling、owasp-top10）
