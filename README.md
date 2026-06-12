# QuorumMind

QuorumMind is an adversarial multi-agent architecture decision engine.

It turns architecture trade-offs into a structured Decision Room: expert agents generate independent proposals, critique each other, revise their recommendations, compute consensus scores, and export an Architecture Decision Record (ADR).

## What This MVP Demonstrates

- Decision Room workflow for technical architecture choices.
- Deterministic expert agents: Principal Architect, SRE Reviewer, Security Reviewer, Cost Engineer, and Pragmatic Builder.
- Borda Count ranking, weighted utility scoring, regret penalty, Quorum Score, and Dissent Index.
- Risk Radar, Pre-Mortem review, and ADR Markdown generation.
- A polished React portfolio UI that runs without API keys.

## Local-Only Environment

This project keeps configuration local to `/Users/kitten/QuorumMind`.

- Dependencies install into local `node_modules/`.
- npm preferences live in project-local `.npmrc`.
- Runtime secrets should go in `.env.local`, which is ignored by Git.
- `.env.example` documents future provider keys.
- No global npm packages or global shell configuration are required.

## Setup

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## Verification

```bash
npm test -- --run
npm run build
```

## Demo Scenario

Default question:

> Should a B2B SaaS MVP use schema-per-tenant or shared tables with tenant_id in PostgreSQL?

QuorumMind evaluates the trade-off and generates a final ADR recommending shared-table tenancy with explicit tenant-boundary tests, per-tenant metrics, and a documented upgrade path to stronger isolation.

## Resume Bullet

Built **QuorumMind**, an adversarial multi-agent architecture decision engine that simulates architect, SRE, security, cost, and pragmatic-builder reviewers to evaluate technical trade-offs, compute consensus scores, identify risks, and generate Architecture Decision Records.

## Future Work

- Real OpenAI, Gemini, and DeepSeek provider adapters.
- PostgreSQL persistence for Decision Rooms.
- GitHub repository and PR architecture review mode.
- PDF export and Mermaid architecture diagrams.
- Dynamic model reputation based on user feedback.
