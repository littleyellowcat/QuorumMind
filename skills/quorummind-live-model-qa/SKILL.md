---
name: quorummind-live-model-qa
description: QuorumMind live-model quality gate for verifying real provider calls, Chinese relevance, schema validity, repair/fallback behavior, and blueprint/detail sufficiency. Use for真实API回归,provider连接测试,模型输出质量控制,or diagnosing results that look generic, English, or unrelated.
---

<!-- quorummind-skill
domain: all
roles: [all]
triggers: [真实模型, API, provider, schema, fallback, 兜底, 中文, 不相关, 质量, live, model, repair, validation]
inject: both
-->

# QuorumMind Live Model QA

## Checks

1. Confirm whether a live provider was called; record provider, model, timeout, attempt count, and status.
2. Validate JSON parse and schema status: valid, repaired, invalid, or unparsed.
3. Mark source honestly: live output, repaired live output, deterministic fallback, or mixed.
4. Check language: Chinese requests should receive Simplified Chinese except unavoidable technical terms.
5. Check relevance: recommendations must respond to the actual user question, not a stale template.
6. Check detail: Blueprint results must include concrete workflow, agents/modules, data fields, risks, milestones, acceptance checks, and backlog.

## Failure Handling

- If schema fails, attempt one repair with explicit schema constraints.
- If fallback is used, show it clearly in UI/report.
- If provider output is unrelated twice, stop and report provider/prompt/schema evidence.
