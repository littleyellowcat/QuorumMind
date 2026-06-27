# QuorumMind Engineering Hardening V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade QuorumMind from a polished demo into a resume-grade, engineering-focused multi-agent decision system with robust model output contracts, explainable decision analysis, persistence boundaries, observability, and architecture documentation.

**Architecture:** Add small, focused modules rather than expanding large UI/server files unnecessarily. Server-side live model handling gets a schema validation and trace classification layer. Client-side decision analysis gets an AHP/sensitivity module that reuses existing scoring outputs without replacing Quorum Score.

**Tech Stack:** Vite, React, TypeScript, Vitest, local Node/tsx API server, browser localStorage persistence, project-local npm environment.

---

## File Structure

- Create `server/provider-schema.ts`: validates and normalizes provider JSON for proposal, ranking, and verdict phases; reports recoverable validation issues.
- Modify `server/live-decision.ts`: enrich trace entries with parse/validation status, failure class, run id, and phase attempt metadata.
- Modify `server/live-aggregation.ts`: aggregate only schema-normalized live objects where available; keep deterministic fallback behavior.
- Create `src/lib/ahp.ts`: compute AHP-like priority weights from decision context and user emphasis, plus sensitivity scenarios.
- Modify `src/lib/domain.ts`: add `AHPAnalysis`, `SensitivityScenario`, and live trace metadata types.
- Modify `src/lib/workflow.ts`: include AHP analysis and sensitivity scenarios in verdict/ADR.
- Modify `src/lib/adr.ts`, `src/lib/exporters.ts`, `src/App.tsx`, `src/styles.css`: expose AHP and sensitivity analysis in ADR, PDF, and UI.
- Create `src/lib/decision-repository.ts`: repository interface with browser localStorage implementation for Decision Rooms.
- Modify `src/lib/decision-history.ts`: delegate to repository layer while keeping current public behavior.
- Create `ARCHITECTURE.md`, `DECISION_ENGINE.md`, `API_CONTRACT.md`: explain system boundaries, algorithms, API shape, reliability model, and resume talking points.

## Task 1: Provider Schema Hardening

- [x] Write failing tests in `server/provider-schema.test.ts` for valid proposal normalization, partial proposal repair, invalid ranking rejection, and verdict normalization.
- [x] Implement `server/provider-schema.ts` with phase-specific validation helpers.
- [x] Run `npm test -- server/provider-schema.test.ts --run`.

## Task 2: Live Trace Observability

- [x] Write failing tests in `server/live-decision.test.ts` showing trace entries include `runId`, `attempt`, `failureClass`, `validationStatus`, and `validationIssues`.
- [x] Update `server/live-decision.ts` to classify provider, parse, and schema failures without exposing secrets.
- [x] Run `npm test -- server/live-decision.test.ts --run`.

## Task 3: Live Aggregation Uses Hardened Outputs

- [x] Write failing tests in `server/live-aggregation.test.ts` proving normalized proposals/rankings are preferred over raw parsed payloads.
- [x] Update `server/live-aggregation.ts` to read `entry.normalized` first, then fallback to raw parsed data.
- [x] Run `npm test -- server/live-aggregation.test.ts --run`.

## Task 4: AHP And Sensitivity Analysis

- [x] Write failing tests in `src/lib/ahp.test.ts` for context-derived weights, consistency ratio approximation, and winner stability scenarios.
- [x] Implement `src/lib/ahp.ts`.
- [x] Connect AHP analysis to `src/lib/workflow.ts` verdict output.
- [x] Run `npm test -- src/lib/ahp.test.ts src/lib/workflow.test.ts --run`.

## Task 5: AHP UI, ADR, And Exports

- [x] Add assertions to `src/App.test.tsx`, `src/lib/adr.test.ts`, and `src/lib/exporters.test.ts` for AHP priorities and sensitivity scenarios.
- [x] Render the AHP panel in `src/App.tsx`, ADR Markdown, and PDF report.
- [x] Run focused tests for App, ADR, and exporters.

## Task 6: Persistence Repository Boundary

- [x] Write failing tests in `src/lib/decision-repository.test.ts` for save, list, restore, limit, and corrupted JSON handling.
- [x] Implement `src/lib/decision-repository.ts`.
- [x] Refactor `src/lib/decision-history.ts` to use the repository.
- [x] Run `npm test -- src/lib/decision-history.test.ts src/lib/decision-repository.test.ts --run`.

## Task 7: Architecture Documentation

- [x] Create `ARCHITECTURE.md` describing frontend, API gateway, provider adapters, live trace, decision engine, exports, and persistence.
- [x] Create `DECISION_ENGINE.md` explaining Delphi, Borda, Bayesian voting, Minimax Regret, TOPSIS, Monte Carlo, AHP, sensitivity analysis, and fallback behavior.
- [x] Create `API_CONTRACT.md` documenting `/api/health`, `/api/decisions`, provider modes, trace metadata, and error classes.
- [x] Update `README.md` to link the engineering docs and summarize reliability improvements.

## Task 8: Full Verification

- [x] Run `npm test -- --run`.
- [x] Run `npm run build`.
- [x] Run `git diff --check`.
