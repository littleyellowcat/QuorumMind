---
name: quorummind-token-guard
description: Bound QuorumMind development and model-evaluation work with explicit budgets, retry limits, validation gates, and source/fallback transparency. Use for repository exploration, browser automation, tests/builds, API/model calls, long-running debugging, dependency changes, security-sensitive work, or any task likely to need multiple tool calls.
---

# QuorumMind Token Guard

## Overview

Use this skill to keep QuorumMind agent work bounded, observable, and honest about output sources. It is a project-local guardrail for coding tasks, quality audits, Blueprint/Decision model evaluation, and operational debugging.

## Start Budget

Before heavy work, state a compact budget in the working update:

- Attempts: usually 1 implementation pass and 1 fix pass.
- Searches: usually 2 targeted `rg`/file-list passes before reading files.
- Tool calls: keep exploration narrow; batch independent reads.
- Validation: run the smallest meaningful test first, then broaden when risk warrants.
- External calls: avoid real provider/API calls unless needed; set timeout and call budget.

## Execution Rules

- Use `rg` or `rg --files` first for repository discovery.
- Read the smallest relevant files or ranges before editing.
- Use `apply_patch` for manual edits.
- Keep unrelated dirty worktree changes intact.
- Do not retry the same failing command or approach more than twice without new evidence.
- When blocked, report what failed, the evidence, and the next best action instead of continuing blind retries.

## Model And API Work

For QuorumMind live model features, always track:

- Provider/model attempted.
- Timeout and retry policy.
- JSON parse status.
- Schema status: valid, repaired, or invalid.
- Whether deterministic fallback was used.
- Whether user-facing content came from live model output, repaired live output, or deterministic synthesis.

Do not describe deterministic fallback as real model reasoning. If fallback contributes to the final answer, make that visible in UI, reports, or audit notes.

## Validation Ladder

Pick the lowest sufficient validation level:

1. Static/document-only edits: `git diff --check` plus direct file review.
2. Narrow code edits: targeted unit tests for touched modules.
3. UI behavior edits: targeted tests plus browser/visual audit when layout or interaction changes.
4. API/model edits: server tests plus mock provider audit; use real API regression only when explicitly needed and budgeted.
5. Release-level confidence: full test suite, build, quality audit, mock e2e, and visual audit.

## Output Discipline

- Keep user updates short and concrete.
- Name skipped validation or API calls explicitly.
- Record substantial quality work in `docs/quality/`.
- Prefer Chinese for user-facing QuorumMind work unless the user asks otherwise.
