# QuorumMind Harness 工程缺口补齐设计

> 状态: 设计确认 | 日期: 2026-06-21

## 背景

基于 Harness 工程 10 项实践框架诊断，QuorumMind 已覆盖 7/10。需补齐两个关键缺口：

| # | 实践 | 当前 | 目标 |
|---|------|------|------|
| 4 | 子Agent集群 (Swarm) | ❌ 顺序执行 | Orchestrator-Worker 五阶段管线 |
| 10 | 垃圾回收Agent | ❌ | 自动清理过期数据 + 熵增对抗 |

---

## 一、Orchestrator-Worker 子Agent集群

### 目标架构

```
runLiveDecisionRoom() — Orchestrator
│
├─ Phase 1: Dispatch Workers
│   Orchestrator: 分析问题, 确定需要的 Worker 角色 (fast=3, deep=5)
│   Worker 1 → generateLiveProposal(principal_architect)
│   Worker 2 → generateLiveProposal(sre_reviewer)
│   Worker 3 → generateLiveProposal(security_reviewer)
│   Worker 4 → generateLiveProposal(cost_engineer)
│   Worker 5 → generateLiveProposal(pragmatic_builder)
│   每个 Worker 独立调用 LLM, 独立接收 skills + knowledge injection
│
├─ Phase 2: Validate
│   Validator: Schema 校验 (Zod) + 去重检查 (文本相似度 >80% 告警) + 维度覆盖检查
│   不合格的 Worker 输出 → 退回重做 (最多 1 次)
│
├─ Phase 3: Cross-Critique (Critic Round)
│   Worker A 盲审 Worker B/C/D/E 的提案 (Blind Review)
│   Worker B 盲审 Worker A/C/D/E 的提案
│   ...5×4 = 20 次 Critic 调用
│
├─ Phase 4: Revise
│   每个 Worker 接收所有对自己提案的 Critic 反馈
│   生成修订版提案 (version: "revised")
│
└─ Phase 5: Finalize
│   评分 (Borda/Bayesian/TOPSIS/Monte Carlo/AHP)
│   生成 ADR + 决策摘要
│   写入 decisions/*.md + 更新 KNOWLEDGE.md
```

### 角色契约

| 角色 | 输入 | 输出 | 失败处理 |
|------|------|------|---------|
| Worker | `{question, context, role, skills}` | `Proposal` | 回退到 demo agent |
| Validator | `Proposal[]` | `{passed: Proposal[], failed: {proposal, reason}[]}` | 记录到 trace |
| Critic | `{blindProposals, reviewerRole}` | `Critique` | 回退到 demo critique |

### 改动文件

只改 `server/live-agents.ts` 中的 `runLiveDecisionRoom` 函数。增加约 80 行编排逻辑。函数签名不变。Worker 顺序调用（非真并行），但流程被显式建模为五阶段管线。

---

## 二、垃圾回收 Agent

### 职责

新建 `server/garbage-collector.ts`，独立脚本，约 60 行。

```
gcAgent.run()
│
├─ 1. 决策归档
│   扫描 ~/.quorummind/decisions/*.md
│   超过 90 天 → 移到 decisions/archive/
│   超过 180 天 → 删除
│
├─ 2. 检查点清理
│   langgraph_checkpoints WHERE created_at < now - 7 days
│   → DELETE
│
├─ 3. 压力日志轮转
│   pressure_log 保留最近 1000 条, 其余 DELETE
│
├─ 4. 声誉反馈衰减
│   reputation_feedback:
│     > 60 天 → confidence *= 0.5
│     > 120 天 → DELETE
│
└─ 5. 输出报告 (stdout)
    "[gc] archived 3 decisions, cleaned 12 checkpoints,
          rotated 45 pressure logs, decayed 8 feedbacks"
```

### 运行方式

```bash
npm run gc    # tsx server/garbage-collector.ts
```

手动或 cron 触发，不侵入现有代码。
