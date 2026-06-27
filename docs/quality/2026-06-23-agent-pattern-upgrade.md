# 2026-06-23 Agent 范式升级记录

## 目标

把 QuorumMind 的方案蓝图 Agent 从“固定图流程”补强为更清晰的混合 Agent 范式：

- 外层：LangGraph Workflow Agent，负责状态、路由、轮次、预算、checkpoint。
- 中层：Multi-Agent Debate + Critique/Revision，负责独立方案、互评、挑刺和修订。
- 内层：Evaluator-Optimizer，负责共识阈值、质量门和人工复审路由。
- 局部：Bounded ReAct Tools，只在节点内部选择受控工具，不开放无界外部工具调用。

## 本次补充

1. 新增 `route_intent` 节点
   识别用户请求类型，输出 category、route、confidence、complexity、signals 和 normalizedRequest。

2. 新增 Clarifier Agent 数据
   生成澄清问题和默认假设。当前策略是不阻塞运行：信息不足时先带假设继续，并把问题暴露给用户。

3. 新增 `react_toolbox` 节点
   记录 Thought / Action / Observation 形式的局部 ReAct 工具步骤，限制在现有本地工具内：
   - `quorummind_create_blueprint`
   - `quorummind_validate_blueprint`
   - `quorummind_advance_consensus_round`
   - `quorummind_select_next_actions`

4. 新增 Evaluator Gate
   不只看共识分，还检查：
   - 共识阈值
   - P0 backlog 可执行性
   - 评估矩阵弱项
   - 质询采纳/延后情况
   - 真实模型/兜底来源透明度

5. 前端展示升级
   Agent 运行面板现在展示：
   - 混合 Agent 范式
   - 意图路由
   - 澄清问题和默认假设
   - 局部 ReAct 工具步骤
   - Evaluator Gate 检查项

## 验证

已运行：

```bash
npm test -- --run server/agent-platform/autonomous-blueprint.test.ts
npm test -- --run server/decision-api.test.ts src/lib/api-client.test.ts
npm run build
```

结果：全部通过。

## 说明

本次没有引入新的真实模型调用，也没有把整个系统改成纯 ReAct。QuorumMind 仍然保持“可控图编排 + 多模型互评 + 质量门”的主路线，ReAct 只作为节点内受控工具选择能力。
