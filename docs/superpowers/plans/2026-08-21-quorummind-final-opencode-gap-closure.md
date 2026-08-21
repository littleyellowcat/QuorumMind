# QuorumMind Final OpenCode Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining objective QuorumMind-vs-opencode product gaps as one coherent shipped pass.

**Architecture:** Add focused server modules for audit archives, GitHub validation, repo evidence, quality evaluation, provider routing, and team persistence. Expose these through existing local API and CLI patterns, with docs and tests proving behavior.

**Tech Stack:** TypeScript, Vitest, Node filesystem APIs, existing QuorumMind local API, CLI, harness, repo, provider, and GitHub modules.

---

### Task 1: Run Audit Replay Archive

**Files:**
- Modify: `server/harness/run-audit-replay.ts`
- Test: `server/harness/run-audit-replay.test.ts`

- [ ] Add search/filter options to `listRunAuditReplays`.
- [ ] Add `diffRunAuditReplays` for run-to-run metrics/artifact/provider/status changes.
- [ ] Add `createRunAuditBundle` for exportable JSON/Markdown bundles with PR/ADR linkage.
- [ ] Verify with focused audit replay tests.

### Task 2: GitHub Production Hardening

**Files:**
- Modify: `server/github/quorummind-runner.ts`
- Test: `server/github/quorummind-runner.test.ts`

- [ ] Validate native GitHub payload shape before write.
- [ ] Infer annotation and review lines from patch hunks.
- [ ] Suppress duplicate comments/annotations by path/line/body.
- [ ] Add status workflow metadata and minimum permission notes.
- [ ] Verify with GitHub runner tests.

### Task 3: Repo Evidence 2.0

**Files:**
- Modify: `server/repo/workspace-model.ts`
- Modify: `server/repo/review-evidence.ts`
- Test: `server/repo/workspace-model.test.ts`
- Test: `server/repo/review-evidence.test.ts`

- [ ] Add stable evidence IDs.
- [ ] Parse imports for source-to-source and source-to-package dependency edges.
- [ ] Detect architecture boundaries and API surfaces.
- [ ] Add change impact records.
- [ ] Verify with repo evidence tests.

### Task 4: Decision Quality Eval

**Files:**
- Create: `server/quality/decision-quality-eval.ts`
- Test: `server/quality/decision-quality-eval.test.ts`

- [ ] Add golden case schema and default cases.
- [ ] Add deterministic rubric judge.
- [ ] Add provider reputation summary from eval results.
- [ ] Add trend entry rendering.
- [ ] Verify with quality eval tests.

### Task 5: Provider Capability Router

**Files:**
- Create: `server/providers/capability-router.ts`
- Test: `server/providers/capability-router.test.ts`

- [ ] Select model seats by task requirements and provider capabilities.
- [ ] Explain included/excluded providers.
- [ ] Keep routing conservative for reserved providers and live-cost paths.
- [ ] Verify with provider router tests.

### Task 6: Team/Persistence Foundation

**Files:**
- Create: `server/team/team-workspace.ts`
- Test: `server/team/team-workspace.test.ts`

- [ ] Add team workspace and member role records.
- [ ] Add ADR approval workflow.
- [ ] Add access-control checks.
- [ ] Add Postgres configuration contract summary.
- [ ] Verify with team workspace tests.

### Task 7: API and CLI Exposure

**Files:**
- Modify: `server/decision-api.ts`
- Modify: `scripts/quorummind-cli.ts`
- Test: `server/decision-api.test.ts`
- Test: `scripts/quorummind-cli.test.ts`

- [ ] Add API routes for audit diff/bundle, provider route, quality eval, and team workspace.
- [ ] Add CLI commands for `audit`, `route-provider`, `eval`, and `team`.
- [ ] Keep default commands backward compatible.
- [ ] Verify API and CLI tests.

### Task 8: Docs and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `API_CONTRACT.md`
- Modify: `ARCHITECTURE.md`
- Modify: `SECURITY_PRIVACY.md`

- [ ] Document new shipped surfaces and safety boundaries.
- [ ] Run targeted tests.
- [ ] Run full tests, build, distribution doctor, and diff check.
