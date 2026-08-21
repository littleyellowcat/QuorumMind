# QuorumMind opencode Seven-Item Completion Record

**Goal:** Close the seven objective gaps identified in the follow-up QuorumMind vs opencode comparison while keeping QuorumMind focused on auditable architecture review and agent-system decisions.

**Positioning Guardrail:** QuorumMind should not become a general coding agent. These changes add review/runtime evidence, CLI and GitHub entry points, provider probes, permission lifecycle, MCP read-only runtime, workspace modeling, and distribution checks.

## Completion Map

- [x] GitHub runner deeper context ingestion: `server/github/github-context.ts` fetches PR files, patches, issue comments, labels, and review history without returning tokens.
- [x] CLI maturity: `scripts/quorummind-cli.ts` supports `decide`, `blueprint`, `review-pr`, `export`, `init`, `runs`, `status`, and `watch`, with stdin/file input and session metadata.
- [x] MCP runtime: `server/tools/mcp-runtime.ts` can start stdio MCP sessions, list tools, call read-only tool names only, block non-read-only names before server calls, and record allowed calls in the approval store.
- [x] Provider capability probe: `server/providers/capability-probe.ts` measures JSON schema stability, failure rate, average latency, repair rate, and recommended use cases; `/api/providers/probe` is mock-safe and opt-in for real providers.
- [x] Permission lifecycle: `server/harness/permission-lifecycle.ts` groups pending, approved, denied, revoked, and expired approvals by tool/provider; approvals can be revoked without deleting audit history.
- [x] Repo workspace model: `server/repo/workspace-model.ts` builds file tree, selected file previews, ADR history, dependency/architecture graph hints, hotspots, test evidence, and CI evidence.
- [x] Distribution maturity: `examples/github-action/quorummind-review.yml`, `docs/distribution/quickstart.md`, and `scripts/distribution-doctor.ts` cover workflow and install/readiness smoke checks.

## Verification Checklist

- [x] Targeted tests for new server/CLI modules: 9 files, 76 tests passed.
- [x] API integration tests for provider probe, repo workspace, and permission lifecycle/revoke: included in `server/decision-api.test.ts`.
- [x] Full test suite: 71 files, 269 tests passed.
- [x] TypeScript/Vite build: `npm run build` passed with the existing Vite chunk-size warning.
- [x] `git diff --check`: passed.
- [x] CLI smoke checks: `init --print` and `review-pr --pr 42` both returned exit 0.
- [x] Distribution doctor: ready, all checks passed.
