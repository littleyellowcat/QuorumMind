# QuorumMind AI Agent 岗位项目描述

日期：2026-06-25
参考：`skills/superpowers/skills/brainstorming/SKILL.md`、`docs/quorummind-complete-highlights-audit-2026-06-25.md`
定位：AI Agent / LLM Application / Agent Engineer 面试项目经历

## 推荐版

**QuorumMind Agentic Decision Platform 多智能体决策与方案蓝图平台**

**项目描述：** 面向架构评审、技术选型、复杂方案设计等高争议决策场景，构建基于 LangGraph / LangChain 的有界自主多 Agent 平台；系统将用户问题拆解为多 Agent 独立提案、盲审互评、交叉质询、循环修订、共识评分和人工复审流程，支持 Planner / Executor / Critic / Memory / Supervisor 协作、bounded ReAct 工具调用、80% 共识阈值、真实 Provider Trace、Schema 质量门、AgentEval 评估和可追溯 ADR / Blueprint 导出。

**核心职责：**

1. **搭建有界自主 Agent 编排链路：** 基于 LangGraph `StateGraph` 设计 `route_intent -> react_toolbox -> planner_agent -> memory_agent -> executor_agent -> critic_agent -> supervisor_agent -> validate_result` 状态图，引入 Planner / Executor / Critic / Memory / Supervisor 五类 Agent，并通过 `threadId`、`maxConsensusRounds`、`routeDecisions`、`terminationReason` 和 `human_review_gate` 控制多轮循环；当共识低于 80% 且轮次耗尽时自动进入人工复审，AgentEval 中 `agent-human-review-budget-zh` 覆盖 76 分低共识复审路径。

2. **设计 Multi-Agent Debate 与受控 ReAct 范式：** 将决策流程拆成 Proposal / Blind Review / Cross-Examination / Revision / Ranking / Verdict 六阶段，多个模型席位先独立给方案，再匿名互评、挑刺、修订和排序；局部接入 Thought / Action / Observation 形式的 bounded ReAct 工具步骤，只允许调用受控 LangChain tools，避免无界工具调用失控。系统结合 Borda Count、Bayesian Weighted Voting、TOPSIS、Monte Carlo、AHP 和 Minimax Regret 解释裁决分、分歧指数、稳定性和后悔风险。

3. **构建 Harness Engineering 工程护栏：** 设计“记忆与文件系统、验证与反馈回路、安全断路和沙箱、工具与 API 集成层”四层 Harness：使用 `MemorySaver` / `SqliteSaver`、SQLite snapshots、knowledge injection、context compressor 和 JSONL progress 支撑可恢复运行；使用 AgentEval、local rubric Judge、mock E2E、visual audit、live quality audit 形成反馈闭环；通过工具权限 `auto / requires_human / blocked`、CORS allowlist、API Token、60 req/min 限流、256 KiB body limit 和 mock provider 模式控制越权、成本和安全风险。

4. **实现真实模型质量门与 AgentEval 评估体系：** 封装 OpenAI / DeepSeek / Gemini / OpenAI-compatible gateway Provider 适配层，支持 strict / fenced / narrated JSON 提取、Zod Schema normalization、bounded repair、failure classification、fallback transparency 和异常模型 seat 禁用；构建 30 条 AgentEval JSONL 测试集，从结果质量、执行轨迹、工具/Schema、多模型协作、工程效率和可解释性六维评分。当前 Vitest 30 files / 144 tests passed，AgentEval full 30/30 passed、平均分 96.3、轨迹分 95、工具/Schema 分 100、fallback 0%；真实 Decision API smoke 4/4 passed，live verdict / schema / 中文 / 相关性均 100%，fallback 0%。

**技术栈：** TypeScript、React、Vite、Node.js、LangGraph、LangChain Core、Zod、OpenAI、DeepSeek、Gemini、OpenAI-compatible Gateway、SQLite、Playwright、Vitest、AgentEval、Borda Count、Bayesian Weighted Voting、TOPSIS、Monte Carlo、AHP、Minimax Regret。

## 更短版

**QuorumMind 多智能体决策与方案蓝图平台**

**项目描述：** 面向架构取舍、技术选型和开放式方案设计场景，构建基于 LangGraph / LangChain 的有界自主多 Agent 平台，支持多模型独立提案、盲审互评、交叉质询、循环修订、80% 共识阈值、人工复审、长期记忆、工具权限控制、真实模型 Trace 和 AgentEval 质量评估。

**核心职责：**

1. 基于 LangGraph `StateGraph` 实现 Planner / Executor / Critic / Memory / Supervisor 五类 Agent，支持 `threadId`、checkpoint、`maxConsensusRounds`、`routeDecisions` 和 `human_review_gate`，将一次性生成升级为可审计的多轮 Agent loop。
2. 设计 Multi-Agent Debate + bounded ReAct 混合范式，落地独立提案、匿名互评、质询修订、共识评分和人工复审；结合 Borda、Bayesian Voting、TOPSIS、Monte Carlo、AHP、Minimax Regret 等算法解释分歧、稳定性和后悔风险。
3. 搭建 Harness Engineering 护栏，覆盖记忆与文件系统、验证与反馈回路、安全断路和沙箱、工具/API 集成层；实现 SQLite checkpoint、JSONL resume、工具权限、CORS/API Token/限流/请求体限制和 mock provider 成本控制。
4. 建立 AgentEval 与真实模型质量门，封装 OpenAI / DeepSeek / Gemini Provider、Schema hardening、bounded repair 和 fallback transparency；AgentEval 30/30 通过，平均分 96.3，工具/Schema 分 100，真实 Decision API smoke 4/4 通过，fallback 0%。

**技术栈：** TypeScript、Node.js、React、LangGraph、LangChain Core、Zod、SQLite、OpenAI、DeepSeek、Gemini、Playwright、Vitest、AgentEval、TOPSIS、Monte Carlo、AHP。

## 面试讲法

如果面试官追问“这个项目的 Agent 味道在哪里”，可以这样回答：

> 我没有只做多模型投票，而是做了一个有界自主 Agent 平台。外层用 LangGraph 控制状态、路由、预算和 checkpoint，中层用 Planner / Executor / Critic / Memory / Supervisor 分工，内层用 Multi-Agent Debate 和 Evaluator-Optimizer 做互评修订，局部才使用 bounded ReAct tools。为了让 Agent 可生产化，我还做了 Harness Engineering：记忆与文件系统保证可恢复，验证与反馈回路保证可评估，安全断路和沙箱防止越权，工具/API 集成层统一接入 provider、schema、导出和本地服务。
