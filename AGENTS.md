## QuorumMind Agent Guard

For any task involving tool calls, repository exploration, web search, browser automation, CI/test/build debugging, dependency installation, long-running commands, external services, retries, or potentially expensive investigation, use `skills/quorummind-token-guard` before doing heavy work.

If a runtime skill named `token-guard` is available, use it as well. If it is not available, emulate the same controls manually:

- Set a compact budget before heavy work: attempts, searches, tool calls, validation cycles, and external API calls.
- Prefer targeted reads and searches over broad scans.
- If the same subproblem fails twice without new evidence, stop retrying, summarize what was attempted, identify the blocker, and choose the next single best action.
- Do not run real model/API calls unless the task needs them; when used, record provider, timeout, schema status, fallback status, and whether the final result came from live output.
- Preserve user work in dirty git trees. Do not revert unrelated changes.
- Validate changes with the smallest meaningful test/build/audit command, then broaden only when the touched surface justifies it.

For small direct questions that do not require tools or iterative debugging, answer normally without adding guard-process ceremony.
