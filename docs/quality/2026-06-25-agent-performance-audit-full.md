# QuorumMind AgentEval 性能评估报告

日期：2026-06-25

## 评估方法

AgentEval 按“最终结果质量 + 执行轨迹合理性 + 工具/Schema 使用正确性 + 多模型协作质量 + 延迟/成本等工程指标 + 可解释性”评分。默认使用离线规则评估，不调用真实模型，也不启用 LLM-as-a-Judge。

评分权重：

| 维度 | 权重 | 说明 |
| --- | ---: | --- |
| 结果质量 | 35% | 相关性、完整性、可执行性、问题类型匹配、中文质量 |
| 执行轨迹 | 20% | 节点顺序、共识循环、路由是否符合预期 |
| 工具/Schema | 15% | 工具命中率、Schema 字段完整性、结构化分数有效性 |
| 多模型协作 | 15% | 互评、修订、质询采纳、共识提升 |
| 工程效率 | 10% | 延迟和估算 Token 是否在预算内 |
| 可解释性 | 5% | ADR、routeDecisions、评估矩阵、复审信息是否可审查 |

美团龙猫式三维拆解：

| 维度 | 本项目映射 |
| --- | --- |
| 推理维度 | 问题类型识别、关键词相关性、共识分、完整性 |
| 工具维度 | LangChain tool 命中率、Schema 有效性、provider/tool trace |
| 交互维度 | 多轮共识、主动进入人工复审、routeDecisions 和 terminationReason |

RAG 评测：当前 AgentEval 未启用 RAGAS，因为 QuorumMind 现阶段没有检索证据链；后续如果 knowledge/RAG 成为主路径，应加入忠实度、引用可追溯性和证据相关性。

## 运行范围

- 套件：`full`
- 本套件可用用例：30
- 本轮运行用例：30
- 用例过滤：未启用

- 明细 JSON：`output/agent-eval/2026-06-25-agent-performance-audit-full.json`

## 汇总指标

| 指标 | 结果 |
| --- | ---: |
| 通过率 | 100% |
| 通过 / 警告 / 失败 | 30 / 0 / 0 |
| 平均总分 | 96.3 |
| 平均响应质量 | 95.9 |
| 平均轨迹分 | 95 |
| 平均工具/Schema 分 | 100 |
| 平均协作分 | 91.7 |
| 平均工程效率分 | 100 |
| 平均推理分 | 91.3 |
| 平均工具使用分 | 97.7 |
| 平均交互分 | 95 |
| 平均延迟 | 6ms |
| 平均估算 Token | 6151 |
| 兜底率 | 0% |

## 用例明细

| 用例 | 类型 | 状态 | 总分 | 结果质量 | 轨迹 | 工具/Schema | 协作 | 延迟 ms | 估算 Token | 共识 | 节点命中 | 工具召回 | 备注 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| decision-services-zh | decision | passed | 97.4 | 92.7 | 100 | 100 | 100 | 7 | 3560 | 84 | n/a | n/a | - |
| decision-agent-framework-zh | decision | passed | 98 | 94.3 | 100 | 100 | 100 | 1 | 2689 | 81 | n/a | n/a | - |
| blueprint-visual-novel-zh | blueprint | passed | 95 | 96.4 | 100 | 100 | 75 | 2 | 7945 | 86 | n/a | n/a | - |
| blueprint-onboarding-zh | blueprint | passed | 92.4 | 98.4 | 83.3 | 100 | 75 | 1 | 6783 | 72 | n/a | n/a | - |
| agent-visual-novel-zh | agent_blueprint | passed | 97.4 | 98.4 | 90 | 100 | 100 | 30 | 8671 | 86 | 100% | 100% | - |
| agent-human-review-budget-zh | agent_blueprint | passed | 95.3 | 98.4 | 79.5 | 100 | 100 | 16 | 8514 | 76 | 79% | 100% | - |
| decision-tenant-isolation-zh-full | decision | passed | 96.4 | 89.8 | 100 | 100 | 100 | 1 | 2456 | 80 | n/a | n/a | - |
| decision-event-driven-zh-full | decision | passed | 96.2 | 89.1 | 100 | 100 | 100 | 2 | 2743 | 83 | n/a | n/a | - |
| decision-model-routing-zh-full | decision | passed | 97.6 | 93.1 | 100 | 100 | 100 | 0 | 2217 | 83 | n/a | n/a | - |
| blueprint-ai-ops-zh-full | blueprint | passed | 95.7 | 98.4 | 100 | 100 | 75 | 1 | 8349 | 88 | n/a | n/a | - |
| blueprint-security-review-zh-full | blueprint | passed | 95.7 | 98.4 | 100 | 100 | 75 | 0 | 7892 | 86 | n/a | n/a | - |
| blueprint-knowledge-assistant-zh-full | blueprint | passed | 92.4 | 98.4 | 83.3 | 100 | 75 | 0 | 6873 | 72 | n/a | n/a | - |
| agent-security-review-zh-full | agent_blueprint | passed | 97.4 | 98.4 | 90 | 100 | 100 | 20 | 8637 | 87 | 100% | 100% | - |
| agent-eval-platform-zh-full | agent_blueprint | passed | 97.4 | 98.4 | 90 | 100 | 100 | 15 | 8739 | 87 | 100% | 100% | - |
| decision-kubernetes-zh-full | decision | passed | 96.2 | 89.1 | 100 | 100 | 100 | 1 | 2745 | 83 | n/a | n/a | - |
| decision-security-gate-zh-full | decision | passed | 96.2 | 89.1 | 100 | 100 | 100 | 2 | 2740 | 83 | n/a | n/a | - |
| decision-data-retention-zh-full | decision | passed | 96.2 | 89.1 | 100 | 100 | 100 | 0 | 2217 | 83 | n/a | n/a | - |
| decision-sre-hiring-zh-full | decision | passed | 97.6 | 93.1 | 100 | 100 | 100 | 1 | 2742 | 83 | n/a | n/a | - |
| decision-prd-process-zh-full | decision | passed | 97.6 | 93.1 | 100 | 100 | 100 | 1 | 2215 | 83 | n/a | n/a | - |
| decision-frontend-migration-en-full | decision | passed | 99 | 97.1 | 100 | 100 | 100 | 1 | 2755 | 83 | n/a | n/a | - |
| blueprint-contract-review-zh-full | blueprint | passed | 95.7 | 98.4 | 100 | 100 | 75 | 1 | 8129 | 87 | n/a | n/a | - |
| blueprint-data-quality-zh-full | blueprint | passed | 95.7 | 98.4 | 100 | 100 | 75 | 0 | 8078 | 87 | n/a | n/a | - |
| blueprint-support-agent-zh-full | blueprint | passed | 95.7 | 98.4 | 100 | 100 | 75 | 0 | 8132 | 87 | n/a | n/a | - |
| blueprint-pricing-experiment-zh-full | blueprint | passed | 92.4 | 98.4 | 83.3 | 100 | 75 | 1 | 6949 | 73 | n/a | n/a | - |
| blueprint-ops-runbook-zh-full | blueprint | passed | 95.7 | 98.4 | 100 | 100 | 75 | 0 | 8052 | 85 | n/a | n/a | - |
| agent-code-review-platform-zh-full | agent_blueprint | passed | 97.4 | 98.4 | 90 | 100 | 100 | 16 | 8755 | 88 | 100% | 100% | - |
| agent-rag-governance-zh-full | agent_blueprint | passed | 97.4 | 98.4 | 90 | 100 | 100 | 13 | 8766 | 87 | 100% | 100% | - |
| agent-incident-response-zh-full | agent_blueprint | passed | 97.4 | 98.4 | 90 | 100 | 100 | 12 | 8830 | 81 | 100% | 100% | - |
| agent-portfolio-generator-zh-full | agent_blueprint | passed | 97.4 | 98.4 | 90 | 100 | 100 | 13 | 8685 | 85 | 100% | 100% | - |
| agent-loop-governance-zh-full | agent_blueprint | passed | 97.4 | 98.4 | 90 | 100 | 100 | 13 | 8675 | 87 | 100% | 100% | - |

## 失败原因 Top

| 问题 | 次数 | 用例 |
| --- | ---: | --- |
| - | 0 | - |

## 下一步

- 将本报告作为默认离线 Agent 性能门：`npm run agent:eval`。
- 需要扩大覆盖时运行 `npm run agent:eval:expanded`；面试展示可引用本报告和趋势文件。
- 后续可加入 LLM-as-a-Judge：只对低分或人工抽检样本运行，避免每次评估都消耗真实 API。
