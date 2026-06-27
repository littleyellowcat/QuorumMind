# QuorumMind 系统质量打磨记录

日期：2026-06-17

## 测试范围

- 决策引擎：确定性 workflow、Fast / Deep / Red-team 模式、Delphi 轮次、评分、风险、假设、ADR。
- 问题识别：租户隔离、Node.js 单体/微服务、LangGraph/LangChain、多数未知架构问题的通用兜底。
- 中文体验：中文问题的可见推荐正文、ADR 中文标题、导出报告中文标签。
- 导出：ADR Markdown、JSON trace、HTML 报告。
- API 质量门：mock live provider 的 JSON parse、schema validation、live verdict aggregation。

## 测试集

- 总用例：30
- 中文用例：21
- 英文用例：9
- 模式覆盖：Fast、Deep、Red-team
- 核心题型覆盖：tenant isolation、service decomposition、agent framework、general architecture
- 相近问题覆盖：产品策略、团队流程、成本取舍、前端迁移、模型路由、安全评审、支持运营、作品集取舍
- 新增相近问题先进入确定性系统审计，不自动进入真实 API full 回归，避免真实模型测试成本失控。

## 发现的问题与策略

| 问题 | 基线表现 | 本轮策略 | 复测结果 |
| --- | --- | --- | --- |
| PostgreSQL / tenant 默认问题在前端上下文里会落到通用兜底 | 旧识别规则通过率 90% | 抽出共享 `question-context` 模块，并补齐 tenant/PostgreSQL/schema-per-tenant/tenant_id 识别 | 新识别通过率 100% |
| 中文界面里部分确定性推荐正文仍是英文 | 原始中文推荐通过率 19% | 增加共享确定性推荐翻译表，UI 和 ADR 导出共用 | 中文可见推荐通过率 100% |
| 用户不容易判断导出是否仍完整 | 未形成系统级回归记录 | 每个用例同时生成 ADR、JSON trace、HTML 报告并检查关键标签 | 导出通过率 100% |
| 真实模型 schema 风险需要持续观察 | 单元测试覆盖局部 schema | 增加 mock live 聚合检查：9 次调用、JSON parse、schema valid/repaired、live verdict | 通过（mock live schema aggregation passed） |

## 汇总指标

| 指标 | 结果 |
| --- | ---: |
| 上下文识别通过率 | 100% |
| 结构完整性通过率 | 100% |
| 相关性通过率 | 100% |
| 中文可见推荐通过率 | 100% |
| 导出通过率 | 100% |
| mock live schema 通过率 | 100% |
| 单用例综合通过率 | 100% |

## 最终验证命令

| 命令 | 结果 |
| --- | --- |
| `npm run quality:audit` | 通过，30 个系统质量用例综合通过率 100% |
| `npm test -- --run` | 当前测试套件通过，具体文件和用例数以命令输出为准 |
| `npm run mock:e2e` | 通过，mock live 模式 9 次调用，openai / deepseek / gemini 三个 mock provider 均产出可解析结构化结果 |
| `npm run build` | 通过，TypeScript 与 Vite production build 均成功 |

## 用例明细

| 用例 | 语言 | 模式 | 期望类型 | 上下文 | 结构 | 相关性 | 中文 | 导出 | 共识分 | 分歧 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- |
| tenant-zh-fast | zh | fast | tenant_isolation | 通过 | 通过 | 通过 | 通过 | 通过 | 80 | 22 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| tenant-en-deep | en | deep | tenant_isolation | 通过 | 通过 | 通过 | 通过 | 通过 | 80 | 12 | - |
| services-zh-fast | zh | fast | service_decomposition | 通过 | 通过 | 通过 | 通过 | 通过 | 84 | 0 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| services-en-deep | en | deep | service_decomposition | 通过 | 通过 | 通过 | 通过 | 通过 | 84 | 14 | - |
| services-zh-red-team | zh | red_team | service_decomposition | 通过 | 通过 | 通过 | 通过 | 通过 | 84 | 14 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| agent-framework-zh-fast | zh | fast | agent_framework | 通过 | 通过 | 通过 | 通过 | 通过 | 81 | 0 | - |
| agent-framework-en-deep | en | deep | agent_framework | 通过 | 通过 | 通过 | 通过 | 通过 | 81 | 0 | - |
| agent-framework-zh-red-team | zh | red_team | agent_framework | 通过 | 通过 | 通过 | 通过 | 通过 | 81 | 0 | - |
| generic-zh-fast | zh | fast | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 22 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| generic-en-deep | en | deep | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 10 | - |
| generic-zh-deep | zh | deep | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 10 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| generic-en-red-team | en | red_team | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 10 | - |
| product-pricing-zh-fast | zh | fast | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 22 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| product-roadmap-en-fast | en | fast | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 22 | - |
| team-process-zh-deep | zh | deep | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 10 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| cost-observability-zh-fast | zh | fast | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 22 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| frontend-migration-en-fast | en | fast | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 22 | - |
| model-routing-zh-fast | zh | fast | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 22 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| security-review-en-red-team | en | red_team | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 10 | - |
| data-retention-zh-fast | zh | fast | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 22 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| hiring-tradeoff-zh-fast | zh | fast | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 22 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| product-process-zh-deep | zh | deep | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 10 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| portfolio-en-fast | en | fast | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 22 | - |
| support-ops-zh-red-team | zh | red_team | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 10 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| kubernetes-zh-deep | zh | deep | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 10 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| api-security-gate-zh-red-team | zh | red_team | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 10 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| contract-review-agent-zh-fast | zh | fast | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 81 | 0 | - |
| rag-governance-zh-deep | zh | deep | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 10 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| incident-response-zh-red-team | zh | red_team | general_architecture | 通过 | 通过 | 通过 | 通过 | 通过 | 83 | 10 | 原始确定性正文偏英文，已通过共享翻译表改善中文可读性 |
| agent-loop-cost-zh-deep | zh | deep | agent_framework | 通过 | 通过 | 通过 | 通过 | 通过 | 81 | 0 | - |

## 低分项处理

- tenant-zh-fast: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- services-zh-fast: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- services-zh-red-team: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- generic-zh-fast: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- generic-zh-deep: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- product-pricing-zh-fast: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- team-process-zh-deep: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- cost-observability-zh-fast: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- model-routing-zh-fast: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- data-retention-zh-fast: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- hiring-tradeoff-zh-fast: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- product-process-zh-deep: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- support-ops-zh-red-team: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- kubernetes-zh-deep: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- api-security-gate-zh-red-team: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- rag-governance-zh-deep: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性
- incident-response-zh-red-team: 原始确定性正文偏英文，已通过共享翻译表改善中文可读性

## 本轮结论

- 当前系统适合继续作为个人使用和演示版本：核心流程、导出、mock live schema、中文推荐可读性都已形成可复测记录。
- 真实模型输出质量仍需要用真实 API key 持续观察；mock live 只能证明 schema 管道可用，不能证明每个真实模型都会稳定遵守 schema。
- 暂时不建议为了这轮质量问题引入 LangGraph JS；当前收益更高的是测试集、schema 质量门和中文体验回归。
