# QuorumMind

QuorumMind is an adversarial multi-agent architecture decision engine.

It turns architecture trade-offs into a structured Decision Room: expert agents generate independent proposals, critique each other, revise their recommendations, compute consensus scores, and export an Architecture Decision Record (ADR).

## What This MVP Demonstrates

- Decision Room workflow for technical architecture choices.
- Deterministic expert agents: Principal Architect, SRE Reviewer, Security Reviewer, Cost Engineer, and Pragmatic Builder.
- Local API gateway that keeps provider API keys out of the browser.
- Experimental LangGraph/LangChain autonomous Blueprint runner with bounded server-side consensus loops, Planner/Executor/Critic/Memory/Supervisor agents, granular tool permission categories, MemorySaver checkpoints, and route-decision audit.
- Blueprint execution switch for **Live model deep Blueprint** versus **Fast deterministic**, with visible provider/model call trace, provider phase budget, rough call/token/timeout estimates, and explicit deterministic fallback messaging.
- Blueprint UI entry for the Agent platform: stable checkpoint thread, configurable max consensus rounds, runtime limits, task tree, tool permissions, executor actions, critic reviews, memory events, supervisor decisions, route decisions, termination reason, live provider trace, tool calls, and node trace are visible in the browser.
- Blueprint process visualization for consensus trend, model differences, contribution map, critique adoption flow, and history comparison across repeated Blueprint runs.
- Provider registry with implemented adapters for OpenAI, DeepSeek, and Gemini, plus reserved slots for future models.
- Live provider trace for proposal, critique, revision, ranking, and verdict phases.
- Delphi Consensus Protocol log for proposal, blind review, cross-examination, revision, consensus, and final verdict rounds.
- Blind Review critique payloads that anonymize proposal authors as Proposal A/B/C before cross-examination.
- Expandable phase-grouped trace detail with raw model output and provider errors.
- Safe provider JSON extraction for fenced JSON blocks and narrated model responses.
- Phase-specific provider schema hardening with validation status, bounded repair, normalized payloads, and failure classification.
- Explicit live-provider retry policy with per-attempt trace metadata and a default single-attempt mode to avoid surprise API spend.
- Live verdict aggregation when provider JSON includes usable proposals and rankings.
- Scoring explanation drilldown showing why the winner won, score formula contributions, and model ranking evidence.
- Run profiles for fast smoke tests, full deep review, and adversarial red-team review.
- Run telemetry for provider calls, failures, JSON parse rate, and total model latency.
- Configurable GPT, DeepSeek, and Gemini agent seats with editable role, weight, and scoring focus.
- Model Reputation v0 that infers the decision domain and converts each model seat's reputation into an explainable effective weight.
- User feedback loop that saves helpful/needs-work ratings and calibrates future Model Reputation weights.
- Manual Provider prompt bundles for ChatGPT/Gemini web workflows when API keys are not available.
- Prompt Inspector for reviewing and copying prompts by phase and agent seat.
- Borda Count ranking, Bayesian Weighted Voting, weighted utility scoring, Minimax Regret Map, TOPSIS Decision Lens, Monte Carlo Stress Lens, AHP Sensitivity Analysis, Decision Score, and Dissent Index.
- Risk Radar, structured Assumption Ledger, Pre-Mortem review, and ADR Markdown generation.
- Local decision history, ADR/JSON trace export, and printable PDF report export.
- Decision Repository boundary around browser persistence, ready for SQLite/Postgres replacement.
- Optional server-side SQLite persistence for Decision Room snapshots and reputation feedback.
- Restorable Decision Room snapshots from browser history.
- Deterministic mock live providers for CI and demos without API keys.
- Docker and GitHub Actions setup for reproducible verification.
- A polished technical command-center UI that runs without API keys.
- Code-split export/report generation and deterministic Blueprint fallback so initial UI load does not carry those heavier paths.
- English and Chinese interface switching for product demos.

## Engineering Docs

- [Architecture](./ARCHITECTURE.md)
- [Decision Engine](./DECISION_ENGINE.md)
- [API Contract](./API_CONTRACT.md)
- [Persistence Strategy](./PERSISTENCE.md)
- [Security And Privacy](./SECURITY_PRIVACY.md)
- [Demo Guide](./DEMO.md)
- [Portfolio Brief](./PORTFOLIO.md)

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

`npm run dev` starts both services:

- API: `http://127.0.0.1:8787`
- Web UI: the local Vite URL shown in the terminal

For separate terminals:

```bash
npm run server
npm run dev:web
```

Keyless live-like demo:

```bash
QUORUMMIND_PROVIDER_MODE=live QUORUMMIND_MOCK_PROVIDERS=1 npm run dev
```

Docker demo:

```bash
docker compose up --build
```

Open `http://localhost:5173`. Docker defaults to mock live providers, so it does not require API keys.

Docker also enables SQLite persistence by default at `/data/quorummind.db` through the `quorummind-data` named volume.

## Agent Platform Blueprint

In the browser, switch **Workspace mode** to **Blueprint**, then use **Agent runtime**:

- **Blueprint execution** defaults to **Live model deep Blueprint**. It requests configured live providers and shows phase/model trace. Switch to **Fast deterministic** to skip providers and return the local structured Blueprint immediately.
- `Max provider phases`: caps live Blueprint phases from 1 to 5 across proposal, critique, revision, ranking, and verdict. The setup panel estimates provider calls, rough tokens, and timeout window before a run.
- `Checkpoint thread`: stable LangGraph `MemorySaver` thread id for repeated runs.
- `Max discussion rounds`: caps consensus-loop cost and time. If the graph is still below the 80% threshold when this budget is exhausted, it routes to `human_review_gate`.
- `Human review note`: optional resume evidence for the same checkpoint thread when the graph reaches `human_review_gate`.
- **Run Agent platform**: calls `POST /api/agent-runs/blueprint` and shows checkpointing, runtime limits, Planner task tree, granular tool permission policy, Executor actions, Critic reviews, long-memory events, Supervisor decisions, consensus loop, route decisions, termination reason, tool calls, and node trace above the normal Blueprint result.

The Agent runtime settings are stored locally in the browser, so refreshing the page keeps the last thread id and discussion-round budget. The Agent platform panel also includes a compact route map before the detailed route list, making it easier to see when the graph continued discussion, finalized, or entered human review.

When the graph enters human review, the panel exposes a **Copy review package** action. The copied Markdown includes the checkpoint thread, termination reason, consensus score, route history, blockers, remaining disagreements, next actions, and review questions for the next team/model pass.

Source transparency: when **Live model deep Blueprint** is selected and live providers are configured, the graph runs live provider trace from `understand_request`, then `live_model_review`, `cross_review`, and `revise_discussion` consume usable trace evidence. The final Blueprint is still normalized by QuorumMind's deterministic synthesis layer. If providers are unavailable or schema output is unusable, the UI shows: `未使用真实模型，本次为确定性本地结果` or the live-fallback warning instead of implying a real model result.

## Provider Modes

The server default mode is deterministic demo mode. It does not call external APIs.

```bash
QUORUMMIND_PROVIDER_MODE=demo
```

Blueprint UI defaults to requesting **Live model deep Blueprint**, but real calls only happen when `QUORUMMIND_PROVIDER_MODE=live` and at least one provider is configured or `QUORUMMIND_MOCK_PROVIDERS=1` is enabled. Otherwise the response includes `blueprintExecution.actual: "deterministic"` and a `fallbackReason`.

To test real provider calls, copy `.env.example` to `.env.local`, switch to live mode, and add whichever keys you want to use:

```bash
QUORUMMIND_PROVIDER_MODE=live
OPENAI_API_KEY=...
DEEPSEEK_API_KEY=...
GEMINI_API_KEY=...
```

The browser never receives these keys. The React app calls `/api/decisions`, Vite proxies that request to the local API server, and the server decides whether to use demo fallback or configured providers.

Provider slots are centralized in `server/providers/registry.ts`.

Implemented now:

- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`

Reserved for later adapters:

- `ANTHROPIC_API_KEY`
- `XAI_API_KEY`
- `MISTRAL_API_KEY`
- `OPENROUTER_API_KEY`
- `GROQ_API_KEY`
- `TOGETHER_API_KEY`
- `COHERE_API_KEY`
- `PERPLEXITY_API_KEY`
- `OLLAMA_BASE_URL`
- `LMSTUDIO_BASE_URL`

`/api/health` reports every provider slot as `configured` and `implemented` without returning secret values.

Current live mode records structured provider traces across `proposal`, `critique`, `revision`, `ranking`, and `verdict` phases. Before critique, proposal payloads are anonymized into `Proposal A`, `Proposal B`, and `Proposal C`, with provider, model, agent name, raw text, and role metadata removed from the review payload. The UI groups trace entries by phase, summarizes call count, failures, latency, JSON parse status, and exposes raw model output for debugging. Provider responses are parsed with a safe extraction layer that accepts strict JSON, Markdown fenced JSON blocks, and narrated responses that contain a balanced JSON payload. When provider JSON contains usable proposal scores and rankings, QuorumMind aggregates those rankings using the same Borda, weighted utility, confidence, and regret-penalty scoring pipeline. That live aggregated verdict is promoted into the primary recommendation panel, and the scoring transparency panel explains the winning path with formula contributions and per-model ranking evidence. The stable deterministic engine remains available as a fallback and ADR baseline until live ADR generation is fully hardened.

Provider traces now include `runId`, attempt count, max attempts, retry count, validation status, validation issues, normalized payloads, and failure class. Live aggregation prefers schema-normalized payloads over raw parsed JSON, so model output can be repaired or rejected explicitly instead of being trusted silently. Retry is explicit and capped; default live mode remains single-attempt to avoid unexpected API usage.

Blueprint live mode deliberately upgrades a Fast UI run to a deep Blueprint trace for synthesis, then applies the configured `maxProviderRounds` cap. With three provider seats and the default five phases, this produces 15 trace entries instead of the 9-call Decision Room Fast profile. The right inspector groups those calls by phase and lists provider, model, duration, and schema status.

For CI and portfolio demos, set `QUORUMMIND_MOCK_PROVIDERS=1` with live mode. QuorumMind will use deterministic local provider seats for GPT, DeepSeek, and Gemini, exercising the same trace, schema, retry, and aggregation surfaces without external network calls.

## Run Profiles And Telemetry

Each decision run can use one of three profiles:

- **Fast**: cheaper smoke test that calls providers for `proposal`, `ranking`, and `verdict` only.
- **Deep**: full closure loop across `proposal`, `critique`, `revision`, `ranking`, and `verdict`.
- **Red-team**: full closure loop with stronger adversarial prompt instructions for failure paths, counterexamples, operational traps, and security edge cases.

With three live model seats, Fast mode makes 9 live calls and Deep/Red-team mode make 15 live calls. The UI shows run telemetry beside the decision trace:

- total provider calls
- provider failures
- JSON parse rate
- summed provider latency

## Quality Audits

Deterministic system audit:

```bash
npm run quality:audit
```

This writes `docs/quality/2026-06-17-system-quality-audit.md` and checks the 30-case deterministic suite: question-context inference, Chinese localization coverage, adjacent product/process/cost questions, exports, and mock-live decision behavior without spending API calls.

Agent performance evaluation:

```bash
npm run agent:eval
npm run agent:eval:expanded
```

`agent:eval` is the default offline AgentEval gate. It reads `eval/agent-eval-cases.jsonl`, runs Decision Room, Blueprint, and LangGraph Agent Blueprint cases, then scores response quality, execution trajectory, tool/Schema correctness, collaboration quality, latency, rough token budget, and explainability without calling real providers. It writes `docs/quality/2026-06-22-agent-performance-audit.md`, `output/agent-eval/2026-06-22-agent-performance-audit.json`, and updates `docs/quality/agent-performance-trend.md`.

`agent:eval:expanded` adds human-review budget exhaustion, Agent framework choice, and generic Blueprint cases. It writes the `-expanded` report variant. Use `QUORUMMIND_AGENT_EVAL_CASE_IDS` for targeted reruns and `QUORUMMIND_AGENT_EVAL_LIMIT` to cap local evaluation time.

Live provider audit:

```bash
npm run quality:live
```

`quality:live` runs the low-cost `smoke` suite by default: 4 Chinese fast-mode cases. It writes a dated report such as `docs/quality/2026-06-25-live-model-quality-audit.md` and records JSON parse rate, schema usability, fallback rate, Chinese response pass rate, relevance pass rate, and whether the visible verdict came from live aggregation.

Every live audit also appends a trend entry to `docs/quality/live-model-quality-trend.jsonl` and refreshes `docs/quality/live-model-quality-trend.md`, so model quality can be judged across runs instead of from one sample. The trend records `providerSource=real|mock`; mock self-checks are visible and should not be treated as real provider quality evidence.

For broader real-model regression checks:

```bash
npm run quality:live:expanded
npm run quality:live:full
```

`expanded` adds Chinese Deep and Red-team cases. `full` runs the 30-case real API regression pool. These commands can use substantially more real API calls; use `QUORUMMIND_LIVE_AUDIT_LIMIT` to cap the number of cases.

Targeted live rerun:

```bash
QUORUMMIND_LIVE_AUDIT_CASE_IDS=tenant-zh-fast,agent-framework-zh-red-team npm run quality:live:full
```

Long live audits are incremental. They print case start/result/trace lines to the terminal, write every completed case to `output/audit-progress/*.jsonl`, and can resume after interruption:

```bash
QUORUMMIND_LIVE_AUDIT_CASE_IDS=services-zh-red-team,agent-framework-zh-red-team \
QUORUMMIND_LIVE_AUDIT_MAX_RUNTIME_MS=600000 \
npm run quality:live:expanded

QUORUMMIND_LIVE_AUDIT_RESUME=1 \
QUORUMMIND_LIVE_AUDIT_CASE_IDS=services-zh-red-team,agent-framework-zh-red-team \
npm run quality:live:expanded
```

Use `QUORUMMIND_LIVE_AUDIT_PROGRESS_PATH` for a custom progress file. For harness self-checks without external API cost, set `QUORUMMIND_PROVIDER_MODE=live QUORUMMIND_MOCK_PROVIDERS=1 QUORUMMIND_LIVE_AUDIT_ALLOW_MOCK=1`; the report will be marked `providerSource=mock`.

Visual regression audit:

```bash
npm run visual:audit
```

This starts mock-live API and Vite services on temporary local ports, checks desktop, narrow desktop, and mobile layouts, long Chinese Decision/Blueprint questions, independent desktop scroll columns, responsive narrow/mobile scrolling, tooltips, export buttons, and known Chinese-mode English remnants in visible UI and exported reports, then writes `docs/quality/2026-06-22-visual-audit.md`.

The GitHub Actions CI runs the low-cost gates only: tests, deterministic quality audit, mock E2E, build, and visual audit. Real API audits are intentionally manual.

Blueprint live provider audit:

```bash
npm run quality:blueprint:live
```

This writes a dated report such as `docs/quality/2026-06-25-live-blueprint-quality-audit.md` and checks Blueprint/Agent Blueprint live behavior across a 30-case pool. Defaults are intentionally bounded: 20 cases, max 3 provider phases per case. Use `QUORUMMIND_BLUEPRINT_LIVE_AUDIT_LIMIT` and `QUORUMMIND_BLUEPRINT_LIVE_AUDIT_MAX_PROVIDER_ROUNDS` to scale cost deliberately.

Blueprint live audits use the same incremental harness:

```bash
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_CASE_IDS=sales-crm-agent-zh,customer-support-agent-zh \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_MAX_RUNTIME_MS=600000 \
npm run quality:blueprint:live

QUORUMMIND_BLUEPRINT_LIVE_AUDIT_RESUME=1 \
QUORUMMIND_BLUEPRINT_LIVE_AUDIT_CASE_IDS=sales-crm-agent-zh,customer-support-agent-zh \
npm run quality:blueprint:live
```

Use `QUORUMMIND_BLUEPRINT_LIVE_AUDIT_PROGRESS_PATH` for a custom progress file. For mock self-checks, set `QUORUMMIND_PROVIDER_MODE=live QUORUMMIND_MOCK_PROVIDERS=1 QUORUMMIND_BLUEPRINT_LIVE_AUDIT_ALLOW_MOCK=1`; reports will be marked `providerSource=mock`.

Provider deep connectivity audit:

```bash
QUORUMMIND_PROVIDER_DEEP_TEST_TIMEOUT_MS=90000 npm run quality:providers:deep
```

This writes `docs/quality/2026-06-25-provider-deep-connectivity-audit.md` and `output/provider-connectivity/2026-06-25-provider-deep-connectivity-audit.json`. It sends a minimal QuorumMind JSON-schema prompt to each configured live model seat, so it is the fastest way to separate "API/model/key can return structured JSON" from "long Blueprint prompt or phase-specific reasoning is unstable".

If one live seat repeatedly causes `provider_error`, `unparsed`, or invalid schema in the longer Blueprint audit, exclude it temporarily before a demo:

```bash
QUORUMMIND_DISABLED_LIVE_MODELS=gpt-5.4-mini npm run quality:blueprint:live
QUORUMMIND_DISABLED_LIVE_MODELS=gemini:gemini-3.1-pro-preview npm run quality:blueprint:live
```

`QUORUMMIND_DISABLED_LIVE_MODELS` accepts comma-separated raw model names or `provider:model` entries. It filters both unified model-gateway seats and standalone OpenAI/DeepSeek/Gemini providers without exposing API keys to the browser.

## Configurable Agent Seats

The Decision Setup panel includes three editable model seats:

- GPT seat
- DeepSeek seat
- Gemini seat

For each seat, you can tune:

- agent name
- decision role
- vote weight
- scoring focus

The selected agent configuration is sent to `/api/decisions`, included in the manual prompt bundle, and passed into live provider prompts. This makes it possible to run the same architecture question with different councils, for example product-heavy review, cost-risk review, or red-team security review.

## Model Reputation

QuorumMind applies an explainable Model Reputation layer before live calls, manual prompt generation, and UI display.

Current v0 behavior:

- Infers the decision domain from the question and context: technical architecture, product strategy, career strategy, or portfolio packaging.
- Looks up a domain-specific reputation score for each model seat.
- Converts the configured base weight into an effective weight using a transparent multiplier.
- Shows reputation score, inferred domain, rationale, and effective weight in the Agent lineup.
- Includes the same reputation metadata in generated provider prompts so models know their expected review posture.

The baseline matrix is intentionally simple and auditable for the MVP. User ratings are stored as bounded historical signals under `quorummind.reputation-feedback.v1`, passed into `/api/decisions` on later runs, and used to nudge model-domain scores up or down while preserving transparent base reasons and clamped weights.

## Decision Mechanisms

The MVP implements the main resume-grade mechanisms as inspectable product surfaces:

- **Decision Score** combines weighted utility, Borda ranking agreement, confidence, and regret penalty. It is the Decision Room's aggregate winner score, not the Blueprint Room's 80% consensus gate.
- **Delphi Consensus Protocol** records the multi-round expert loop from independent proposal to final verdict.
- **Dissent Index** measures how strongly model rankings diverge.
- **Assumption Ledger** turns hidden proposal assumptions into validation questions and follow-up actions.
- **Regret Map** applies minimax regret: each proposal is ranked by its worst-case downside across scenarios.
- **TOPSIS Decision Lens** ranks proposals by closeness to the ideal multi-criteria solution as a secondary diagnostic layer.
- **Monte Carlo Stress Lens** runs repeatable uncertainty simulations to estimate win rate, average simulated score, downside P10, and worst simulated score.
- **AHP Sensitivity Analysis** derives context-aware priority weights and tests whether the selected winner changes under security, speed, cost, and reliability stress.
- **Model Reputation** adjusts effective model-seat weight by inferred decision domain.
- **Bayesian Weighted Voting** blends model reputation prior, current ranking confidence, and configured agent weight into an explainable posterior vote weight.

The first version intentionally keeps deeper TOPSIS/Monte Carlo calibration, interactive pairwise AHP editing, and TrueSkill out of the core path until real decision history exists.

## Manual Provider Mode

QuorumMind also generates a copy-ready prompt bundle for manual model use. This is now an optional workflow; if you have a unified API key configured, the normal live provider flow is the primary path.

Workflow:

1. Run the decision room.
2. Click **Copy prompt bundle**.
3. Paste the relevant prompts into ChatGPT, Gemini, or another model UI.
4. Keep the JSON outputs as a manual trace for later aggregation.

The bundle includes the currently configured GPT, DeepSeek, and Gemini seats across proposal, critique, revision, ranking, and final verdict phases.

The Decision Room also includes a Prompt Inspector. It groups the generated prompt bundle by phase, shows the exact prompt for each model seat, and lets you copy a single agent/phase prompt when you want to debug or demonstrate the manual workflow without copying the full bundle.

## History And Exports

The browser stores the latest 12 local decision runs in `localStorage` under `quorummind.history.v1`.

Storage is accessed through a `DecisionRepository` interface. The current implementation is browser `localStorage`; the boundary is designed so a future SQLite/Postgres implementation can persist rooms without changing the UI workflow.

Model Reputation feedback is also local-first. The browser stores validated user ratings under `quorummind.reputation-feedback.v1`; each future run sends those signals to the local API so provider prompts and effective model weights reflect prior feedback.

When `QUORUMMIND_SQLITE_PATH` is set, the local API also stores each Decision Room snapshot, provider trace, ADR Markdown, prompt bundle, and reputation feedback in SQLite. Docker sets this to `/data/quorummind.db` automatically.

History entries are restorable snapshots. Reopening a saved room restores the decision result, provider mode, live provider trace, live verdict overlay, prompt bundle, and ADR preview without rerunning providers.

Export actions:

- **Export ADR** downloads the final Architecture Decision Record as Markdown.
- **Export JSON** downloads the full decision result, provider trace, live verdict, provider mode, and manual prompt bundle.
- **Export PDF** opens a print-ready decision report that can be saved as PDF from the browser print dialog.
- **Copy prompt bundle** copies all manual provider prompts to the clipboard.

## Verification

```bash
npm test -- --run
npm run mock:e2e
npm run build
```

## Engineering Docs

- [ARCHITECTURE.md](ARCHITECTURE.md): system boundaries, live provider flow, reliability model, and extension points.
- [DECISION_ENGINE.md](DECISION_ENGINE.md): Delphi loop, scoring mechanisms, sensitivity analysis, and fallback behavior.
- [API_CONTRACT.md](API_CONTRACT.md): local API shape, trace metadata, provider output contract, and error classes.
- [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md): key handling, provider data, local persistence, and demo safety.
- [DEMO.md](DEMO.md): interview walkthrough, Docker demo, mock E2E, and resume bullets.

API smoke test:

```bash
npm run server
curl -s http://127.0.0.1:8787/api/health
```

## Demo Scenario

Default question:

> Should a B2B SaaS MVP use schema-per-tenant or shared tables with tenant_id in PostgreSQL?

QuorumMind evaluates the trade-off and generates a final ADR recommending shared-table tenancy with explicit tenant-boundary tests, per-tenant metrics, and a documented upgrade path to stronger isolation.

## Interface Language

The UI can switch between English and Chinese from the top-right language control.

The current MVP localizes interface labels, module headings, agent role names, risk categories, action buttons, context chips, and run-profile labels. The deterministic demo report body is still generated in English. Live provider prompts receive the selected locale so GPT, DeepSeek, Gemini, or a unified model gateway can produce model outputs in the chosen language.

## Resume Bullet

Built **QuorumMind**, an adversarial multi-agent architecture decision engine that simulates architect, SRE, security, cost, and pragmatic-builder reviewers to evaluate technical trade-offs, compute consensus scores, identify risks, and generate Architecture Decision Records.

## Future Work

- Harden live ADR generation from provider JSON with retries and stricter cross-phase validation.
- Implement reserved provider adapters from `server/providers/registry.ts`.
- Server routes for browsing and reopening SQLite-persisted Decision Rooms.
- GitHub repository and PR architecture review mode.
- Interactive pairwise AHP editing, deeper TOPSIS/Monte Carlo calibration, and TrueSkill once enough historical decision data exists.
