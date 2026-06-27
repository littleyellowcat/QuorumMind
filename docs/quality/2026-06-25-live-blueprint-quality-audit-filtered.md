# QuorumMind 真实 API 蓝图质量回归

日期：2026-06-25

## 评估目标

- 验证蓝图室 / Agent 平台是否真的调用真实模型。
- 记录中文、相关性、schema 可用性、schema 修复、兜底原因。
- 判断最终蓝图是否足够详细，避免只输出概要。
- 验证来源透明：真实模型不可用时必须显示确定性兜底。

## 本轮运行参数

| 项目 | 值 |
| --- | ---: |
| 用例上限 | 1 |
| 用例过滤 | sales-crm-agent-zh |
| 未找到用例 | 无 |
| 最大 provider 阶段 | 1/5 |
| 预计最大调用数 | 3 |
| 单用例超时 | 90000ms |
| 单 provider 超时 | 20000ms |
| 已配置真实 provider | openai, deepseek, gemini |
| Provider source | mock |
| 进度 JSONL | output/audit-progress/validation-live-blueprint.jsonl |
| Resume | 未启用 |
| 已恢复用例 | 0 |
| 已完成 / 计划用例 | 1/1 |
| 全局最大运行时长 | 未设置 |
| 停止原因 | completed |

## Provider 配置状态

| Provider | 状态 | 模型 | 说明 |
| --- | --- | --- | --- |
| model_gateway | 已配置 | gpt-5.4-mini,deepseek-v4-pro,gemini-3.1-pro-preview | Implemented as an OpenAI-compatible chat completions gateway using one API key and base URL. |
| deepseek | 已配置 | deepseek-chat | Implemented through the DeepSeek chat completions API. |
| openai | 未配置 | gpt-4o-mini | Implemented through the OpenAI Responses API. ChatGPT Plus is not an API key. |
| gemini | 未配置 | gemini-2.0-flash-lite | Implemented through the Gemini generateContent API. Gemini Advanced is not an API key. |

## 汇总指标

| 指标 | 结果 |
| --- | ---: |
| 运行用例 | 1 |
| 真实模型调用率 | 100% |
| 可用真实轨迹率 | 100% |
| Schema 可用率 | 100% |
| Schema 修复率 | 0% |
| 兜底率 | 0% |
| 中文通过率 | 100% |
| 相关性通过率 | 100% |
| 蓝图详细度通过率 | 100% |
| 功能可用率 | 100% |
| 严格通过率 | 100% |

## 用例明细

| 用例 | 端点 | 语言 | 模式 | 状态 | 真实调用 | 可用轨迹 | 调用数 | Schema 可用 | 修复 | 无效 | 中文 | 相关性 | 详细度 | 兜底原因 | 共识 | 耗时 ms | 备注 |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | --- |
| sales-crm-agent-zh | blueprint | zh | fast | passed | 是 | 是 | 3 | 100% | 0 | 0 | true | 通过 | 通过 | - | 75 | 18 | - |

## 判读规则

- `passed`：真实调用、可用 live trace、中文/相关性/详细度通过，且无 invalid/unparsed/error。
- `warning`：有真实调用且功能可用，但存在 schema 修复、provider error、兜底、详细度或语言相关风险。
- `failed`：没有真实调用、请求失败、超时或只能得到错误。
- `skipped`：本地未配置真实 provider。

## 下一步

- 若“真实模型调用率”为 0，先检查 `.env.local`、`QUORUMMIND_PROVIDER_MODE=live` 和 provider key。
- 若“详细度通过率”低，优先加强 Blueprint provider prompt 和最终合成约束。
- 若“Schema 修复率”高，优先收紧 provider JSON schema 提示或增加 provider-specific repair。
