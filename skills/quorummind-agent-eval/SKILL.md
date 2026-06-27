---
name: quorummind-agent-eval
description: QuorumMind AgentEval method for evaluating agent systems by final-answer quality, execution trajectory, tool/RAG correctness, latency, token cost, schema validity, and online/offline regression. Use for agent performance audits,测试集设计,LLM-as-judge rubrics,trace scoring,or quality reports.
---

<!-- quorummind-skill
domain: all
roles: [all]
triggers: [评估, 测试集, AgentEval, 性能, 轨迹, 延迟, token, 成本, judge, rubric, eval, benchmark, regression]
inject: both
-->

# QuorumMind AgentEval

## Evaluation Axes

1. Response quality: relevance, correctness, usefulness, completeness, logic, bias/safety, and Chinese consistency.
2. Trajectory quality: phase order, tool choice, critique coverage, revision uptake, and stop condition.
3. Structured-output quality: JSON parse status, schema status, repair status, fallback status, and source transparency.
4. Efficiency: latency, provider attempts, timeout count, token estimate, cost estimate, and consensus rounds.
5. RAG/tool quality when applicable: evidence relevance, citation traceability, and hallucination risk.

## Offline Test Method

- Use JSONL cases with input, expected behavior, ideal trajectory, required fields, and risk tags.
- Score each case with deterministic checks first, then LLM-as-judge only for subjective quality.
- Record failure reason categories so improvements can be measured over time.

## Online Tracking

- Log phase-level latency, provider, model, schema status, fallback status, and final source.
- Compare versions with A/B or before/after reports before claiming improvement.
