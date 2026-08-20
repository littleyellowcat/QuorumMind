# QuorumMind opencode Platform Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the five saved QuorumMind improvements inspired by opencode: durable run evidence, UI component boundary, context source ledger, provider policy, and governed default tools.

**Architecture:** Reuse the existing harness where available instead of duplicating it. Add small focused modules for missing platform concepts and integrate them into the API and UI with minimal blast radius.

**Tech Stack:** TypeScript, React, Vite, Vitest, Zod, existing QuorumMind server harness.

---

### Task 1: Context Source Ledger

**Files:**
- Create: `server/context-source-ledger.ts`
- Test: `server/context-source-ledger.test.ts`
- Modify: `src/lib/api-client.ts`
- Modify: `server/decision-api.ts`

- [ ] Write a failing test that builds a ledger from question, context, knowledge injection, reputation feedback, provider trace, and fallback state.
- [ ] Implement stable source entries, source counts, and SHA-256 hash.
- [ ] Attach ledger to decision and blueprint API responses.

### Task 2: Provider Policy

**Files:**
- Create: `server/providers/provider-policy.ts`
- Test: `server/providers/provider-policy.test.ts`
- Modify: `server/providers/registry.ts`
- Modify: `server/providers/registry.test.ts`

- [ ] Write failing tests for JSON policy allow/deny, wildcard matching, and legacy disabled model compatibility.
- [ ] Implement provider policy evaluation with last matching statement winning.
- [ ] Filter configured providers through policy while keeping status diagnostic data.

### Task 3: Default Governed Tools

**Files:**
- Create: `server/harness/quorummind-tools.ts`
- Test: `server/harness/quorummind-tools.test.ts`

- [ ] Write failing tests for default tool registration and role-based materialization.
- [ ] Register read, scoring, ADR export, context ledger, and live provider tools through the existing registry.
- [ ] Verify live provider tools remain gated unless preapproved.

### Task 4: Workbench UI Boundary

**Files:**
- Create: `src/components/WorkbenchIntro.tsx`
- Test: `src/components/WorkbenchIntro.test.tsx`
- Modify: `src/App.tsx`

- [ ] Write a failing component test for the extracted workbench intro status.
- [ ] Replace the inline intro strip in `App.tsx` with `WorkbenchIntro`.
- [ ] Keep DOM text and accessibility labels compatible with existing app tests.

### Task 5: Verification

**Files:**
- Modify only if verification identifies a real defect.

- [ ] Run targeted tests for the new modules and touched integration points.
- [ ] Run `npm run build`.
- [ ] Report any skipped real API validation explicitly.

