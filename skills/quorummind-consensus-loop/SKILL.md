---
name: quorummind-consensus-loop
description: QuorumMind multi-model consensus loop for independent proposals, blind critique, revision, ranking, and threshold-based finalization. Use when coordinating多个模型互评,共识阈值,分歧分析,red-team review,or iterative refinement until a decision or blueprint reaches enough agreement.
---

<!-- quorummind-skill
domain: all
roles: [all]
triggers: [共识, 分歧, 互评, 挑刺, 质询, 修订, 阈值, consensus, dissent, critique, red-team, revise]
inject: both
-->

# QuorumMind Consensus Loop

## Loop

1. Independent proposal: each model answers without seeing author identity.
2. Blind critique: reviewers attack assumptions, risks, missing evidence, and failure paths.
3. Revision: each proposal must explicitly accept, reject, or defer critique points.
4. Ranking: rank options by criteria and explain material disagreements.
5. Finalization: stop when consensus is at or above the configured threshold, usually 80%.
6. Human review gate: if the round budget is exhausted below threshold, surface the remaining disagreement instead of pretending certainty.

## Quality Rules

- Keep proposal IDs stable; never invent new IDs during ranking or verdict.
- Treat disagreement as useful evidence, not a formatting problem.
- Make adopted versus rejected suggestions visible.
- Report termination reason: threshold met, budget exhausted, or human review required.
