# QuorumMind Provider 深度连通性审计

日期：2026-06-25

## 目标

逐个真实 provider/model seat 发送最小 JSON schema prompt，验证模型是否能响应、是否能解析 JSON、是否能通过 QuorumMind proposal schema。

本报告不记录任何 API key。

## 参数

| 项目 | 值 |
| --- | ---: |
| 单模型超时 | 90000ms |
| 检测 seat 数 | 3 |
| 输出 JSON | `output/provider-connectivity/2026-06-25-provider-deep-connectivity-audit.json` |

## Provider 状态

| Provider | 状态 | 模型 | 说明 |
| --- | --- | --- | --- |
| model_gateway | 已配置 | gpt-5.4-mini,deepseek-v4-pro,gemini-3.1-pro-preview | Implemented as an OpenAI-compatible chat completions gateway using one API key and base URL. |
| deepseek | 已配置 | deepseek-chat | Implemented through the DeepSeek chat completions API. |
| openai | 未配置 | gpt-4o-mini | Implemented through the OpenAI Responses API. ChatGPT Plus is not an API key. |
| gemini | 未配置 | gemini-2.0-flash-lite | Implemented through the Gemini generateContent API. Gemini Advanced is not an API key. |

## 汇总

| 指标 | 结果 |
| --- | ---: |
| seat 数 | 3 |
| configured | 3 |
| responded | 3 |
| JSON parsed | 3 |
| schema usable | 3 |
| repaired | 0 |
| 响应率 | 100% |
| JSON 解析率 | 100% |
| Schema 可用率 | 100% |

## 明细

| Seat | Provider | Model | 响应 | JSON | Schema | Validation | 耗时 ms | 失败原因 |
| --- | --- | --- | --- | --- | --- | --- | ---: | --- |
| model_gateway:openai:gpt-5.4-mini | openai | gpt-5.4-mini | 是 | 是 | 是 | valid | 20808 | - |
| model_gateway:deepseek:deepseek-v4-pro | deepseek | deepseek-v4-pro | 是 | 是 | 是 | valid | 12304 | - |
| model_gateway:gemini:gemini-3.1-pro-preview | gemini | gemini-3.1-pro-preview | 是 | 是 | 是 | valid | 14614 | - |

## 判读

- Schema=是：该模型可作为 QuorumMind live provider seat 使用。
- Validation=repaired：模型输出可修复，但应继续观察。
- 响应=否 或 Schema=否：不建议放在 live seat 前排；会拖低严格质量门。
