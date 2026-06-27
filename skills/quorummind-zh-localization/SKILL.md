---
name: quorummind-zh-localization
description: QuorumMind Chinese localization and UX-language guard for UI, prompts, reports, tooltips, charts, and exported documents. Use when checking中文体验,术语统一,残留英文,长中文排版,or whether model/report output should be Simplified Chinese.
---

<!-- quorummind-skill
domain: all
roles: [all]
triggers: [中文, 翻译, 本地化, 英文, 术语, tooltip, 文案, Chinese, localization, i18n]
inject: both
-->

# QuorumMind Zh Localization

## Language Rules

- Use Simplified Chinese for Chinese mode, including UI labels, chart labels, empty states, export headings, and model-facing instructions.
- Keep unavoidable technical terms in English only when they are standard: API, Token, schema, provider, ADR, RAG.
- Explain uncommon technical terms with short Chinese tooltip text.
- Avoid mixed-language section titles such as Risk Ledger, Assumption Ledger, or Regret Map in Chinese mode.

## UX Checks

- Long Chinese sentences must wrap cleanly and not overflow buttons, cards, charts, or side panels.
- Prefer user-facing phrases: 最终方案, 风险矩阵, 共识变化, 采纳建议, 待确认问题.
- Do not expose internal phase names unless they help users understand progress.
- Exported documents must match the active locale.
