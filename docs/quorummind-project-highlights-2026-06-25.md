# QuorumMind 项目亮点完整提取

日期：2026-06-25
范围：当前仓库代码、README/API/架构文档、AgentEval、视觉审计、真实 API 小样本回归、Provider 深度连通性、Live Audit Harness 加固记录、项目内 skills、code graph。
口径：本文件区分真实 API、mock live、离线规则评估和本地构建验证，不把 mock 或确定性兜底包装成真实模型效果。

## 一句话定位

QuorumMind 是一个 **LangGraph 编排的有界自主多 Agent 决策与方案蓝图平台**。

它不是简单“调用几个大模型再总结”的聊天 Demo，而是把复杂问题拆成可审查流程：多 Agent 独立提案、盲审互评、质询修订、共识评分、分歧解释、人工复审、记忆注入、权限控制、质量评估和可追溯导出。

更准确的作品集表述：

> QuorumMind 将架构决策和开放式方案设计产品化为可审计的 agentic workflow：基于 React + Node.js + LangGraph/LangChain，落地 Planner/Executor/Critic/Memory/Supervisor、工具权限系统、多模型互评、80% 共识阈值、AgentEval 质量门、真实 provider trace、schema hardening、fallback 透明化、视觉回归和安全治理。

## 最新验证数据

| 维度 | 最新结果 | 数据来源 | 可信边界 |
| --- | ---: | --- | --- |
| 单元/集成测试 | 30 files / 144 tests passed | `npm test -- --run` | 本地自动化测试 |
| 生产构建 | passed | `npm run build` | TypeScript + Vite build |
| AgentEval full | 30/30 passed，平均分 96.3 | `docs/quality/2026-06-25-agent-performance-audit-full.md` | 离线规则评估，不调用真实模型 |
| AgentEval 轨迹分 | 平均 95 | 同上 | 验证节点顺序、路由、共识循环 |
| AgentEval 工具/Schema 分 | 100 | 同上 | 验证结构字段与工具命中 |
| AgentEval 工具召回 | 100% | 同上 | Agent Blueprint 样本 |
| AgentEval fallback | 0% | 同上 | 离线确定性评估口径 |
| Judge 抽检 | 8/8 passed，平均 Judge 分 95.2 | `docs/quality/2026-06-25-agent-judge-audit.md` | 本地 rubric mock，不是真实 LLM Judge |
| 系统质量审计 | 30 cases / 综合通过率 100% | `docs/quality/2026-06-17-system-quality-audit.md` | 确定性与 mock live 质量门 |
| 视觉回归 | 74 checks / 0 failed / 100% | `docs/quality/2026-06-25-visual-audit.md` | mock live 浏览器自动化 |
| 真实 Decision API smoke | 4/4 passed，综合 100% | `docs/quality/2026-06-25-real-api-functional-audit.md` | 真实 provider，小样本 |
| 真实 Decision live verdict | 100% | 同上 | 4 条 smoke |
| 真实 Decision schema | 100% usable，0% repair | 同上 | 36 次调用预算 |
| 真实 Decision fallback | 0% | 同上 | 4 条 smoke |
| Blueprint/Agent live 小样本 | 功能可用率 100%，strict 0% | 同上 | 2 条；有 provider error |
| Blueprint 禁用异常 seat 后 | 1 条 strict 100% | 同上 | 小样本，证明降级策略有效 |
| Provider 深度连通性 | 3/3 seats schema usable 100% | `docs/quality/2026-06-25-provider-deep-connectivity-audit.md` | 最小 JSON schema prompt |
| Mock E2E | passed，9 provider calls | `docs/quality/2026-06-25-next-step-validation.md` | openai/deepseek/gemini mock |
| Live Audit Harness | case 日志、JSONL、resume、max runtime 已接入 | `docs/quality/2026-06-25-live-audit-harness-hardening.md` | mock self-check 通过 |
| Code graph | 93 files，246 local import edges | `docs/code-graph.md` | 本地代码扫描 |

## 技术栈与工程体量

| 层 | 技术/模块 | 说明 |
| --- | --- | --- |
| 前端 | React 19、Vite 8、TypeScript 6、GSAP | 工作台 UI、首页、三栏决策/蓝图界面、中文/英文切换、导出入口 |
| 后端 | Node.js、tsx、本地 API gateway | 保护 provider key，处理 `/api/decisions`、`/api/blueprints`、`/api/agent-runs/blueprint` |
| Agent 编排 | `@langchain/langgraph`、`@langchain/core`、LangChain | 有界状态图、MemorySaver/SqliteSaver、LangChain tools |
| Provider | OpenAI、DeepSeek、Gemini、统一 OpenAI-compatible gateway、mock provider | 真实/模拟 provider trace，共用 schema hardening |
| 评估 | Vitest、Playwright、AgentEval、local Judge、live audit scripts | 单元测试、浏览器视觉回归、Agent 轨迹评估、真实 API 小样本 |
| 持久化 | localStorage、SQLite optional | 历史记录、reputation feedback、Decision snapshots、checkpoint |
| 安全 | CORS allowlist、API token、rate limit、body limit、security headers | 本地优先，支持分享前加固 |

关键文件规模：

| 文件 | 行数 | 职责 |
| --- | ---: | --- |
| `src/App.tsx` | 5395 | React 工作台、决策室、蓝图室、Agent 平台 UI |
| `server/agent-platform/autonomous-blueprint.ts` | 2923 | LangGraph 有界自主 Agent 平台 |
| `src/lib/blueprint.ts` | 3455 | 通用蓝图生成、领域适配、详细方案输出 |
| `server/decision-api.ts` | 756 | API 网关、provider mode、决策/蓝图请求处理 |
| `src/lib/workflow.ts` | 530 | 决策室 deterministic multi-agent workflow |
| `scripts/live-model-quality-audit.ts` | 952 | Decision live 质量回归 |
| `scripts/live-blueprint-quality-audit.ts` | 916 | Blueprint/Agent live 质量回归 |
| `scripts/audit-harness.ts` | 269 | 新增增量审计、resume、进度日志 |

## 亮点 1：把“问 AI”变成可审查的 Decision Room

**解决的问题**：普通 LLM 回答像黑盒，用户只能看到一个结论，看不到候选方案、分歧、假设、风险和为什么赢。

**采用策略**：

- Proposal Round：多个 agent 独立提案。
- Blind Review：提案匿名为 Proposal A/B/C，隐藏 provider/model/作者信息。
- Cross-Examination：互相挑刺，暴露假设、遗漏和失败路径。
- Revision Round：吸收质询后修订方案。
- Consensus Engine：聚合排序、效用、置信度、后悔值、声誉权重。
- Final Verdict：输出推荐、风险、回滚路径、ADR。

**实现证据**：

- `src/lib/workflow.ts`
- `src/lib/demo-agents.ts`
- `server/live-decision.ts`
- `server/live-aggregation.ts`
- `DECISION_ENGINE.md`

**结果价值**：

- 用户能看到“为什么这么决策”，而不是只看到“答案是什么”。
- 对架构、技术选型、产品流程、成本取舍这类高争议问题更适合。
- 视觉和导出层保留 ADR、JSON trace、PDF 报告，让决策可复盘。

## 亮点 2：Blueprint 模式把项目从二选一决策扩展到开放式方案设计

**解决的问题**：真实用户常问的是“我想做一个系统，工作流、Agent 分工、字段、里程碑怎么设计”，不是标准二选一。

**采用策略**：

- 新增 Blueprint 工作台，面向开放式需求。
- 从用户问题动态识别主题、数据源、角色、风险、模块和工作流。
- 输出完整方案，而不是固定模板。

**Blueprint 覆盖内容**：

- 目标与非目标。
- Agent / 模块职责。
- 工作流与异常流。
- 数据 schema 与字段设计。
- 人工复审与安全边界。
- 里程碑与验收标准。
- 风险矩阵、终局评估矩阵。
- 质询采纳账本。
- issue 级 implementation backlog。
- 专业报告和简版方案 PDF。

**实现证据**：

- `src/lib/blueprint.ts`
- `src/lib/blueprint.test.ts`
- `server/decision-api.ts`
- `src/lib/exporters.ts`
- `skills/quorummind-blueprint-planner/SKILL.md`

**验证数据**：

- AgentEval full 中 Blueprint / Agent Blueprint 场景全部通过。
- `blueprint-contract-review-zh-full`、`blueprint-data-quality-zh-full`、`blueprint-support-agent-zh-full`、`agent-rag-governance-zh-full` 等非视觉小说场景通过。
- 视觉回归检查 Blueprint 输入、运行后结果、导出入口、长中文和移动端全部通过。

## 亮点 3：LangGraph/LangChain 有界自主 Agent 平台

**解决的问题**：一次性函数流程不能很好表达“规划、执行、批判、记忆、主管决策、权限、循环、人工复审、checkpoint”。

**采用策略**：

- 使用 LangGraph `StateGraph` 做服务端有界状态机。
- 用 LangChain Core tools 包装本地能力。
- 用 `MemorySaver` 默认 checkpoint；配置 SQLite 后切换持久化 saver。
- 通过 `threadId` 支持稳定线程。
- 通过 `maxConsensusRounds` 控制成本和循环深度。

**Agent 节点**：

| Agent / 节点 | 作用 |
| --- | --- |
| Planner Agent | 拆解用户目标为 taskTree、依赖、owner、验收标准 |
| Executor Agent | 按权限策略执行本地受控任务，高风险动作只 staged |
| Critic Agent | 检查任务覆盖、权限边界、弱项、共识分 |
| Memory Agent | 记录 thread 摘要、项目画像、知识注入、失败样本 backlog |
| Supervisor Agent | 决定继续、暂停人工复审或 finalize |
| validate_result | 判断是否达到共识阈值 |
| revise_discussion | 共识不足时继续修订 |
| human_review_gate | 轮次耗尽或高风险时进入人工复审 |

**实现证据**：

- `server/agent-platform/autonomous-blueprint.ts`
- `API_CONTRACT.md`
- `server/agent-platform/autonomous-blueprint.test.ts`

**结果价值**：

- 这是“真正 agentic workflow”的证据，不是把多个 prompt 串起来。
- 但它仍是有界自主，不宣称无约束自主 Agent，工程表述更稳。

## 亮点 4：80% 共识阈值 + 预算耗尽进入人工复审

**解决的问题**：很多多 Agent Demo 会“讨论一下就强行输出”，没有明确何时继续、何时停止、何时请人介入。

**采用策略**：

- 默认共识阈值 80。
- 每轮验证共识分。
- 低于阈值且仍有轮次预算：`validate_result -> revise_discussion -> critic_agent -> supervisor_agent -> validate_result`。
- 轮次耗尽仍未达标：进入 `human_review_gate`。
- 记录 `routeDecisions` 和 `terminationReason`。

**可见字段**：

- `runtimeLimits`
- `consensusLoop`
- `routeDecisions`
- `terminationReason`
- `humanReviewNote`
- `summary.humanReviewRequired`

**验证数据**：

- AgentEval 覆盖 `agent-human-review-budget-zh`，共识 76 低于 80，但仍通过，因为系统正确识别复审路径。
- AgentEval 平均轨迹分 95，说明路由/循环/终止条件可稳定验证。

## 亮点 5：工具权限系统，避免 Agent 静默越权

**解决的问题**：自主 Agent 最大风险之一是乱调用工具、写文件、调用外部 API、执行生产操作或产生费用。

**采用策略**：

工具权限分级：

| 类别 | 说明 |
| --- | --- |
| `read_only` | 本地只读分析 |
| `local_file_write` | 本地文件写入 |
| `external_api_call` | 外部 API |
| `live_model_call` | 真实模型调用 |
| `production_operation` | 生产环境动作 |
| `paid_operation` | 可能产生费用的动作 |

决策：

- `auto`
- `requires_human`
- `blocked`

**实现证据**：

- `server/agent-platform/autonomous-blueprint.ts`
- `API_CONTRACT.md`
- `docs/quality/2026-06-24-real-model-agent-loop-audit.md`

**结果价值**：

- 高风险请求不会自动执行。
- Live provider 调用也进入权限账本，标记为 `live_model_call`。
- 用户能看到哪些动作自动执行，哪些需要人工确认。

## 亮点 6：多算法决策层，而不是一个“共识分”写死

**解决的问题**：单一分数容易误导，尤其是“共识高但分歧也高”的场景。

**采用策略**：

项目使用多种可解释决策算法：

- Borda Count：聚合排名。
- Bayesian Weighted Voting：融合 agent 权重、model reputation 和 confidence。
- Weighted Utility：多指标效用。
- Quorum Score：综合效用、排序、置信度和 regret penalty。
- Dissent Index：显示分歧强度。
- Minimax Regret Map：看最坏场景下谁后悔最少。
- TOPSIS Decision Lens：接近理想解程度。
- Monte Carlo Stress Lens：模拟不确定性下的稳定性。
- AHP Sensitivity Analysis：不同权重压力下赢家是否改变。
- Model Reputation Feedback：用户反馈校准模型领域权重。

**实现证据**：

- `src/lib/scoring.ts`
- `src/lib/ahp.ts`
- `src/lib/model-reputation.ts`
- `DECISION_ENGINE.md`

**结果价值**：

- “共识 76 但建议复审”这类结果有解释基础。
- 可以区分方向一致、风险未解、赢家不稳定等不同状态。
- 适合讲“决策智能”而不是单纯“聊天生成”。

## 亮点 7：真实模型调用链具备 schema hardening 与来源透明

**解决的问题**：真实 LLM 经常输出非 JSON、英文、跑题、字段缺失或不合 schema；如果系统静默兜底，用户会误以为真实模型参与了。

**采用策略**：

- Provider API key 只在本地 Node API。
- Provider trace 记录 provider、model、phase、duration、jsonParsed、validationStatus、failureClass。
- 支持 strict JSON、Markdown fenced JSON、叙述文本中的 balanced JSON。
- phase-specific schema normalization。
- bounded repair。
- failure classification。
- fallback source 透明展示。
- `QUORUMMIND_DISABLED_LIVE_MODELS` 临时禁用不稳定 seat。

**实现证据**：

- `server/live-decision.ts`
- `server/provider-json.ts`
- `server/provider-schema.ts`
- `server/providers/registry.ts`
- `scripts/live-model-quality-audit.ts`
- `scripts/live-blueprint-quality-audit.ts`

**真实 API 数据**：

| 链路 | 结果 |
| --- | --- |
| Decision smoke | 4/4 passed |
| Decision live verdict | 100% |
| Decision schema usable | 100% |
| Decision fallback | 0% |
| Blueprint/Agent live 小样本 | live trace 可用、中文/相关性/详细度 100% |
| Blueprint strict | 0%，因为一个 proposal seat `provider_error` |
| Provider deep connectivity | 3/3 seats schema usable 100% |
| 禁用异常 seat 后 Blueprint | 单条 strict 100% |

**边界说明**：

- 真实 Decision smoke 已稳定通过。
- Blueprint/Agent live 更长 prompt 下仍有个别 seat 不稳定。
- 系统现在能发现并标注，而不是把失败伪装成成功。

## 亮点 8：Live Audit Harness 从黑盒长任务升级为可观测质量工程

**解决的问题**：真实 API 扩展回归曾经出现长时间无输出，无法判断卡在哪个 case/provider/phase。

**采用策略**：

新增共享 harness：

- 每个 case 开始日志。
- 每个 case 结果日志。
- trace summary 输出。
- 每个完成 case 增量写入 JSONL。
- 支持 resume。
- 支持全局最大运行时长。
- 支持 SIGINT 中断摘要。
- 区分 `providerSource=real|mock`。
- Blueprint 报告路径改为按日期/过滤条件输出，避免覆盖。

**实现证据**：

- `scripts/audit-harness.ts`
- `scripts/live-model-quality-audit.ts`
- `scripts/live-blueprint-quality-audit.ts`
- `docs/quality/2026-06-25-live-audit-harness-hardening.md`

**自检数据**：

| 自检 | 结果 |
| --- | --- |
| Decision mock harness | 1 case，9 provider calls，JSON 100%，Schema 100% |
| Decision resume | `resume-skip services-zh-fast`，未重复调用 |
| Blueprint mock harness | 1 case，3 provider calls，strict 100% |
| 工程验证 | TypeScript app/node passed，Vitest 144 passed，Build passed |

**结果价值**：

- 后续跑真实 API 不再是黑盒。
- 中断后可以从已完成 case resume，避免重复烧 API。
- 质量报告能明确 mock 和 real，不会混淆证据。

## 亮点 9：AgentEval 不是只测最终答案，而是测“结果 + 轨迹 + 工具 + 成本”

**解决的问题**：Agent 系统只看最终答案不够；过程错、工具乱用、成本失控也会导致不可用。

**采用策略**：

AgentEval 维度：

- 结果质量 35%
- 执行轨迹 20%
- 工具/Schema 15%
- 多模型协作 15%
- 工程效率 10%
- 可解释性 5%

参考思路：

- 通用工程指标：延迟、成本、fallback。
- Agent 特有指标：响应质量、轨迹合理性、工具命中率、交互质量。
- 美团龙猫式三维：推理维度、工具维度、交互维度。

**实现证据**：

- `scripts/agent-performance-eval.ts`
- `eval/agent-eval-cases.jsonl`
- `skills/quorummind-agent-eval/SKILL.md`

**数据结果**：

| 指标 | 结果 |
| --- | ---: |
| full suite | 30 条 |
| 通过 / 警告 / 失败 | 30 / 0 / 0 |
| 平均总分 | 96.3 |
| 平均响应质量 | 95.9 |
| 平均轨迹分 | 95 |
| 平均工具/Schema 分 | 100 |
| 平均协作分 | 91.7 |
| 平均工程效率分 | 100 |
| 平均延迟 | 6ms |
| 平均估算 Token | 6151 |
| fallback 率 | 0% |

## 亮点 10：长期记忆与项目知识注入

**解决的问题**：Agent 不应该每次都像第一次见用户，尤其是决策系统需要记住团队偏好、历史失败样本、项目画像和上次方案差异。

**采用策略**：

- LangGraph `MemorySaver` 默认 checkpoint。
- 可选 `SqliteSaver`。
- `threadId` 稳定线程。
- knowledge index 搜索。
- `KNOWLEDGE.md` 优先注入团队约束。
- Memory Agent 记录：
  - thread summary
  - user preference summary
  - project profile
  - last vs current diff
  - failure sample backlog
  - checkpoint write

**实现证据**：

- `server/agent-platform/autonomous-blueprint.ts`
- `server/knowledge-index.ts`
- `server/knowledge-inject.ts`
- `server/knowledge-store.ts`
- `server/context-compressor.ts`
- `server/garbage-collector.ts`
- `PERSISTENCE.md`

**结果价值**：

- 项目不是一次性 prompt，已经有长期运行底座。
- 可以继续扩展成历史偏好总结、失败样本回流和项目画像记忆。

## 亮点 11：项目内 Skill 系统，把方法论从 Prompt 中拆出来管理

**解决的问题**：所有规则都塞进一个 prompt 会臃肿、难维护，也不利于按场景复用。

**采用策略**：

- 项目内 `skills/quorummind-*/SKILL.md` 沉淀方法论。
- 每个 skill 有 domain、roles、triggers、inject 范围。
- runtime skill loader 扫描项目 skills 和 `~/.quorummind/skills/*.md`。
- 每次按问题、domain、role 匹配最多 6 个。
- Blueprint live provider prompt 注入匹配到的 skill。

**当前 skills**：

| Skill | 作用 |
| --- | --- |
| `quorummind-decision-review` | 决策室取舍、ADR、共识/分歧解释 |
| `quorummind-blueprint-planner` | 开放式需求转完整实施蓝图 |
| `quorummind-consensus-loop` | 多模型互评、盲审、修订、阈值终止 |
| `quorummind-agent-eval` | AgentEval、轨迹、schema、成本、延迟 |
| `quorummind-live-model-qa` | 真实模型调用、中文、schema、fallback 质量门 |
| `quorummind-report-export` | ADR、蓝图、专业/简版报告导出 |
| `quorummind-security-guard` | API Token、CORS、限流、导出安全 |
| `quorummind-zh-localization` | 中文 UI、报告、长中文排版 |
| `quorummind-token-guard` | 预算、重试、验证、来源透明 |

**实现证据**：

- `server/skill-loader.ts`
- `server/skill-inject.ts`
- `docs/quality/skill-governance.md`

**结果价值**：

- 项目有自己的可复用方法论层。
- 很适合面试讲“我不只是调 prompt，而是做了可管理的 agent skill governance”。

## 亮点 12：安全策略覆盖了本地自用到对外分享的关键边界

**解决的问题**：带真实 API key 的工具如果没有安全边界，很容易泄露 key、被跨域滥用、被大请求拖垮或在导出中泄露敏感上下文。

**采用策略**：

- API key 只放 `.env.local`，浏览器不接收 provider key。
- `/api/health` 和 `/api/security` 不返回 secret。
- CORS allowlist，默认本地 Vite origin。
- 可选 `QUORUMMIND_API_TOKEN`。
- 支持 `X-QuorumMind-Token` 和 `Authorization: Bearer`。
- rate limit 默认 60 requests/min。
- request body limit 默认 256 KiB。
- 安全响应头：CSP、X-Frame-Options、X-Content-Type-Options、Referrer-Policy、Permissions-Policy、Cache-Control no-store。
- HSTS 可选。
- 导出 JSON/PDF/HTML 被视为敏感产物。

**实现证据**：

- `server/security.ts`
- `SECURITY_PRIVACY.md`
- `API_CONTRACT.md`
- `skills/quorummind-security-guard/SKILL.md`

**结果价值**：

- 自用默认方便。
- 给别人用之前知道该开哪些安全配置。
- 这比普通本地 AI demo 多了安全运营意识。

## 亮点 13：中文体验和浏览器视觉回归已经工程化

**解决的问题**：中文长句、三栏滚动、窄屏、tooltip、导出、残留英文最容易在 AI 工具 UI 中翻车。

**采用策略**：

- UI 中文/英文切换。
- 中文模式下流程标题、说明、风险、假设、导出标签持续本地化。
- Tooltip 解释指标。
- 三栏独立滚动。
- 长中文问题与窄屏/移动端自动检查。
- 导出报告残留英文扫描。

**验证数据**：

| 指标 | 结果 |
| --- | ---: |
| 视觉检查项 | 74 |
| 失败项 | 0 |
| 通过率 | 100% |
| 桌面视口 | 1440x1100 |
| 窄桌面视口 | 1024x900 |
| 移动视口 | 390x844 |

覆盖：

- 决策室长中文输入与结果页。
- Blueprint 输入与结果页。
- Agent 平台 Planner/Executor/Critic/Memory/Supervisor 展示。
- 左/中/右独立滚动。
- tooltip。
- ADR/JSON/PDF/Prompt/Blueprint 导出入口。
- 中文 UI 和导出报告残留英文。
- 横向溢出和按钮文字溢出。

**实现证据**：

- `scripts/visual-audit.ts`
- `src/App.tsx`
- `src/styles.css`
- `src/i18n`
- `skills/quorummind-zh-localization/SKILL.md`

## 亮点 14：导出体系同时服务专家和非专家

**解决的问题**：专家想要 trace、评分、ADR；普通用户只想要最后方案，不想看复杂调试信息。

**采用策略**：

- ADR Markdown。
- JSON trace。
- 专业 HTML/PDF 报告。
- 简版最终方案 PDF。
- Blueprint 报告。
- Prompt bundle。
- Copy review package。

**实现证据**：

- `src/lib/exporters.ts`
- `server/pdf-export.ts`
- `skills/quorummind-report-export/SKILL.md`
- `src/lib/exporters.test.ts`

**结果价值**：

- 可以用于架构评审、项目方案、面试作品集展示。
- 同一结果可以给技术人员和非技术人员看不同版本。

## 亮点 15：Model Reputation 与用户反馈闭环

**解决的问题**：不同模型在不同领域表现不同，不能永远固定权重。

**采用策略**：

- 根据问题推断领域：技术架构、产品策略、职业策略、作品集包装等。
- 每个模型 seat 有 domain reputation。
- 用户点击 helpful / needs-work 后生成 feedback。
- 下次运行时用 bounded delta 调整有效权重。
- UI 展示 reputation、domain、rationale、effective weight。

**实现证据**：

- `src/lib/model-reputation.ts`
- `src/lib/reputation-feedback.ts`
- `PERSISTENCE.md`
- `src/lib/model-reputation.test.ts`
- `src/lib/reputation-feedback.test.ts`

**结果价值**：

- 有学习闭环，但不是黑箱 fine-tuning。
- 更容易解释：权重为什么变化、变化幅度如何受限。

## 亮点 16：本地优先 + mock live，让项目可演示、可 CI、可控成本

**解决的问题**：真实 API 不稳定、昂贵、慢；但完全不用 live trace 又无法测试 provider 流程。

**采用策略**：

- 默认 demo mode 不调用外部 API。
- `QUORUMMIND_MOCK_PROVIDERS=1` 提供 keyless live-like provider。
- mock live 覆盖 provider trace、schema validation、aggregation。
- 真实 API audit 手动运行，避免 CI 消耗 key。

**验证数据**：

- Mock E2E：9 provider calls，openai/deepseek/gemini，proposal/ranking/verdict。
- Visual audit 使用 mock live，74 checks 通过。
- AgentEval 离线 30 条，6ms 平均延迟。

**结果价值**：

- 面试/演示不依赖 API key。
- CI 可以验证关键链路。
- 真实 API 单独按预算验证。

## 亮点 17：代码图和模块边界清晰，可解释工程复杂度

**解决的问题**：项目容易被误解成一个大文件堆功能。

**采用策略**：

- 生成 code graph。
- 按 frontend_app、domain_core、api_server、provider_adapters、agent_platform、persistence、quality_scripts 分组。
- 标出 import edges 和主链路。

**数据结果**：

| 指标 | 数量 |
| --- | ---: |
| 扫描文件 | 93 |
| 本地 import 边 | 246 |
| domain_core | 30 files / 11761 lines |
| api_server | 25 files / 5737 lines |
| quality_scripts | 9 files / 4011 lines |
| provider_adapters | 15 files / 1437 lines |

**实现证据**：

- `docs/code-graph.md`
- `docs/code-graph.mmd`

## 可以重点包装的“面试亮点”

### 30 秒版本

QuorumMind 是我做的一个多 Agent 决策与蓝图平台。它不是单纯问大模型，而是把决策拆成独立提案、盲审互评、修订、共识评分和人工复审。后面我把 Blueprint 升级成 LangGraph 有界自主 Agent 平台，加入 Planner、Executor、Critic、Memory、Supervisor、工具权限系统、80% 共识阈值、checkpoint 和 AgentEval。项目有 30 条 AgentEval 全量评估，平均分 96.3；视觉回归 74 项 0 失败；真实 Decision API smoke 4/4 通过，provider schema 100% 可用；同时我做了 live audit harness，支持增量 JSONL、resume 和 providerSource 标记。

### 90 秒版本

这个项目解决的是：AI 给出的架构决策和复杂方案往往不可审查、不可复盘、不可评估。我把它设计成一个 local-first 的多 Agent 决策平台。前端是 React 工作台，后端是 Node.js API gateway，provider key 不进浏览器。核心有两条线：Decision Room 负责架构/技术/产品取舍，Blueprint Room 负责开放式方案设计。

Decision Room 里多个 agent 先独立提案，再匿名盲审、互相质询、修订，最后用 Borda、Bayesian Weighted Voting、Minimax Regret、TOPSIS、Monte Carlo、AHP 等算法形成 Quorum Score 和 Dissent Index。Blueprint Room 进一步接入 LangGraph/LangChain，落地 Planner/Executor/Critic/Memory/Supervisor、工具权限、checkpoint、共识循环和人工复审门。为了避免 Agent 只是看起来高级，我做了 AgentEval：30 条 full suite 覆盖 Decision、Blueprint、Agent Blueprint，评估结果质量、轨迹、工具/Schema、协作、成本和可解释性，当前 30/30 通过，平均分 96.3。

工程上我还做了真实 provider schema hardening、fallback 透明化、安全策略、视觉回归和 live audit harness。真实 Decision smoke 4 条全部通过；Blueprint live 小样本功能可用，但发现某个模型 seat 在长 prompt 下不稳定，所以又加了 provider deep connectivity 和禁用不稳定模型 seat 的机制。这个项目的重点不是“我调了几个 prompt”，而是把 agentic workflow 的可靠性、评估、权限、记忆和可观测性做成了完整工程体系。

## 简历/作品集 bullet 版本

- 设计并实现 QuorumMind，一个 React + Node.js + LangGraph/LangChain 的多 Agent 决策与方案蓝图平台，将架构取舍和开放式系统设计转化为可审计的提案、盲审、质询、修订、共识评分、人工复审和导出流程。
- 落地有界自主 Agent 平台：Planner/Executor/Critic/Memory/Supervisor、LangChain tools、工具权限系统、MemorySaver/SqliteSaver checkpoint、`threadId`、`maxConsensusRounds`、`routeDecisions`、`terminationReason` 和 `human_review_gate`。
- 构建多算法决策层：Borda Count、Bayesian Weighted Voting、Weighted Utility、Minimax Regret、TOPSIS、Monte Carlo Stress Lens、AHP Sensitivity、Quorum Score、Dissent Index 和 Model Reputation feedback calibration。
- 构建 AgentEval 评估体系，覆盖最终答案质量、执行轨迹、工具/Schema、协作质量、延迟/Token 和可解释性；30 条 full suite 全部通过，平均分 96.3，平均轨迹分 95，工具/Schema 分 100，fallback 0%。
- 建立真实 provider 质量门：OpenAI/DeepSeek/Gemini/统一 gateway adapter、provider trace、JSON extraction、phase-specific schema hardening、bounded repair、failure classification、fallback transparency 和不稳定模型 seat 禁用机制。
- 完成真实 API 小样本验收：Decision smoke 4/4 通过，live verdict/schema/中文/相关性均 100%，fallback 0%；Provider 深度连通性 3/3 seats schema usable 100%。
- 将 live audit 从黑盒长任务升级为可观测 harness：case start/result/trace 日志、增量 JSONL、resume、全局 max runtime、SIGINT 摘要、`providerSource=real|mock`，避免重复消耗真实 API。
- 建立产品级质量保障：Vitest 30 files / 144 tests passed，Playwright 视觉回归 74 checks / 0 failed，mock E2E 9 provider calls passed，生产 build passed。
- 实现项目内 skill governance：将 Decision Review、Blueprint Planner、Consensus Loop、AgentEval、Live Model QA、Report Export、Security Guard、Zh Localization、Token Guard 沉淀为可注入 `SKILL.md` 方法论。
- 实现 local-first 安全与持久化：API key server-side、CORS allowlist、API token、rate limit、body size limit、安全响应头、localStorage history、SQLite snapshots、reputation feedback 和可恢复历史记录。

## 可直接对外展示的结果数字

| 数字 | 说法 |
| ---: | --- |
| 30 | AgentEval full suite 用例数 |
| 96.3 | AgentEval 平均总分 |
| 95 | AgentEval 平均轨迹分 |
| 100 | AgentEval 工具/Schema 分 |
| 0% | AgentEval fallback 率 |
| 8/8 | local rubric Judge 抽检通过 |
| 95.2 | Judge mock 平均分 |
| 74/74 | 浏览器视觉/交互检查通过 |
| 30 files / 144 tests | Vitest 测试通过 |
| 4/4 | 真实 Decision API smoke 通过 |
| 36 | Decision smoke 预估真实 provider 调用预算 |
| 100% | 真实 Decision live verdict/schema/中文/相关性通过率 |
| 0% | 真实 Decision fallback 率 |
| 3/3 | Provider deep connectivity seat 通过 |
| 100% | Provider deep JSON parse/schema usable |
| 9 | mock E2E provider calls |
| 15 | Deep/Red-team 三 provider seats 下最大 live trace calls |
| 93 | code graph 扫描文件数 |
| 246 | 本地 import edges |

## 当前边界与诚实表述

必须保留这些边界，反而会显得更专业：

- AgentEval 是离线规则评估，不等同真实模型主观质量。
- Agent Judge 当前是 `local_rubric_mock`，不是付费 LLM-as-a-Judge。
- Visual audit 是 mock live 浏览器检查，不证明真实 provider 稳定。
- Decision 真实 API smoke 已通过，但 Blueprint/Agent live 在长 prompt 下仍可能遇到个别 seat provider error。
- QuorumMind 是有界自主 Agent 工作流平台，不应宣称完全无约束自主多 Agent society。
- 最终 Blueprint 即使使用 live trace，也仍由 QuorumMind deterministic synthesis 归一化生成；UI/报告会标明来源。

推荐对外说法：

> 真实 API 调用链已经接通，Decision smoke 通过；Blueprint/Agent live 小样本功能可用，但长 prompt 下仍需继续观察模型 seat 稳定性。系统重点不是假装模型永远可靠，而是通过 schema hardening、trace、fallback、providerSource、禁用不稳定 seat 和 live audit harness，把真实模型质量风险显式暴露并可回归验证。

## 目前最有辨识度的 6 个亮点

1. **有界自主 Agent 平台**：LangGraph + LangChain tools + Planner/Executor/Critic/Memory/Supervisor，不是普通 workflow。
2. **可审查共识循环**：80% 阈值、routeDecisions、terminationReason、human_review_gate。
3. **AgentEval 工程化**：30 条 full suite，评估结果、轨迹、工具、协作、成本和解释性。
4. **真实模型质量门**：schema hardening、fallback transparency、provider deep connectivity、disabled seat。
5. **Live Audit Harness**：增量 JSONL、resume、max runtime、providerSource，解决真实 API 回归黑盒问题。
6. **项目内 Skill Governance**：把方法论拆成 quorummind-* skills，可按问题注入，而不是堆长 prompt。
