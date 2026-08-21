# QuorumMind opencode Gap Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first product-grade bridges from QuorumMind's audit-focused decision room to opencode-like engineering entry points without turning QuorumMind into a generic coding agent.

**Architecture:** Implement external entry points as deterministic, testable adapters around the existing Decision Room and Blueprint APIs. Keep live provider calls, GitHub writes, MCP calls, and paid actions out of this MVP; produce plans, manifests, audit packages, and local CLI output instead.

**Tech Stack:** TypeScript, Vitest, React, local API server, existing QuorumMind harness stores.

---

### Task 1: External Entry Point Skeleton

**Files:**
- Create: `server/github/quorummind-command.ts`
- Create: `server/github/quorummind-command.test.ts`
- Create: `scripts/quorummind-cli.ts`
- Create: `scripts/quorummind-cli.test.ts`
- Modify: `package.json`

- [ ] Add failing tests for parsing `/quorummind` and `/qm` comments into `decide`, `blueprint`, and `review-pr` actions.
- [ ] Add failing tests for CLI argument parsing for `decide`, `blueprint`, `review-pr`, and `export`.
- [ ] Implement deterministic parsers and CLI dispatch that only prints local JSON/Markdown plans.
- [ ] Add `quorummind` npm script for the CLI.

### Task 2: Provider And Config Ecosystem

**Files:**
- Create: `server/providers/capabilities.ts`
- Create: `server/providers/capabilities.test.ts`
- Create: `server/config/quorummind-config.ts`
- Create: `server/config/quorummind-config.test.ts`
- Modify: `server/providers/registry.ts`
- Modify: `server/providers/types.ts`
- Modify: `server/decision-api.ts`
- Modify: `src/lib/api-client.ts`

- [ ] Add provider capability matrix tests covering OpenAI, DeepSeek, Gemini, OpenRouter, Ollama, LM Studio, Anthropic, and model gateway.
- [ ] Add config parser tests for `quorummind.config.json` with MCP servers, custom tools, agent tool access, and provider overrides.
- [ ] Add capabilities to `/api/health` without exposing secrets.
- [ ] Keep reserved providers non-calling unless an adapter exists.

### Task 3: Permission Audit Center

**Files:**
- Create: `server/harness/permission-audit.ts`
- Create: `server/harness/permission-audit.test.ts`
- Create: `src/components/PermissionAuditCenter.tsx`
- Create: `src/components/PermissionAuditCenter.test.tsx`
- Create: `src/hooks/usePermissionAudit.ts`
- Modify: `server/decision-api.ts`
- Modify: `src/lib/api-client.ts`
- Modify: `src/App.tsx`
- Modify: `src/i18n/view-copy.ts`

- [ ] Add server tests for summarizing approval records into allowed, human-gated, blocked, redacted, and packageable audit items.
- [ ] Expose `GET /api/permissions/audit`.
- [ ] Add a compact right/left panel in the Workbench showing permission decisions and copyable approval package.
- [ ] Do not execute or approve anything from this panel; it is read-only visibility.

### Task 4: Product Positioning

**Files:**
- Modify: `README.md`
- Modify: `src/components/LandingPage.tsx`
- Modify: `src/components/WorkbenchIntro.tsx`
- Modify: `src/i18n/view-copy.ts`

- [ ] Update positioning to "auditable multi-model decision room for architecture reviews, Agent-system design, and complex technical decisions".
- [ ] Add GitHub/CLI/config/MCP/provider capability descriptions as current MVP surfaces or explicit local-only skeletons.
- [ ] Keep claims honest: no real GitHub PR writes, no real MCP execution, no real reserved provider adapters unless implemented.

### Task 5: Verification

- [ ] Run targeted tests for new modules.
- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
