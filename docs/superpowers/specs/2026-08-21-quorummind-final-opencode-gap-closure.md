# QuorumMind Final OpenCode Gap Closure Design

## Goal

Finish the remaining objective gaps between QuorumMind and opencode without changing QuorumMind into a general coding agent. The target product remains an auditable multi-model decision room for architecture review, Agent-system design, ADRs, risk radar, model disagreement, and consensus trace.

## Scope

This closure covers eight shipped surfaces:

1. Run Audit Replay archive/search/diff/bundle/PR-ADR linkage.
2. GitHub production hardening for native Check Run and PR Review payloads.
3. Repo Evidence 2.0 with evidence IDs, dependency/import graph, architecture boundaries, API surface, and change impact.
4. Decision Quality Eval with golden cases, rubric judging, provider reputation, and quality trends.
5. Provider Capability Router with task-specific model-seat selection and explainable capability reasons.
6. Team/Persistence foundation with workspace records, ADR approval workflow, access checks, and Postgres configuration contract.
7. CLI/API exposure for the new product surfaces.
8. Documentation and verification that distinguishes real shipped behavior from future work.

## Boundaries

The implementation must stay local-first and safe:

- GitHub writes remain opt-in and default to dry-run.
- Provider probes and live calls remain opt-in.
- MCP process launching is not exposed through a public route.
- Postgres is represented as a durable configuration and contract layer; no new database dependency is introduced in this pass.
- The code should reuse existing harness, repo, provider, CLI, and API patterns.

## Acceptance

Each area must have local Vitest coverage and either API, CLI, or GitHub runner integration. Final verification must include targeted tests, full test suite, build, distribution doctor, and diff whitespace checks.
