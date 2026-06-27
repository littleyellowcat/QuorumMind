# QuorumMind 真实 API 功能验收记录

日期：2026-06-25

## 验收目标

在已授权使用真实 API key 的前提下，补跑第二层真实 provider 回归，确认核心链路是否真的调用模型、是否能产出可用结果、是否会触发 fallback，以及真实模型输出质量风险在哪里。

本轮采用控成本策略：不跑 30 条 full suite，而是先跑 Decision live smoke，再跑 Blueprint/Agent live 小样本。

## 调用预算

| 项目 | 设置 |
| --- | --- |
| Decision live | `QUORUMMIND_LIVE_AUDIT_LIMIT=4` |
| Blueprint/Agent live | `QUORUMMIND_BLUEPRINT_LIVE_AUDIT_LIMIT=2` |
| Blueprint provider 阶段 | `QUORUMMIND_BLUEPRINT_LIVE_AUDIT_MAX_PROVIDER_ROUNDS=2` |
| 单 provider 超时 | `QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS=90000` |
| 是否调用真实 API | 是 |
| 是否使用 mock provider | 否 |

## Provider 配置

脚本检测到已配置真实 provider：

- `model_gateway`
- `deepseek`

`model_gateway` 当前模型列表包含：

- `gpt-5.4-mini`
- `deepseek-v4-pro`
- `gemini-3.1-pro-preview`

报告只记录 provider/model 状态，不记录任何 API key。

## Decision Live Smoke

命令：

```bash
QUORUMMIND_LIVE_AUDIT_LIMIT=4 QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS=90000 npm run quality:live
```

结果：

| 指标 | 结果 |
| --- | ---: |
| 用例 | 4 |
| 预估调用预算 | 36 |
| 配置 provider | `model_gateway`, `deepseek` |
| live verdict 生成率 | 100% |
| JSON 解析率 | 100% |
| Schema 可用率 | 100% |
| Schema 修复占比 | 0% |
| 兜底触发率 | 0% |
| 中文回答通过率 | 100% |
| 相关性通过率 | 100% |
| 综合通过率 | 100% |

用例明细：

| 用例 | 模式 | 来源 | 状态 | 调用数 | Schema | 中文 | 相关性 | 共识分 | 分歧 |
| --- | --- | --- | --- | ---: | --- | --- | --- | ---: | ---: |
| `tenant-zh-fast` | fast | live | passed | 9 | 100% | true | 通过 | 81 | 44 |
| `services-zh-fast` | fast | live | passed | 9 | 100% | true | 通过 | 82 | 0 |
| `agent-framework-zh-fast` | fast | live | passed | 9 | 100% | true | 通过 | 73 | 67 |
| `generic-zh-fast` | fast | live | passed | 9 | 100% | true | 通过 | 79 | 44 |

结论：Decision Room 真实 provider 链路可用，未触发 fallback。

## Blueprint / Agent Live 小样本

第一次运行发现中文检查 0%，复查后确认是审计脚本过严：脚本把 Agent ID、Schema 字段和技术词也计入英文词，误判中文失败。已修复为“中文占比 + 技术词豁免”，并补充 case id 过滤，确保能指定 Agent endpoint。

最终命令：

```bash
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_CASE_IDS=vn-agent-workflow-zh,ai-code-review-platform-zh \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_LIMIT=2 \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_MAX_PROVIDER_ROUNDS=2 \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_TIMEOUT_MS=240000 \
QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS=90000 \
npm run quality:blueprint:live
```

结果：

| 指标 | 结果 |
| --- | ---: |
| 用例 | 2 |
| 端点覆盖 | `blueprint`, `agent` |
| 真实模型调用率 | 100% |
| 可用真实轨迹率 | 100% |
| Schema 可用率 | 83% |
| Schema 修复率 | 0% |
| 兜底率 | 0% |
| 中文通过率 | 100% |
| 相关性通过率 | 100% |
| 蓝图详细度通过率 | 100% |
| 功能可用率 | 100% |
| 严格通过率 | 0% |

用例明细：

| 用例 | 端点 | 状态 | 调用数 | Schema 可用 | 中文 | 相关性 | 详细度 | 共识 | 备注 |
| --- | --- | --- | ---: | --- | --- | --- | --- | ---: | --- |
| `vn-agent-workflow-zh` | blueprint | warning | 6 | 83% | true | 通过 | 通过 | 87 | `proposal/openai/gpt-5.4-mini/error/unparsed/provider_error` |
| `ai-code-review-platform-zh` | agent | warning | 6 | 83% | true | 通过 | 通过 | 88 | `proposal/openai/gpt-5.4-mini/error/unparsed/provider_error` |

判读：

- 功能层面：蓝图室和 Agent 平台都能真实调用 provider，并得到可用 live trace；没有 fallback；中文、相关性、详细度都通过。
- 严格质量层面：仍有 1 次 provider error，所以状态是 `warning`，严格通过率不是 100%。

## 失败模型定位

本轮稳定暴露的问题是模型网关第一席在 proposal 阶段报错：

```text
proposal/openai/gpt-5.4-mini/error/unparsed/provider_error
```

后续补了两层复测，避免把问题误判成“模型/API key 完全不可用”。

### Provider 深度连通性复测

命令：

```bash
QUORUMMIND_PROVIDER_DEEP_TEST_TIMEOUT_MS=90000 npm run quality:providers:deep
```

结果写入：

- `docs/quality/2026-06-25-provider-deep-connectivity-audit.md`
- `output/provider-connectivity/2026-06-25-provider-deep-connectivity-audit.json`

结果：

| 指标 | 结果 |
| --- | ---: |
| 检测 seat | 3 |
| 响应率 | 100% |
| JSON 解析率 | 100% |
| Schema 可用率 | 100% |
| Schema 修复率 | 0% |

明细：

| Seat | Provider | Model | Schema |
| --- | --- | --- | --- |
| `model_gateway:openai:gpt-5.4-mini` | openai | `gpt-5.4-mini` | valid |
| `model_gateway:deepseek:deepseek-v4-pro` | deepseek | `deepseek-v4-pro` | valid |
| `model_gateway:gemini:gemini-3.1-pro-preview` | gemini | `gemini-3.1-pro-preview` | valid |

### 禁用不稳定席位后的 Blueprint 复跑

命令：

```bash
QUORUMMIND_DISABLED_LIVE_MODELS=gpt-5.4-mini \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_CASE_IDS=vn-agent-workflow-zh \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_LIMIT=1 \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_MAX_PROVIDER_ROUNDS=2 \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_TIMEOUT_MS=240000 \
QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS=90000 \
npm run quality:blueprint:live
```

结果：

| 指标 | 结果 |
| --- | ---: |
| 用例 | 1 |
| 真实模型调用率 | 100% |
| 可用真实轨迹率 | 100% |
| Schema 可用率 | 100% |
| 兜底率 | 0% |
| 中文通过率 | 100% |
| 相关性通过率 | 100% |
| 蓝图详细度通过率 | 100% |
| 严格通过率 | 100% |

这说明问题更像是：

- 某些模型 seat 在长 Blueprint prompt / proposal 阶段可能不稳定；
- 不是所有 seat 的基础连通性问题，因为最小 JSON schema prompt 已经 3/3 通过；
- 禁用异常 seat 后，Blueprint 小样本可以达到严格通过；
- QuorumMind 主流程有容错：其余 provider 输出仍可形成可用 live trace，所以功能可用率仍为 100%。

## 本轮代码/脚本补强

| 文件 | 变更 |
| --- | --- |
| `scripts/live-blueprint-quality-audit.ts` | 支持 `QUORUMMIND_BLUEPRINT_LIVE_AUDIT_CASE_IDS` 指定用例 |
| `scripts/live-blueprint-quality-audit.ts` | 中文检查改为中文占比 + 技术词豁免，避免把 Agent/Schema/API 等技术词误判为英文输出 |
| `scripts/live-blueprint-quality-audit.ts` | invalid/unparsed/error 备注增加 phase/provider/model/status/failureClass 明细 |
| `scripts/live-blueprint-quality-audit.ts` | 新增“功能可用率”，与严格通过率分开表达 |
| `scripts/provider-deep-connectivity-audit.ts` | 新增逐 seat 最小 JSON schema 真实连通性审计 |
| `server/providers/registry.ts` | 新增 `QUORUMMIND_DISABLED_LIVE_MODELS`，可临时跳过不稳定 live seat |
| `server/providers/registry.test.ts` | 覆盖 gateway seat 与 standalone provider 的禁用逻辑 |

构建验证：

```bash
npm run build
```

结果：通过。

## 总结

真实 API 第二层验收结论：

1. Decision Room 真实模型链路通过，4/4 passed，live verdict、schema、中文、相关性均为 100%，fallback 0%。
2. Blueprint Room 和 Agent Platform 真实模型链路可以跑通，功能可用率 100%，fallback 0%，中文/相关性/详细度均通过。
3. Provider 深度连通性复测 3/3 通过，说明 API key、网关、模型名至少能完成最小结构化 JSON 输出。
4. 当前最大真实 API 质量风险不是主流程，而是长 Blueprint prompt / proposal 阶段对个别 seat 的稳定性要求更高，可能出现 `provider_error` 或 unparsed。
5. 自用可以继续试；如果要对外演示，建议先跑 `quality:providers:deep` 和 1-2 条 `quality:blueprint:live`，再用 `QUORUMMIND_DISABLED_LIVE_MODELS` 临时排除异常 seat。

## 下一步建议

- 对 `MODEL_GATEWAY_MODELS` 做一次人工核验：确认每个模型名是否是网关实际支持的可用模型。
- 将 `quality:providers:deep` 作为真实 API 变更后的第一道健康检查。
- 对连续 provider error 的模型 seat 使用 `QUORUMMIND_DISABLED_LIVE_MODELS` 临时排除，避免一个坏 seat 拖低严格通过率。
- 如果要继续扩大真实 API 回归，再跑 5-8 条 Blueprint/Agent live，而不是直接上 30 条 full suite。
