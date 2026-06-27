# QuorumMind Live Blueprint Audit 旧固定路径说明

日期：2026-06-25

这个文件曾经是 `npm run quality:blueprint:live` 的固定输出路径。为了避免真实 API、mock 自检和不同 case 过滤条件互相覆盖，脚本已经改为按日期和过滤条件生成新报告。

新的默认报告示例：

- `docs/quality/2026-06-25-live-blueprint-quality-audit.md`
- `docs/quality/2026-06-25-live-blueprint-quality-audit-filtered.md`

本轮 mock harness 自检报告：

- `docs/quality/2026-06-25-live-blueprint-quality-audit-filtered.md`
- `output/audit-progress/validation-live-blueprint.jsonl`

真实 API 功能验收结论请看：

- `docs/quality/2026-06-25-real-api-functional-audit.md`
- `docs/quality/2026-06-25-provider-deep-connectivity-audit.md`
