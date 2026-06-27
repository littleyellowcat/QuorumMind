# QuorumMind AgentEval 当前结果保存版

保存日期：2026-06-22

本文件用于固定保存当前 AgentEval 结果快照。该快照来自已经生成的离线评估报告，没有重新运行评估，也没有调用真实模型 API。

## 原始报告

| 报告 | 路径 |
| --- | --- |
| Smoke 评估报告 | `docs/quality/2026-06-22-agent-performance-audit.md` |
| Expanded 评估报告 | `docs/quality/2026-06-22-agent-performance-audit-expanded.md` |
| Smoke 明细 JSON | `output/agent-eval/2026-06-22-agent-performance-audit.json` |
| Expanded 明细 JSON | `output/agent-eval/2026-06-22-agent-performance-audit-expanded.json` |
| 趋势报告 | `docs/quality/agent-performance-trend.md` |
| 趋势原始数据 | `docs/quality/agent-performance-trend.jsonl` |

## 当前结论

当前 AgentEval 已经覆盖 Decision Room、Blueprint Room 和 LangGraph Agent Blueprint 三类核心路径。评估方式是离线确定性规则评估，主要检查最终回答质量、执行轨迹、工具/Schema 使用、多模型协作、工程效率、可解释性，以及龙猫式的推理、工具、交互三维能力。

## Expanded 结果

| 指标 | 结果 |
| --- | ---: |
| 套件 | expanded |
| 用例数 | 6 |
| 通过 / 警告 / 失败 | 6 / 0 / 0 |
| 通过率 | 100% |
| 平均总分 | 96 |
| 平均响应质量 | 95.5 |
| 平均轨迹分 | 97.2 |
| 平均工具/Schema 分 | 95.8 |
| 平均协作分 | 91.7 |
| 平均工程效率分 | 100 |
| 平均推理分 | 90.3 |
| 平均工具使用分 | 95.8 |
| 平均交互分 | 94.5 |
| 平均延迟 | 6ms |
| 平均估算 Token | 5751 |
| 兜底率 | 0% |

## Smoke 结果

| 指标 | 结果 |
| --- | ---: |
| 套件 | smoke |
| 用例数 | 3 |
| 通过 / 警告 / 失败 | 3 / 0 / 0 |
| 通过率 | 100% |
| 平均总分 | 97.3 |
| 平均响应质量 | 95.8 |
| 平均轨迹分 | 100 |
| 平均工具/Schema 分 | 100 |
| 平均协作分 | 91.7 |
| 平均工程效率分 | 100 |
| 平均推理分 | 94 |
| 平均工具使用分 | 100 |
| 平均交互分 | 95.8 |
| 平均延迟 | 10ms |
| 平均估算 Token | 6439 |
| 兜底率 | 0% |

## 用例覆盖

| 用例 | 类型 | 状态 | 说明 |
| --- | --- | --- | --- |
| `decision-services-zh` | decision | passed | 微服务拆分决策 |
| `decision-agent-framework-zh` | decision | passed | LangGraph / LangChain / 自研状态机取舍 |
| `blueprint-visual-novel-zh` | blueprint | passed | 视觉小说多 Agent 蓝图 |
| `blueprint-onboarding-zh` | blueprint | passed | 企业客户 onboarding 流程蓝图 |
| `agent-visual-novel-zh` | agent_blueprint | passed | LangGraph Agent Blueprint 正常共识路径 |
| `agent-human-review-budget-zh` | agent_blueprint | passed | 轮次预算耗尽后进入人工复审路径 |

## 当前限制

- 当前保存的是离线确定性评估结果，不代表真实模型 API 的输出质量。
- 当前没有启用 LLM-as-a-Judge，低分样本和抽样复核后续可以再接入。
- 当前没有启用 RAGAS，因为 QuorumMind 现阶段还没有把 RAG 证据链作为主路径。
- 当前 full 套件与 expanded 套件覆盖相同 6 个用例，后续可以扩展到 20-30 个离线样本。

## 后续建议

- 把本文件作为当前阶段 AgentEval 成果快照，用于项目展示和阶段复盘。
- 后续每次扩展测试集或接入真实模型评估时，新增日期化保存文件，不覆盖本文件。
- 下一阶段可以补充真实 API AgentEval、LLM Judge 抽检、线上 trace 聚合和 UI 质量面板。
