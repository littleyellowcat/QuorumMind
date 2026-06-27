# Decision Closure V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable QuorumMind decision closure loop: structured live model traces, manual provider prompt bundles, local decision history, and basic export actions.

**Architecture:** Keep the existing deterministic workflow as the stable scoring and ADR fallback. Add a small server-side live trace orchestrator that asks configured providers for proposal, critique, revision, ranking, and verdict JSON text, then returns the trace beside the current result. Add client-side utilities for manual prompt bundles, localStorage history, and Markdown/JSON export without introducing persistence dependencies yet.

**Tech Stack:** React, TypeScript, Vite, Node HTTP server, native `fetch`, Vitest, localStorage, Blob download APIs.

---

### Task 1: Structured Decision Trace Contract

**Files:**
- Create: `server/live-decision.ts`
- Test: `server/live-decision.test.ts`
- Modify: `server/decision-api.ts`
- Modify: `src/lib/api-client.ts`

- [ ] Add `LiveDecisionPhase`, `LiveDecisionTraceEntry`, `ManualProviderPrompt`, and `ManualProviderBundle` types.
- [ ] Write a test that injects three fake providers and expects one trace entry for each phase: `proposal`, `critique`, `revision`, `ranking`, and `verdict`.
- [ ] Implement `runLiveDecisionTrace` so it calls at most three providers, passes prior phase outputs as payload, and catches provider failures as trace entries with `status: "error"`.
- [ ] Update `/api/decisions` to return `providerTrace` from `runLiveDecisionTrace` when live providers are active.

### Task 2: Manual Provider Prompt Bundle

**Files:**
- Create: `src/lib/manual-provider.ts`
- Test: `src/lib/manual-provider.test.ts`
- Modify: `src/lib/api-client.ts`

- [ ] Define default manual agents for GPT, DeepSeek, and Gemini with role, model label, weight, and scoring focus.
- [ ] Generate copy-ready prompts for all five phases using the same decision question and context.
- [ ] Include clear JSON-only output instructions in each prompt.
- [ ] Expose the prompt bundle through the API response type so the frontend can copy it even in demo mode.

### Task 3: Decision History And Export Utilities

**Files:**
- Create: `src/lib/decision-history.ts`
- Test: `src/lib/decision-history.test.ts`
- Create: `src/lib/exporters.ts`
- Test: `src/lib/exporters.test.ts`
- Modify: `src/lib/api-client.ts`

- [ ] Store compact decision history records in localStorage under `quorummind.history.v1`.
- [ ] Keep the latest 12 records.
- [ ] Export ADR Markdown from the result verdict.
- [ ] Export JSON trace with question, provider mode, provider trace, prompt bundle, and result.

### Task 4: Frontend Product Surface

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

- [ ] Show a history strip with recent room titles and timestamps.
- [ ] Show live trace grouped by phase with provider/model/status.
- [ ] Add buttons for `Export ADR`, `Export JSON`, and `Copy prompt bundle`.
- [ ] Add scoring transparency copy explaining Borda, weighted utility, regret penalty, quorum score, and dissent index.
- [ ] Save every successful decision run to local history.

### Task 5: Verification

**Files:**
- Modify: `README.md`

- [ ] Document the new closure loop, manual provider mode, history, and exports.
- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
