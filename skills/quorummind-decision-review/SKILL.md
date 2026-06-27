---
name: quorummind-decision-review
description: QuorumMind decision-room method for审查架构取舍、技术选型、产品策略、团队流程或成本风险决策. Use when a request asks whether to choose A or B, compare options, produce an ADR, explain consensus/dissent, or make a reviewable decision.
---

<!-- quorummind-skill
domain: all
roles: [all]
triggers: [决策, 取舍, 是否, 要不要, 方案比较, 技术选型, 架构, ADR, consensus, decision, tradeoff, option]
inject: decision_room
-->

# QuorumMind Decision Review

## Workflow

1. Restate the decision as a reviewable question with candidate options, constraints, and time horizon.
2. Separate facts, assumptions, unknowns, and preferences. Do not treat missing context as evidence.
3. Score options across delivery speed, reliability, security, cost, maintainability, team fit, reversibility, and migration flexibility.
4. Identify regret scenarios: what would make each option look wrong in 3, 6, and 12 months.
5. Explain consensus and dissent separately. High consensus means agreement on direction; high dissent means important unresolved risks remain.
6. Recommend the smallest reversible next step unless the evidence clearly justifies a one-way move.

## Output Rules

- Produce a clear winner only when the tradeoff is defensible.
- Include decision triggers: metrics or dates that would cause a revisit.
- For Chinese users, answer in Simplified Chinese except unavoidable technical terms.
- For ADR output, include context, decision, alternatives, consequences, risks, and follow-up checks.
