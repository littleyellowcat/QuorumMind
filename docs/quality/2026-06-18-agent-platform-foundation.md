# QuorumMind Agent Platform Foundation

日期：2026-06-18

## 本轮目标

开始搭建 LangGraph/LangChain autonomous agent 平台，但不直接替换现有 Decision Room / Blueprint Room 主流程。第一版目标是先建立可测试的服务端编排基座。

## 已实现

- 新增服务端模块：`server/agent-platform/autonomous-blueprint.ts`
- 新增 API：`POST /api/agent-runs/blueprint`
- 新增依赖：
  - `@langchain/langgraph`
  - `@langchain/core`
  - `langchain`
  - `zod`
- 使用 LangGraph `StateGraph` 编排节点：
  - `understand_request`
  - `draft_blueprint`
  - `live_model_review`（仅在 `blueprintRuntime.executionMode=live` 时注册）
  - `cross_review`
  - `validate_result`
  - `revise_discussion`
  - `human_review_gate`
  - `finalize`
- 使用 LangChain Core tool 包装本地能力：
  - `quorummind_create_blueprint`
  - `quorummind_validate_blueprint`
  - `quorummind_advance_consensus_round`
  - `quorummind_select_next_actions`
- 新增 trace、toolCalls、consensusLoop、validation、summary、platform source 字段，避免把确定性工具输出误标成真实模型推理。
- 新增 Blueprint live trace 运行态：
  - `blueprintRuntime.executionMode` 支持 `live` / `deterministic`
  - `blueprintRuntime.maxProviderRounds` 支持 1-5 阶段 provider 预算控制
  - 蓝图 UI 默认请求 `live`
  - Fast 蓝图 live 请求会在服务端升级为 deep provider trace，确保 proposal、critique、revision、ranking、verdict 都有模型参与机会
  - API 返回 `blueprintExecution` / `run.liveModel`，记录 requested、actual、providerCalls、usableCalls、fallbackReason
  - 如果没有可用真实模型输出，UI 明确显示 `未使用真实模型，本次为确定性本地结果` 或 live fallback 说明
- Agent graph live 节点升级：
  - `understand_request` 会在 live 模式调用 provider trace runner，记录 `quorummind_live_understand_request_trace`
  - `live_model_review` 复用已生成的 provider trace，避免重复调用
  - `cross_review` 会读取可用 critique trace 作为真实模型质询证据
  - `revise_discussion` 会读取可用 revision trace 作为真实模型修订证据
  - `human_review_gate` 支持 `agentRuntime.humanReviewNote`，同一 checkpoint thread 重新运行时可把人工意见作为恢复证据
- 已把 graph 从一次性流程升级为有界循环：`validate_result -> revise_discussion -> validate_result`，直到共识分达到 80% 或可用轮次耗尽。
- 新增内存 checkpointer：LangGraph `MemorySaver`。
- 新增运行预算参数：
  - `agentRuntime.threadId`
  - `agentRuntime.maxConsensusRounds`
- 新增路由审计字段：`routeDecisions`。
- 新增终止原因字段：`terminationReason`，可区分 `threshold_met`、`round_budget_exhausted` 和 `human_review_required`。
- 新增前端实验入口：
  - 蓝图模式左侧 `Agent 运行时` 面板支持配置 `Checkpoint thread` 和 `最多讨论轮次`
  - `运行 Agent 平台` 会调用 `POST /api/agent-runs/blueprint`
  - 右侧 `Agent 平台运行` 面板展示 `MemorySaver`、`runtimeLimits`、`consensusLoop`、`routeDecisions`、`terminationReason`、`toolCalls` 和节点 `trace`
  - 前端明确标注当前 source 是 `确定性 LangChain 工具` 或 `live_model_trace_with_deterministic_synthesis`，避免把兜底输出误认为真实模型推理
  - 右侧 `蓝图模型调用` 面板按 phase 展示 provider、model、耗时和 schema 状态
  - 运行进度会提示当前蓝图阶段预计调用的模型席位；确定性模式显示不会调用真实模型
  - 新增 `蓝图过程地图`，展示共识变化、模型观点差异、贡献映射和质询采纳流
  - 新增 `历史结果对比`，同一蓝图问题重复运行后可对比 live vs deterministic 或本次 vs 上次差异
  - 新增运行成本估算：预计调用数、粗略 token 和超时窗口
- 新增前端可用性打磨：
  - `Agent 运行时` 配置写入浏览器本地存储，刷新后保留上次的 thread id 和最多讨论轮次
  - `routeDecisions` 增加 `路由路径图`，先用路径摘要展示每轮去向、共识分/阈值和路由原因，再保留详细列表
  - `human_review_gate` 触发时提供 `人工复审包` 复制动作，Markdown 内含 checkpoint thread、终止原因、共识分、路由历史、阻塞项、剩余分歧、下一步行动和复审问题
- 新增首屏体积优化：
  - `src/lib/exporters.ts` 从 App 首屏静态导入改为导出按钮点击时动态加载
  - 本地确定性 Blueprint fallback 从 App 首屏静态导入改为异常路径动态加载
  - Vite 构建产物拆成 `index`、`exporters` 和 `blueprint` chunk，原先持续存在的 500 kB chunk warning 已消除

## 当前边界

- 当前是 `bounded_server_graph`，不是完全自主 agent 平台。
- 当前 graph 已有可选真实 provider trace 节点，但最终 Blueprint 仍由 QuorumMind 确定性合成器收敛；不能把整份输出理解为未经校验的 LLM 长文。
- 当前 source 只有在 `live_model_review` 产出可用结构化 trace 时才是 `live_model_trace_with_deterministic_synthesis`；否则保持 `deterministic_tools`。
- 当前 graph 已有有界多轮循环和内存 checkpointer，但还没有持久化 checkpointer、长期记忆和动态工具选择。
- 当前前端入口是实验入口，尚未替换经典 Blueprint Room 主流程。

## 验证

- `npm test -- --run server/agent-platform/autonomous-blueprint.test.ts server/decision-api.test.ts`
  - 2 个测试文件通过
  - 20 个测试通过
  - deep 模式覆盖 `68 -> 79 -> 87` 的共识循环，前两轮 continue，第三轮 finalize
  - `maxConsensusRounds=2` 覆盖预算耗尽路径，第二轮后进入 `human_review_gate`
- `npx tsc -p tsconfig.node.json --noEmit`
  - 通过
- `npm test -- --run`
  - 27 个测试文件通过
  - 118 个测试通过
- `npm test -- --run src/lib/api-client.test.ts src/App.test.tsx server/agent-platform/autonomous-blueprint.test.ts server/decision-api.test.ts`
  - 4 个测试文件通过
  - 35 个测试通过
  - 覆盖前端发送 `blueprintRuntime.executionMode`、`agentRuntime.threadId` / `maxConsensusRounds`、中文 Agent 平台入口展示 `MemorySaver`、`round_budget_exhausted` 和 `human_review_gate`
  - 覆盖 `/api/blueprints` 默认 live 请求但 provider demo 时的 fallback evidence、显式 deterministic 模式跳过 provider、mock live 蓝图强制 15-call deep trace
  - 覆盖 `/api/agent-runs/blueprint` mock live provider trace、`run.liveModel.liveTraceUsable=true` 和 `platform.source=live_model_trace_with_deterministic_synthesis`
- `npm test -- --run src/App.test.tsx`
  - 1 个测试文件通过
  - 4 个测试通过
  - 覆盖 `路由路径图` 展示、Agent runtime 本地持久化、API 请求体携带自定义 thread id 和轮次预算、`人工复审包` Markdown 复制
- `npm run quality:audit`
  - 24 个确定性质量用例通过
  - context pass rate 100%
  - localized Chinese pass rate 100%
  - all case pass rate 100%
- `npm run visual:audit`
  - 23 个浏览器视觉检查通过
  - 0 个失败
  - 产物目录：`output/playwright/visual-audit`
- `npm run build`
  - 通过
  - 通过首屏拆包优化后无 chunk size warning
  - 当前主要产物：`index` 约 416.81 kB，`blueprint` 约 85.79 kB，`exporters` 约 32.49 kB
- `git diff --check`
  - 通过
- `npm run quality:blueprint:live`
  - 新增脚本和报告路径：`docs/quality/2026-06-20-live-blueprint-quality-audit.md`
  - 默认 20 个用例、最多 3 个 provider 阶段
  - 本轮实际执行进入真实 provider 串行调用路径，但超过本轮 token-guard 等待预算后中止
  - 没有伪造真实 API 通过率；报告记录为未完成，并给出小批量运行命令

## 下一步

1. 把 `MemorySaver` 替换或补充为持久化 checkpointer，支持服务重启后的恢复。
2. 将更多节点升级为真正 tool-calling LLM agent，但继续复用现有 provider trace、schema hardening、fallback 和来源透明策略。
3. 支持人工复审后 resume，让 `human_review_gate` 不只是 trace，而是可恢复的中断点。
4. 给 Agent 平台面板增加更直观的节点图或 Sankey 视图，把 `routeDecisions` 从列表升级成可视化路径。
5. 对比现有 Blueprint 直接流程和 LangGraph 流程的复杂度、可观测性和运行成本，再决定是否迁移主流程。
