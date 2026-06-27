# QuorumMind 真实模型质量与 Agent Loop 审计

日期：2026-06-24

## 结论摘要

本轮把离线 AgentEval、系统质量审计、Decision live audit pool、Blueprint live audit pool 都扩展到 30 条级别；离线与 mock live 质量门通过，但真实 API 小样本结果不理想：provider 确实被调用，当前没有产出可用 live verdict / live trace，最终仍依赖确定性兜底。

QuorumMind 已经使用了近两年 Agent 系统里很主流的 loop 技术：LangGraph 状态图、有界共识循环、Planner/Executor/Critic、Memory Agent、Supervisor Agent、工具权限策略、Evaluator-Optimizer、Human-in-the-loop、checkpoint thread、route decision trace、bounded ReAct tools。更准确的定位是：**LangGraph 编排的有界自主多 Agent 工作流平台**，不是无约束的 multi-agent society。

## 测试集扩展

| 测试池 | 当前规模 | 覆盖说明 |
| --- | ---: | --- |
| AgentEval JSONL | 30 条 | 11 条 Decision、10 条 Blueprint、9 条 Agent Blueprint |
| 系统质量审计 | 30 条 | 中文/英文、Fast/Deep/Red-team、决策题、开放式方案题、相近产品/流程/安全/成本题 |
| Decision 真实 API full 池 | 30 条 | smoke / expanded / full 分层，full 已不是旧的 12 条 |
| Blueprint 真实 API 池 | 30 条 | 蓝图室与 Agent Blueprint 的 live provider 质量回归池 |

新增覆盖的代表场景包括 Kubernetes 迁移、API 安全闸门、合同评审 Agent、RAG 治理、安全事件响应、作品集生成、多 Agent 循环治理、数据质量平台、客服 Agent、定价实验和运维 runbook。

## 已运行结果

| 验证命令/报告 | 结果 | 判读 |
| --- | --- | --- |
| `npm run agent:eval:full` | 30/30 passed，平均分 96.3 | 离线 AgentEval 质量门稳定，轨迹、工具/Schema、协作和成本预算均通过 |
| `npm run quality:audit` | 30 cases，综合通过率 100% | 确定性工作流、中文本地化、导出和 mock live schema 路径通过 |
| Decision live 小样本 | 1/30，overall 0%，fallback 100% | 真实 provider 被调用，但 live verdict 生成率 0%，最终来自确定性兜底 |
| Blueprint live 小样本 | 1/30，overall 0%，fallback 100% | 真实 provider 被调用，但可用 live trace 0%，最终来自确定性兜底 |

真实 API 小样本的关键指标：

| 项目 | Decision live | Blueprint live |
| --- | ---: | ---: |
| 配置 provider | model_gateway, deepseek | model_gateway, deepseek |
| 真实调用率 | 有调用 | 100% |
| live verdict / usable trace | 0% | 0% |
| JSON 解析率 | 44% | 0% |
| Schema 可用率 | 44% | 0% |
| 中文通过率 | 0% | 0% |
| 相关性通过率 | 100% | 100% |
| 兜底率 | 100% | 100% |

判读：这说明系统的 provider trace、fallback 透明化和质量门是有效的，因为它没有把不可用真实输出伪装成真实裁决。但真实 provider prompt/schema 适配仍是当前最大质量风险。

## Agent Loop 技术核查

代码证据主要在 `server/agent-platform/autonomous-blueprint.ts`、`server/agent-platform/autonomous-blueprint.test.ts`、`API_CONTRACT.md` 和 `docs/quality/2026-06-18-agent-platform-foundation.md`。

已经落地的 loop / agentic pattern：

| 技术 | 项目实现 | 价值 |
| --- | --- | --- |
| LangGraph 状态图 | `StateGraph` 节点编排，从 `route_intent` 到 `finalize` | 把流程从一次函数调用升级为可观测状态机 |
| 有界共识循环 | `validate_result -> revise_discussion -> critic_agent -> supervisor_agent -> validate_result` | 共识不足时继续修订，并在每轮修订后重新批判和主管判断 |
| Planner Agent | `planner_agent` 生成 `taskTree` | 把用户目标拆成任务、依赖、负责 agent、工具和验收标准 |
| Executor Agent | `executor_agent` 生成 `executorActions` | 按权限策略执行本地受控任务，外部/高风险动作只做预备 |
| Critic Agent | `critic_agent` 生成 `criticReviews` | 检查任务覆盖、权限边界、共识分、weak 项和延后采纳 |
| Memory Agent | `memory_agent` 生成 `memoryEvents` | 维护 run/thread 摘要、knowledge injection 和 checkpoint 证据 |
| Supervisor Agent | `supervisor_agent` 生成 `supervisorDecisions` | 决定继续、暂停人工复审或收敛，并保留原因 |
| 工具权限系统 | `toolPermissions` 标记 `auto` / `requires_human` / `blocked` | 覆盖本地工具、live provider 调用和高风险外部动作，避免自主流程静默越权 |
| 共识阈值 | 默认 80，`maxConsensusRounds` 控制最多轮次 | 兼顾质量、成本和耗时 |
| Evaluator-Optimizer | `validate_result` 评估，`revise_discussion` 优化 | 贴近当前常见的反思/修订式 Agent 结构 |
| Human-in-the-loop | `human_review_gate` 和 `humanReviewNote` | 预算耗尽或共识不足时交给人工复审 |
| Checkpoint / thread | `MemorySaver`，可选 `SqliteSaver`，支持 `threadId` | 支持稳定线程和未来 resume |
| Route decision trace | `routeDecisions` 记录为什么 finalize / revise / human review | 让循环过程可审查 |
| Bounded ReAct | `react_toolbox` 只选择受控 LangChain tools | 有 ReAct 思想，但避免无界工具调用 |
| Runtime limits | `runtimeLimits`、recursion limit、轮次预算 | 防止 agent loop 失控 |

这部分是项目亮点：它不是把“循环”写成 while true，而是把循环原因、终止条件、预算和人工复审都变成可展示的运行证据。

## 多 Agent 到底算不算真正 Agent

客观判断：

| 层级 | 当前状态 | 说明 |
| --- | --- | --- |
| 多模型/多角色协作 | 已具备 | Decision 和 Blueprint 都有独立提案、互评、质询、修订、聚合 |
| 工作流 Agent | 已具备 | LangGraph 控制节点、循环、checkpoint、预算和终止 |
| 有界自主 Agent | 已具备 | Planner/Executor/Critic/Memory/Supervisor 和工具权限系统已接入 |
| 有界 ReAct Agent | 部分具备 | 节点内部有 thought/action/observation 风格的受控工具步骤 |
| 真实 LLM Agent 节点 | 部分接入但质量未通过 | live provider 被调用，但本轮可用 trace/verdict 为 0% |
| 完全无约束自主 Agent | 暂不应这样宣称 | 工具集合仍受控，高风险动作需人工确认，真实 LLM agent 节点质量仍需修复 |

推荐对外表述：

> QuorumMind 是一个 LangGraph 编排的有界自主多 Agent 工作流平台，落地了多 Agent Debate、Planner-Executor-Critic、Memory Agent、Supervisor Agent、工具权限策略、Evaluator-Optimizer、bounded ReAct、Human-in-the-loop、checkpoint 和 AgentEval。它不是无约束自主 Agent，而是为了决策和蓝图生成场景专门设计的可审计 agentic workflow。

这个说法更稳，也更高级：它承认边界，但把真正做出来的工程能力讲清楚。

## 本轮新确认的项目亮点

- **AgentEval 工程化**：不是只看最终回答，而是同时评估响应质量、执行轨迹、工具/Schema、协作质量、延迟/Token 和可解释性。
- **真实模型来源透明**：provider 调用失败、schema 不可用、fallback 参与都会出现在报告里，避免用户误解。
- **共识循环不是装饰**：测试覆盖了达到阈值和轮次耗尽进入 `human_review_gate` 两条路径。
- **有界自主 agent 层**：Planner/Executor/Critic/Memory/Supervisor 和工具权限系统已返回可审查字段，前端可直接展示；live provider 调用和高风险外部动作也进入权限账本。
- **多算法评分层**：Borda、Bayesian weighted voting、Quorum Score、Dissent Index、Minimax Regret、TOPSIS、Monte Carlo、AHP sensitivity 和模型声誉反馈共同解释“为什么是这个结果”。
- **记忆与 checkpoint 设计**：MemorySaver/SqliteSaver、threadId、context compressor、knowledge injection、SQLite persistence 和 GC agent 形成了可继续扩展的长期运行底座。
- **Skill-based context injection**：项目内 `quorummind-*` skills 已经把决策评审、蓝图规划、共识循环、AgentEval、Live Model QA、安全和中文本地化沉淀成可复用方法论。
- **Harness 思维**：mock live、质量审计、视觉回归、API contract、fallback source transparency 和 security guard 让项目更像一个可运营系统，而不是 prompt demo。

## 当前最需要继续修的点

1. 真实 provider schema 适配：优先修 `model_gateway` / `deepseek` 的错误信息、JSON 提取、schema repair 和 provider-specific prompt。
2. live audit 分层：在 1 条样本通过前，不建议直接跑 30 条真实 API full suite。
3. LLM-as-a-Judge 抽检：离线 30 条规则评估已经够用，下一步可对 5-8 条低风险样本做主观质量 judge。
4. Agent resume：`human_review_gate` 已能记录证据，下一步可以做真正的人工输入后继续执行。
5. 在线指标：把 provider latency、token estimate、fallback rate、schema rate、loop rounds 做成趋势看板。

## 结论

当前项目的离线质量和 agentic workflow 结构已经能支撑作品集/面试表达；最需要谨慎的是“真实模型质量”这条线。现在可以说系统会调用真实 provider，但不能说真实 provider 输出已经稳定可用。准确讲法是：**真实调用链已接通，质量门发现当前 live 输出不可用，系统正确回退并透明标识来源；下一阶段重点是 live provider schema 成功率和中文可用率。**
