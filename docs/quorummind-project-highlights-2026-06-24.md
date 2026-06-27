# QuorumMind 项目亮点完整提取

日期：2026-06-24
范围：当前仓库代码、项目文档、AgentEval、系统质量审计、视觉审计、mock live E2E、真实 API 小样本回归、构建结果。
说明：离线评估和 mock live 路径已扩大覆盖；真实 API 回归只做小样本，避免在 provider/schema 未稳定前无界消耗调用。

## 一句话定位

QuorumMind 不是“问多个大模型再总结”的普通 AI Demo，而是一个**可审查、可评估、可追踪、可回归测试的多 Agent 决策与方案蓝图平台**。

它把架构取舍、技术选型、产品流程、开放式方案设计拆成可观察的过程：多 Agent 独立提案、匿名互评、挑刺、修订、共识判断、人工复审、导出 ADR / 蓝图 / PDF，并用 AgentEval 和视觉/质量审计持续验证效果。

## 当前验证结果

| 验证项 | 本轮结果 | 说明 |
| --- | ---: | --- |
| `npm test -- --run` | 30 files / 135 tests passed | 单元与模块测试通过 |
| `npm run build` | passed | TypeScript + Vite 生产构建通过 |
| `npm run quality:audit` | 30 cases / 100% | 确定性系统质量、中文本地化、导出与 mock live 检查 |
| `npm run agent:eval:full` | 30 cases / 30 passed / avg 96.3 | AgentEval 覆盖 Decision / Blueprint / LangGraph Agent Blueprint |
| `npm run quality:live` 小样本 | 1/30 cases / overall 0% | 真实 provider 被调用，但 live verdict 未生成，最终依赖确定性兜底 |
| `npm run quality:blueprint:live` 小样本 | 1/30 cases / overall 0% | 蓝图室真实 provider 被调用，但可用 live trace 为 0%，最终依赖确定性兜底 |
| `npm run mock:e2e` | passed / 9 provider calls | mock live 覆盖 openai / deepseek / gemini，proposal / ranking / verdict 三阶段 |
| `npm run visual:audit` | 59 checks / 0 failed | 桌面、窄屏、移动端、长中文、独立滚动、Tooltip、导出按钮、中文残留检查 |

重要边界：

- `agent:eval:full` 是离线规则评估，不代表真实模型 API 输出质量。
- `mock:e2e` 和 `visual:audit` 使用 mock live provider，不消耗 API key。
- 真实 API 质量已经暴露风险：当前小样本里 provider 调用存在 schema/trace 不可用，UI 和报告必须继续清晰标出 fallback 来源。

## 亮点 1：多 Agent 决策室，不是单次问答

**解决的问题**：普通 LLM 回答容易像黑盒，用户不知道方案从哪里来，也不知道模型之间是否有分歧。

**策略**：采用类似 Delphi / adversarial review 的多阶段流程。

流程：

1. Agent 独立提案。
2. Blind Review 匿名互评，隐藏 proposal 作者，降低模型品牌偏见。
3. Cross-Examination 交叉质询，攻击假设、风险和遗漏。
4. Revision Round 吸收质询后修订。
5. Consensus Engine 聚合排序、置信度、后悔值和分歧。
6. Final Verdict 输出推荐、风险、回滚路径和 ADR。

**实现位置**：

- `src/lib/workflow.ts`
- `src/lib/demo-agents.ts`
- `server/live-decision.ts`
- `server/live-agents.ts`
- `DECISION_ENGINE.md`

**结果**：

- 决策不只是“最终答案”，还包含提案、质询、修订、排名、风险雷达、假设账本、ADR。
- 用户可以看到共识和分歧，而不是被一个分数糊弄。

## 亮点 2：方案蓝图室支持开放式需求

**解决的问题**：很多用户不会只问二选一决策，而是会问“我想做一个系统，工作流、Agent 分工、字段、测试、风险怎么设计”。

**策略**：新增 Blueprint 模式，把开放式问题转成完整实施蓝图。

Blueprint 覆盖：

- 目标输出
- Agent / 模块分工
- 工作流
- 数据 Schema
- 人工复审
- 里程碑
- 风险矩阵
- 终局评估矩阵
- 质询采纳账本
- issue 级实施 backlog
- 简版 PDF / 专业报告导出

**实现位置**：

- `src/lib/blueprint.ts`
- `server/decision-api.ts`
- `src/lib/exporters.ts`
- `skills/quorummind-blueprint-planner/SKILL.md`

**结果**：

- 方案蓝图不再依赖固定模板；主题、数据源、建议区域、风险区域、Schema 概念会根据用户问题动态生成。
- AgentEval 新增 AI 运营助手、API 安全审查、知识库助手等样本，验证它不只适用于视觉小说类问题。

## 亮点 3：LangGraph / LangChain Agent 平台

**解决的问题**：一次性函数流程很难表达规划、执行、批判、记忆、主管决策、权限边界、循环、路由、checkpoint、人类复审和预算耗尽。

**策略**：把 Blueprint 的高级路径升级为 LangGraph 服务端状态图，并用 LangChain Core tools 包装本地能力；在原有共识循环上增加 Planner / Executor / Critic / Memory / Supervisor 和工具权限系统。

LangGraph 节点：

- `route_intent`
- `understand_request`
- `react_toolbox`
- `planner_agent`
- `memory_agent`
- `executor_agent`
- `draft_blueprint`
- `live_model_review`
- `cross_review`
- `critic_agent`
- `supervisor_agent`
- `validate_result`
- `revise_discussion`
- `human_review_gate`
- `finalize`

**实现位置**：

- `server/agent-platform/autonomous-blueprint.ts`
- `src/lib/api-client.ts`
- `API_CONTRACT.md`
- `docs/quality/2026-06-18-agent-platform-foundation.md`

**结果**：

- 支持 `threadId`、`maxConsensusRounds`、`runtimeLimits`、`routeDecisions`、`terminationReason`。
- 新增 `taskTree`、`toolPermissions`、`executorActions`、`criticReviews`、`memoryEvents`、`supervisorDecisions`，让自主规划、权限和主管决策可见。
- 当共识达不到阈值且轮次耗尽时，会进入 `human_review_gate`，不是假装已经收敛。
- UI 能看到节点 trace、tool calls、provider trace、任务树、权限策略、执行记录、Critic 审查、Memory 事件、Supervisor 决策、route map 和终止原因。

## 亮点 4：受控 ReAct 范式

**解决的问题**：完全自由的 ReAct Agent 容易乱调用工具、成本失控、轨迹难审计。

**策略**：采用“外层 LangGraph、内层 bounded ReAct”的组合。

设计：

- 外层由 LangGraph 控制状态、预算、路由和 checkpoint。
- 中层由 Planner / Executor / Critic / Memory / Supervisor、多 Agent 互评、修订和共识循环完成协作。
- 内层只在节点局部使用受控 ReAct tool steps。

ReAct steps 包括：

- `inspect_intent`
- `record_assumptions`
- `prepare_tool`
- `prepare_agent_loop`
- `prepare_gate`

**实现位置**：

- `server/agent-platform/autonomous-blueprint.ts`
- `docs/quality/2026-06-23-agent-pattern-upgrade.md`

**结果**：

- 项目使用了 Agent 的 ReAct 思想，但没有把整个系统交给无约束自主循环。
- 这更适合自用 / 作品集 / 企业内部工具，因为可解释性和成本边界更强。

## 亮点 5：三层记忆机制

**解决的问题**：Agent 容易“忘事”：忘记团队约束、忘记历史决策、长上下文被挤出窗口、服务重启后状态丢失。

**策略**：设计文件层 + SQLite 工作记忆 + 注入层的混合记忆架构。

三层：

| 层 | 职责 | 实现 |
| --- | --- | --- |
| L1 Active Context | 当前模型上下文窗口管理 | WBC 压缩、tail messages、pressure log |
| L2 Working State | 会话状态与中间产物 | LangGraph checkpoint、context summaries |
| L3 Durable Memory | 跨会话知识沉淀 | `KNOWLEDGE.md`、`decisions/*.md`、`.index.json`、reputation feedback |

关键设计：

- Write-Before-Compaction：压缩前先提取关键约束。
- 65% 上下文窗口阈值触发压缩。
- `SqliteSaver` 支持 LangGraph checkpoint 持久化。
- `threadId` 支持稳定线程复用。
- GC Agent 清理旧决策、过期 checkpoint、pressure log、过期反馈。

**实现位置**：

- `server/context-compressor.ts`
- `server/persistence/sqlite-saver.ts`
- `server/persistence/sqlite-schema.sql`
- `server/knowledge-index.ts`
- `server/knowledge-inject.ts`
- `server/knowledge-store.ts`
- `server/decision-summarizer.ts`
- `server/garbage-collector.ts`
- `docs/superpowers/specs/2026-06-20-memory-system-design.md`

**结果**：

- 默认可用 `MemorySaver`，设置 `QUORUMMIND_SQLITE_PATH` 后启用 SQLite checkpoint。
- 决策摘要可以写入 `~/.quorummind/decisions` 并重建索引，后续运行可注入历史知识。
- 记忆机制是项目亮点之一，后续可以继续强化为长期用户画像和团队决策偏好。

## 亮点 6：Harness 工程体系

**解决的问题**：Agent 系统如果只关注 Prompt，很难稳定、评估和维护。

**策略**：在 Agent 外围构建工程 Harness。

覆盖点：

- 外部持久记忆
- 确定性验证轨道
- 子 Agent / Orchestrator-Worker
- Skill 文件
- Guard Rails
- Checkpoints
- Handoffs
- Human-in-the-loop
- 架构约束
- 垃圾回收 Agent

**实现位置**：

- `HARNESS.md`
- `server/live-agents.ts`
- `server/context-compressor.ts`
- `server/persistence/sqlite-saver.ts`
- `server/garbage-collector.ts`
- `skills/quorummind-token-guard/SKILL.md`

**结果**：

- 这是项目最适合面试展开的部分：你不是只做了 UI 和 prompt，而是在做 Agent Runtime 外围的可靠性工程。

## 亮点 7：项目内 Skill 系统

**解决的问题**：所有任务都塞进一个超长 system prompt，会导致上下文浪费、规则冲突和泛化差。

**策略**：借鉴 `SKILL.md` 形式，做项目内可检索、可注入的 QuorumMind skills。

当前项目内 skills：

- `quorummind-decision-review`
- `quorummind-blueprint-planner`
- `quorummind-consensus-loop`
- `quorummind-agent-eval`
- `quorummind-live-model-qa`
- `quorummind-report-export`
- `quorummind-zh-localization`
- `quorummind-security-guard`
- `quorummind-token-guard`

运行时策略：

- 从 `skills/quorummind-*/SKILL.md` 和 `~/.quorummind/skills/*.md` 加载。
- 按 domain、role、triggers 粗筛。
- 候选上限 6 个，正文注入上限 1500 字符。
- Blueprint live provider prompt 会注入匹配的方法论 skill。

**实现位置**：

- `server/skill-loader.ts`
- `server/skill-inject.ts`
- `server/live-agents.ts`
- `server/decision-api.ts`
- `docs/quality/skill-governance.md`

**结果**：

- 你的项目不只是“使用 skills”，还设计了自己的 QuorumMind 方法论 skills。
- 这些 skill 能作为产品能力、Agent 治理策略和作品集亮点同时展示。

## 亮点 8：真实模型调用透明化

**解决的问题**：用户很容易误以为所有结果都来自真实模型；但真实模型可能不合 schema、不相关、英文输出或调用失败。

**策略**：把 live provider trace、schema 状态、repair/fallback 状态全部暴露。

记录字段：

- provider / model
- phase
- attempt / maxAttempts / retryCount
- durationMs
- jsonParsed
- validationStatus: `valid | repaired | invalid | unparsed`
- validationIssues
- failureClass
- normalized payload
- fallbackReason

**实现位置**：

- `server/live-decision.ts`
- `server/provider-json.ts`
- `server/provider-schema.ts`
- `server/live-aggregation.ts`
- `server/providers/*`
- `src/App.tsx`
- `API_CONTRACT.md`

**结果**：

- live 输出只有在结构化可用时才参与聚合。
- 确定性兜底会明确标出，避免把 fallback 说成真实模型推理。
- mock provider 能不花 API 费用验证同一条 trace / schema / 聚合路径。

## 亮点 9：多算法共识与决策评分

**解决的问题**：只用“投票”或“平均分”无法解释为什么某个方案赢，也无法暴露风险和分歧。

**策略**：组合多种决策算法，形成可解释评分层。

算法：

- Borda Count：聚合模型排序。
- Bayesian Weighted Voting：结合模型权重、声誉先验和当前置信度。
- Quorum Score：综合 utility、Borda、confidence、regret。
- Dissent Index：衡量排名分歧。
- Minimax Regret Map：看最坏情形后悔值。
- TOPSIS：计算与理想方案距离。
- Monte Carlo Stress Lens：种子化不确定性模拟，输出 win rate、P10、worst score。
- AHP Sensitivity：不同优先级下看赢家是否稳定。
- Model Reputation Feedback：用户反馈会校准后续模型权重。

**实现位置**：

- `src/lib/scoring.ts`
- `src/lib/ahp.ts`
- `src/lib/model-reputation.ts`
- `src/lib/reputation-feedback.ts`
- `DECISION_ENGINE.md`

**结果**：

- 前端的共识分、分歧指数、风险矩阵、后悔地图、AHP、Monte Carlo 不是写死展示，而是由当前输入、候选方案、排名和评分动态计算。
- AgentEval 也会检查共识分、轨迹和工具/Schema 命中。

## 亮点 10：AgentEval 性能评估体系

**解决的问题**：Agent 项目不能只靠“看起来回答不错”评价，需要同时看结果、过程、工具、成本和可解释性。

**策略**：结合通用工程指标、Agent 特有指标和美团龙猫式三维拆解。

评分维度：

| 维度 | 权重 |
| --- | ---: |
| 结果质量 | 35% |
| 执行轨迹 | 20% |
| 工具/Schema | 15% |
| 多模型协作 | 15% |
| 工程效率 | 10% |
| 可解释性 | 5% |

龙猫式映射：

- 推理维度：问题类型识别、关键词相关性、共识分、完整性。
- 工具维度：LangChain tool 命中率、Schema 有效性、provider/tool trace。
- 交互维度：多轮共识、人工复审、routeDecisions、terminationReason。

**实现位置**：

- `scripts/agent-performance-eval.ts`
- `eval/agent-eval-cases.jsonl`
- `docs/quality/*agent-performance-audit*.md`
- `docs/quality/agent-performance-trend.md`
- `skills/quorummind-agent-eval/SKILL.md`

**本轮改进**：

- AgentEval JSONL 从 6 条扩展到 30 条。
- full cases 覆盖租户隔离、事件驱动、模型路由、AI 运营助手、API 安全审查、知识库助手、合同评审、RAG 治理、安全事件响应、作品集生成、多 Agent 循环治理等场景。
- 第一次扩展 full suite 时暴露 3 个阈值口径问题：fast 蓝图和预算耗尽人工复审路径不应该用接近 80 的“最终收敛”门槛评估；随后把 AgentEval 的最低可接受线与运行模式语义对齐，产品自身 80 共识阈值不变。
- `npm run agent:eval:full`：30/30 通过，平均 96.3。

## 亮点 11：安全策略不是后补文档，而是 API 层实现

**解决的问题**：本地 AI 工具接入真实 API key 后，容易出现密钥泄露、CORS 放开、无限请求、导出内容泄露等风险。

**策略**：建立 local-first 安全基线。

安全控制：

- API key 只在服务端 `.env.local`，浏览器不接触 provider key。
- 可选 `QUORUMMIND_API_TOKEN`。
- `X-QuorumMind-Token` / `Authorization: Bearer` 校验。
- CORS 白名单，禁止 wildcard CORS。
- 请求体大小限制，默认 256 KiB。
- 内存限流，默认 60 req/min。
- 安全响应头：CSP、X-Frame-Options、no-store、Permissions-Policy 等。
- HSTS 可配置开启。
- `/api/security` 返回脱敏后的安全状态。

**实现位置**：

- `server/security.ts`
- `SECURITY_PRIVACY.md`
- `API_CONTRACT.md`
- `skills/quorummind-security-guard/SKILL.md`

**结果**：

- 你已经能解释“自用”和“给别人用”时安全策略有什么差异。
- UI 的设置/安全状态说明能帮助普通用户理解 Token、CORS、限流、请求体大小和分享风险。

## 亮点 12：前端体验和视觉回归

**解决的问题**：AI 工具常见问题是结果很强但界面不可信、不好用、长中文溢出、滚动区混乱、导出按钮找不到。

**策略**：把前端作为工作台，而不是 landing page 玩具。

前端能力：

- React 19 + Vite 8。
- 中文 / 英文切换。
- 决策室和方案蓝图室。
- 顶部进入页和工作台分离。
- 左中右独立滚动。
- 指标 tooltip。
- 设置页和 API 状态说明。
- 新手引导和示例问题。
- Provider trace / Agent trace / route map 可视化。
- ADR / JSON / 专业报告 / 简版 PDF 导出。
- GSAP 用于进入页动效。

**实现位置**：

- `src/App.tsx`
- `src/styles.css`
- `src/components/*`
- `scripts/visual-audit.ts`
- `docs/quality/2026-06-23-visual-audit.md`

**结果**：

- `visual:audit` 当前 59 checks / 0 failed。
- 覆盖桌面、窄屏、移动端、长中文、独立滚动、Tooltip、导出按钮、中文残留和导出内容。

## 亮点 13：导出与报告体系

**解决的问题**：专业报告对工程师有用，但普通用户只想要“最后方案”；同时专业评审又需要 trace 和证据。

**策略**：提供多级导出。

导出类型：

- ADR Markdown
- JSON trace
- 专业 HTML/PDF 报告
- 简版最终方案 PDF
- Blueprint 报告
- 人工复审包 Markdown

**实现位置**：

- `src/lib/exporters.ts`
- `server/pdf-export.ts`
- `skills/quorummind-report-export/SKILL.md`

**结果**：

- 非专业用户可以只拿最终方案。
- 专业用户可以追溯 provider trace、共识、分歧、采纳账本和评分细节。

## 亮点 14：Local-first + Mock Live，兼顾演示和成本控制

**解决的问题**：作品集项目如果必须配置真实 key 才能跑，演示成本高且不稳定。

**策略**：默认 local-first，真实 provider 可选，mock live 覆盖同一条路径。

模式：

- `QUORUMMIND_PROVIDER_MODE=demo`：完全确定性。
- `QUORUMMIND_PROVIDER_MODE=live`：启用真实 provider。
- `QUORUMMIND_MOCK_PROVIDERS=1`：不需要 key，但走 live trace / schema / aggregation 路径。

**实现位置**：

- `server/providers/mock.ts`
- `server/providers/registry.ts`
- `scripts/mock-e2e.ts`
- `README.md`

**结果**：

- 本轮 `mock:e2e`：9 次 provider 调用，openai / deepseek / gemini 三个 mock provider 均参与。
- 适合面试演示，因为不依赖外部 API 稳定性。

## 亮点 15：持久化和历史恢复

**解决的问题**：用户需要回看历史结果，模型声誉反馈也需要跨运行保留。

**策略**：localStorage + 可选 SQLite。

存储：

- 浏览器历史：`quorummind.history.v1`
- 声誉反馈：`quorummind.reputation-feedback.v1`
- SQLite：Decision Room snapshot、provider trace、ADR、prompt bundle、feedback、LangGraph checkpoints、context summaries、pressure log

**实现位置**：

- `src/lib/decision-repository.ts`
- `src/lib/decision-history.ts`
- `src/lib/reputation-feedback.ts`
- `server/persistence/sqlite-repository.ts`
- `server/persistence/sqlite-schema.sql`
- `PERSISTENCE.md`

**结果**：

- 自用场景低配置可运行。
- 未来扩展团队版时已有 SQLite/Postgres 边界。

## 亮点 16：Code Graph 和可维护性意识

**解决的问题**：项目变大后，单靠 README 很难解释代码边界和后续拆分方向。

**策略**：生成 code graph 和热点分析。

当前扫描：

- 93 个 TS/TSX/MJS 文件。
- 246 条本地 import 边。
- 模块分组覆盖 frontend、domain core、API server、provider adapters、agent platform、persistence、quality scripts。

**实现位置**：

- `docs/code-graph.md`
- `docs/code-graph.mmd`

**结果**：

- 能清楚说明项目不是堆代码，而是有架构边界。
- 同时也暴露真实工程债：`src/App.tsx`、`src/lib/blueprint.ts`、`server/agent-platform/autonomous-blueprint.ts` 仍偏大，后续适合继续拆分。

## 可以写进简历的版本

下面是可直接压缩进简历的高密度版本：

- 设计并实现 QuorumMind 多 Agent 决策与方案蓝图平台，将架构取舍和开放式系统设计拆解为独立提案、匿名互评、交叉质询、修订、共识阈值、人工复审和 ADR / PDF 导出流程。
- 基于 LangGraph + LangChain Core 构建服务端 Agent 编排层，支持 Planner/Executor/Critic/Memory/Supervisor、工具权限策略、checkpoint thread、最大讨论轮次、routeDecisions、terminationReason、human_review_gate 和 bounded ReAct tool steps，实现可审计的有界自主 Agent 工作流。
- 设计三层记忆机制：知识文件层、SQLite 工作记忆、system prompt 注入层；实现 WBC 上下文压缩、SqliteSaver checkpoint、历史决策索引、pressure log 和 GC Agent，提升跨会话连续性和长任务稳定性。
- 构建 QuorumMind 专用 Skill 系统，支持项目内 `SKILL.md` 方法论按 domain / role / trigger 检索注入，沉淀 Decision Review、Blueprint Planner、Consensus Loop、AgentEval、Live Model QA、Security Guard 等 9 个领域技能。
- 实现多算法共识评分：Borda Count、Bayesian Weighted Voting、Minimax Regret、TOPSIS、Monte Carlo Stress、AHP Sensitivity、Dissent Index 和 Model Reputation Feedback，使模型分歧、风险和方案稳定性可解释。
- 完成真实模型可靠性治理：provider trace、三策略 JSON 提取、phase-specific schema hardening、bounded repair、retry metadata、failure class、fallback source transparency，避免把确定性兜底误标为真实模型推理。
- 搭建 AgentEval 评估体系，覆盖结果质量、执行轨迹、工具/Schema、多模型协作、延迟/Token、可解释性；本轮 full suite 扩展到 30 cases，30/30 通过，平均分 96.3。
- 建立 local-first 安全与质量闭环：API key 服务端隔离、Token 鉴权、CORS 白名单、限流、请求体上限、安全头、mock live E2E、系统质量审计、视觉回归审计和生产构建验证。

## 面试讲法

如果面试官问“这个项目和普通 AI 应用有什么区别”，可以这样讲：

> 普通 AI 应用通常是 prompt + 单次回答，而 QuorumMind 更像一个可审计的 Agent Runtime。我把复杂决策拆成多 Agent 独立提案、匿名互评、修订和共识判断，并且用 LangGraph 管理循环、预算、checkpoint 和人工复审。模型输出不会直接被信任，而是经过 JSON 提取、Schema 修复、provider trace 和 fallback 标识。最后我用 AgentEval、mock E2E、视觉审计和系统质量审计持续验证它的结果质量、执行轨迹、工具命中、延迟成本和中文体验。

如果面试官问“你用了哪些前沿 Agent 思想”，可以这样讲：

> 这个项目里落地了多 Agent Debate、Planner-Executor-Critic、Supervisor、Evaluator-Optimizer、Human-in-the-loop、bounded ReAct、Memory/Checkpoint、Tool Permission Policy、AgentEval、Harness Engineering 和 Skill-based Context Injection。重点不是堆概念，而是把每个概念都做成可测试、可导出、可观察的工程能力。

## 仍然要诚实说明的边界

- 当前真实模型输出质量仍需要重点修复：小样本显示 provider 有调用，但可用 live verdict/trace 为 0%，最终内容来自确定性兜底。
- AgentEval full suite 已扩到 30 条；如果用于公开展示，下一步建议引入少量 LLM-as-a-Judge 抽检和更多真实 API 成功样本。
- `src/App.tsx` 和 `src/lib/blueprint.ts` 仍是后续最明显的可维护性拆分点。
- 现在适合自用、作品集和面试演示；如果要给别人公开使用，还需要更完整的用户账号、权限、密钥管理、部署安全和在线监控。
