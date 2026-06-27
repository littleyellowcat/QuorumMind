# QuorumMind 多 Agent 决策与方案蓝图平台

日期：2026-06-25
用途：简历项目经历、作品集项目介绍、面试讲解提纲
来源：`docs/quorummind-project-highlights-2026-06-25.md`、`skills/resume-writer`

## 图片风格精简版

**项目描述：**
QuorumMind 是一个基于 React + Node.js + LangGraph/LangChain 的有界自主多 Agent 决策与方案蓝图平台，面向架构取舍、技术选型、产品流程和开放式系统设计问题，将“问大模型”升级为可审查的 agentic workflow：多个模型/Agent 先独立提案，再盲审互评、交叉质询、循环修订，最终在共识阈值、人工复审、记忆注入、权限控制和质量评估约束下输出 ADR、完整蓝图或简版 PDF 方案。

**核心职责：**

1. **设计多 Agent 决策闭环，解决普通 LLM 回答黑盒化问题。** 将决策室拆成 Proposal / Blind Review / Cross-Examination / Revision / Consensus / Final Verdict 六阶段，引入匿名互评、质询采纳账本、风险账本、假设账本、后悔地图和 ADR 导出，使架构取舍从“直接给答案”变成“可追踪、可复盘、可审查”的决策过程。

2. **搭建 LangGraph 有界自主 Agent 平台，解决一次性流程无法循环推理的问题。** 基于 StateGraph + LangChain Core tools 实现 Planner / Executor / Critic / Memory / Supervisor 五类 Agent，支持 `threadId`、`MemorySaver` / `SqliteSaver` checkpoint、`maxConsensusRounds`、`routeDecisions`、`terminationReason` 和 `human_review_gate`，在共识低于 80 且轮次耗尽时自动进入人工复审。

3. **扩展 Blueprint 方案蓝图模式，解决用户问题不一定是二选一的问题。** 针对“我要做一个系统，Agent 怎么分工、数据字段怎么设计、工作流怎么拆”的开放式需求，动态生成目标/非目标、模块职责、数据 schema、工作流、异常流、里程碑、验收标准、风险矩阵和 issue 级 backlog，使项目从决策工具扩展为通用方案设计工作台。

4. **构建多算法共识评分体系，解决单一分数误导决策的问题。** 融合 Borda Count、Bayesian Weighted Voting、Weighted Utility、Quorum Score、Minimax Regret、TOPSIS、Monte Carlo Stress Lens、AHP Sensitivity 和 Model Reputation，把“赢家”“分歧”“后悔风险”“稳定性”和“模型声誉”拆开解释，避免共识分写死或用一个数字掩盖真实争议。

5. **实现真实模型质量门与来源透明，解决 provider 输出不稳定和用户误解问题。** 封装 OpenAI / DeepSeek / Gemini / OpenAI-compatible gateway / mock provider，支持 provider trace、strict/fenced/narrated JSON 提取、phase-specific schema normalization、bounded repair、failure classification、fallback transparency 和异常模型 seat 禁用；真实 Decision API smoke 4/4 通过，live verdict / schema / 中文 / 相关性均 100%，fallback 0%。

6. **设计 Live Audit Harness，解决真实 API 回归不可观测和重复烧成本的问题。** 为真实模型质量回归加入 case start/result/trace 日志、增量 JSONL、resume、max runtime、SIGINT 摘要和 `providerSource=real|mock` 标记；Provider 深度连通性 3/3 seats schema usable 100%，JSON parse 100%，mock E2E 9 provider calls 通过。

7. **建立 AgentEval 评估体系，解决 Agent 只看最终答案、不看执行过程的问题。** 构建 30 条 full suite，从结果质量、执行轨迹、工具/Schema、多模型协作、工程效率和可解释性六个维度评分；AgentEval 30/30 通过，平均分 96.3，轨迹分 95，工具/Schema 分 100，工具召回 100%，fallback 0%。

8. **沉淀长期记忆与 Skill Governance，解决 Prompt 臃肿和上下文不可复用问题。** 实现 `MemorySaver` 默认 checkpoint、可选 SQLite 持久化、knowledge injection、项目画像、历史偏好、last-vs-current diff 和失败样本 backlog；同时将 Decision Review、Blueprint Planner、Consensus Loop、AgentEval、Live Model QA、Report Export、Security Guard、中文本地化等方法论拆成 `quorummind-*` skills，由 runtime loader 按 domain/role/triggers 注入。

9. **补齐安全策略与工具权限系统，解决 Agent 静默越权和 API key 暴露风险。** 服务端托管 provider key，前端不接触密钥；实现 CORS allowlist、可选 API Token、60 req/min 限流、256 KiB 请求体限制、安全响应头和 `/api/security` 状态检查；工具权限分为只读、本地写入、外部 API、真实模型调用、生产操作、付费操作，并统一决策为 auto / requires_human / blocked。

10. **完善前端体验、导出和质量回归，解决 AI 工具展示不专业、中文长内容易溢出的问题。** 使用 React + TypeScript + Vite 构建三栏独立滚动工作台、首页引导、设置页、中文/英文切换、Tooltip 指标解释、专业/简版 PDF、ADR、JSON trace 和 Prompt bundle 导出；视觉审计覆盖桌面、窄屏、移动端、长中文、Tooltip、导出入口和 Agent 平台展示，74 checks / 0 failed，Vitest 30 files / 144 tests passed，生产 build 通过。

**技术栈：**
React、TypeScript、Vite、Node.js、tsx、LangGraph、LangChain Core、OpenAI、DeepSeek、Gemini、OpenAI-compatible Gateway、Zod、SQLite、Playwright、Vitest、GSAP、Borda Count、Bayesian Weighted Voting、TOPSIS、Monte Carlo、AHP、Minimax Regret、AgentEval、PDF/ADR/JSON Export。

## 四段式简历版

**背景：**
在架构评审、技术选型、产品策略和复杂系统设计场景中，普通 LLM 往往直接输出单一结论，缺少候选方案、反方质询、假设暴露、风险解释和可复盘证据。为解决复杂决策“难审查、难比较、难追责”的问题，设计并实现 QuorumMind 多 Agent 决策与方案蓝图平台。

**目标：**
目标是把架构取舍和开放式方案设计产品化为一个可追踪的 agentic workflow，使多个模型/Agent 能独立提案、互相评估、循环修订，并在共识阈值、人工复审、记忆机制、工具权限和质量评估约束下输出可信结果。

**过程：**

- **设计** 决策室六阶段链路，引入匿名互评、质询修订、共识评分和 ADR/PDF/JSON 导出，让决策过程可审查。
- **实现** LangGraph 有界自主 Agent 平台，落地 Planner / Executor / Critic / Memory / Supervisor、checkpoint、threadId 和 human review gate。
- **构建** 多算法共识层，融合 Borda、Bayesian Voting、TOPSIS、Monte Carlo、AHP、Minimax Regret 和模型声誉反馈，解释分歧与稳定性。
- **封装** 真实 provider 质量门，支持 JSON 提取、schema 修复、fallback 透明、provider trace 和异常模型 seat 禁用，降低真实 API 不稳定风险。
- **建立** AgentEval + Live Audit Harness + 视觉回归闭环，覆盖结果质量、轨迹、工具/schema、协作、成本、中文长内容和多端 UI。
- **沉淀** 项目内 skills、长期记忆、安全策略和工具权限系统，把 Prompt 规则、用户偏好、失败样本和高风险动作统一治理。

**结果：**
项目通过 30 files / 144 个 Vitest 测试与生产构建；AgentEval full suite 30/30 通过，平均分 96.3，轨迹分 95，工具/Schema 分 100，工具召回 100%，fallback 0%；浏览器视觉审计 74 checks / 0 failed；真实 Decision API smoke 4/4 通过，live verdict / schema / 中文 / 相关性均 100%，真实 Decision fallback 0%。代码图扫描 93 files / 246 local import edges，形成可解释的前端、后端、provider、agent platform、persistence 和 quality scripts 模块边界。

## 亮点拆解版

| 解决的问题 | 采用的策略 | 可展示结果 |
| --- | --- | --- |
| LLM 直接回答黑盒，无法复盘 | 多 Agent 独立提案、盲审互评、质询修订、ADR/JSON/PDF 导出 | 决策链路可追踪，专家看 trace，普通用户看简版方案 |
| 开放式需求不是二选一 | Blueprint 模式动态生成目标、模块、schema、流程、里程碑、风险和 backlog | 非结构化问题也能输出完整实施蓝图 |
| 多 Agent 容易“一轮就结束” | LangGraph 循环图 + 80% 共识阈值 + 轮次预算 + human_review_gate | 低共识时继续修订，预算耗尽后进入人工复审 |
| 单一共识分容易误导 | Borda、Bayesian Voting、TOPSIS、Monte Carlo、AHP、Minimax Regret 多算法解释 | 可区分共识、分歧、稳定性、后悔风险和模型声誉 |
| 真实 provider 输出不合 schema | strict/fenced/narrated JSON 提取、schema normalization、bounded repair、fallback 透明 | Decision live smoke 4/4，schema usable 100%，fallback 0% |
| 长任务 API 回归不可观测 | Live Audit Harness：case 日志、JSONL、resume、max runtime、SIGINT 摘要 | mock E2E 9 provider calls 通过，真实/模拟证据口径分离 |
| Agent 评估不能只看最终答案 | AgentEval 覆盖结果质量、轨迹、工具/schema、协作、效率、解释性 | 30/30 通过，平均 96.3，轨迹 95，工具/schema 100 |
| Agent 可能静默越权 | 工具权限分级：只读、本地写入、外部 API、真实模型、生产、付费 | auto / requires_human / blocked 可解释展示 |
| 每次运行缺少长期上下文 | MemorySaver / SQLite checkpoint、threadId、知识注入、项目画像、失败样本 backlog | 支持稳定线程、历史偏好与 last-vs-current diff |
| Prompt 规则难维护 | `quorummind-*` skills 按 domain/role/triggers 注入 | 方法论从 Prompt 中拆出，可复用、可治理 |
| 中文 UI 和长内容容易翻车 | 三栏独立滚动、中文本地化、Tooltip、新手引导、视觉回归 | 74 checks / 0 failed，覆盖桌面/窄屏/移动端 |
| API key 和分享安全风险 | provider key 服务端托管、CORS、API Token、限流、body limit、安全头 | 本地自用方便，对外分享有明确安全边界 |

## 数据口径说明

- **真实 API 已验证：** Decision smoke 4/4 通过，live verdict / schema / 中文 / 相关性均 100%，fallback 0%。
- **离线规则评估：** AgentEval 30/30、平均 96.3 是离线评估，不包装成真实 LLM Judge。
- **本地 Judge 抽检：** 8/8 passed、平均 95.2 是 local rubric mock，不是真实付费 LLM Judge。
- **视觉审计：** 74 checks / 0 failed 使用 mock live 浏览器自动化，验证 UI 和交互，不代表真实 provider 质量。
- **Blueprint/Agent live 边界：** 小样本功能可用、中文/相关性/详细度 100%，但长 prompt 下个别 provider seat 曾出现 `provider_error`，已通过异常 seat 禁用和 harness 透明记录规避。

## 面试一句话版本

QuorumMind 不是一个简单的多模型聊天 Demo，而是一个基于 LangGraph 的有界自主多 Agent 决策平台：我把复杂决策拆成独立提案、盲审互评、质询修订、共识评分、人工复审、记忆注入、工具权限和 AgentEval 质量门，并通过真实 provider trace、schema hardening、Live Audit Harness 和视觉回归，把多 Agent 系统从“能生成”推进到“可审查、可评估、可运维”。
