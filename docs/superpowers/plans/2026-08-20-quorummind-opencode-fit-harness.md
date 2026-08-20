# QuorumMind OpenCode-Fit Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the five OpenCode-inspired but QuorumMind-specific harness improvements: persisted run events, file-backed bounded outputs, permission approval ledger, role capability matrix, and lightweight run status/resume APIs.

**Architecture:** Keep the harness lightweight and business-specific. Add small focused modules under `server/harness/`, expose their metadata through existing live decision and autonomous blueprint flows, and avoid OpenCode's full coding-agent session runtime.

**Tech Stack:** TypeScript, Vitest, Node filesystem APIs, optional SQLite-compatible JSONL persistence, FastAPI-like Request handlers in `server/decision-api.ts`, LangGraph checkpoint integration.

---

### Task 1: Persist Run Events

**Files:**
- Create: `server/harness/run-event-store.ts`
- Test: `server/harness/run-event-store.test.ts`
- Modify: `server/live-decision.ts`

- [ ] Write failing tests for append/list/status behavior.
- [ ] Implement a lightweight JSONL-backed `RunEventStore`.
- [ ] Wire live provider traces to optionally persist events.

### Task 2: File-Backed Bounded Outputs

**Files:**
- Modify: `server/harness/bounded-output-store.ts`
- Test: `server/harness/bounded-output-store.test.ts`
- Modify: `server/live-decision.ts`
- Modify: `server/agent-platform/autonomous-blueprint.ts`

- [ ] Write failing tests showing long output gets a file path and short output remains inline.
- [ ] Add `storageDir` / `runId` support while keeping old `boundOutput` behavior compatible.
- [ ] Pass run-scoped output directories from provider and blueprint flows.

### Task 3: Permission Approval Ledger

**Files:**
- Modify: `server/harness/tool-governance.ts`
- Test: `server/harness/tool-governance.test.ts`
- Modify: `server/agent-platform/autonomous-blueprint.ts`

- [ ] Write failing tests for approval record creation and saved approval lookup.
- [ ] Add deterministic permission record helpers and saved approval matching.
- [ ] Include approval records in autonomous blueprint output.

### Task 4: Agent Role Capability Matrix

**Files:**
- Modify: `server/harness/tool-governance.ts`
- Test: `server/harness/tool-governance.test.ts`
- Modify: `server/agent-platform/autonomous-blueprint.ts`

- [ ] Write failing tests for Planner/Critic/Memory/Executor/Supervisor boundaries.
- [ ] Add `decideRoleToolPermission`.
- [ ] Use role-aware permission decisions when evaluating task tree tool calls.

### Task 5: Run Status and Resume API

**Files:**
- Create: `server/harness/run-status-store.ts`
- Test: `server/harness/run-status-store.test.ts`
- Modify: `server/decision-api.ts`
- Modify: `src/lib/api-client.ts`

- [ ] Write failing tests for `running / paused / completed / failed` status persistence.
- [ ] Add `GET /api/agent-runs/:runId` and `POST /api/agent-runs/:runId/resume` lightweight endpoints.
- [ ] Record autonomous blueprint run status and expose resume guidance without implementing a full OpenCode session runtime.

### Verification

- [ ] Run focused harness tests.
- [ ] Run decision API and autonomous blueprint tests.
- [ ] Run full `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
