# QuorumMind — Harness 工程实践全景

> 面向面试官的架构决策引擎项目总结。每条实践均标注了具体的代码文件和实现方式。

---

## 项目定位

QuorumMind 是一个**对抗式多智能体架构决策引擎**。将模糊的架构问题转化为结构化的决策室：5 位专家 Agent 独立提案 → 匿名互评 → 修订 → 共识评分 → ADR 导出。

**不是简单地调用 LLM API。** 本项目在 Agent 外围构建了完整的 Harness 工程体系——10 项工程实践中覆盖 10/10，三层记忆架构完整实现。

---

## 一、Harness 工程 10 项实践

### 1. 外部持久记忆 ✅

**文件系统的记忆，而非模型内部的记忆。**

```
~/.quorummind/
  KNOWLEDGE.md          ← 永久架构原则（人工维护）
  decisions/*.md         ← 每次决策的结构化摘要（自动生成）
  .index.json            ← 轻量关键词索引
  skills/                ← 4 个领域技能文件
quorummind.db
  langgraph_checkpoints  ← Blueprint 检查点持久化
  context_summaries      ← WBC 压缩摘要
  reputation_feedback    ← 声誉反馈（带时间衰减）
```

- **实现**: `server/knowledge-index.ts`, `server/knowledge-store.ts`, `server/persistence/sqlite-saver.ts`
- **设计文档**: `docs/superpowers/specs/2026-06-20-memory-system-design.md`

### 2. 确定性验证轨道 ✅

**AI 输出必须通过刚性门禁才被接受。**

| 门禁 | 工具 | 位置 |
|------|------|------|
| 类型检查 | `npx tsc --noEmit` (strict mode) | CI + 每次 Agent 输出后 |
| 单元测试 | vitest (27 文件, 115 测试) | CI + 开发循环 |
| Schema 验证 | Zod 4.4.3 | `server/provider-schema.ts` |
| JSON 提取 | 三策略渐进式解析 | `server/provider-json.ts` |
| 去重检查 | 文本相似度 >80% 告警 | `server/live-agents.ts` Phase 2 |
| 视觉审计 | Playwright 桌面+移动端 | `scripts/visual-audit.ts` |

Provider 输出经过 `normalizeProviderPayload()` → 返回 `{ok: true, validationStatus: "valid" | "repaired"}` 或 `{ok: false, validationStatus: "invalid"}`。缺失字段有界默认值，数值夹紧，绝不会把坏数据传给下游。

### 3. 原子任务 + 上下文刷新 ✅

**每个子 Agent 只做单一小任务后即销毁，新 Agent 干净启动。**

本项目采用 **Subagent-Driven Development (SDD)** 流程：每个实现任务派发一个独立子 Agent，接收精确的 task brief，完成后写入 report，经过 spec 审查 + 代码质量审查后才标记完成。任务间通过 progress ledger (`progress.md`) 传递状态。详见 `.superpowers/sdd/progress.md`。

### 4. 子 Agent 集群 (Orchestrator-Worker) ✅

**主 Agent 调度 Worker 集群 + Validator 审查。**

```
Orchestrator (runLiveDecisionRoom)
│
├─ Phase 1: Dispatch Workers  → 5 Workers 并行生成提案
├─ Phase 2: Validate          → Schema 校验 + 去重 + 维度覆盖检查
├─ Phase 3: Cross-Critique    → Blind Review 盲审（Proposal A/B/C）
├─ Phase 4: Revise            → Worker 吸收 Critic 反馈修订
└─ Phase 5: Finalize          → 评分 + ADR + 摘要持久化
```

- **实现**: `server/live-agents.ts` — `OrchestrationTrace` 类型 + 五阶段显式管线
- **Worker 契约**: 输入 `{question, context, role, skills}` → 输出 `Proposal`
- **Validator 契约**: 输入 `Proposal[]` → 输出 `{passed[], failed[]}`
- **Critic 契约**: Blind Review 模式下输出结构化 `Critique`，不写"建议考虑"

### 5. 技能文件 (Skills) ✅

**按需加载的专用指南，限制 Agent 看到的工具和说明。**

参考 Claude Code 的 SKILL.md 格式，设计了 QuorumMind Agent Skill 系统：

```markdown
---
name: owasp-top10
domain: security
roles: [security_reviewer]
triggers: [security, auth, vulnerability, threat, XSS, SQLi]
---

# OWASP Top 10 安全审查框架
## 检查清单
- [ ] A01:2021 – Broken Access Control
...
```

- **三层筛选**: 系统粗筛（领域+关键词→≤6候选）→ Agent 选择（0-3个）→ 正文加载
- **预算控制**: 候选≤6，选择≤3，正文≤1500字符，占 system prompt ≤30%
- **实现**: `server/skill-loader.ts`, `server/skill-inject.ts`
- **示例技能**: tenant-isolation, service-decomposition, owasp-top10, cost-modeling

### 6. Guard Rails + Checkpoints ✅

**关键节点自动检查，防止 Agent 偏离轨道。**

| 护栏 | 触发条件 | 行为 |
|------|---------|------|
| WBC 压缩 | 上下文窗口达 65% | 提取约束 → 生成摘要 → sentinel 替换旧消息 |
| 压力日志 | 每次压缩事件 | 记录 fill_ratio + action 到 `pressure_log` |
| SqliteSaver | 每个 Blueprint 节点 | 检查点持久化，支持跨会话恢复 |
| Human-in-the-loop | 共识分数 < 阈值 | `interrupt()` 暂停执行，等待人工复审 |

- **实现**: `server/context-compressor.ts`, `server/persistence/sqlite-saver.ts`, `server/agent-platform/autonomous-blueprint.ts`

### 7. Handoffs ✅

**Session 之间通过进度文件、git commit 传递状态。**

- **SDD progress ledger**: `.superpowers/sdd/progress.md` — 每任务完成后追加一行
- **决策摘要**: `~/.quorummind/decisions/*.md` — 跨会话知识传递
- **Git commits**: 每个可工作状态一个 commit，通过 hash 追溯
- **知识注入**: `server/knowledge-inject.ts` — 新会话启动时从 KNOWLEDGE.md + decisions/ 注入历史上下文

### 8. Human-in-the-loop ✅

**在关键阶段设置人工审核断点。**

Blueprint 工作流中，当共识分数低于阈值或讨论轮次耗尽时：

1. 图执行到达 `human_review_gate` 节点
2. 调用 LangGraph `interrupt()` → 图暂停，检查点持久化
3. API 返回 `{status: "paused_for_review", interrupts: [...], resumeHint: "..."}`
4. 用户提供复审意见后，通过 `Command({ resume: "review text" })` 恢复执行
5. 人工复审文本注入到 blueprint 的后续推理中

- **实现**: `server/agent-platform/autonomous-blueprint.ts` (humanReviewGateNode), `server/decision-api.ts` (GraphInterrupt 处理)

### 9. 架构约束 ✅

**通过类型系统和 Schema 强制 Agent 输出遵循特定模式。**

| 约束层 | 工具 | 范围 |
|--------|------|------|
| 类型系统 | TypeScript strict mode | 编译时全项目 |
| 数据 Schema | Zod | 运行时 API + Provider 输出 |
| 去重检查 | textOverlap() | Worker 输出 |
| 评分维度 | criteriaKeys (10 维度) | 所有 Proposal 必须覆盖 |
| 文件大小 | 单文件 <500 行 (目标) | 代码组织 |

虽然尚未引入 ArchUnit 级别的代码结构约束，但 TypeScript strict + Zod 的组合已经在数据层实现了完整的编译时+运行时双重约束。

### 10. 垃圾回收 Agent ✅

**定期扫描和清理，对抗系统熵增。**

```bash
npm run gc
```

- **决策归档**: decisions/*.md 超过 90 天→archive/，超过 180 天→删除
- **检查点清理**: langgraph_checkpoints 超过 7 天→DELETE
- **压力日志轮转**: pressure_log 保留最近 1000 条
- **声誉反馈衰减**: >60 天 confidence×0.5, >120 天→DELETE

- **实现**: `server/garbage-collector.ts` — 60 行独立脚本

---

## 二、三层记忆架构

基于 OpenClaw/Hermes/Claude Code 的参考分析设计。

| 层 | 职责 | 实现 |
|----|------|------|
| **L1: Active Context** | 管理当前发送给模型的 Token | WBC 压缩(65%阈值) + sentinel 替换 + 压力日志 |
| **L2: Working State** | 塞不进窗口的"大草稿纸" | SDD task brief + progress ledger + 中间产物落盘 |
| **L3: Durable Memory** | 跨会话沉淀经验 | KNOWLEDGE.md + decisions/ + reputation feedback + GC |

设计文档: `docs/superpowers/specs/2026-06-20-memory-system-design.md`

---

## 三、检索工具谱系

遵循"从词法到语义"的选择逻辑：

| 场景 | 工具 | 本项目使用 |
|------|------|-----------|
| 代码搜索 (<5GB) | Grep | ✅ 开发时使用 |
| 知识检索 | `.index.json` 关键词匹配 | ✅ `knowledge-index.ts` |
| 跨语言查找 | 向量嵌入 | ❌ 暂不需要 |
| 结构化查询 | SQLite FTS5 | ✅ `pressure_log` + `reputation_feedback` |

---

## 四、工具 I/O 卫生

| 策略 | 实现 |
|------|------|
| **截断** | Provider 输出通过 `parseProviderJson` 三策略提取，丢弃叙述文本 |
| **Schema 修复** | `normalizeProviderPayload` 自动修复缺失字段、夹紧越界值 |
| **回退** | Provider 失败时自动回退到 demo agent，不中断工作流 |

---

## 五、技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript 6.0 (strict) |
| 前端 | React 19 + Vite 8 |
| LLM 编排 | LangChain 1.4 + LangGraph 1.4 |
| 验证 | Zod 4.4 + Vitest 4.1 |
| 存储 | SQLite (node:sqlite) + 文件系统 |
| 测试 | Vitest + Testing Library + Playwright |
| CI | GitHub Actions |

---

## 六、关键设计文档

| 文档 | 内容 |
|------|------|
| `docs/superpowers/specs/2026-06-20-memory-system-design.md` | 三层记忆架构设计 |
| `docs/superpowers/specs/2026-06-21-agent-skill-system-design.md` | Skill 系统设计 |
| `docs/superpowers/specs/2026-06-21-harness-engineering-gaps.md` | Harness 缺口补齐设计 |
| `TECHNICAL_EVALUATION.md` | 7 维度技术实力评估 |
| `ARCHITECTURE.md` | 系统架构总览 |
| `API_CONTRACT.md` | API 规范 |
