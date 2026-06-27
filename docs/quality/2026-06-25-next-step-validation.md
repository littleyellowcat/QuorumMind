# QuorumMind 下一阶段稳定性验收记录

日期：2026-06-25

## 目标

按照下一阶段计划，验证项目是否已经具备更稳定的自测基础：

- 真实 API 扩大验收：Decision / Blueprint / Agent 是否能在更多样本下稳定输出。
- 本地全链路浏览器验收：中文、长内容、窄屏、滚动区、导出入口、Agent 平台展示是否正常。
- AgentEval：Planner / Executor / Critic / Memory / Supervisor / 工具权限等轨迹是否可评估。
- 工程门禁：mock E2E、单元测试、生产构建是否通过。

## 本轮预算

| 项目 | 预算 |
| --- | --- |
| 真实 API | 先尝试 Decision expanded 8 条；若耗时不可观测，则降到 targeted 3 条 |
| Blueprint/Agent live | 计划 4-6 条；若 Decision live 已暴露长任务问题，本轮不继续叠加外部调用 |
| 浏览器验收 | 运行 `npm run visual:audit` |
| AgentEval | 运行 full 30 条离线评估 |
| 工程验证 | mock E2E、全量测试、build |

## 真实 API 扩大验收

### 已有可用证据

本轮没有重复跑已经完成的低成本真实 API smoke，但引用当前已保存报告：

- `docs/quality/2026-06-25-live-model-quality-audit.md`
- `docs/quality/2026-06-25-real-api-functional-audit.md`
- `docs/quality/2026-06-25-provider-deep-connectivity-audit.md`

当前已保存结论：

| 链路 | 结果 |
| --- | --- |
| Decision smoke | 4/4 passed，live verdict 100%，schema usable 100%，中文 100%，相关性 100%，fallback 0% |
| Provider deep connectivity | 3/3 seat responded，JSON parsed 100%，schema usable 100%，repair 0% |
| Blueprint/Agent 小样本 | live trace 可用，中文/相关性/详细度通过；个别长 Blueprint proposal seat 曾出现 provider error |

### 本轮扩展尝试

第一次尝试：

```bash
QUORUMMIND_LIVE_AUDIT_SUITE=expanded \
QUORUMMIND_LIVE_AUDIT_LIMIT=8 \
QUORUMMIND_LIVE_AUDIT_TIMEOUT_MS=180000 \
QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS=90000 \
npm run quality:live:expanded
```

结果：运行超过可接受窗口且没有逐 case 进度输出，已人工中断，未生成完整报告。

第二次降级为 targeted 3 条：

```bash
QUORUMMIND_LIVE_AUDIT_SUITE=expanded \
QUORUMMIND_LIVE_AUDIT_CASE_IDS=services-zh-red-team,agent-framework-zh-red-team,generic-zh-deep \
QUORUMMIND_LIVE_AUDIT_LIMIT=3 \
QUORUMMIND_LIVE_AUDIT_TIMEOUT_MS=180000 \
QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS=90000 \
npm run quality:live:expanded
```

结果：仍然运行超过可接受窗口且无阶段输出，已人工中断，未生成完整报告。

### 判读

这不是“模型一定失败”的证据，因为已有 smoke 和 provider deep 报告证明真实链路可用；但它暴露了一个更实际的工程问题：

- 真实 API 扩展验收缺少逐 case / 逐 phase 进度输出。
- 长任务没有内建取消、续跑、已完成用例落盘机制。
- 当 provider 长尾耗时出现时，操作者无法判断是某个 provider 卡住、某个 case 卡住，还是脚本仍在正常推进。

结论：下一步不应继续盲目扩大真实 API 样本，而应先把 live audit harness 做成可观测、可续跑、可小批量落盘。

## 本地浏览器全链路验收

命令：

```bash
npm run visual:audit
```

结果：

| 指标 | 结果 |
| --- | ---: |
| 检查项 | 74 |
| 失败项 | 0 |
| 通过率 | 100% |
| 报告 | `docs/quality/2026-06-25-visual-audit.md` |
| 截图目录 | `output/playwright/visual-audit` |

覆盖范围：

- 桌面、窄桌面、移动端。
- 决策室长中文问题输入和运行后结果页。
- Blueprint 输入和运行后结果页。
- Agent 平台运行后结果页。
- Planner、Executor、Critic、Memory、Supervisor、工具权限类别可见性。
- 左 / 中 / 右独立滚动。
- Tooltip。
- ADR / JSON / PDF / Prompt / Blueprint 导出入口。
- 中文模式 UI 和导出报告残留英文扫描。
- 横向溢出和按钮文字溢出。

## AgentEval Full

命令：

```bash
npm run agent:eval:full
```

结果：

| 指标 | 结果 |
| --- | ---: |
| 用例 | 30 |
| 通过 / 警告 / 失败 | 30 / 0 / 0 |
| 平均总分 | 96.3 |
| 平均轨迹分 | 95 |
| 工具召回 | 100% |
| 兜底率 | 0% |
| 报告 | `docs/quality/2026-06-25-agent-performance-audit-full.md` |
| 明细 | `output/agent-eval/2026-06-25-agent-performance-audit-full.json` |

判读：离线 AgentEval 当前稳定，适合作为默认回归门。它验证的是本地可重复的 agent 轨迹与结构质量，不等同于真实 provider 的主观输出质量。

## Mock E2E

命令：

```bash
npm run mock:e2e
```

结果：

| 指标 | 结果 |
| --- | --- |
| 状态 | passed |
| providerMode | live |
| calls | 9 |
| providers | openai, deepseek, gemini |
| phases | proposal, ranking, verdict |
| selectedProposalId | gpt-balanced-proposal |
| quorumScore | 83 |
| dissentIndex | 44 |

判读：无真实 key 的模拟 live provider 链路仍然可用，适合作为 CI / 演示前低成本门禁。

## 单元测试与构建

命令：

```bash
npm test -- --run
npm run build
```

结果：

| 项目 | 结果 |
| --- | --- |
| Vitest | 30 files / 144 tests passed |
| Build | passed |

## 当前项目状态

| 维度 | 状态 | 说明 |
| --- | --- | --- |
| 本地 UI / 浏览器体验 | 绿色 | 74 项视觉和交互检查通过 |
| 本地 AgentEval | 绿色 | 30 条 full suite 全过，平均 96.3 |
| mock live provider | 绿色 | proposal / ranking / verdict 可跑通 |
| 单元测试 / build | 绿色 | 144 tests + production build 通过 |
| 真实 API smoke | 绿色 | 已保存 4/4 Decision smoke 通过 |
| provider 基础连通性 | 绿色 | 3/3 seat 最小 schema prompt 通过 |
| 真实 API 扩展验收 | 黄色 | 扩展脚本缺少进度化和续跑能力，长任务不可观测 |

## 下一步优先级

1. 先修 live audit harness，而不是继续扩大真实 API 样本：
   - 每个 case 开始 / 结束输出日志。
   - 每个 phase/provider 完成后即时记录状态。
   - 已完成 case 增量写入 JSONL，避免中断后丢结果。
   - 支持 `--resume` 或基于 case id 跳过已完成项。
   - 增加全局最大运行时长和清晰的中断摘要。

2. 修完后再跑真实 API 小批次：
   - Decision targeted 3 条。
   - Blueprint/Agent targeted 4 条。
   - 记录 provider/model/schema/fallback/chinese/relevance/detail/latency。

3. 如果 targeted 小批次稳定，再扩大到：
   - Decision 12 条。
   - Blueprint/Agent 8 条。
   - 最后才考虑 30 条 full suite。
