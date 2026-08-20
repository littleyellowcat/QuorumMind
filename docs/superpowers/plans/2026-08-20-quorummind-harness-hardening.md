# QuorumMind Harness Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the OpenCode-inspired harness improvements that fit QuorumMind: standardized failure taxonomy, run event tracing, permission governance, and bounded output storage for long model/tool outputs.

**Architecture:** Add small reusable server-side modules, then wire them into the existing live provider trace and autonomous blueprint graph. Keep QuorumMind as a decision-agent system: no shell/file editing permissions, no coding-agent session runtime, and no frontend-heavy changes in this pass.

**Tech Stack:** TypeScript, Vitest, Node server runtime, LangGraph blueprint graph, QuorumMind provider trace.

---

## File Structure

**Create:**
- `server/harness/failure-taxonomy.ts`
  - Classifies provider/tool/schema/runtime failures into stable categories.
- `server/harness/run-event-trace.ts`
  - Builds compact run events with sequence numbers, phases, severities, and timestamps.
- `server/harness/bounded-output-store.ts`
  - Stores preview/hash/metadata for long outputs without stuffing huge strings into trace fields.
- `server/harness/tool-governance.ts`
  - Centralizes bounded QuorumMind tool permission decisions.
- `server/harness/*.test.ts`
  - Focused tests for each new harness component.

**Modify:**
- `server/live-decision.ts`
  - Replace ad hoc failure strings with taxonomy results.
  - Add event trace and bounded output refs to live provider trace entries.
- `server/agent-platform/autonomous-blueprint.ts`
  - Use centralized tool governance for blueprint task permissions and live provider permission decisions.
  - Keep existing output shape compatible with current UI/tests.

## Tasks

### Task 1: Failure Taxonomy

- [x] Write failing tests for timeout, rate limit, safety rejection, JSON parse, schema validation, provider error, missing reference, QA failed, and unknown errors.
- [x] Implement `classifyFailure()` and stable `FailureCategory` / `FailureRetryability` types.
- [x] Wire live provider trace attempts to record `failure` details while preserving existing `failureClass`.
- [x] Run `npm test -- server/harness/failure-taxonomy.test.ts server/live-decision.test.ts`.

### Task 2: Run Event Trace

- [x] Write failing tests for sequence order, phase metadata, severity, duration, and bounded event summaries.
- [x] Implement `createRunEventRecorder()`.
- [x] Add `events` to `LiveDecisionTraceEntry` and per-attempt lifecycle events: start, success, retry, failure.
- [x] Run `npm test -- server/harness/run-event-trace.test.ts server/live-decision.test.ts`.

### Task 3: Bounded Output Store

- [x] Write failing tests for short output passthrough, long output previewing, stable hash, truncation metadata, and JSON serialization safety.
- [x] Implement `boundOutput()` and `BoundedOutputRef`.
- [x] Add bounded raw output references to live provider trace entries and blueprint tool call summaries where relevant.
- [x] Run `npm test -- server/harness/bounded-output-store.test.ts server/live-decision.test.ts server/agent-platform/autonomous-blueprint.test.ts`.

### Task 4: Tool Governance

- [x] Write failing tests for read-only, local checkpoint write, live model call, external API, production operation, paid operation, and blocked destructive actions.
- [x] Implement centralized `decideToolPermission()`.
- [x] Replace local permission classification in autonomous blueprint with the shared governance module.
- [x] Run `npm test -- server/harness/tool-governance.test.ts server/agent-platform/autonomous-blueprint.test.ts`.

### Task 5: Full Verification

- [x] Run `npm test -- server/harness server/live-decision.test.ts server/agent-platform/autonomous-blueprint.test.ts server/decision-api.test.ts`.
- [x] Run `npm run build`.
- [x] Update the harness analysis doc with a short “已实施增强” section and keep full verification status explicit.

> Verification note: dependencies were restored with `npm install`. Focused tests passed with 7 files / 56 tests. Full `npm test` passed with 34 files / 161 tests. `npm run build` passed. `npm audit fix` updated compatible transitive packages and `npm audit --audit-level=high` now reports 0 vulnerabilities.
