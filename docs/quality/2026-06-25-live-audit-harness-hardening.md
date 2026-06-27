# QuorumMind Live Audit Harness 加固记录

日期：2026-06-25

## 背景

上一轮真实 API 扩展验收暴露的问题不是“真实 provider 完全不可用”，而是 `quality:live:expanded` 在长任务下缺少可观测性：

- 没有逐 case 开始 / 结束日志。
- 没有逐 provider trace 摘要输出。
- 中断后已完成用例没有增量落盘。
- 不能基于已完成 case resume。
- 没有全局最大运行时长控制。

## 本轮改动

| 文件 | 改动 |
| --- | --- |
| `scripts/audit-harness.ts` | 新增共享 audit harness：case 日志、增量 JSONL、resume、全局运行时长、SIGINT 摘要 |
| `scripts/live-model-quality-audit.ts` | 接入 harness，记录 progress path、provider source、case trace summary、resume 状态 |
| `scripts/live-blueprint-quality-audit.ts` | 接入 harness，支持 Blueprint / Agent live 审计增量落盘和 resume |
| `scripts/live-blueprint-quality-audit.ts` | 报告路径改为按日期生成，避免固定 `2026-06-20` 文件被反复覆盖 |
| `.env.example` | 补充 live audit progress / resume / max runtime / mock self-check 配置 |
| `README.md` | 补充长任务增量审计、resume、mock self-check 和 providerSource 说明 |

## 新增能力

Decision live audit：

- `QUORUMMIND_LIVE_AUDIT_PROGRESS_PATH`
- `QUORUMMIND_LIVE_AUDIT_RESUME=1`
- `QUORUMMIND_LIVE_AUDIT_MAX_RUNTIME_MS=600000`
- `QUORUMMIND_LIVE_AUDIT_ALLOW_MOCK=1`

Blueprint / Agent live audit：

- `QUORUMMIND_BLUEPRINT_LIVE_AUDIT_PROGRESS_PATH`
- `QUORUMMIND_BLUEPRINT_LIVE_AUDIT_RESUME=1`
- `QUORUMMIND_BLUEPRINT_LIVE_AUDIT_MAX_RUNTIME_MS=600000`
- `QUORUMMIND_BLUEPRINT_LIVE_AUDIT_ALLOW_MOCK=1`

通用开关：

- `QUORUMMIND_AUDIT_RESUME=1`
- `QUORUMMIND_AUDIT_MAX_RUNTIME_MS=600000`

## Mock Harness 自检

本轮没有再次调用真实付费 provider。为了验证 harness 本身，使用 mock-live provider 进行自检，报告会显式标记 `providerSource=mock`。

### Decision live audit self-check

命令：

```bash
QUORUMMIND_PROVIDER_MODE=live \
QUORUMMIND_MOCK_PROVIDERS=1 \
QUORUMMIND_LIVE_AUDIT_ALLOW_MOCK=1 \
QUORUMMIND_LIVE_AUDIT_CASE_IDS=services-zh-fast \
QUORUMMIND_LIVE_AUDIT_LIMIT=1 \
QUORUMMIND_LIVE_AUDIT_TIMEOUT_MS=60000 \
QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS=20000 \
QUORUMMIND_LIVE_AUDIT_PROGRESS_PATH=output/audit-progress/validation-live-model.jsonl \
npm run quality:live
```

结果：

| 指标 | 结果 |
| --- | ---: |
| 用例 | 1 |
| providerSource | mock |
| provider calls | 9 |
| JSON 解析率 | 100% |
| Schema 可用率 | 100% |
| 兜底率 | 0% |
| 进度 JSONL | `output/audit-progress/validation-live-model.jsonl` |
| 报告 | `docs/quality/2026-06-25-live-model-quality-audit-filtered.md` |

备注：该 mock provider 的可见裁决为英文，因此中文检查为 warning。这是预期结果，说明中文质量门仍然生效。

### Decision resume self-check

命令：

```bash
QUORUMMIND_PROVIDER_MODE=live \
QUORUMMIND_MOCK_PROVIDERS=1 \
QUORUMMIND_LIVE_AUDIT_ALLOW_MOCK=1 \
QUORUMMIND_LIVE_AUDIT_RESUME=1 \
QUORUMMIND_LIVE_AUDIT_CASE_IDS=services-zh-fast \
QUORUMMIND_LIVE_AUDIT_PROGRESS_PATH=output/audit-progress/validation-live-model.jsonl \
npm run quality:live
```

结果：控制台输出 `resume-skip services-zh-fast`，没有重复调用该 case。

### Blueprint live audit self-check

命令：

```bash
QUORUMMIND_PROVIDER_MODE=live \
QUORUMMIND_MOCK_PROVIDERS=1 \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_ALLOW_MOCK=1 \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_CASE_IDS=sales-crm-agent-zh \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_LIMIT=1 \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_MAX_PROVIDER_ROUNDS=1 \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_TIMEOUT_MS=90000 \
QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS=20000 \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_PROGRESS_PATH=output/audit-progress/validation-live-blueprint.jsonl \
npm run quality:blueprint:live
```

结果：

| 指标 | 结果 |
| --- | ---: |
| 用例 | 1 |
| providerSource | mock |
| provider calls | 3 |
| Live called | 100% |
| Live usable | 100% |
| Schema 可用率 | 100% |
| 中文 / 相关性 / 详细度 | 100% |
| 严格通过率 | 100% |
| 进度 JSONL | `output/audit-progress/validation-live-blueprint.jsonl` |
| 报告 | `docs/quality/2026-06-25-live-blueprint-quality-audit-filtered.md` |

## 工程验证

```bash
npx tsc --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm test -- --run
npm run build
```

结果：

| 项目 | 结果 |
| --- | --- |
| TypeScript app | passed |
| TypeScript node | passed |
| Vitest | 30 files / 144 tests passed |
| Build | passed |

## 下一步

现在可以重新跑真实 API 小批次，但建议仍从小样本开始：

```bash
QUORUMMIND_LIVE_AUDIT_CASE_IDS=services-zh-red-team,agent-framework-zh-red-team,generic-zh-deep \
QUORUMMIND_LIVE_AUDIT_MAX_RUNTIME_MS=600000 \
npm run quality:live:expanded
```

如果中断或超时，再用：

```bash
QUORUMMIND_LIVE_AUDIT_RESUME=1 \
QUORUMMIND_LIVE_AUDIT_CASE_IDS=services-zh-red-team,agent-framework-zh-red-team,generic-zh-deep \
npm run quality:live:expanded
```

这样即使 provider 长尾耗时仍然存在，也能看到卡在哪个 case，并保留已经完成的结果。
