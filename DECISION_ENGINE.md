# QuorumMind Decision Engine

The decision engine turns a user question into an auditable Decision Room. It is intentionally deterministic in demo mode so tests, exports, and interviews can reproduce the same reasoning path without spending API credits.

## Multi-Agent Protocol

- **Proposal Round:** agents independently generate candidate decision paths.
- **Blind Review:** proposal authorship is hidden as Proposal A/B/C before critique.
- **Cross-Examination:** agents attack assumptions, hidden risks, and missing considerations.
- **Revision Round:** proposals are revised after critique.
- **Consensus Engine:** rankings, utility, confidence, regret, model reputation, and sensitivity lenses are aggregated.
- **Final Verdict:** QuorumMind emits recommendation, risks, rollback path, and ADR Markdown.

## Scoring Mechanisms

- **Quorum Score:** combines weighted utility, Borda score, confidence, and regret penalty.
- **Borda Count:** aggregates ordered model preferences more robustly than simple majority vote.
- **Bayesian Weighted Voting:** blends configured agent weight, model reputation prior, and current confidence.
- **Dissent Index:** measures ranking disagreement so consensus and controversy are visible.
- **Minimax Regret Map:** ranks options by worst-case downside across scenarios.
- **TOPSIS Decision Lens:** ranks options by closeness to the ideal multi-criteria solution.
- **Monte Carlo Stress Lens:** runs seeded uncertainty simulations and reports win rate, average score, downside P10, and worst simulated score.
- **AHP Sensitivity Analysis:** derives context-aware priority weights, estimates consistency, and tests whether the winner changes under security, speed, cost, or reliability stress.
- **Model Reputation Feedback Calibration:** applies bounded historical feedback signals to model-domain reputation without replacing the transparent base matrix.

## Explainability Surfaces

- Scoring transparency panel shows formula contributions for the winner.
- Model ranking evidence shows how each structured ranking affected aggregation.
- Assumption Ledger converts hidden assumptions into validation questions and actions.
- ADR, JSON trace, and PDF exports preserve the decision rationale.

## Fallback Strategy

Live model outputs are treated as useful but unreliable. The deterministic engine is the stable baseline, while live aggregation is promoted only when provider JSON contains usable proposals and rankings. Invalid model payloads are classified and displayed instead of silently trusted. Bounded retry policy can recover transient provider, parse, or schema failures while preserving each attempt in the trace.
