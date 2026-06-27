# Security And Privacy Notes

QuorumMind is designed as a local-first decision system. The default demo path does not call external model APIs.

## Secrets

- Provider API keys belong in `.env.local`.
- `.env.local` is ignored by Git and Docker build context.
- The browser never receives provider keys.
- `/api/health` reports whether a provider is configured without returning secret values.
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

## Local Modes

- `QUORUMMIND_PROVIDER_MODE=demo`: deterministic decision engine, no external calls.
- `QUORUMMIND_PROVIDER_MODE=live`: configured providers can be called by the local API server.
- `QUORUMMIND_MOCK_PROVIDERS=1`: keyless mock live providers, useful for demos and CI.

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
