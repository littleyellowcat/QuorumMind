# QuorumMind AgentEval LLM-as-a-Judge 抽检

日期：2026-06-25

## 说明

- Judge 模式：`local_rubric_mock`。
- 本次默认不调用真实模型，使用 LLM-as-a-Judge Rubric 的本地 mock 版本做 8 条抽检，避免额外 API 成本。
- 如果后续接入真实 Judge，需要沿用同一套维度，并记录 provider、timeout、schema、fallback 和调用成本。
- 来源明细：`output/agent-eval/2026-06-25-agent-performance-audit-full.json`（2026-06-25-agent-performance-audit-full.json）。
- 输出 JSON：`output/agent-eval/2026-06-25-agent-judge-audit.json`。

## 汇总

| 指标 | 结果 |
| --- | ---: |
| 抽检样本 | 8 |
| 通过 | 8 |
| 警告 | 0 |
| 失败 | 0 |
| 平均 Judge 分 | 95.2 |

## Rubric

| 维度 | 含义 |
| --- | --- |
| Relevance | 是否回答用户问题、关键词覆盖和意图相关性 |
| Process | Agent 轨迹、工具/Schema、协作过程是否合理 |
| Engineering | 延迟、可执行性、推理完整性和交互质量 |
| Transparency | 是否解释来源、fallback、schema 和过程证据 |
| Cost Control | provider 调用次数、fallback 和预算风险 |

## 抽检明细

| 样本 | 类型 | 结论 | 总分 | 相关性 | 过程 | 工程 | 透明度 | 成本 | 评语 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| decision-event-driven-zh-full | decision | pass | 95.7 | 86 | 100 | 96.5 | 100 | 96 | 响应质量 89.1，综合分 96.2，Judge 总分 95.7。<br>轨迹/工具/协作过程分 100，Schema 有效率 100%。<br>缺失关键词：风险。 |
| blueprint-onboarding-zh | blueprint | pass | 94 | 98 | 86.1 | 90 | 100 | 96 | 响应质量 98.4，综合分 92.4，Judge 总分 94。<br>轨迹/工具/协作过程分 86.1，Schema 有效率 100%。<br>共识分 72 低于 80，建议纳入复审样本。 |
| blueprint-knowledge-assistant-zh-full | blueprint | pass | 94 | 98 | 86.1 | 90 | 100 | 96 | 响应质量 98.4，综合分 92.4，Judge 总分 94。<br>轨迹/工具/协作过程分 86.1，Schema 有效率 100%。<br>共识分 72 低于 80，建议纳入复审样本。 |
| blueprint-pricing-experiment-zh-full | blueprint | pass | 94 | 98 | 86.1 | 90.1 | 100 | 96 | 响应质量 98.4，综合分 92.4，Judge 总分 94。<br>轨迹/工具/协作过程分 86.1，Schema 有效率 100%。<br>共识分 73 低于 80，建议纳入复审样本。 |
| agent-human-review-budget-zh | agent_blueprint | pass | 96.4 | 98 | 93.2 | 94.9 | 100 | 96 | 响应质量 98.4，综合分 95.3，Judge 总分 96.4。<br>轨迹/工具/协作过程分 93.2，Schema 有效率 100%。<br>共识分 76 低于 80，建议纳入复审样本。 |
| decision-kubernetes-zh-full | decision | pass | 95.7 | 86 | 100 | 96.5 | 100 | 96 | 响应质量 89.1，综合分 96.2，Judge 总分 95.7。<br>轨迹/工具/协作过程分 100，Schema 有效率 100%。<br>缺失关键词：验证。 |
| decision-security-gate-zh-full | decision | pass | 95.7 | 86 | 100 | 96.5 | 100 | 96 | 响应质量 89.1，综合分 96.2，Judge 总分 95.7。<br>轨迹/工具/协作过程分 100，Schema 有效率 100%。<br>缺失关键词：验证。 |
| decision-data-retention-zh-full | decision | pass | 95.7 | 86 | 100 | 96.5 | 100 | 96 | 响应质量 89.1，综合分 96.2，Judge 总分 95.7。<br>轨迹/工具/协作过程分 100，Schema 有效率 100%。<br>缺失关键词：风险。 |
