# QuorumMind 项目索引

> 生成时间: 2026-06-20 | Git 提交: `c48f18a` | 分析文件: 91 个 | 知识图谱: 328 节点 / 769 边

---

## 一、项目概览

**QuorumMind** 是一个对抗式多智能体架构决策引擎。它将架构权衡转化为结构化的"决策室"：多位专家智能体生成独立提案、互相盲审、修订建议、计算共识分数，最终导出架构决策记录（ADR）。

- **本地优先**：浏览器端 React UI + 确定性决策引擎
- **可选远程**：本地 API 服务器管理 API 密钥，调度 OpenAI / DeepSeek / Gemini 实时模型调用
- **双模式**：确定性模拟（零 API 密钥） + 实时模型（需配置密钥）

### 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + Vite 8 + TypeScript 6.0 |
| 后端 | 原生 Node.js HTTP（无 Express）+ tsx |
| LLM | LangChain 1.4 + LangGraph 1.4 |
| 验证 | Zod 4 |
| 测试 | Vitest 4 + Playwright + Testing Library |
| 样式 | 纯 CSS（718 行） |
| 容器 | Docker (Node 24) |
| CI | GitHub Actions |

---

## 二、架构层级（9 层）

### 🖥️ 1. UI 层 (`layer:ui`) — 5 个文件

React 单页应用前端。

| 文件 | 行数 | 职责 | 关键入口 |
|------|------|------|----------|
| [src/App.tsx](src/App.tsx) | ~6000 | **主应用组件** — 全部 UI、状态、事件处理、中英双语界面 | 修改 UI 从这里开始 |
| [src/main.tsx](src/main.tsx) | 19 | React 18 启动入口 | `createRoot` 挂载点 |
| [src/styles.css](src/styles.css) | 718 | 全局样式 — 暗色命令中心主题 | 修改样式在这里 |
| [index.html](index.html) | 12 | Vite 入口 HTML | |
| [src/vite-env.d.ts](src/vite-env.d.ts) | 6 | Vite 类型声明 | |

---

### 🧠 2. 核心决策引擎 (`layer:core-engine`) — 16 个文件

**这是整个项目的心脏**。所有决策逻辑都在 `src/lib/` 中，纯 TypeScript，无需浏览器 API。

#### 核心流程入口

| 文件 | 行数 | 职责 | 关键函数 |
|------|------|------|----------|
| [src/lib/workflow.ts](src/lib/workflow.ts) | 526 | **决策室工作流引擎** — 生成提案、盲审、交叉质询、修订、排名、ADR 生成 | `runDecisionRoom()` |
| [src/lib/blueprint.ts](src/lib/blueprint.ts) | 2741 | **蓝图引擎** — 评估矩阵、共识轮次、实施待办项 | `runBlueprintRoom()` |
| [src/lib/domain.ts](src/lib/domain.ts) | 211 | **核心类型定义**（被导入 26 次）— Agent, Proposal, Critique, Verdict, ADR 等 30+ 类型 | 所有类型的源头 |

#### 评分系统

| 文件 | 行数 | 职责 |
|------|------|------|
| [src/lib/scoring.ts](src/lib/scoring.ts) | 379 | **7 种评分机制** — 波达计数、贝叶斯加权投票、Quorum Score、Dissent Index、Minimax Regret、TOPSIS、蒙特卡洛压力测试 |
| [src/lib/ahp.ts](src/lib/ahp.ts) | 153 | **AHP 敏感性分析** — 上下文感知优先级权重、胜者稳定性测试 |

#### 产出物生成

| 文件 | 行数 | 职责 |
|------|------|------|
| [src/lib/adr.ts](src/lib/adr.ts) | 396 | **ADR Markdown 生成** — 架构决策记录的标准格式输出 |
| [src/lib/exporters.ts](src/lib/exporters.ts) | 1061 | **导出工具** — ADR Markdown、JSON Trace、PDF 报告 |
| [src/lib/localization.ts](src/lib/localization.ts) | 75 | **中英文本地化** — 已知文本模式翻译 |
| [src/lib/question-context.ts](src/lib/question-context.ts) | 123 | **问题上下文推断** — 从自然语言问题推断决策领域 |

#### 智能体与模型

| 文件 | 行数 | 职责 |
|------|------|------|
| [src/lib/demo-agents.ts](src/lib/demo-agents.ts) | 993 | **确定性演示智能体** — 5 位专家角色（首席架构师、SRE、安全审查员、成本工程师、实用构建者） |
| [src/lib/manual-provider.ts](src/lib/manual-provider.ts) | 222 | **手动提示包生成** — 为 ChatGPT/Gemini Web 界面生成提示 |
| [src/lib/model-reputation.ts](src/lib/model-reputation.ts) | 213 | **模型声誉评分** — 按领域计算模型声誉，转化为可解释权重 |
| [src/lib/reputation-feedback.ts](src/lib/reputation-feedback.ts) | 36 | **用户反馈回路** — 存储 helpful/needs-work 评分，校准声誉权重 |

#### 数据持久化（浏览器端）

| 文件 | 行数 | 职责 |
|------|------|------|
| [src/lib/decision-repository.ts](src/lib/decision-repository.ts) | 67 | **决策仓库接口** — localStorage 实现，可替换为 SQLite/Postgres |
| [src/lib/decision-history.ts](src/lib/decision-history.ts) | 62 | **决策历史快照** — Blueprint/Decision Room 历史检查 |

#### 连接桥梁

| 文件 | 行数 | 职责 |
|------|------|------|
| [src/lib/api-client.ts](src/lib/api-client.ts) | 460 | **API 客户端** — 前端到服务器所有端点的请求函数 |

---

### 🔧 3. API 网关 (`layer:api-gateway`) — 9 个文件

Node.js 原生 HTTP 服务器，处理决策请求、协调提供者调用。

| 文件 | 行数 | 职责 |
|------|------|------|
| [server/index.ts](server/index.ts) | 120 | **服务器入口** — 原生 HTTP，加载 `.env.local`，请求体大小限制 |
| [server/decision-api.ts](server/decision-api.ts) | 753 | **核心 API 处理器** — 三路径路由（决策室/蓝图/自主蓝图），载荷验证，实时/回退切换，SQLite 持久化 |
| [server/security.ts](server/security.ts) | 214 | **安全层** — CORS 验证，Bearer Token 认证，令牌桶限流，安全头（CSP/HSTS） |
| [server/live-decision.ts](server/live-decision.ts) | 291 | **实时决策编排** — 多提供者并行调用，重试策略，多阶段管线 |
| [server/live-aggregation.ts](server/live-aggregation.ts) | 310 | **实时裁决聚合** — 从提供者 JSON 中提取评分和排名 |
| [server/blind-review.ts](server/blind-review.ts) | 61 | **盲审匿名化** — 将提案作者替换为 Proposal A/B/C |
| [server/provider-json.ts](server/provider-json.ts) | 123 | **JSON 安全提取** — 三策略提取 AI 输出中的 JSON |
| [server/provider-schema.ts](server/provider-schema.ts) | 283 | **模式验证与修复** — 分阶段验证，有界修复，失败分类 |
| [server/provider-connectivity.ts](server/provider-connectivity.ts) | 154 | **提供者连接测试** |

---

### 🔌 4. 提供者适配器 (`layer:providers`) — 9 个文件

模型 API 的抽象层，支持 14 个槽位。

| 文件 | 行数 | 职责 |
|------|------|------|
| [server/providers/registry.ts](server/providers/registry.ts) | 334 | **中心注册表** — 14 槽位，`createConfiguredProviders()` 工厂函数 |
| [server/providers/types.ts](server/providers/types.ts) | 36 | **ModelProvider 接口** — 所有适配器的基础类型 |
| [server/providers/prompt.ts](server/providers/prompt.ts) | 166 | **提示模板生成** — 按决策阶段生成系统/用户提示 |
| [server/providers/openai.ts](server/providers/openai.ts) | 63 | OpenAI 适配器 |
| [server/providers/deepseek.ts](server/providers/deepseek.ts) | 48 | DeepSeek 适配器 |
| [server/providers/gemini.ts](server/providers/gemini.ts) | 52 | Gemini 适配器 |
| [server/providers/model-gateway.ts](server/providers/model-gateway.ts) | 78 | 统一 OpenAI 兼容网关 |
| [server/providers/mock.ts](server/providers/mock.ts) | 206 | 确定性模拟提供者（CI/Demo） |
| [server/providers/index.ts](server/providers/index.ts) | 14 | Barrel 导出 |

---

### 🤖 5. 智能体平台 (`layer:agent-platform`) — 1 个文件

| 文件 | 行数 | 职责 |
|------|------|------|
| [server/agent-platform/autonomous-blueprint.ts](server/agent-platform/autonomous-blueprint.ts) | 1084 | **LangGraph 自主蓝图** — 8 节点状态图（理解→草稿→审查→交叉审查→验证→修订→人工门控→最终化），MemorySaver 检查点 |

---

### 💾 6. 持久化层 (`layer:persistence`) — 5 个文件

| 文件 | 行数 | 职责 |
|------|------|------|
| [server/persistence/sqlite-schema.sql](server/persistence/sqlite-schema.sql) | 40 | **SQLite 模式** — 3 表（decision_rooms, decision_traces, reputation_feedback） |
| [server/persistence/sqlite-repository.ts](server/persistence/sqlite-repository.ts) | 303 | **SQLite 仓库实现** — 完整 CRUD，连接 `src/lib/` 类型 |

> 浏览器端持久化由 [src/lib/decision-repository.ts](src/lib/decision-repository.ts) 和 [src/lib/decision-history.ts](src/lib/decision-history.ts) 提供，默认使用 localStorage。

---

### 📊 7. 质量与基础设施 (`layer:quality-infra`) — 12 个文件

#### 脚本

| 文件 | 行数 | 职责 |
|------|------|------|
| [scripts/dev.mjs](scripts/dev.mjs) | 49 | **开发启动** — 同时启动 API + Vite |
| [scripts/system-quality-audit.ts](scripts/system-quality-audit.ts) | 393 | 24 案例确定性质量审计 |
| [scripts/live-model-quality-audit.ts](scripts/live-model-quality-audit.ts) | 822 | 实时模型质量审计（smoke/expanded/full 套件） |
| [scripts/live-blueprint-quality-audit.ts](scripts/live-blueprint-quality-audit.ts) | 708 | 实时蓝图质量审计 |
| [scripts/quality-audit-cases.ts](scripts/quality-audit-cases.ts) | 234 | 共享审计案例定义 |
| [scripts/mock-e2e.ts](scripts/mock-e2e.ts) | 79 | 确定性模拟端到端测试 |
| [scripts/visual-audit.ts](scripts/visual-audit.ts) | 342 | Playwright 视觉回归审计 |

#### CI 与容器

| 文件 | 行数 | 职责 |
|------|------|------|
| [.github/workflows/ci.yml](.github/workflows/ci.yml) | 55 | **CI 流水线** — 测试→审计→E2E→构建→视觉审计→发布 |
| [Dockerfile](Dockerfile) | 19 | Node 24 容器镜像 |
| [docker-compose.yml](docker-compose.yml) | 20 | 编排 mock-live + SQLite 服务 |

---

### 📚 8. 文档层 (`layer:docs`) — 28 个文件

#### 核心工程文档

| 文件 | 描述 |
|------|------|
| [README.md](README.md) | 项目首页 — 概览、功能列表、快速开始 |
| [PRODUCT.md](PRODUCT.md) | 产品愿景、品牌、设计原则 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 系统架构 — 三边界架构（React/API/Agent Platform） |
| [DECISION_ENGINE.md](DECISION_ENGINE.md) | 决策引擎机制 — 评分公式、协议轮次 |
| [API_CONTRACT.md](API_CONTRACT.md) | API 规范 — 所有端点、请求/响应格式 |
| [PERSISTENCE.md](PERSISTENCE.md) | 持久化策略 — localStorage + SQLite |
| [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md) | 安全隐私说明 |
| [DEMO.md](DEMO.md) | 演示指南 |
| [PORTFOLIO.md](PORTFOLIO.md) | 作品集摘要 |
| [AGENTS.md](AGENTS.md) | Claude Code 智能体守卫规则 |

#### 质量审计报告（`docs/quality/`，12+ 文件）

系统质量、实时模型质量、视觉审计、蓝图优化、智能体平台基础、技能治理等报告。

#### 实现计划（`docs/superpowers/plans/`，5 个文件）

| 文件 | 内容 |
|------|------|
| `2026-06-12-quorummind-mvp.md` | MVP 脚手架计划 |
| `2026-06-12-quorummind-product-redesign.md` | 产品重设计（双语命令中心 UI） |
| `2026-06-12-real-provider-engine.md` | 实时提供者引擎（16 个服务端/客户端文件） |
| `2026-06-12-decision-closure-v1.md` | 决策闭合（实时追踪、导出、前端） |
| `2026-06-15-engineering-hardening-v1.md` | 工程加固（模式验证、AHP、持久化） |

---

### ⚙️ 9. 配置层 (`layer:config`) — 9 个文件

| 文件 | 职责 |
|------|------|
| [package.json](package.json) | NPM 依赖 + 脚本（dev, test, build, quality:*） |
| [tsconfig.json](tsconfig.json) | 前端 TS 配置（ES2022, react-jsx, bundler） |
| [tsconfig.node.json](tsconfig.node.json) | 服务端 TS 配置（composite, 含 server + src/lib） |
| [vite.config.ts](vite.config.ts) | Vite + React 插件 + API 代理 + Vitest 配置 |
| [.env.example](.env.example) | 所有可配置环境变量模板 |
| [vitest.setup.ts](vitest.setup.ts) | 测试环境初始化 |
| [skills/quorummind-token-guard/SKILL.md](skills/quorummind-token-guard/SKILL.md) | 自定义技能：Token 使用守卫 |

---

## 三、学习导览（11 步）

按此顺序阅读代码，从外到内理解整个项目：

| # | 标题 | 关键文件 |
|---|------|----------|
| 1 | **项目概览** | README.md, PRODUCT.md |
| 2 | **应用入口** | index.html → src/main.tsx |
| 3 | **命令中心 UI** | src/App.tsx（~6000 行单体组件） |
| 4 | **核心类型与演示智能体** | src/lib/domain.ts → src/lib/demo-agents.ts |
| 5 | **确定性决策引擎** | src/lib/workflow.ts → src/lib/scoring.ts → src/lib/ahp.ts |
| 6 | **ADR 生成与导出管线** | src/lib/adr.ts → src/lib/exporters.ts → src/lib/localization.ts |
| 7 | **蓝图引擎与 API 客户端** | src/lib/blueprint.ts → src/lib/api-client.ts |
| 8 | **模型声誉与反馈回路** | src/lib/model-reputation.ts → src/lib/reputation-feedback.ts |
| 9 | **API 网关 — 入口与安全** | server/index.ts → server/decision-api.ts → server/security.ts |
| 10 | **提供者抽象层** | server/providers/registry.ts → 各适配器 → server/providers/mock.ts |
| 11 | **持久化、质量与部署** | server/persistence/ → scripts/ → Dockerfile → CI |

---

## 四、快速定位指南

### "我要修改..."

| 需求 | 去哪里 |
|------|--------|
| 修改 UI | [src/App.tsx](src/App.tsx)（组件/状态）+ [src/styles.css](src/styles.css)（样式） |
| 添加新的评分机制 | [src/lib/scoring.ts](src/lib/scoring.ts) |
| 修改决策流程 | [src/lib/workflow.ts](src/lib/workflow.ts) |
| 修改 ADR 输出格式 | [src/lib/adr.ts](src/lib/adr.ts) |
| 添加新的导出格式 | [src/lib/exporters.ts](src/lib/exporters.ts) |
| 添加新的 AI 模型提供者 | [server/providers/registry.ts](server/providers/registry.ts) + 新建适配器文件 |
| 修改 API 端点 | [server/decision-api.ts](server/decision-api.ts) |
| 修改数据库模式 | [server/persistence/sqlite-schema.sql](server/persistence/sqlite-schema.sql) |
| 修改安全策略 | [server/security.ts](server/security.ts) |
| 修改 CI 流水线 | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| 添加新类型定义 | [src/lib/domain.ts](src/lib/domain.ts) |
| 中英文翻译 | [src/lib/localization.ts](src/lib/localization.ts) |
| 手动提示模板 | [src/lib/manual-provider.ts](src/lib/manual-provider.ts) |
| 蓝图自主运行 | [server/agent-platform/autonomous-blueprint.ts](server/agent-platform/autonomous-blueprint.ts) |
| Docker 部署 | [Dockerfile](Dockerfile) + [docker-compose.yml](docker-compose.yml) |
| 查看 API 文档 | [API_CONTRACT.md](API_CONTRACT.md) |
| 查看架构设计 | [ARCHITECTURE.md](ARCHITECTURE.md) |

### 关键数据流

```
用户输入问题
    ↓
src/App.tsx (UI 状态管理)
    ↓
src/lib/workflow.ts (决策室引擎) 或 src/lib/blueprint.ts (蓝图引擎)
    ↓
src/lib/demo-agents.ts (确定性模式) 或 server/decision-api.ts (实时模式)
    ↓
src/lib/scoring.ts + src/lib/ahp.ts (评分与分析)
    ↓
src/lib/adr.ts + src/lib/exporters.ts (产出物生成)
    ↓
src/lib/decision-repository.ts (持久化)
```

---

## 五、NPM 脚本速查

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动 API + Vite 开发服务器 |
| `npm run server` | 仅启动 API 服务器 |
| `npm test` | 运行 Vitest 测试套件 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run quality:audit` | 确定性质量审计（24 案例） |
| `npm run quality:live` | 实时模型质量审计（smoke 套件） |
| `npm run mock:e2e` | 模拟端到端测试 |
| `npm run visual:audit` | Playwright 视觉审计 |

---

## 六、分析统计

| 指标 | 数值 |
|------|------|
| 分析文件总数 | 91 |
| 代码文件 | 51 |
| 文档文件 | 28 |
| 配置文件 | 5 |
| 基础设施文件 | 4 |
| 知识图谱节点 | 328 |
| 知识图谱边 | 769 |
| 架构层级 | 9 |
| 学习导览步数 | 11 |
| 节点类型 | file(53), function(234), document(28), config(5), table(4), service(3), pipeline(1) |
| 边类型 | contains(237), imports(127), calls(119), documents(115), exports(84), related(41), depends_on(26), configures(11), implements(5), deploys(2), serves(1), defines_schema(1) |

---

> 本文件由 `understand-anything` 自动分析生成。更新知识图谱：运行 `/understand`。
