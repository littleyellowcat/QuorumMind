# QuorumMind 真实模型质量趋势

更新：2026-06-25T05:23:31.595Z

## 说明

- 数据源：`docs/quality/live-model-quality-trend.jsonl`，每次运行 `npm run quality:live`、`quality:live:expanded` 或 `quality:live:full` 后自动追加。
- 这里只记录 provider 是否配置、模型名、质量指标、失败用例和报告路径，不记录 API key。
- 真实 API 有波动，趋势比单次结果更有判断价值。

## 最新结果

| 指标 | 结果 |
| --- | ---: |
| 总记录数 | 6 |
| 最新套件 | smoke |
| 最新用例数 | 1/4 |
| 最新 Provider source | mock |
| 最新 live verdict | 100% |
| 最新 JSON 解析 | 100% |
| 最新 Schema 可用 | 100% |
| 最新中文通过 | 0% |
| 最新相关性通过 | 100% |
| 最新兜底率 | 0% |
| 最新综合通过 | 0% |
| 相比上次综合通过 | 0pp |
| 相比上次兜底率 | 0pp |

## 最近记录

| 时间 | 套件 | 用例 | 过滤 | Provider source | live verdict | JSON | Schema | 中文 | 相关性 | 兜底 | 综合 | invalid | repaired | 耗时 ms | 报告 |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-06-25T05:23:31.591Z | smoke | 1/4 | services-zh-fast | mock | 100% | 100% | 100% | 0% | 100% | 0% | 0% | 0 | 0 | 23 | docs/quality/2026-06-25-live-model-quality-audit-filtered.md |
| 2026-06-25T05:23:22.298Z | smoke | 1/4 | services-zh-fast | mock | 100% | 100% | 100% | 0% | 100% | 0% | 0% | 0 | 0 | 23 | docs/quality/2026-06-25-live-model-quality-audit-filtered.md |
| 2026-06-25T02:22:59.306Z | smoke | 4/4 | 未过滤 | real | 100% | 100% | 100% | 100% | 100% | 0% | 100% | 0 | 0 | 296542 | docs/quality/2026-06-25-live-model-quality-audit.md |
| 2026-06-24T08:41:18.079Z | full | 1/30 | tenant-zh-fast | real | 0% | 44% | 44% | 0% | 100% | 100% | 0% | 5 | 0 | 60036 | docs/quality/2026-06-24-live-model-quality-audit-full-filtered.md |
| 2026-06-22T03:17:40.625Z | smoke | 1/4 | 未过滤 | real | 100% | 100% | 100% | 100% | 100% | 0% | 100% | 0 | 0 | 69289 | docs/quality/2026-06-22-live-model-quality-audit.md |
| 2026-06-17T06:30:53.967Z | smoke | 1/4 | 未过滤 | real | 100% | 100% | 100% | 100% | 100% | 0% | 100% | 0 | 0 | 60276 | docs/quality/2026-06-17-live-model-quality-audit.md |

## 最新异常用例

| 用例 | 状态 | 来源 | 备注 |
| --- | --- | --- | --- |
| services-zh-fast | warning | live | 中文可见回答未通过语言检查。 |
