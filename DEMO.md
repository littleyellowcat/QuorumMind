# QuorumMind Demo Guide

This guide is for interviews, portfolio walkthroughs, and local validation.

## One-Command Checks

```bash
npm test -- --run
npm run build
npm run mock:e2e
```

`npm run mock:e2e` exercises the live-like provider pipeline without API keys:

- mock GPT, DeepSeek, and Gemini seats
- proposal, ranking, and verdict phases
- schema validation and normalized payloads
- live verdict aggregation

## Local Browser Demo

```bash
QUORUMMIND_PROVIDER_MODE=live QUORUMMIND_MOCK_PROVIDERS=1 npm run dev
```

Open the Vite URL shown in the terminal. Run the default architecture question and show:

- Decision Room setup
- live provider trace
- schema status and retries
- scoring transparency
- TOPSIS / Monte Carlo / AHP lenses
- ADR, JSON, and PDF exports

## Docker Demo

```bash
docker compose up --build
```

Open `http://localhost:5173`. Docker uses mock live providers by default, so it does not need API keys.

## One-Minute Interview Pitch

QuorumMind is a local-first multi-agent architecture decision engine. It turns a vague architecture trade-off into a Decision Room where model agents propose, critique, revise, rank, and generate an ADR. The engineering focus is reliability: model outputs are schema-hardened, live calls are observable and retry-aware, scoring is transparent, and deterministic mock providers make the system testable without API keys.

## Resume Bullets

- Built **QuorumMind**, a multi-agent architecture decision engine with Delphi-style proposal, blind review, revision, ranking, and ADR generation.
- Implemented schema-hardened LLM output validation with normalized payloads, failure classification, retry-aware traces, and deterministic fallback.
- Designed an explainable consensus engine using Borda Count, Bayesian weighted voting, Minimax Regret, TOPSIS, Monte Carlo stress testing, and AHP sensitivity analysis.
- Added CI, Docker, mock E2E validation, local-first persistence boundaries, and security documentation for a portfolio-grade engineering project.
