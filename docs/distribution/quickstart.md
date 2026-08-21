# QuorumMind Distribution Quickstart

QuorumMind is an auditable multi-model decision room for architecture review, agent-system design, ADR generation, and risk review. It is not trying to become a general coding agent.

## Local CLI Smoke Test

```bash
npm install
npm link
quorummind --version
quorummind doctor
npm run server
npm run quorummind -- init --print
npm run quorummind -- init --github-action
npm run quorummind -- decide --stdin --session arch-1 < docs/distribution/quickstart.md
npm run quorummind -- blueprint --file docs/distribution/quickstart.md
npm run quorummind -- review-pr --pr 42 "focus on architecture boundaries"
npm run quorummind -- audit --run <run-id>
npm run quorummind -- route-provider --task architecture_review --json-schema --long-context
npm run quorummind -- eval --suite offline-smoke
npm run quorummind -- team --workspace architecture --user alice --action approve_adr
```

The CLI defaults to `http://127.0.0.1:8787`. Set `QUORUMMIND_API_BASE_URL` when the local API runs on another port.

## GitHub Comment Mode

Copy `examples/github-action/quorummind-review.yml` into `.github/workflows/quorummind-review.yml` in a repository that contains QuorumMind. The workflow reacts to comments containing `/quorummind` or `/qm`.

The example keeps `write_comment: "false"` so the action writes only the GitHub step summary. It sets `output_mode: all` so the summary includes the normal issue comment payload, a Check Run payload, and a PR Review payload for inspection. Change `write_comment` to `"true"` only when you explicitly want QuorumMind to post the review package back to the issue or PR.

## Provider Probe Smoke Test

Use mock providers first. This exercises the probe shape without external calls:

```bash
QUORUMMIND_PROVIDER_MODE=live QUORUMMIND_MOCK_PROVIDERS=1 npm run server
curl -s http://127.0.0.1:8787/api/providers/probe \
  -H 'Content-Type: application/json' \
  -d '{"providerId":"openai","sampleCount":2}'
```

Real provider probes are disabled unless `QUORUMMIND_PROVIDER_PROBE_ENABLED=1` is set. Keep `sampleCount` small because each sample is a real model call.

## Repo Workspace Model

```bash
curl -s http://127.0.0.1:8787/api/repo/workspace \
  -H 'Content-Type: application/json' \
  -d '{"selectedFiles":["README.md"],"diffText":"","testOutput":"1 passed","ciStatus":"passing"}'
```

The response includes a bounded file tree, selected file previews, ADR history, dependency/import graph hints, architecture boundaries, API surface, evidence IDs, change impact, hotspots, test evidence, and CI evidence.

## Provider Routing And Quality Eval

```bash
curl -s http://127.0.0.1:8787/api/providers/route \
  -H 'Content-Type: application/json' \
  -d '{"task":"architecture_review","requirements":{"jsonSchema":true,"longContext":true,"maxSeats":2}}'

curl -s http://127.0.0.1:8787/api/quality/eval \
  -H 'Content-Type: application/json' \
  -d '{"suiteName":"offline-smoke","outputs":{}}'
```

Provider routing does not call external models. Quality eval is a deterministic local rubric gate.

## Run Audit Archive

```bash
curl -s 'http://127.0.0.1:8787/api/agent-runs/audit?query=auth&provider=openrouter'
curl -s 'http://127.0.0.1:8787/api/agent-runs/<run-id>/audit?bundle=true'
curl -s 'http://127.0.0.1:8787/api/agent-runs/audit/diff?base=<old-run>&target=<new-run>'
```

Audit bundles include a manifest, linked PRs, linked ADRs, artifact references, and a Markdown replay package.

## GitHub E2E Validation

```bash
npm run github:e2e
```

The default mode validates the `/qm review-pr -> Check Run -> PR Review` loop through the local write adapter without touching GitHub. To validate against a real test repository, set `QUORUMMIND_GITHUB_E2E_WRITE=1`, `QUORUMMIND_GITHUB_E2E_REPO=owner/repo`, `QUORUMMIND_GITHUB_E2E_PR=<number>`, `GITHUB_TOKEN`, and `GITHUB_SHA`.

## Team Workspace Foundation

```bash
curl -s http://127.0.0.1:8787/api/team/workspaces \
  -H 'Content-Type: application/json' \
  -d '{"id":"architecture","name":"Architecture Council","persistenceMode":"postgres","members":[{"userId":"alice","role":"owner"}]}'

curl -s http://127.0.0.1:8787/api/team/workspaces/architecture

curl -s -X POST http://127.0.0.1:8787/api/team/adr-approvals/<approval-id>/reply \
  -H 'Content-Type: application/json' \
  -d '{"userId":"alice","decision":"approve","note":"Risk and rollback notes are clear."}'
```

Postgres mode reports configuration state without returning the connection string. A query-client repository adapter is available for deployment code that supplies a real Postgres client; the local-first API does not open a database connection by default.

## Permission Lifecycle

```bash
curl -s http://127.0.0.1:8787/api/permissions/audit
curl -s http://127.0.0.1:8787/api/permissions/lifecycle
```

Tool-scoped approvals created through `reply: "always"` can be revoked through:

```bash
curl -s -X POST http://127.0.0.1:8787/api/permissions/approvals/<approval-id>/revoke
```

## Distribution Doctor

```bash
npm run distribution:doctor
```

The doctor checks the npm bin wrapper, the composite GitHub action, the quickstart workflow template, and frontend bundle-splitting configuration.
