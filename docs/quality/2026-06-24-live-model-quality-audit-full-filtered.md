# QuorumMind 真实模型质量评估记录

日期：2026-06-24

## 评估目标

- 验证真实 provider 是否能产出可解析 JSON。
- 验证 schema valid / repaired / invalid 比例。
- 验证真实模型是否能聚合出 live verdict，避免悄悄回退到确定性兜底。
- 验证中文问题的可见回答是否仍为中文且与问题相关。
- 验证不同运行深度下的快测、Deep 和 Red-team 链路是否稳定。

## 本轮策略

- Prompt 已强化：中文运行要求所有用户可见字符串使用简体中文，保留 JSON 字段、proposalId、模型名和技术标识。
- Prompt 已强化：ranking / verdict 阶段必须使用 payload 里出现过的 proposalId，不能自造 ID。
- 当前套件：`full`。可选 `smoke`、`expanded`、`full`，通过 `QUORUMMIND_LIVE_AUDIT_SUITE` 切换。
- `smoke` 默认保持 4 个中文 fast 代表问题；`expanded` 增加中文 Deep / Red-team；`full` 跑完整 30 题真实 API 回归池。
- 本套件可运行用例：30 个；本轮实际运行：1 个；预估模型调用预算：9 次。
- 用例过滤：tenant-zh-fast。

- 可通过 `QUORUMMIND_LIVE_AUDIT_LIMIT` 控制本套件内运行用例数，避免真实 API 调用过量。
- 单用例超时：75000ms，可通过 `QUORUMMIND_LIVE_AUDIT_TIMEOUT_MS` 调整。
- 单 provider 请求超时：20000ms，可通过 `QUORUMMIND_LIVE_PROVIDER_TIMEOUT_MS` 调整。

## Provider 配置状态

> 这里只记录是否配置和模型名，不记录任何 API key。

| Provider | 状态 | 模型 | 说明 |
| --- | --- | --- | --- |
| model_gateway | 已配置 | gpt-5.4-mini,deepseek-v4-pro,gemini-3.1-pro-preview | Implemented as an OpenAI-compatible chat completions gateway using one API key and base URL. |
| deepseek | 已配置 | deepseek-chat | Implemented through the DeepSeek chat completions API. |
| openai | 未配置 | gpt-4o-mini | Implemented through the OpenAI Responses API. ChatGPT Plus is not an API key. |
| gemini | 未配置 | gemini-2.0-flash-lite | Implemented through the Gemini generateContent API. Gemini Advanced is not an API key. |

## 汇总指标

| 指标 | 结果 |
| --- | ---: |
| 评估套件 | full |
| 运行用例数 | 1 |
| 套件可用用例数 | 30 |
| 用例过滤 | tenant-zh-fast |
| 预估模型调用预算 | 9 |
| 配置的真实 provider | model_gateway, deepseek |
| live verdict 生成率 | 0% |
| JSON 解析率 | 44% |
| Schema 可用率 | 44% |
| Schema 修复占比 | 0% |
| 兜底触发率 | 100% |
| 中文回答通过率 | 0% |
| 相关性通过率 | 100% |
| 综合通过率 | 0% |

## 用例明细

| 用例 | 语言 | 模式 | 来源 | 状态 | 调用数 | JSON 解析 | Schema 可用 | 中文 | 相关性 | 共识分 | 分歧 | 耗时 ms | 备注 |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | --- |
| tenant-zh-fast | zh | fast | fallback | failed | 9 | 44% | 44% | false | 通过 | 80 | 22 | 60036 | 真实模型未生成可聚合裁决，结果会依赖确定性兜底。；5 次调用无效或未解析：proposal/openai/gpt-5.4-mini provider_error (Unknown provider error)；proposal/deepseek/deepseek-v4-pro provider_error (Unknown provider error)；proposal/gemini/gemini-3.1-pro-preview provider_error (Unknown provider error)；ranking/gemini/gemini-3.1-pro-preview provider_error (Unknown provider error)；verdict/gemini/gemini-3.1-pro-preview provider_error (Unknown provider error)；中文可见回答未通过语言检查。 |

## 判读规则

- `passed`：有 live verdict、相关性通过、中文用例通过中文检查、且无 invalid/unparsed/error 调用。
- `warning`：能生成 live verdict，但有 schema 修复、中文/相关性风险或部分调用质量风险。
- `failed`：未生成 live verdict、请求失败、超时或只能依赖确定性兜底。
- `skipped`：未配置真实 provider。

## 下一步建议

- 优先查看 warning/failed 用例备注，针对 provider 输出格式、中文指令或 proposalId 对齐继续加强 prompt/schema 修复。
- 如果 `Schema 修复占比` 长期偏高，应该进一步收紧 provider prompt 或增加 provider-specific repair 规则。
- 如果 `兜底触发率` 非 0，需要在 UI 中继续强调“当前不是 live verdict”。
