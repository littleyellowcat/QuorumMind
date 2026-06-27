# QuorumMind 项目亮点完整审计

日期：2026-06-25
用途：作品集亮点提取、简历素材库、面试答辩证据库、后续项目总结引用
口径：本文件基于当前仓库代码、项目文档、质量报告和本轮重新运行的离线/mock 验证整理。真实 API 结果只引用已有真实 API 审计报告，本轮没有再次消耗真实 provider。

## 一句话定位

QuorumMind 是一个 **LangGraph 编排的有界自主多 Agent 决策与方案蓝图平台**。

它不是“调用几个模型然后总结”的聊天 Demo，而是把复杂决策和开放式方案设计拆成可审查的 agentic workflow：多 Agent 独立提案、盲审互评、交叉质询、循环修订、共识阈值、人工复审、记忆注入、工具权限、真实 provider trace、schema 质量门、AgentEval 评估和可追溯导出。

更稳妥的对外表述：

> QuorumMind 落地了 Multi-Agent Debate、Planner-Executor-Critic、Memory Agent、Supervisor Agent、Evaluator-Optimizer、bounded ReAct、Human-in-the-loop、LangGraph checkpoint、工具权限治理、AgentEval 和 Live Audit Harness。它是有界自主多 Agent 工作流平台，不应夸成无约束自主 Agent 社会。

## 本轮重新验证结果

本轮为了提高数据可信度，重新运行了不消耗真实 API 的完整验证组合。

| 验证项 | 命令 | 结果 | 口径 |
| --- | --- | --- | --- |
| 单元/集成测试 | `npm test -- --run` | 30 files / 144 tests passed | 本地 Vitest |
| AgentEval full | `npm run agent:eval:full` | 30/30 passed，平均分 96.3 | 离线规则评估，不调用真实模型 |
| AgentEval 本地 Judge 抽检 | `npm run agent:judge` | 8/8 passed，平均 Judge 分 95.2 | local rubric mock，不是真实 LLM Judge |
| Mock E2E | `npm run mock:e2e` | passed，9 provider calls，openai/deepseek/gemini | mock live provider，不消耗 API |
| 系统质量审计 | `npm run quality:audit` | 30 cases，allCasePassRate 100%，localizedChinesePassRate 100% | deterministic + mock live |
| 浏览器视觉审计 | `npm run visual:audit` | 74 checks / 0 failed | mock live，Playwright 临时服务 |
| 生产构建 | `npm run build` | TypeScript + Vite build passed | 本地构建 |

说明：我没有找到“当前重新跑出来的 96.6”这个数字。本轮可信结果是 **AgentEval 平均分 96.3**；如果简历/作品集要写数字，建议写 96.3，不要写记忆中的 96.6。

## 已有真实 API 审计结果

这些结果来自 `docs/quality/2026-06-25-real-api-functional-audit.md` 和 `docs/quality/2026-06-25-provider-deep-connectivity-audit.md`。

| 链路 | 结果 | 可信边界 |
| --- | --- | --- |
| Decision live smoke | 4/4 passed | 真实 provider，小样本 |
| Decision live verdict | 100% | 4 条真实 API smoke |
| Decision schema usable | 100% | 0% repair，fallback 0% |
| Decision 中文/相关性 | 100% / 100% | 4 条真实 API smoke |
| Blueprint / Agent live 小样本 | 功能可用率 100%，中文/相关性/详细度 100% | 2 条真实 API，小样本 |
| Blueprint strict | 0% | 因 `gpt-5.4-mini` proposal seat 出现 provider_error |
| 禁用异常 seat 后 Blueprint | 1 条 strict 100% | 证明 seat 降级策略有效 |
| Provider 深度连通性 | 3/3 seats responded，JSON parsed 100%，schema usable 100% | 最小 JSON schema prompt |

边界：真实 Decision 链路已比较稳；Blueprint/Agent live 在长 prompt 下仍可能受单个 provider seat 稳定性影响。项目做得比较好的地方是：它会把 provider error、schema 不可用和 fallback 透明暴露出来，而不是伪装成真实模型成功。

## 代码体量与结构证据

| 维度 | 当前数据 |
| --- | ---: |
| Code graph 扫描文件 | 93 |
| 本地 import 边 | 246 |
| 当前统计代码/测试/脚本/质量文档行数 | 34033 |
| AgentEval JSONL 用例 | 30 |
| 项目内 QuorumMind skills | 9 |

关键实现文件：

| 文件 | 行数 | 作用 |
| --- | ---: | --- |
| `src/App.tsx` | 5395 | React 工作台、首页、决策室、蓝图室、Agent 平台 UI |
| `src/lib/blueprint.ts` | 3455 | Blueprint 方案生成、多轮讨论、详细方案结构 |
| `server/agent-platform/autonomous-blueprint.ts` | 2923 | LangGraph 有界自主 Agent 平台 |
| `src/lib/exporters.ts` | 1477 | ADR、报告、PDF、Prompt bundle 导出 |
| `scripts/agent-performance-eval.ts` | 1008 | AgentEval 离线评估框架 |
| `scripts/live-model-quality-audit.ts` | 952 | Decision live 质量回归 |
| `scripts/live-blueprint-quality-audit.ts` | 916 | Blueprint/Agent live 质量回归 |
| `scripts/visual-audit.ts` | 751 | Playwright 视觉回归 |
| `server/decision-api.ts` | 756 | 本地 Node API 网关 |

## 亮点 1：Decision Room 把“问 AI”变成可审查决策

**解决的问题：** 普通 LLM 往往直接给结论，用户看不到候选方案、互评过程、假设、风险和为什么选择某个方案。

**实现策略：**

- Proposal Round：多个 Agent 独立提案。
- Blind Review：隐藏 provider、model、agent 身份做匿名互评。
- Cross-Examination：互相挑刺，暴露缺口和失败路径。
- Revision Round：吸收质询后修订。
- Consensus Engine：聚合排序、效用、置信度、后悔值和模型声誉。
- Final Verdict：输出推荐、风险、回滚路径和 ADR。

**证据：** `src/lib/workflow.ts`、`src/lib/demo-agents.ts`、`server/live-decision.ts`、`server/live-aggregation.ts`、`DECISION_ENGINE.md`。

**结果：** 决策不再只是“答案”，而是带有分歧、风险、假设、回滚计划和 ADR 的评审材料。

## 亮点 2：Blueprint 模式让系统能回答开放式方案问题

**解决的问题：** 用户不一定问二选一，更多时候会问“我想做一个系统，Agent 怎么分工、字段怎么设计、工作流怎么拆、里程碑怎么排”。

**实现策略：**

- 从用户自然语言中动态识别目标、角色、模块、数据对象、风险和交付物。
- 生成目标/非目标、Agent/模块职责、工作流、异常流、schema、验收标准、风险矩阵和 backlog。
- 输出完整方案和简版 PDF，而不是固定模板。

**证据：** `src/lib/blueprint.ts`、`src/lib/blueprint.test.ts`、`server/decision-api.ts`、`skills/quorummind-blueprint-planner/SKILL.md`。

**结果：** AgentEval full 覆盖 10 条 Blueprint 和 9 条 Agent Blueprint，全部通过；视觉审计覆盖 Blueprint 输入、运行后结果页和导出入口。

## 亮点 3：LangGraph/LangChain 有界自主 Agent 平台

**解决的问题：** 一次性函数流程无法表达“规划、执行、批判、记忆、主管决策、权限、循环、checkpoint、人工复审”。

**实现策略：**

- 使用 `@langchain/langgraph` 的 `StateGraph` 作为服务端状态机。
- 使用 `@langchain/core/tools` 包装本地 QuorumMind 工具。
- 默认 `MemorySaver` checkpoint，可通过 `QUORUMMIND_SQLITE_PATH` 切换到 `SqliteSaver`。
- 支持 `threadId`、`maxConsensusRounds`、`runtimeLimits`、`routeDecisions`、`terminationReason`。

**核心路径：**

```text
route_intent -> understand_request -> react_toolbox
-> planner_agent -> memory_agent -> executor_agent
-> draft_blueprint -> live_model_review? -> cross_review
-> critic_agent -> supervisor_agent -> validate_result
-> revise_discussion / human_review_gate / finalize
```

**证据：** `server/agent-platform/autonomous-blueprint.ts`、`server/agent-platform/autonomous-blueprint.test.ts`、`API_CONTRACT.md`。

**结果：** Agent 平台返回并展示 taskTree、toolPermissions、executorActions、criticReviews、memoryEvents、supervisorDecisions、consensusLoop、routeDecisions、trace 和 checkpoint。

## 亮点 4：混合 Agent 范式，不是单一 ReAct 或固定工作流

**解决的问题：** 单纯 ReAct 容易工具调用失控，单纯固定工作流又缺少 Agent 反思和循环能力。

**实现策略：**

| 层 | 项目实现 | 价值 |
| --- | --- | --- |
| 外层 | LangGraph Workflow Agent | 管状态、路由、预算、checkpoint、终止 |
| 中层 | Multi-Agent Debate + Critique/Revision | 多模型独立提案、互评、挑刺、修订 |
| 内层 | Evaluator-Optimizer | 低共识时继续优化，高风险时进人工复审 |
| 局部 | Bounded ReAct Tools | 只在节点内记录 Thought / Action / Observation，不开放无界工具 |

**证据：** `docs/quality/2026-06-23-agent-pattern-upgrade.md`、`server/agent-platform/autonomous-blueprint.ts` 中 `react_toolbox`、`evaluatorGate`、`validate_result`、`revise_discussion`。

**结果：** 可以在面试中准确说：项目使用了 ReAct 思想，但不是无约束 ReAct；它把 ReAct 限制在受控工具步骤内，外层由 LangGraph 和权限策略兜住。

## 亮点 5：Planner / Executor / Critic / Memory / Supervisor 五类 Agent

**解决的问题：** 多 Agent 如果只是多个角色名，本质仍然是 prompt 拼接；需要有明确职责、输出字段和可审查轨迹。

**实现策略：**

| Agent | 返回字段 | 作用 |
| --- | --- | --- |
| Planner Agent | `taskTree` | 将目标拆成任务、依赖、owner、工具和验收标准 |
| Executor Agent | `executorActions` | 根据权限执行本地受控任务，高风险只 staged |
| Critic Agent | `criticReviews` | 检查任务覆盖、权限边界、共识分、弱项和延后采纳 |
| Memory Agent | `memoryEvents` | 读写 run/thread/durable 记忆、知识注入和 checkpoint 证据 |
| Supervisor Agent | `supervisorDecisions` | 判断继续、暂停人工复审或 finalize |

**证据：** `server/agent-platform/autonomous-blueprint.ts` 中 `plannerAgentTool`、`executorAgentTool`、`criticAgentTool`、`memoryAgentTool`、`supervisorAgentTool`。

**结果：** 视觉审计明确验证 Agent 平台结果页中 Planner、Executor、Critic、Memory、Supervisor 和权限类别均可见。

## 亮点 6：记忆机制不是一个词，而是一组可扩展记忆层

**解决的问题：** Agent 不应该每次都像第一次见用户；同时长上下文也会膨胀，历史偏好和失败样本需要沉淀。

**实现策略：**

- **Checkpoint 记忆：** LangGraph `MemorySaver` 默认启用，`threadId` 支持稳定线程。
- **持久化 checkpoint：** 配置 `QUORUMMIND_SQLITE_PATH` 后使用 `SqliteSaver`，写入 `langgraph_checkpoints` 和 `langgraph_writes`。
- **长期项目知识：** `knowledge-index` / `knowledge-inject` 从 `KNOWLEDGE.md` 和历史决策中注入团队约束。
- **Context Compressor：** 估算 token、在上下文压力过高时压缩历史状态，保留最近共识轮和硬约束。
- **Memory Agent 事件：** 记录 thread summary、preference summary、project profile、last-vs-current diff、failure sample backlog。
- **本地历史记忆：** 浏览器 localStorage 保存最近决策，SQLite 可保存 server-side snapshots。
- **模型声誉记忆：** 用户 helpful / needs-work 反馈会影响后续模型领域权重。

**证据：** `server/agent-platform/autonomous-blueprint.ts`、`server/persistence/sqlite-saver.ts`、`server/context-compressor.ts`、`server/knowledge-inject.ts`、`PERSISTENCE.md`、`src/lib/reputation-feedback.ts`。

**结果：** 项目具备长期运行底座：不是隐藏 fine-tuning，而是可解释的 checkpoint、知识注入、历史偏好和失败样本回流。

## 亮点 7：80% 共识阈值 + 人工复审门

**解决的问题：** 多 Agent Demo 常见问题是“讨论一轮就强行输出”，没有终止标准，也没有共识不足时的人工接管。

**实现策略：**

- 默认共识阈值 80。
- `validate_result` 判断是否达到阈值。
- 如果低于阈值且仍有预算：`revise_discussion -> critic_agent -> supervisor_agent -> validate_result`。
- 如果轮次耗尽仍未达标：进入 `human_review_gate`。
- 记录 `routeDecisions` 和 `terminationReason`。

**证据：** `API_CONTRACT.md`、`server/agent-platform/autonomous-blueprint.ts`、AgentEval 用例 `agent-human-review-budget-zh`。

**结果：** AgentEval 覆盖共识 76 仍通过的情况，因为它正确进入复审路径；这不是失败，而是按规则暴露“需要人审”。

## 亮点 8：工具权限系统避免 Agent 静默越权

**解决的问题：** 自主 Agent 最大风险之一是静默写文件、调用外部 API、发邮件、部署、删除资源或产生费用。

**实现策略：**

| 权限类别 | 默认策略 |
| --- | --- |
| `read_only` | 自动执行 |
| `local_file_write` | 受控 checkpoint 可自动；用户可见导出需确认 |
| `external_api_call` | 需要人工确认 |
| `live_model_call` | 用户选择 live 且在预算内可执行 |
| `production_operation` | 默认 blocked |
| `paid_operation` | 默认 blocked |

**证据：** `server/agent-platform/autonomous-blueprint.ts`、`API_CONTRACT.md`、`docs/quality/2026-06-24-autonomous-agent-upgrade.md`。

**结果：** live provider 调用和高风险外部动作都会进入权限账本；前端展示 auto / requires_human / blocked，而不是让 Agent 私下执行。

## 亮点 9：多算法决策层，而不是写死共识分

**解决的问题：** 单一分数容易误导，比如“赢家稳定率高但分歧也高”其实是两种不同含义。

**实现策略：**

- Borda Count：聚合排序。
- Bayesian Weighted Voting：融合模型权重、领域声誉和置信度。
- Weighted Utility：按多指标效用评分。
- Quorum Score：综合效用、排序、置信度和 regret penalty。
- Dissent Index：显示分歧强度。
- Minimax Regret：分析最坏后悔值。
- TOPSIS：衡量接近理想解程度。
- Monte Carlo Stress Lens：模拟不确定性下的赢家稳定性。
- AHP Sensitivity：不同权重压力下看赢家是否改变。
- Model Reputation：用历史反馈校准领域权重。

**证据：** `src/lib/scoring.ts`、`src/lib/ahp.ts`、`src/lib/model-reputation.ts`、`DECISION_ENGINE.md`。

**结果：** 系统能解释“裁决综合分”“分歧指数”“稳定赢家率”“后悔值”分别代表什么，避免一个分数万能化。

## 亮点 10：Model Reputation 形成可解释反馈闭环

**解决的问题：** 不同模型在不同领域表现不一样，固定权重不合理；但黑箱 fine-tuning 又不透明。

**实现策略：**

- 根据问题推断领域，如技术架构、产品策略、职业策略、作品集包装。
- 每个模型 seat 有 domain reputation。
- 用户反馈 helpful / needs-work 后生成 bounded feedback。
- 下次运行时调整有效权重，UI 展示 reputation、domain、rationale、effective weight。

**证据：** `src/lib/model-reputation.ts`、`src/lib/reputation-feedback.ts`、`PERSISTENCE.md`、对应测试文件。

**结果：** 有学习闭环，但权重变化可解释、幅度受限，不会变成不可解释的模型偏置。

## 亮点 11：真实模型调用链具备 schema hardening

**解决的问题：** 真实 LLM 可能输出英文、跑题、非 JSON、字段缺失或 schema 不合格；如果静默兜底，用户会误以为真实模型参与了。

**实现策略：**

- Provider API key 只在 Node server。
- Provider trace 记录 provider、model、phase、duration、jsonParsed、validationStatus、failureClass。
- 支持 strict JSON、Markdown fenced JSON、叙述文本中的 balanced JSON。
- phase-specific schema normalization。
- bounded repair。
- fallback source 透明展示。
- `QUORUMMIND_DISABLED_LIVE_MODELS` 临时禁用异常 seat。

**证据：** `server/live-decision.ts`、`server/provider-json.ts`、`server/provider-schema.ts`、`server/providers/registry.ts`、`scripts/live-model-quality-audit.ts`。

**结果：** Decision 真实 API smoke 4/4 通过；Blueprint 小样本在异常 seat 下也能识别 warning，并在禁用 seat 后达到单条 strict 100%。

## 亮点 12：Live Audit Harness 把真实 API 回归工程化

**解决的问题：** 长时间真实 API 回归最怕黑盒：不知道卡在哪个 case、哪个 provider、哪个 phase，中断后还要重跑烧成本。

**实现策略：**

- 每个 case start/result 日志。
- provider trace summary 输出。
- 每完成一个 case 增量写入 JSONL。
- 支持 resume。
- 支持全局 max runtime。
- 支持 SIGINT 摘要。
- 区分 `providerSource=real|mock`。

**证据：** `scripts/audit-harness.ts`、`scripts/live-model-quality-audit.ts`、`scripts/live-blueprint-quality-audit.ts`、`docs/quality/2026-06-25-live-audit-harness-hardening.md`。

**结果：** mock harness 自检覆盖 Decision 和 Blueprint；resume 能跳过已完成 case；真实 API 回归可以小批量、可中断、可续跑。

## Harness Engineering 四组件映射

这里需要单独强调：QuorumMind 的 Harness Engineering 不只是 `scripts/audit-harness.ts` 这个脚本，而是一套把 Agent 系统“兜住”的工程层。它由四个组件共同组成：

| 组件 | 项目实现 | 解决的问题 | 证据 |
| --- | --- | --- | --- |
| 记忆与文件系统 | `MemorySaver` / `SqliteSaver` checkpoint、`threadId`、SQLite snapshots、localStorage 历史、knowledge injection、context compressor、JSONL progress 文件 | 让 Agent run 可以保存、恢复、对比历史、压缩上下文，并在长任务中避免中断后从零开始 | `server/persistence/sqlite-saver.ts`、`server/context-compressor.ts`、`server/knowledge-inject.ts`、`PERSISTENCE.md`、`output/audit-progress/*.jsonl` |
| 验证与反馈回路 | AgentEval、local rubric Judge、system quality audit、mock E2E、visual audit、live quality audit、Model Reputation feedback | 把“效果好不好”从主观感觉变成测试集、轨迹评分、schema 检查、中文/相关性检查、用户反馈和趋势报告 | `scripts/agent-performance-eval.ts`、`scripts/agent-judge-audit.ts`、`scripts/system-quality-audit.ts`、`scripts/visual-audit.ts`、`src/lib/reputation-feedback.ts` |
| 安全断路和沙箱 | 工具权限 auto / requires_human / blocked、生产/付费操作默认 blocked、CORS allowlist、API token、rate limit、body limit、security headers、mock provider 模式 | 防止 Agent 静默越权、生产误操作、API key 泄露、外部调用失控、成本失控和恶意大请求 | `server/security.ts`、`server/agent-platform/autonomous-blueprint.ts`、`SECURITY_PRIVACY.md`、`skills/quorummind-security-guard/SKILL.md` |
| 工具与 API 集成层 | LangChain Core tools、本地 Node API gateway、OpenAI/DeepSeek/Gemini/model gateway adapters、provider trace、schema hardening、PDF/export API | 把模型、工具、导出、Provider、Agent Graph 接到统一边界里，并记录每次调用的来源、状态和失败原因 | `server/decision-api.ts`、`server/providers/*`、`server/live-decision.ts`、`server/provider-schema.ts`、`src/lib/api-client.ts`、`src/lib/exporters.ts` |

这四层组合起来，才是项目里真正的 harness engineering：它把 Agent 的记忆、执行、评估、安全、工具调用和外部 API 都纳入可观测、可恢复、可限制的工程边界。面试里可以这样讲：

> 我没有只做一个 Agent 流程，而是给 Agent 做了 harness engineering：底层有记忆与文件系统保存运行状态，中间有评估和反馈回路持续打分，外侧有安全断路和沙箱防止越权，最外层通过工具/API 集成层把 provider、导出、LangChain tools 和本地服务统一接入。

## 亮点 13：AgentEval 不是只测答案，而是测“结果 + 轨迹 + 工具 + 成本”

**解决的问题：** Agent 系统如果只看最终答案，会漏掉错误路径、乱用工具、schema 缺失、成本失控和不可解释的问题。

**实现策略：**

| 维度 | 权重 |
| --- | ---: |
| 结果质量 | 35% |
| 执行轨迹 | 20% |
| 工具/Schema | 15% |
| 多模型协作 | 15% |
| 工程效率 | 10% |
| 可解释性 | 5% |

同时映射美团龙猫式三维：推理维度、工具维度、交互维度。

**证据：** `scripts/agent-performance-eval.ts`、`eval/agent-eval-cases.jsonl`、`skills/quorummind-agent-eval/SKILL.md`。

**结果：** 本轮 `agent:eval:full` 30/30 通过，平均 96.3，轨迹 95，工具/Schema 100，工具召回 100%，fallback 0%。

## 亮点 14：Skill Governance 把方法论从 Prompt 中拆出来

**解决的问题：** 所有规则塞进一个大 prompt 会难维护、难复用，也不利于按不同场景注入。

**实现策略：**

项目内沉淀 9 个 `quorummind-*` skills：

| Skill | 作用 |
| --- | --- |
| `quorummind-decision-review` | 决策评审、ADR、共识/分歧解释 |
| `quorummind-blueprint-planner` | 开放式需求转完整方案蓝图 |
| `quorummind-consensus-loop` | 独立提案、盲审、修订、阈值终止 |
| `quorummind-agent-eval` | AgentEval、轨迹、schema、成本和延迟 |
| `quorummind-live-model-qa` | 真实模型调用、中文、相关性、schema/fallback |
| `quorummind-report-export` | ADR、蓝图、专业/简版报告导出 |
| `quorummind-security-guard` | API Token、CORS、限流、导出安全 |
| `quorummind-zh-localization` | 中文 UI、报告、长中文排版 |
| `quorummind-token-guard` | 预算、重试、验证、来源透明 |

运行时 `skill-loader` 支持项目 skills 和 `~/.quorummind/skills/*.md`，按 domain、role、triggers 匹配最多 6 个，模型可选择注入 0-3 个。

**证据：** `server/skill-loader.ts`、`server/skill-inject.ts`、`skills/quorummind-*/SKILL.md`、`docs/quality/skill-governance.md`。

**结果：** 这可以作为项目亮点讲：不是简单 prompt engineering，而是做了可管理、可触发、可复用的 agent skill governance。

## 亮点 15：安全策略覆盖本地自用到对外分享的边界

**解决的问题：** 带 API key 的 AI 工具如果没有安全边界，很容易被跨域滥用、被大请求拖垮或泄露 provider key。

**实现策略：**

- provider key 只放 `.env.local`，浏览器永远拿不到真实 key。
- `/api/health` 和 `/api/security` 不返回 secret。
- CORS allowlist，默认只允许本地 Vite origins。
- 可选 `QUORUMMIND_API_TOKEN`，支持 `X-QuorumMind-Token` 和 Bearer。
- 默认 60 requests/min 限流。
- 默认 256 KiB 请求体限制。
- 安全响应头：CSP、X-Frame-Options、X-Content-Type-Options、Referrer-Policy、Permissions-Policy、Cache-Control no-store。
- HSTS 可选。

**证据：** `server/security.ts`、`SECURITY_PRIVACY.md`、`skills/quorummind-security-guard/SKILL.md`。

**结果：** 项目不是只考虑功能，还具备 API Security Posture Management 的意识；自用方便，对外分享前也有明确加固清单。

## 亮点 16：本地优先 + mock live 控制成本

**解决的问题：** 真实 API 慢、贵、不稳定；但完全不用 live trace 又无法验证 provider 链路。

**实现策略：**

- 默认 demo/deterministic 不调用外部 API。
- `QUORUMMIND_MOCK_PROVIDERS=1` 提供 keyless live-like provider。
- mock live 仍然走 provider trace、schema validation、aggregation。
- 真实 API audit 单独手动运行，避免 CI 或日常测试烧 key。

**证据：** `server/providers/mock.ts`、`scripts/mock-e2e.ts`、`README.md`。

**结果：** 本轮 mock E2E 通过，9 provider calls 覆盖 openai/deepseek/gemini 和 proposal/ranking/verdict phases。

## 亮点 17：导出体系同时服务专家和非专家

**解决的问题：** 专家需要 trace、评分、ADR；普通用户只想要最终方案，不想看复杂调试过程。

**实现策略：**

- ADR Markdown。
- JSON trace。
- 专业 HTML/PDF 报告。
- 简版最终方案 PDF。
- Blueprint 报告。
- Prompt bundle。
- Copy review package。

**证据：** `src/lib/exporters.ts`、`server/pdf-export.ts`、`skills/quorummind-report-export/SKILL.md`、`src/lib/exporters.test.ts`。

**结果：** 同一个结果可以分别给技术评审、非技术用户和面试作品集展示。

## 亮点 18：中文体验和视觉回归已工程化

**解决的问题：** AI 工具常见问题是中文模式残留英文、长中文溢出、三栏滚动互相干扰、移动端不可用。

**实现策略：**

- 中文/英文切换。
- Tooltip 解释指标。
- 三栏独立滚动。
- 长中文问题覆盖。
- 导出报告残留英文扫描。
- 桌面、窄屏、移动端 Playwright 审计。

**证据：** `scripts/visual-audit.ts`、`src/App.tsx`、`src/styles.css`、`src/i18n`、`skills/quorummind-zh-localization/SKILL.md`。

**结果：** 本轮视觉审计 74 checks / 0 failed，覆盖 Agent 平台 Planner/Executor/Critic/Memory/Supervisor 可见性、导出入口、Tooltip、中文残留、横向溢出和按钮文字溢出。

## 亮点 19：首页和产品体验不是空壳

**解决的问题：** 作品集项目如果一进来就是工具表单，普通用户不知道做什么；如果只是 landing page，又不像真实产品。

**实现策略：**

- 用首页引导进入工作台。
- 使用 React + GSAP 做具有动效的产品第一屏。
- 工作台保留决策室、蓝图室、设置状态、新手引导、示例问题、指标说明和历史入口。

**证据：** `src/App.tsx`、`src/styles.css`、`package.json` 中 GSAP 依赖。

**结果：** 项目既能作为可运行工具，也能作为作品集展示，不只是后端能力堆叠。

## 亮点 20：Code Graph 和模块边界让复杂度可解释

**解决的问题：** 项目功能多之后容易被看成一个大文件堆功能，不利于面试讲架构。

**实现策略：**

- 生成 `docs/code-graph.md` 和 Mermaid 图。
- 按 frontend_app、domain_core、api_server、provider_adapters、agent_platform、persistence、quality_scripts 分组。
- 标出 import edges、决策室链路、蓝图/Agent 链路、Provider 图和质量评估图。

**证据：** `docs/code-graph.md`。

**结果：** 可清楚解释前端、领域核心、API、Provider、Agent 平台、持久化和质量脚本之间的依赖关系。

## 亮点 21：API Contract 和文档同步

**解决的问题：** Agent 平台字段多，如果没有 API contract，前后端和报告很容易各说各话。

**实现策略：**

- `API_CONTRACT.md` 记录 `/api/decisions`、`/api/blueprints`、`/api/agent-runs/blueprint`。
- 明确 `blueprintExecution.actual`、fallback reason、live source、agentRuntime、runtimeLimits、routeDecisions。
- README 记录配置、真实模型、mock provider、AgentEval、visual audit、live audit、persistence、security。

**证据：** `API_CONTRACT.md`、`README.md`。

**结果：** 项目可解释性更强，后续扩展设置页、多人使用、外部调用时不容易乱。

## 亮点 22：Prompt bundle / 手工 provider 仍保留兜底协作路径

**解决的问题：** 真实 API 不稳定或用户暂时没有 key 时，系统不应该完全不可用。

**实现策略：**

- 决策室保留 deterministic baseline。
- 支持手工 prompt bundle。
- Provider trace 不可用时 UI 显示 deterministic fallback。
- 报告和导出标注来源。

**证据：** `src/lib/manual-provider.ts`、`src/lib/api-client.ts`、`src/App.tsx`、`README.md`。

**结果：** 项目能在无 key、mock、真实 API 三种环境下演示，并清楚说明结果来源。

## 面试亮点表达建议

### 30 秒版本

我做的 QuorumMind 不是普通大模型问答，而是一个 LangGraph 编排的有界自主多 Agent 决策平台。它把复杂架构决策和开放式方案设计拆成独立提案、盲审互评、质询修订、共识评分、人工复审、记忆注入、工具权限和 AgentEval 质量门，并通过真实 provider trace、schema hardening、Live Audit Harness 和视觉回归保证结果可审查、可评估、可运维。

### 2 分钟版本

这个项目核心是把“问 AI”产品化成可审计 agentic workflow。决策室使用多 Agent debate 和 Delphi 风格流程，让模型独立提案、匿名互评、交叉质询、修订后再聚合；蓝图室支持开放式需求，能输出 Agent 分工、schema、工作流、里程碑、风险矩阵和 backlog。服务端用 LangGraph StateGraph 实现 Planner、Executor、Critic、Memory、Supervisor，并用 MemorySaver/SQLite checkpoint、threadId、上下文压缩、知识注入和 failure backlog 做长期运行底座。为了避免 Agent 越权，我做了工具权限系统，把只读、本地写入、外部 API、真实模型、生产操作和付费操作分成 auto、requires_human 和 blocked。质量侧做了 AgentEval、Live Audit Harness、mock live、视觉回归和真实 provider smoke，其中本轮离线 AgentEval 30/30 通过，平均 96.3，视觉审计 74/74 通过，真实 Decision API smoke 4/4 通过。

## 简历可用 Bullet

- **设计并实现** LangGraph 有界自主多 Agent 决策平台，落地 Planner/Executor/Critic/Memory/Supervisor、checkpoint thread、route decisions、human review gate 和 80% 共识阈值，将一次性生成升级为可审查循环工作流。
- **构建** 多模型互评与多算法共识层，融合 Borda、Bayesian Weighted Voting、TOPSIS、Monte Carlo、AHP、Minimax Regret 和模型声誉反馈，分别解释裁决分、分歧、稳定性和后悔风险。
- **实现** Memory 体系，结合 MemorySaver/SqliteSaver、threadId、knowledge injection、context compressor、localStorage/SQLite 历史和 reputation feedback，支持项目偏好、历史对比和失败样本回流。
- **搭建** Live Audit Harness 和 AgentEval 评估体系，覆盖结果质量、轨迹、工具/schema、协作、延迟、Token 和来源透明；本轮 AgentEval full 30/30 通过，平均分 96.3，工具/schema 分 100，fallback 0%。
- **封装** OpenAI/DeepSeek/Gemini/OpenAI-compatible provider adapter，支持 JSON 提取、schema normalization、bounded repair、failure classification、fallback transparency 和异常模型 seat 禁用；真实 Decision smoke 4/4 通过，fallback 0%。
- **补齐** API 安全和工具权限治理，服务端保存 provider key，增加 CORS allowlist、API Token、60 req/min 限流、256 KiB body limit、安全响应头，并把外部 API、生产操作和付费动作默认纳入人工确认或 blocked。

## 需要谨慎表述的边界

- 可以说：**有界自主多 Agent 工作流平台**。不建议说：完全自主、无约束多 Agent 社会。
- 可以说：真实 Decision API 小样本已通过。不要说：所有真实模型长任务都完全稳定。
- 可以说：本地 Judge 抽检 8/8 passed。不要说：已经用真实 LLM-as-a-Judge 大规模评估。
- 可以说：ReAct 思想已接入 bounded node-local tools。不要说：整个系统是纯 ReAct Agent。
- 可以说：Memory 机制具备 checkpoint、SQLite、知识注入、上下文压缩和反馈闭环。不要说：已经具备向量长期记忆或自动 fine-tuning。

## 结论

QuorumMind 当前最大的亮点不是某一个页面或某个算法，而是把一套前沿 Agent 工程组合成了可运行产品：

- Multi-Agent Debate 解决单模型片面性。
- LangGraph Loop 解决一次性流程不可控。
- Planner/Executor/Critic/Memory/Supervisor 解决 Agent 职责不清。
- Bounded ReAct 和工具权限解决自主 Agent 越权风险。
- MemorySaver/SQLite/Knowledge Injection 解决长期上下文。
- AgentEval 和 Harness 解决“效果靠感觉”的问题。
- Provider schema hardening 和 fallback transparency 解决真实模型不稳定。
- 视觉回归、中文本地化和导出体系解决产品可用性。

所以它可以定位为一个 **可审计、可评估、可复盘、可控成本的 Agentic Decision & Blueprint Platform**。这比“多模型投票工具”更准确，也更能体现项目的新颖性和工程深度。
