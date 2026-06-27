# QuorumMind 自主 Agent 平台升级记录

日期：2026-06-24

## 本轮目标

把原来的 LangGraph 有界蓝图流程继续升级，补齐 6 个更接近自主 Agent 平台的能力：

1. Planner Agent：把用户目标拆成任务树。
2. Executor Agent：根据任务选择工具并执行。
3. Critic Agent：检查执行结果。
4. Memory Agent：维护长期项目记忆。
5. Supervisor Agent：决定继续、暂停、请求人工确认。
6. 工具权限系统：区分自动执行、人工确认和禁止执行。

## 实现结果

| 能力 | 实现字段 | 实现说明 |
| --- | --- | --- |
| Planner Agent | `taskTree` | 将开放式问题拆成目标规划、记忆上下文、蓝图执行、批判检查、主管路由、最终交付 6 类任务 |
| Executor Agent | `executorActions` | 按权限策略执行本地确定性任务；高风险任务只生成计划，不静默执行 |
| Critic Agent | `criticReviews` | 检查任务覆盖、权限边界、共识阈值、weak 评估项、延后采纳项 |
| Memory Agent | `memoryEvents` | 记录 run/thread 摘要、knowledge injection、checkpoint/SQLite 写入证据 |
| Supervisor Agent | `supervisorDecisions` | 根据 Critic、权限和轮次预算判断继续、暂停人工复审或收敛 |
| 工具权限系统 | `toolPermissions` | 每个工具被标记为动作类别、风险、`auto` / `requires_human` / `blocked` 决策和原因 |

## LangGraph 路径变化

升级前的核心路径：

```text
route_intent -> understand_request -> react_toolbox -> draft_blueprint
-> cross_review -> validate_result -> revise_discussion -> validate_result -> finalize
```

升级后的核心路径：

```text
route_intent -> understand_request -> react_toolbox
-> planner_agent -> memory_agent -> executor_agent
-> draft_blueprint -> cross_review -> critic_agent -> supervisor_agent
-> validate_result -> revise_discussion -> critic_agent -> supervisor_agent
-> validate_result -> finalize
```

关键变化：每次 `revise_discussion` 后不再直接回到验证节点，而是重新经过 `critic_agent` 和 `supervisor_agent`，让循环具备“修订后再批判、再主管决策”的结构。

## API 与前端可见性

`POST /api/agent-runs/blueprint` 现在返回并在前端 Agent 平台面板中展示：

- `taskTree`
- `toolPermissions`
- `executorActions`
- `criticReviews`
- `memoryEvents`
- `supervisorDecisions`
- 原有 `consensusLoop`
- 原有 `routeDecisions`
- 原有 `toolCalls`
- 原有节点 `trace`

这样用户能看到不是“左侧输入后黑盒生成”，而是目标如何被规划、哪些工具被允许自动执行、哪些动作需要人工确认、Critic 发现了什么、Supervisor 为什么继续或暂停。

## 权限边界

当前默认策略：

| 类别 | 默认决策 | 行为 |
| --- | --- | --- |
| `read_only` | `auto` | 只读/本地确定性工具自动执行 |
| `local_file_write` | 受控 checkpoint 自动执行；用户可见导出需确认 | 区分 MemorySaver/SQLite 写入和用户可见导出 |
| `external_api_call` | `requires_human` | 外部 API、消息通知等动作需人工确认 |
| `live_model_call` | 用户选择 live 模式后本轮 `auto` | 在阶段预算、超时和 schema 质量门内执行，并记录 provider trace |
| `production_operation` | `blocked` | 部署、删除、不可逆生产动作默认禁止 |
| `paid_operation` | `blocked` | 可能扣费或产生付费影响的动作默认禁止 |

这让系统更接近自主 Agent，但不会越权变成不可控 Agent。

## 验证

本轮低成本验证：

```bash
npx vitest run server/agent-platform/autonomous-blueprint.test.ts
# 1 file, 6 tests passed

npx vitest run server/decision-api.test.ts src/lib/api-client.test.ts
# 2 files, 34 tests passed

npm run build
# passed

npm run agent:eval:full
# 30 cases, 30 passed, averageScore 96.3

npm run quality:audit
# 30 cases, allCasePassRate 100%

npm test -- --run
# 30 files, 136 tests passed
```

真实 API 没有在本轮调用。当前重点仍然是本地 agentic workflow 和 API/前端结构升级；真实 provider schema 质量应按单独 live audit 预算验证。

## 本轮补强

- live provider 调用现在会进入 `toolPermissions` 和 `executorActions`，不再只显示 6 个本地低风险工具。
- Supervisor 的 `pause_for_human` 现在会强制影响 `validate_result` 路由；当权限策略阻止高风险工具时，会进入 `human_review_gate`。
- 新增高风险动作识别：自动部署、删除、扣费、发邮件、外部写入等请求会被拆成 `task-high-risk-external-action` 并默认阻止自动执行。

## 边界说明

升级后可以更自信地说：

> QuorumMind 已从有界工作流 Agent 升级为具备 Planner/Executor/Critic/Memory/Supervisor 和工具权限系统的有界自主多 Agent 平台。

仍然不建议说成“完全无约束自主 Agent”。原因是它仍然有明确边界：

- 工具集合是受控的。
- 高风险动作不会自动执行。
- 共识循环有轮次预算。
- 真实 LLM provider 输出还需要继续通过 schema 质量门。
- 长期自动执行外部任务仍需要更完整的 resume、权限、审计和用户确认机制。
