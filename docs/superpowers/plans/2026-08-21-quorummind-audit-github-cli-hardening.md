# QuorumMind Audit, GitHub, And CLI Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the three remaining opencode comparison gaps into QuorumMind-native, auditable product capabilities.

**Architecture:** Add a run audit replay read model on top of the existing run status, event, artifact, and permission stores. Extend the GitHub runner with structured Check Run and PR Review payloads while keeping write actions explicit. Package the CLI with a distributable JavaScript bin, `doctor`, version output, and GitHub Action scaffold generation.

**Tech Stack:** TypeScript, Vitest, React, existing QuorumMind local API gateway, existing run harness stores.

---

### Task 1: Audit Replay Center Contract

**Files:**
- Create: `server/harness/run-audit-replay.ts`
- Test: `server/harness/run-audit-replay.test.ts`
- Modify: `server/decision-api.ts`
- Modify: `src/lib/api-client.ts`
- Create: `src/components/AuditReplayCenter.tsx`
- Test: `src/components/AuditReplayCenter.test.tsx`
- Modify: `src/App.tsx`

- [ ] Write failing tests for the aggregated audit replay shape.
- [ ] Implement a read model that merges run summaries, event timeline, artifacts, provider calls, permission audit, and GitHub review artifacts.
- [ ] Expose `GET /api/agent-runs/audit` and `GET /api/agent-runs/:id/audit`.
- [ ] Add a compact Workbench panel for recent run replay and selected run details.

### Task 2: GitHub Native Review Outputs

**Files:**
- Modify: `server/github/quorummind-runner.ts`
- Modify: `server/github/quorummind-runner.test.ts`
- Modify: `server/github/run-github-action.ts`
- Modify: `github/action.yml`
- Modify: `API_CONTRACT.md`
- Modify: `README.md`

- [ ] Write failing tests for Check Run payloads, PR review payloads, annotations, and ADR suggestion blocks.
- [ ] Implement dry-run structured output generation.
- [ ] Add explicit action inputs for `output_mode` and `write_comment`.
- [ ] Keep token-backed GitHub writes opt-in.

### Task 3: CLI Distribution Readiness

**Files:**
- Create: `bin/quorummind.mjs`
- Modify: `package.json`
- Modify: `scripts/quorummind-cli.ts`
- Modify: `scripts/quorummind-cli.test.ts`
- Modify: `scripts/distribution-doctor.ts`
- Modify: `scripts/distribution-doctor.test.ts`
- Create: `examples/github-action/quorummind-review.yml`
- Modify: `docs/distribution/quickstart.md`

- [ ] Write failing tests for `--version`, `doctor`, and scaffold output.
- [ ] Add a stable JavaScript bin wrapper that runs the TypeScript CLI through local `tsx`.
- [ ] Extend the distribution doctor to verify bin, CLI smoke commands, quickstart, and GitHub Action scaffold.
- [ ] Document `npx`, local install, and GitHub Action usage.

### Verification

- [ ] Run targeted Vitest suites for new/changed areas.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Run `npm run distribution:doctor`.
