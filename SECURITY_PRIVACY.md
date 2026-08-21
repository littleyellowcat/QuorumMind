# Security And Privacy Notes

QuorumMind is designed as a local-first decision system. The default demo path does not call external model APIs.

## Secrets

- Provider API keys belong in `.env.local`.
- `.env.local` is ignored by Git and Docker build context.
- The browser never receives provider keys.
- `/api/health` reports whether a provider is configured without returning secret values.
- `quorummind.config.json` summaries expose configured env-key names only; env values and MCP args are not returned.
- If `QUORUMMIND_API_TOKEN` is set, API requests must include either `X-QuorumMind-Token` or `Authorization: Bearer <token>`.
- If the browser app needs to call a token-protected local API, set `VITE_QUORUMMIND_API_TOKEN` to the same value for local use. Do not treat this as a strong public-web secret because browser-delivered tokens are visible to the browser user.

## API Security Controls

The local API applies baseline API Security Posture Management controls:

- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`, and `Cache-Control: no-store`.
- Strict CORS allowlist instead of wildcard CORS. Defaults allow local Vite origins only.
- Optional bearer/static token authentication through `QUORUMMIND_API_TOKEN`.
- In-memory rate limiting. Defaults to 60 requests per minute per client identifier.
- Request body size limit. Defaults to 256 KiB.
- Sanitized posture summary at `GET /api/security`.

Security-related environment variables:

- `QUORUMMIND_ALLOWED_ORIGINS`: comma-separated origins allowed for browser API calls, for example `http://localhost:5173,https://quorummind.example`.
- `QUORUMMIND_API_TOKEN`: optional API token required for all API routes when set.
- `VITE_QUORUMMIND_API_TOKEN`: optional local browser token sent as `X-QuorumMind-Token`.
- `QUORUMMIND_RATE_LIMIT_MAX`: max requests per window, default `60`.
- `QUORUMMIND_RATE_LIMIT_WINDOW_MS`: rate-limit window, default `60000`.
- `QUORUMMIND_MAX_BODY_BYTES`: max request body size, default `262144`.
- `QUORUMMIND_ENABLE_HSTS=1`: enable HSTS when serving behind HTTPS.

## Provider Data

Live provider outputs can include raw model text in the trace. Treat exported JSON traces as sensitive if the original decision question or context contains private architecture, business, or career information.

## GitHub And Tool Data

- `POST /api/github/run` is dry-run by default. It creates a review package from supplied comment, PR number, changed files, diff text, ADR references, and risk radar. It does not push commits, open PRs, or write comments unless the GitHub Action is explicitly configured with `write_comment: "true"` and a token. Native Check Run / PR Review writes require `write_github: "true"` and are validated, line-mapped, deduplicated, and documented with minimum permissions before any write helper is used.
- `POST /api/github/e2e` and `npm run github:e2e` validate the GitHub runner loop in mock mode by default. Live writes require explicit `QUORUMMIND_GITHUB_E2E_WRITE=1`, `GITHUB_TOKEN`, and `GITHUB_SHA`.
- `POST /api/providers/probe` is disabled for real providers unless `QUORUMMIND_PROVIDER_PROBE_ENABLED=1` is set. Mock probes are allowed through `QUORUMMIND_MOCK_PROVIDERS=1`.
- `POST /api/providers/route` is local-only planning logic. It reads sanitized provider status and capability metadata; it does not call providers.
- `POST /api/quality/eval` is a deterministic local rubric gate by default. Optional LLM-as-a-Judge requires both request-level `judge.enabled: true` and server-level `QUORUMMIND_LLM_JUDGE_ENABLED=1`; responses record skip/error state and a privacy note.
- `POST /api/repo/workspace` reads only bounded repository evidence from `QUORUMMIND_CONFIG_DIR` or the current working directory and rejects unsafe selected file paths.
- `GET /api/agent-runs/audit`, `GET /api/agent-runs/:runId/audit`, and audit diff/bundle responses are derived from local run-store files. Treat bundles as sensitive because they may contain provider output summaries, PR references, ADR paths, and permission decisions.
- `POST /api/team/workspaces`, `GET /api/team/workspaces/:id`, `POST /api/team/access`, `POST /api/team/adr-approvals`, and `POST /api/team/adr-approvals/:id/reply` write/read local team metadata and ADR approval records. Postgres support includes a query-client repository adapter for deployment code, but local-first endpoints never return `QUORUMMIND_POSTGRES_URL` and do not open a Postgres connection by default.
- `GET /api/tools/manifests` lists sanitized MCP/custom tool metadata only. It does not expose MCP env values or command args.
- `POST /api/tools/read-only` executes only configured read-only custom tools, currently repo diff evidence summarization. The requesting agent must be explicitly allowed in `quorummind.config.json`.
- MCP server processes can be started by `server/tools/mcp-runtime.ts` only when server-side code creates an MCP session. Tool calls are limited to read-only tool names and are written to the permission approval store; no HTTP API starts arbitrary MCP processes.
- `POST /api/permissions/approvals/:id/reply` updates local approval records. `POST /api/permissions/approvals/:id/revoke` revokes a stored approval without deleting the audit trail. Treat tool-scoped `always` approvals as sensitive because they affect future execution decisions.

## Local Modes

- `QUORUMMIND_PROVIDER_MODE=demo`: deterministic decision engine, no external calls.
- `QUORUMMIND_PROVIDER_MODE=live`: configured providers can be called by the local API server.
- `QUORUMMIND_MOCK_PROVIDERS=1`: keyless mock live providers, useful for demos and CI.
- `OLLAMA_BASE_URL` and `LMSTUDIO_BASE_URL`: local model endpoints. These do not require third-party API keys but can still process private prompts on the local machine.
- `QUORUMMIND_POSTGRES_URL`: optional team persistence connection string. Current local-first endpoints only report whether it is present and never return the value; deployment code can wire a database client into the Postgres repository adapter.
- `QUORUMMIND_POSTGRES_SCHEMA` and `QUORUMMIND_POSTGRES_SSL`: optional Postgres contract metadata.
- `QUORUMMIND_LLM_JUDGE_ENABLED=1`: allows opt-in LLM-as-a-Judge calls from `/api/quality/eval` when the request also enables judge mode.
- `QUORUMMIND_GITHUB_E2E_WRITE=1`: allows `/api/github/e2e` or `npm run github:e2e` to perform live GitHub write validation when `GITHUB_TOKEN` and `GITHUB_SHA` are also present.

## Persistence

The browser stores recent decision rooms in `localStorage` through a `DecisionRepository` boundary. This keeps the current project simple while leaving a clear path to SQLite/Postgres persistence.

## Recommended Demo Practice

Use mock providers for public demos unless you intentionally want to spend API credits. Avoid pasting confidential business context into live third-party providers.

## Before Sharing With Other Users

The local defaults are intentionally convenient for self-use. Before giving the app to other users or binding the API beyond localhost, harden the deployment:

- Set `QUORUMMIND_API_TOKEN` and pass the matching browser token only to trusted users through `VITE_QUORUMMIND_API_TOKEN`.
- Replace default local origins with an exact `QUORUMMIND_ALLOWED_ORIGINS` allowlist for the deployed web origin.
- Keep `QUORUMMIND_RATE_LIMIT_MAX`, `QUORUMMIND_RATE_LIMIT_WINDOW_MS`, and `QUORUMMIND_MAX_BODY_BYTES` conservative until real usage is measured.
- Serve the API behind HTTPS and set `QUORUMMIND_ENABLE_HSTS=1`.
- Use mock providers for demos, or clearly label live-provider cost and data exposure before enabling real keys.
- Treat exported JSON traces, PDF/HTML reports, and copied prompt packages as sensitive when the original question contains private business or architecture context.
