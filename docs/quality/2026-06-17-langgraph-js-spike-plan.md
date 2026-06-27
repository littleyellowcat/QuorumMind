# QuorumMind LangGraph JS Spike 计划

日期：2026-06-17

## 结论先行

本轮不建议直接重构主流程。当前主流程已经有可审计的阶段、trace、schema 修复、fallback 标识和质量报告。LangGraph JS 应先作为独立实验，只验证 Deep / Red-team 编排是否能明显降低复杂度或提升可观测性。

## 实验边界

- 不替换 `runDecisionRoom`。
- 不替换当前真实 provider 调用链。
- 不改变 UI 数据结构。
- 不影响 `quality:audit`、`quality:live`、`visual:audit`。
- 只做一个独立 spike：输入同一个问题，跑 proposal -> critique -> revision -> ranking -> verdict 的状态图。

## 评估指标

| 指标 | 当前实现 | LangGraph spike 需要证明 |
| --- | --- | --- |
| 编排复杂度 | TypeScript 函数和阶段数组，直接可控 | 状态图是否让 Deep/Red-team 分支更清楚 |
| 可观测性 | providerTrace 已记录 phase、attempt、schema、错误 | 是否能更自然地输出节点级 trace |
| 错误恢复 | 当前有 retry、schema repair、fallback | 是否能更好表达节点失败后的降级路径 |
| UI 适配成本 | 当前 UI 已消费稳定结构 | 是否无需改动主要 UI contract |
| 依赖成本 | 无 LangGraph 运行时依赖 | 新依赖体积、API 稳定性、测试维护成本是否可接受 |

## 建议实验步骤

1. 新建 `experiments/langgraph-deep-red-team/`，不要放进主流程。
2. 只接 mock provider，先不打真实 API。
3. 将五个阶段建成 graph node：proposal、critique、revision、ranking、verdict。
4. 输出与现有 `providerTrace` 尽量相同的结构。
5. 用 3 个问题比较：
   - Node.js 单体是否拆微服务。
   - LangGraph vs LangChain 多 agent 编排。
   - Kubernetes 是否现在引入。
6. 对比代码量、节点 trace 清晰度、错误恢复表达能力。

## 通过门槛

只有同时满足以下条件，才值得考虑引入主流程：

- Deep / Red-team 编排代码明显更清楚，而不是只是换一种写法。
- 节点失败、重试、兜底比当前更容易解释给用户。
- 输出能保持现有 UI contract，不引入大面积前端改动。
- 单元测试和 mock e2e 能覆盖 graph 节点失败路径。

## 暂不做的事

- 不在本轮安装 LangGraph JS 依赖。
- 不把 Fast 模式迁移到 LangGraph。
- 不为了“用了框架”而重写已经稳定的决策和评分逻辑。
