# QuorumMind Code Graph

日期：2026-06-24

说明：当前运行环境没有可调用的 `code-graph` 技能；本文件由本地代码扫描生成，覆盖 `src/`、`server/`、`scripts/` 下的 TypeScript / TSX / MJS 文件。

## 扫描概览

| 指标 | 数量 |
| --- | ---: |
| 扫描文件 | 93 |
| 本地 import 边 | 246 |
| 外部依赖入口 | React、Vite、LangGraph、LangChain Core、GSAP、Zod、Playwright、Vitest、Node 内置模块 |

## 顶层架构图

```mermaid
flowchart LR
  User[用户 / 浏览器] --> FE[React 工作台\nsrc/App.tsx]
  FE --> UI[UI 组件\nsrc/components]
  FE --> Client[API Client\nsrc/lib/api-client.ts]
  FE --> Core[前端确定性核心\nsrc/lib/workflow.ts\nsrc/lib/blueprint.ts\nsrc/lib/scoring.ts]
  FE --> Exporters[导出与报告\nsrc/lib/exporters.ts]
  FE --> History[浏览器历史与反馈\nsrc/lib/decision-history.ts\nsrc/lib/reputation-feedback.ts]

  Client --> API[本地 Node API\nserver/decision-api.ts]
  API --> Core
  API --> Live[真实/Mock 模型编排\nserver/live-decision.ts\nserver/live-agents.ts]
  API --> Aggregation[模型结果聚合\nserver/live-aggregation.ts]
  API --> AgentGraph[LangGraph Agent 平台\nserver/agent-platform/autonomous-blueprint.ts]
  API --> Security[安全网关\nserver/security.ts]
  API --> Persistence[持久化\nserver/persistence]
  API --> SkillRuntime[Skill/Knowledge 注入\nserver/skill-loader.ts\nserver/skill-inject.ts\nserver/knowledge-*]
  API --> Pdf[PDF 渲染\nserver/pdf-export.ts]

  Live --> Providers[Provider Adapters\nserver/providers]
  Providers --> OpenAI[OpenAI]
  Providers --> DeepSeek[DeepSeek]
  Providers --> Gemini[Gemini]
  Providers --> Mock[Mock Provider]

  AgentGraph --> Core
  AgentGraph --> Live
  AgentGraph --> Persistence

  Scripts[质量与回归脚本\nscripts] --> API
  Scripts --> Core
  Scripts --> Providers
  Scripts --> AgentGraph
```

## 模块分组

| 分组 | 文件数 | 行数 | 角色 |
| --- | ---: | ---: | --- |
| `frontend_app` | 5 | 5362 | React 应用壳、i18n、格式化辅助 |
| `ui_components` | 2 | 188 | 面板标题、Tooltip、指标卡 |
| `domain_core` | 30 | 11761 | 决策室、蓝图室、评分、导出、历史、模型声誉、领域类型 |
| `api_server` | 25 | 5737 | API 路由、安全、live trace、聚合、PDF、skill/knowledge 注入 |
| `provider_adapters` | 15 | 1437 | OpenAI / DeepSeek / Gemini / Mock provider 适配 |
| `agent_platform` | 2 | 1966 | LangGraph autonomous Blueprint 编排 |
| `persistence` | 3 | 710 | SQLite repository / saver |
| `quality_scripts` | 9 | 4011 | mock e2e、视觉审计、系统质量审计、live audit、AgentEval |
| `other` | 2 | 382 | 入口/类型环境 |

## 分组依赖图

```mermaid
flowchart TB
  frontend_app -->|15| domain_core
  frontend_app -->|2| ui_components

  api_server -->|29| domain_core
  api_server -->|9| provider_adapters
  api_server -->|2| persistence
  api_server -->|2| agent_platform

  provider_adapters -->|3| domain_core
  persistence -->|7| domain_core

  agent_platform -->|3| api_server
  agent_platform -->|3| domain_core
  agent_platform -->|1| persistence

  quality_scripts -->|25| domain_core
  quality_scripts -->|4| api_server
  quality_scripts -->|2| provider_adapters
  quality_scripts -->|1| agent_platform
```

## 决策室主链路

```mermaid
flowchart TD
  Input[用户输入决策问题] --> Context[contextForQuestion\nsrc/lib/question-context.ts]
  Context --> AppRun[handleRunDecision\nsrc/App.tsx]
  AppRun --> ApiClient[requestDecisionRoom\nsrc/lib/api-client.ts]
  ApiClient --> DecisionAPI[server/decision-api.ts]

  DecisionAPI --> Workflow[runDecisionRoom\nsrc/lib/workflow.ts]
  Workflow --> Agents[generateProposal / critique / revise\nsrc/lib/demo-agents.ts]
  Workflow --> Scoring[scoreProposals\nsrc/lib/scoring.ts]
  Workflow --> AHP[buildAHPAnalysis\nsrc/lib/ahp.ts]
  Workflow --> ADR[generateADR\nsrc/lib/adr.ts]

  DecisionAPI --> LiveTrace{Provider mode live?}
  LiveTrace -->|yes| LiveDecision[runLiveDecisionTrace\nserver/live-decision.ts]
  LiveDecision --> Providers[server/providers/*]
  LiveDecision --> Schema[provider-schema / provider-json]
  Schema --> Aggregation[aggregateLiveVerdict\nserver/live-aggregation.ts]
  LiveTrace -->|no| Deterministic[确定性结果]

  Aggregation --> Response[DecisionApiResponse]
  Deterministic --> Response
  Response --> AppView[DecisionResultView / DecisionInspector\nsrc/App.tsx]
  AppView --> Export[ADR / JSON / Report / Simple PDF\nsrc/lib/exporters.ts]
```

## 方案蓝图与 Agent 平台链路

```mermaid
flowchart TD
  BlueprintInput[开放式蓝图需求] --> BlueprintAPI[requestBlueprintRoom\nsrc/lib/api-client.ts]
  BlueprintAPI --> ServerBlueprint[server/decision-api.ts / blueprint handler]
  ServerBlueprint --> BlueprintCore[runBlueprintRoom\nsrc/lib/blueprint.ts]
  BlueprintCore --> Drafts[多 Agent 草案]
  BlueprintCore --> Critiques[交叉质询]
  BlueprintCore --> Revisions[修订]
  BlueprintCore --> Consensus[共识轮次 / 阈值 80]
  Consensus --> FinalSpec[finalSpec / markdown / backlog]

  BlueprintInput --> AgentRun[requestAutonomousBlueprintRun\nsrc/lib/api-client.ts]
  AgentRun --> LangGraph[runAutonomousBlueprintGraph\nserver/agent-platform/autonomous-blueprint.ts]
  LangGraph --> Intent[route_intent / clarify]
  LangGraph --> Review[live_model_review / cross_review]
  LangGraph --> Validate[validate_result]
  Validate -->|below threshold| Revise[revise_discussion]
  Revise --> Validate
  Validate -->|threshold_met| Finalize[finalize]
  Validate -->|round budget exhausted| HumanReview[human_review_gate]
  LangGraph --> Checkpoint[MemorySaver / SqliteSaver]
```

## Provider 与模型调用图

```mermaid
flowchart LR
  Registry[server/providers/registry.ts] --> Gateway[model-gateway.ts]
  Registry --> OpenAI[openai.ts]
  Registry --> DeepSeek[deepseek.ts]
  Registry --> Gemini[gemini.ts]
  Registry --> Mock[mock.ts]

  Prompt[prompt.ts] --> Types[types.ts]
  OpenAI --> Prompt
  DeepSeek --> Prompt
  Gemini --> Prompt
  Gateway --> Prompt

  LiveDecision[server/live-decision.ts] --> Registry
  Connectivity[server/provider-connectivity.ts] --> Registry
  Schema[server/provider-schema.ts] --> LiveDecision
  Json[server/provider-json.ts] --> LiveDecision
```

## 质量与评估图

```mermaid
flowchart TD
  Test[Vitest\nnpm test] --> Unit[30 test files / 135 cases]
  Build[npm run build] --> TS[tsc noEmit]
  Build --> Vite[vite build]

  MockE2E[npm run mock:e2e] --> API[Decision API]
  MockE2E --> MockProviders[Mock live providers]

  SystemAudit[npm run quality:audit] --> Cases[24 deterministic cases]
  AgentEval[npm run agent:eval] --> EvalCases[AgentEval JSONL]
  VisualAudit[npm run visual:audit] --> Playwright[desktop / narrow / mobile screenshots]
  VisualAudit --> Report[docs/quality/2026-06-23-visual-audit.md]

  LiveAudit[npm run quality:live] --> RealProviders[真实 provider，可手动启用]
  BlueprintLiveAudit[npm run quality:blueprint:live] --> RealProviders
```

## import 依赖中心

| 文件 | 被引用次数 | 说明 |
| --- | ---: | --- |
| `src/lib/domain.ts` | 45 | 全项目领域类型中心 |
| `src/lib/manual-provider.ts` | 18 | 手工 provider 配置与 prompt bundle |
| `server/providers/types.ts` | 13 | provider adapter 类型契约 |
| `src/lib/blueprint.ts` | 12 | 方案蓝图核心 |
| `src/lib/model-reputation.ts` | 12 | 模型声誉与权重修正 |
| `src/lib/workflow.ts` | 12 | 决策室确定性核心 |
| `src/lib/question-context.ts` | 9 | 问题上下文推断 |
| `src/lib/api-client.ts` | 8 | 前端 API 边界 |
| `server/live-decision.ts` | 7 | live provider trace 编排 |
| `server/decision-api.ts` | 6 | Node API 总入口 |

## 代码体量热点

| 文件 | 行数 | 风险/含义 |
| --- | ---: | --- |
| `src/App.tsx` | 5191 | 前端主应用过大，是后续可维护性主要风险 |
| `src/lib/blueprint.ts` | 3456 | 蓝图规则、合成、导出前置结构集中 |
| `server/agent-platform/autonomous-blueprint.ts` | 1791 | LangGraph 编排复杂度集中 |
| `src/lib/exporters.ts` | 1478 | 多种导出格式集中 |
| `src/lib/demo-agents.ts` | 1004 | 确定性 agent 规则集中 |
| `server/decision-api.ts` | 757 | API handler 聚合了较多职责 |

## 关键边界

- 浏览器不能直接拿 API key，真实模型调用都在 `server/` 侧。
- `src/lib/*` 是可在前端和服务端共享的领域核心；这里应避免引入 Node-only API。
- `server/providers/*` 是模型供应商适配边界；新增模型应优先落在这里，而不是散落到业务逻辑。
- `server/agent-platform/autonomous-blueprint.ts` 是 LangGraph 实验/平台边界；不要把一次性 UI 状态写进 graph。
- `scripts/*` 是质量和回归入口，不应该依赖浏览器本地状态或真实 API，除非脚本名明确是 live audit。

## 推荐的后续拆分顺序

1. `src/App.tsx`
   - 拆出 `DecisionWorkbench.tsx`
   - 拆出 `BlueprintWorkbench.tsx`
   - 拆出 `SettingsPanel.tsx`
   - 拆出 `HistoryPanel.tsx`
   - 拆出 `OnboardingPanel.tsx`

2. `src/lib/blueprint.ts`
   - 拆成 `blueprint-patterns.ts`
   - `blueprint-consensus.ts`
   - `blueprint-synthesis.ts`
   - `blueprint-export-model.ts`

3. `server/decision-api.ts`
   - 拆出 `decision-routes.ts`
   - `blueprint-routes.ts`
   - `agent-routes.ts`
   - `pdf-routes.ts`
   - `provider-test-routes.ts`

4. `server/agent-platform/autonomous-blueprint.ts`
   - 拆出 graph state/types
   - 拆出 nodes
   - 拆出 routing policy
   - 拆出 human review package

## 当前结构判断

项目已经不是简单 demo，而是一个较完整的本地 AI 决策工作台。当前最大工程风险不是“功能不够”，而是功能增长后几个大文件继续膨胀。下一步最有价值的 code-graph 行动，是按上面的边界拆分 `App.tsx`、`blueprint.ts`、`decision-api.ts` 和 `autonomous-blueprint.ts`，让图上的节点变小、依赖方向更清楚。
