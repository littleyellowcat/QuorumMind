# QuorumMind / opencode Optimization Roadmap

Date: 2026-08-20

This note saves the five platform improvements identified from comparing QuorumMind with opencode. The goal is not to turn QuorumMind into a general coding agent. The goal is to borrow the platform qualities that make opencode reliable: durable runtime state, clear boundaries, policy controls, source transparency, and governed tools.

## 1. Durable Run Runtime

QuorumMind should treat Decision and Blueprint executions as replayable runs, not only final JSON snapshots. Each run needs ordered events, incremental replay, a read model, interruption-friendly status, and persisted metrics.

Implementation target:

- Event log per run.
- Read model projection for timeline, metrics, and artifacts.
- API evidence that lets the browser distinguish demo, live, fallback, and persisted states.

## 2. UI Boundary Split

`src/App.tsx` remains the largest maintainability risk. The first optimization is to extract stable workbench surfaces into focused components while preserving current behavior.

Implementation target:

- Extract reusable workbench shell components.
- Keep component props explicit and testable.
- Avoid a risky full rewrite in one pass.

## 3. Context Source Ledger

Architecture decisions should show what the final recommendation was based on: user input, inferred context, assumptions, knowledge injection, reputation feedback, provider evidence, and deterministic fallback.

Implementation target:

- Build a versioned source ledger with a stable hash.
- Attach source and fallback metadata to API responses.
- Make restored runs auditable without rerunning providers.

## 4. Provider Policy And Cost Governance

Provider configuration and provider permission should be separate. A provider can be configured but denied by policy. Run budgets should remain visible and bounded.

Implementation target:

- Add allow/deny provider policy with wildcard matching.
- Preserve the legacy disabled-model environment variable.
- Expose policy decisions through provider status.

## 5. Runtime Tool Boundary

QuorumMind should keep local agent tools explicit, schema-described, role-owned, and permission-filtered. This keeps Blueprint/Decision automation auditable without giving every agent every capability.

Implementation target:

- Register default QuorumMind tools through the existing governed tool registry.
- Materialize tools by agent role and permission policy.
- Keep live model and write/export tools gated when required.

