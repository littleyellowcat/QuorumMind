# QuorumMind 连续优化记录

日期：2026-06-25

## 本轮目标

围绕当前最大的质量风险继续补强：

1. 真实模型输出质量：降低 schema 不稳定和 fallback 占比风险。
2. 工具权限系统：从粗粒度风险升级为动作类别 + 风险 + 决策。
3. Memory Agent：增加更像长期记忆的结构化事件。
4. AgentEval：加入 LLM-as-a-Judge Rubric 抽检入口。
5. UI 视觉回归：覆盖 Agent 平台、长中文、窄屏、移动端和折叠区。

## 实现内容

| 方向 | 改动 | 结果 |
| --- | --- | --- |
| 真实模型质量 | `server/provider-schema.ts` 支持常见 provider 别名、对象列表、数字字符串、snake_case 分数字段，并将非标准修复标记为 `repaired` | 真实 provider 偶发不合 schema 时更容易修复，且审计状态更诚实 |
| Prompt 约束 | `server/providers/prompt.ts` 增加 canonical 字段、自检 JSON/schema、中文可见值规则 | 减少模型返回英文、错字段名、非 JSON 的概率 |
| 工具权限 | `toolPermissions` 新增 `category`：`read_only`、`local_file_write`、`external_api_call`、`live_model_call`、`production_operation`、`paid_operation` | 用户能看到工具动作属于只读、本地写入、真实模型、外部 API、生产或付费操作 |
| Memory | `memoryEvents` 新增偏好摘要、项目画像、上次/本次差异锚点、失败样本回流入口 | Memory 不只记录 checkpoint，也能解释长期上下文怎样沉淀 |
| AgentEval Judge | 新增 `scripts/agent-judge-audit.ts` 和 `npm run agent:judge` | 默认本地 mock judge，不消耗 API；抽检 8 条样本，输出 Markdown + JSON |
| 视觉回归 | `scripts/visual-audit.ts` 增加 Agent 平台流程与折叠区检查，报告按当天日期生成 | 覆盖 Planner/Executor/Critic/Memory/Supervisor、权限类别、窄屏和移动端 |
| 中文 UI | 修复 Agent 平台 Evaluator Gate 英文 detail，如 `live trace usable`、`deferred critique suggestions` | 中文模式视觉审计无已知英文残留 |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npx vitest run server/provider-schema.test.ts server/providers/prompt.test.ts server/agent-platform/autonomous-blueprint.test.ts server/decision-api.test.ts src/lib/api-client.test.ts` | 5 files / 54 tests passed |
| `npm run build` | passed |
| `npm run agent:eval:full` | 30 cases，30 passed，averageScore 96.3，fallbackRate 0% |
| `npm run agent:judge` | 8 samples，8 passed，average Judge score 95.2，模式 `local_rubric_mock` |
| `npm run quality:audit` | 30 cases，allCasePassRate 100%，localizedChinesePassRate 100% |
| `npm run visual:audit` | 74 checks，0 failed，截图目录 `output/playwright/visual-audit` |

## 新增产物

- `docs/quality/2026-06-25-agent-judge-audit.md`
- `output/agent-eval/2026-06-25-agent-judge-audit.json`
- `docs/quality/2026-06-25-visual-audit.md`
- `docs/quality/2026-06-25-agent-performance-audit-full.md`

## 边界说明

- 本轮没有调用真实付费 provider；真实 API 质量仍需要单独按预算跑 `quality:live` / `quality:blueprint:live`。
- `agent:judge` 当前是 LLM-as-a-Judge Rubric 的本地 mock 抽检，适合作为稳定质量门；如果要作为对外背书，需要接入真实 Judge provider 并记录 provider、timeout、token、schema 和 fallback。
- Memory 已经有长期记忆事件和 SQLite/knowledge injection 基础，但还不是完整向量记忆或自主学习系统。
