# QuorumMind API Contract

The API is a local gateway between the browser and model providers. It protects API keys, normalizes provider output, and returns enough trace metadata for debugging and audit.

## `GET /api/health`

Returns provider mode and provider slot status. Secret values are never included.

```json
{
  "status": "ok",
  "providerMode": "demo",
  "persistence": {
    "mode": "browser_local",
    "configured": false
  },
  "providerStatus": {
    "openai": {
      "configured": false,
      "implemented": true,
      "model": "gpt-4o-mini"
    },
    "openrouter": {
      "configured": false,
      "implemented": true,
      "model": "openai/gpt-5.2"
    },
    "ollama": {
      "configured": false,
      "implemented": true,
      "model": "llama3.1"
    }
  },
  "providerCapabilities": {},
  "configSummary": {
    "loaded": false,
    "mcpServers": [],
    "customTools": [],
    "agentToolAccess": [],
    "providerOverrides": []
  }
}
```

Implemented provider adapters include OpenAI, DeepSeek, Gemini, Anthropic, OpenRouter, Ollama, LM Studio, and the unified OpenAI-compatible model gateway. Reserved provider slots still appear in `providerStatus` with `implemented: false`.

## `GET /api/security`

Returns a sanitized API security posture summary. Secret values are never included.

```json
{
  "classification": "local-first API",
  "controls": {
    "securityHeaders": true,
    "corsAllowlist": true,
    "wildcardCors": false,
    "rateLimiting": true,
    "authenticationRequired": false
  },
  "endpoints": [
    {
      "method": "POST",
      "path": "/api/decisions",
      "documented": true,
      "authentication": "optional"
    }
  ]
}
```

The security posture also documents `/api/providers/probe`, `/api/providers/route`, `/api/quality/eval`, `/api/repo/workspace`, `/api/agent-runs/audit`, `/api/agent-runs/:id/audit`, `/api/agent-runs/audit/diff`, `/api/permissions/audit`, `/api/permissions/lifecycle`, `/api/permissions/approvals/:id/reply`, `/api/permissions/approvals/:id/revoke`, `/api/tools/manifests`, `/api/tools/read-only`, `/api/github/run`, `/api/github/e2e`, `/api/team/workspaces`, `/api/team/workspaces/:id`, `/api/team/access`, `/api/team/adr-approvals`, and `/api/team/adr-approvals/:id/reply`.

If `QUORUMMIND_API_TOKEN` is configured, every API route requires either:

- `X-QuorumMind-Token: <token>`
- `Authorization: Bearer <token>`

Browser origins must match `QUORUMMIND_ALLOWED_ORIGINS`; wildcard CORS is not used.

## `POST /api/providers/probe`

Runs a bounded provider capability probe against configured providers. Real provider probes are disabled unless `QUORUMMIND_PROVIDER_PROBE_ENABLED=1` is set. Mock probes work when `QUORUMMIND_MOCK_PROVIDERS=1`.

Request:

```json
{
  "providerId": "openai",
  "sampleCount": 2
}
```

Response:

```json
{
  "probe": {
    "providerId": "openai",
    "model": "mock-gpt-seat",
    "sampleCount": 2,
    "jsonSchemaStable": true,
    "toolCallsAvailable": "unknown",
    "longContextLimit": "unknown",
    "priceTier": "unknown",
    "failureRate": 0,
    "averageLatencyMs": 25,
    "repairRate": 0,
    "recommendedUseCases": ["architecture_review", "adr_generation"]
  }
}
```

If `providerId` is omitted, the endpoint probes up to three configured providers and returns `{ "probes": [] }`.

## `POST /api/decisions`

Request:

```json
{
  "question": "Should we use shared tables or schema-per-tenant?",
  "mode": "deep",
  "locale": "en",
  "agentConfig": [
    {
      "id": "gpt",
      "name": "GPT Product Architect",
      "providerLabel": "ChatGPT / GPT Plus",
      "role": "principal_architect",
      "weight": 1,
      "scoringFocus": ["product fit", "architecture coherence"]
    }
  ],
  "reputationFeedback": [
    {
      "agentId": "deepseek",
      "domain": "technical_architecture",
      "outcome": "helpful",
      "confidence": 1,
      "createdAt": "2026-06-15T00:00:00.000Z"
    }
  ],
  "context": {
    "productStage": "mvp",
    "expectedScale": "50 tenants",
    "teamProfile": "Small full-stack team",
    "budgetSensitivity": "high",
    "reliabilityRequirement": "medium",
    "securityRequirement": "high",
    "existingConstraints": ["Use PostgreSQL"],
    "candidateOptions": ["Shared tables", "Schema per tenant"],
    "assumptions": ["No strict compliance need at launch"]
  }
}
```

`agentConfig` and `reputationFeedback` are optional. Invalid agent seats or feedback records are ignored and replaced with safe defaults. Valid feedback records calibrate Model Reputation before prompt generation and live provider calls.

Response:

```json
{
  "providerMode": "demo",
  "persistence": {
    "mode": "sqlite",
    "configured": true,
    "saved": true
  },
  "providerTrace": [],
  "liveVerdict": null,
  "promptBundle": { "version": "manual-v1" },
  "result": { "roomId": "demo-room" }
}
```

## `POST /api/blueprints`

Runs the Blueprint room for open-ended planning/specification questions. The request shape matches `/api/decisions` and accepts an optional `blueprintRuntime` block:

```json
{
  "question": "我想做一个视觉类游戏，用多 agent 处理小说文本，工作流和字段怎么设计？",
  "mode": "fast",
  "locale": "zh",
  "blueprintRuntime": {
    "executionMode": "live",
    "maxProviderRounds": 3
  },
  "context": {
    "productStage": "mvp",
    "expectedScale": "3-5 pilot novels",
    "teamProfile": "Small full-stack team",
    "budgetSensitivity": "medium",
    "reliabilityRequirement": "medium",
    "securityRequirement": "medium",
    "existingConstraints": ["Chinese output"],
    "candidateOptions": ["LangGraph", "LangChain", "Custom orchestration"],
    "assumptions": ["Start with structured text artifacts"]
  }
}
```

`blueprintRuntime.executionMode` supports:

- `live`: default for Blueprint UI. The server attempts live provider trace when `QUORUMMIND_PROVIDER_MODE=live` and providers are available. Fast Blueprint requests are upgraded to deep provider trace so model critique/revision can participate.
- `deterministic`: skips providers and returns the local structured Blueprint.

`blueprintRuntime.maxProviderRounds` is optional and caps live Blueprint provider phases from 1 to 5:

1. proposal
2. critique
3. revision
4. ranking
5. verdict

With three provider seats, the maximum call count is `maxProviderRounds * 3`.

Response source fields:

```json
{
  "providerMode": "live",
  "providerTrace": [
    { "phase": "proposal", "provider": "openai", "model": "gpt-4o-mini", "validationStatus": "valid" }
  ],
  "blueprintExecution": {
    "requested": "live",
    "actual": "live",
    "liveTraceRequired": true,
    "liveTraceAttempted": true,
    "liveTraceUsable": true,
    "providerCalls": 15,
    "usableCalls": 15
  },
  "promptBundle": { "version": "manual-v1" },
  "result": { "roomId": "blueprint-room" }
}
```

When no usable live model output contributes, `blueprintExecution.actual` is `deterministic` and `fallbackReason` is one of `deterministic_mode`, `provider_mode_demo`, `no_configured_providers`, `no_usable_live_trace`, or `live_trace_error`. The frontend must display this as deterministic fallback, not as model reasoning.

## `POST /api/agent-runs/blueprint`

Runs the experimental autonomous Blueprint platform. This endpoint uses LangGraph as a bounded server-side state graph, LangChain Core tools for local QuorumMind Blueprint capabilities, and an optional `live_model_review` node for live provider trace.

Request shape matches `/api/decisions`:

```json
{
  "question": "我想做一个视觉类游戏，用多 agent 处理小说文本，工作流和字段怎么设计？",
  "mode": "deep",
  "locale": "zh",
  "blueprintRuntime": {
    "executionMode": "live",
    "maxProviderRounds": 3
  },
  "agentRuntime": {
    "threadId": "optional-stable-thread-id",
    "maxConsensusRounds": 3,
    "humanReviewNote": "Optional human review evidence when resuming the same checkpoint thread."
  },
  "context": {
    "productStage": "mvp",
    "expectedScale": "3-5 pilot novels",
    "teamProfile": "Small full-stack team",
    "budgetSensitivity": "medium",
    "reliabilityRequirement": "medium",
    "securityRequirement": "medium",
    "existingConstraints": ["Chinese output"],
    "candidateOptions": ["LangGraph", "LangChain", "Custom orchestration"],
    "assumptions": ["Start with structured text artifacts"]
  }
}
```

Response:

```json
{
  "providerMode": "demo",
  "run": {
    "platform": {
      "orchestrator": "langgraph",
      "toolLayer": "langchain-core",
      "autonomyLevel": "bounded_server_graph",
      "source": "live_model_trace_with_deterministic_synthesis",
      "checkpointing": "memory_saver"
    },
    "checkpoint": {
      "enabled": true,
      "saver": "MemorySaver",
      "threadId": "optional-stable-thread-id"
    },
    "runtimeLimits": {
      "maxConsensusRounds": 3,
      "recursionLimit": 24
    },
    "trace": [
      { "node": "understand_request", "agentId": "goal-agent", "status": "complete" },
      { "node": "live_model_review", "agentId": "live-provider-router", "status": "complete" }
    ],
    "toolCalls": [
      { "toolName": "quorummind_create_blueprint", "source": "langchain_tool" },
      { "toolName": "quorummind_live_blueprint_provider_trace", "source": "live_model_provider" }
    ],
    "taskTree": [
      {
        "id": "task-plan-goal",
        "title": "拆解用户目标与成功标准",
        "ownerAgent": "planner_agent",
        "status": "ready",
        "toolName": "quorummind_planner_agent"
      }
    ],
    "toolPermissions": [
      {
        "toolName": "quorummind_create_blueprint",
        "node": "executor_agent",
        "category": "read_only",
        "risk": "low",
        "decision": "auto",
        "reason": "该动作限制在本地确定性工具和运行时状态内，可以自动执行。"
      }
    ],
    "executorActions": [
      {
        "taskId": "task-execute-blueprint",
        "toolName": "quorummind_create_blueprint",
        "permission": "auto",
        "status": "executed"
      }
    ],
    "criticReviews": [
      {
        "targetTaskId": "task-supervise-route",
        "status": "warn",
        "finding": "当前共识 68/80。",
        "recommendation": "低于阈值时继续修订或进入人工复审。"
      }
    ],
    "memoryEvents": [
      {
        "scope": "thread",
        "action": "summarize",
        "key": "optional-stable-thread-id",
        "persistence": "memory"
      },
      {
        "scope": "thread",
        "action": "summarize",
        "key": "user_preference_summary",
        "persistence": "memory"
      },
      {
        "scope": "durable",
        "action": "profile",
        "key": "project_profile",
        "persistence": "memory"
      },
      {
        "scope": "thread",
        "action": "compare",
        "key": "last_vs_current_diff",
        "persistence": "memory"
      },
      {
        "scope": "durable",
        "action": "backlog",
        "key": "failure_sample_backlog",
        "persistence": "memory"
      }
    ],
    "supervisorDecisions": [
      {
        "node": "supervisor_agent",
        "decision": "continue",
        "nextNode": "validate_result"
      }
    ],
    "providerTrace": [
      { "phase": "proposal", "provider": "openai", "model": "gpt-4o-mini", "validationStatus": "valid" }
    ],
    "liveModel": {
      "requested": "live",
      "actual": "live",
      "liveTraceRequired": true,
      "liveTraceAttempted": true,
      "liveTraceUsable": true,
      "providerCalls": 15,
      "usableCalls": 15
    },
    "consensusLoop": [
      {
        "round": 1,
        "phase": "draft",
        "consensusScore": 68,
        "threshold": 80,
        "passed": false,
        "action": "continue"
      },
      {
        "round": 3,
        "phase": "final",
        "consensusScore": 87,
        "threshold": 80,
        "passed": true,
        "action": "finalize"
      }
    ],
    "routeDecisions": [
      {
        "fromNode": "validate_result",
        "toNode": "revise_discussion",
        "reason": "below_threshold_can_revise",
        "round": 1,
        "consensusScore": 68,
        "threshold": 80
      }
    ],
    "validation": {
      "passed": true,
      "canRevise": false,
      "round": 3,
      "totalRounds": 3,
      "maxConsensusRounds": 3,
      "terminationReason": "threshold_met",
      "consensusScore": 87,
      "threshold": 80
    },
    "summary": {
      "discussionRounds": 3,
      "terminationReason": "threshold_met",
      "nextActions": ["..."]
    },
    "result": { "roomId": "blueprint-room" }
  }
}
```

Source transparency: `run.platform.source` is `live_model_trace_with_deterministic_synthesis` only when the `live_model_review` node produced usable structured provider trace. It remains `deterministic_tools` when the user selects deterministic mode, provider mode is demo, no providers are configured, or live output fails schema checks. Even in live mode, final Blueprint assembly is deterministic synthesis over validated model contributions.

Runtime controls:

- `agentRuntime.threadId` is optional. When provided, the run is attached to that LangGraph memory checkpoint thread.
- `agentRuntime.maxConsensusRounds` is optional. It caps how many Blueprint consensus rounds the graph may discuss before routing to `human_review_gate`.
- `agentRuntime.humanReviewNote` is optional. It is attached as resume evidence when the graph reaches `human_review_gate` on the same checkpoint thread.
- `blueprintRuntime.executionMode` is optional and defaults to `live`. Use `deterministic` for quick local runs with no provider calls.
- `blueprintRuntime.maxProviderRounds` is optional and caps live provider trace phases for Blueprint runs.

## `POST /api/github/run`

Plans a GitHub issue/PR architecture review from a `/quorummind` or `/qm` comment. The endpoint defaults to dry-run and does not write GitHub comments.

Request:

```json
{
  "commentBody": "/quorummind review-pr --pr 42 focus on auth boundaries",
  "repo": "owner/repo",
  "issueNumber": 42,
  "diffText": "diff --git a/server/auth.ts b/server/auth.ts\n+++ b/server/auth.ts\n+token",
  "changedFiles": ["server/auth.ts"]
}
```

Response:

```json
{
  "status": "planned",
  "githubWriteMode": "dry_run",
  "reviewMarkdown": "# QuorumMind Architecture Review\n...",
  "githubNative": {
    "checkRun": {
      "name": "QuorumMind Architecture Review",
      "conclusion": "neutral",
      "output": {
        "annotations": []
      }
    },
    "pullRequestReview": {
      "pullNumber": 42,
      "event": "COMMENT",
      "comments": []
    }
  },
  "writeRequest": {
    "owner": "owner",
    "repo": "repo",
    "issueNumber": 42,
    "body": "# QuorumMind Architecture Review\n..."
  }
}
```

The companion `github/action.yml` runs `server/github/run-github-action.ts`. It writes the selected payload to the GitHub step summary by default. `output_mode` can be `comment`, `check`, `pr_review`, or `all`. It posts a normal issue/PR comment only when `write_comment: "true"` is supplied. It posts native Check Run or PR Review outputs only when `write_github: "true"` is supplied with `GITHUB_TOKEN`; Check Run output also requires `GITHUB_SHA`.

`server/github/github-context.ts` can ingest deeper PR context for runners that provide a token: changed files, patches, issue comments, labels, and review history. The API response never includes the GitHub token.

## `POST /api/github/e2e`

Validates the `/qm review-pr` to native Check Run and PR Review loop. The endpoint runs in mock write mode unless the request sets `write: true` and the server has `QUORUMMIND_GITHUB_E2E_WRITE=1`. Live mode also needs `GITHUB_TOKEN` and `GITHUB_SHA`.

```json
{
  "commentBody": "/qm review-pr --pr 42 focus on auth boundaries",
  "repo": "owner/repo",
  "issueNumber": 42,
  "changedFiles": ["server/auth.ts"],
  "diffText": "diff --git a/server/auth.ts b/server/auth.ts\n@@ -1,1 +1,2 @@\n+token",
  "write": false
}
```

Response:

```json
{
  "report": {
    "mode": "mock",
    "passed": true,
    "readyToWrite": false,
    "steps": [
      { "id": "command_planned", "passed": true },
      { "id": "native_payload_valid", "passed": true },
      { "id": "check_run_roundtrip", "passed": true },
      { "id": "pr_review_roundtrip", "passed": true }
    ],
    "postedRequests": [
      { "kind": "check_run", "url": "https://api.github.com/repos/owner/repo/check-runs" },
      { "kind": "pr_review", "url": "https://api.github.com/repos/owner/repo/pulls/42/reviews" }
    ]
  }
}
```

## `GET /api/agent-runs/audit`

Lists recent server-side run audit replay summaries. The response is read-only and is used by the Workbench Run Audit Replay panel.

```json
{
  "replays": [
    {
      "runId": "run-1",
      "kind": "autonomous_blueprint",
      "status": "completed",
      "eventCount": 4,
      "artifactCount": 2
    }
  ]
}
```

## `GET /api/agent-runs/:runId/audit`

Returns a merged audit replay for one run, including read-model summary, event timeline, provider calls, artifacts, GitHub native review outputs, permission audit, and a copyable Markdown replay package. `?bundle=true` also returns an exportable audit bundle.

```json
{
  "replay": {
    "summary": { "runId": "run-1", "eventCount": 4, "artifactCount": 2 },
    "metrics": {
      "providerCallCount": 2,
      "permissionDecisionCount": 1,
      "githubReviewCount": 1
    },
    "providerCalls": [],
    "githubReviews": [],
    "permissionAudit": {},
    "replayPackage": "# QuorumMind Run Audit Replay\n..."
  },
  "bundle": {
    "manifest": {
      "formatVersion": 1,
      "runId": "run-1",
      "linkedPullRequests": [42],
      "linkedAdrPaths": ["docs/ADR-042-auth.md"],
      "providerCallCount": 2
    },
    "files": [],
    "markdown": "# QuorumMind Run Audit Bundle\n..."
  }
}
```

## `GET /api/agent-runs/audit`

Lists server-side audit archive summaries. Query parameters:

- `query`: text search across run id, summary, provider, PR, ADR, and risk metadata.
- `status`: `running`, `paused`, `completed`, `failed`, or `interrupted`.
- `kind`: `live_decision` or `autonomous_blueprint`.
- `provider`: provider id/name fragment.
- `pr`: linked pull request number.
- `adr`: ADR path fragment.
- `risk`: risk level.
- `limit`: maximum rows.

Response items include `providers`, `linkedPullRequests`, `linkedAdrPaths`, and `riskLevels` in addition to status/event/artifact counts.

## `GET /api/agent-runs/audit/diff`

Compares two run audit replays.

```json
{
  "diff": {
    "baseRunId": "run-a",
    "targetRunId": "run-b",
    "statusChanged": false,
    "summaryChanged": true,
    "metricDelta": {
      "eventCount": 3,
      "artifactCount": 1,
      "providerCallCount": 2,
      "permissionDecisionCount": 0,
      "githubReviewCount": 1,
      "durationMs": 1200
    },
    "providerChanges": { "added": ["openrouter"], "removed": [], "unchanged": ["openai"] },
    "artifactChanges": { "added": ["docs/ADR-042-auth.md"], "removed": [], "unchanged": [] },
    "riskLevelChanges": { "added": ["high"], "removed": [], "unchanged": [] }
  }
}
```

## `POST /api/repo/workspace`

Builds a bounded, read-only repository workspace model from the server-side repo root (`QUORUMMIND_CONFIG_DIR` when set, otherwise the current working directory).

Request:

```json
{
  "selectedFiles": ["README.md"],
  "diffText": "diff --git a/README.md b/README.md\n+++ b/README.md\n+new line",
  "testOutput": "1 passed",
  "ciStatus": "passing"
}
```

Response:

```json
{
  "workspace": {
    "fileTree": [],
    "selectedFiles": [
      {
        "path": "README.md",
        "lineCount": 42,
        "preview": "# QuorumMind"
      }
    ],
    "adrHistory": [],
    "dependencyGraph": { "nodes": [], "edges": [] },
    "architectureGraph": { "nodes": [], "edges": [] },
    "architectureBoundaries": [],
    "apiSurface": [],
    "evidenceIndex": [],
    "changeImpact": [],
    "codeHotspots": [],
    "testEvidence": { "status": "passed" },
    "ciEvidence": { "status": "passing" }
  }
}
```

## `POST /api/providers/route`

Selects configured provider/model seats for a task using the capability matrix.

```json
{
  "task": "architecture_review",
  "requirements": {
    "jsonSchema": true,
    "toolCalls": false,
    "longContext": true,
    "lowCost": false,
    "localOnly": false,
    "maxSeats": 2
  }
}
```

```json
{
  "route": {
    "task": "architecture_review",
    "selectedSeats": [
      {
        "providerId": "openrouter",
        "model": "anthropic/claude-sonnet-4.5",
        "score": 81,
        "rationale": ["OpenRouter is configured and implemented."],
        "capabilityWarnings": ["JSON schema is model-dependent and should be verified for this model."]
      }
    ],
    "excludedSeats": [
      { "providerId": "xai", "reason": "Provider is not implemented in QuorumMind yet." }
    ],
    "capabilityWarnings": [],
    "explanation": "Provider route for architecture_review: selected 1 configured model seat using capability matrix requirements."
  }
}
```

## `POST /api/quality/eval`

Runs deterministic golden-case judging. This is a stable local quality gate by default. An optional LLM judge is available only when the request sets `judge.enabled: true` and the server sets `QUORUMMIND_LLM_JUDGE_ENABLED=1`.

```json
{
  "suiteName": "offline-smoke",
  "outputs": {
    "tenant-architecture-review": {
      "providerId": "openrouter",
      "model": "anthropic/claude",
      "text": "Use shared tenant tables... include ADR, risk, consensus, rollback, validation."
    }
  },
  "judge": {
    "enabled": false,
    "providerId": "openrouter"
  }
}
```

Response:

```json
{
  "report": {
    "summary": {
      "suiteName": "offline-smoke",
      "totalCases": 3,
      "passedCases": 1,
      "failedCases": 0,
      "missingOutputCases": 2,
      "averageScore": 31.3
    },
    "findings": [],
    "judgeSummary": {
      "requested": false,
      "status": "not_requested",
      "judgedCases": 0,
      "privacyNote": "No LLM judge was requested; deterministic local rubric was used."
    }
  },
  "trend": {
    "suiteName": "offline-smoke",
    "providerReputation": [
      {
        "providerId": "openrouter",
        "sampleCount": 1,
        "qualityBand": "strong"
      }
    ]
  }
}
```

## `POST /api/team/workspaces`

Creates or updates a local team workspace record.

```json
{
  "id": "architecture",
  "name": "Architecture Council",
  "persistenceMode": "postgres",
  "members": [
    { "userId": "alice", "role": "owner" },
    { "userId": "bob", "role": "reviewer" }
  ]
}
```

Response includes a sanitized `persistenceContract`. For Postgres, it reports configured state, schema, SSL mode, and required table names without returning `QUORUMMIND_POSTGRES_URL`.

## `GET /api/team/workspaces/:id`

Returns one workspace, its ADR approval records, and sanitized persistence contract metadata.

## `POST /api/team/access`

Checks whether a user can perform `view`, `comment`, `create_adr`, `approve_adr`, or `admin` in a workspace.

## `POST /api/team/adr-approvals`

Creates an ADR approval record for a workspace.

## `POST /api/team/adr-approvals/:id/reply`

Records an ADR approval decision.

```json
{
  "userId": "bob",
  "decision": "approve",
  "note": "Risk and rollback notes are clear."
}
```

The response returns the updated approval with status `pending`, `approved`, `changes_requested`, or `rejected`.

## `GET /api/tools/manifests`

Returns sanitized MCP server and custom tool manifests from `quorummind.config.json`.

```json
{
  "tools": [
    {
      "name": "mcp:github",
      "kind": "mcp_server",
      "description": "Configured MCP server command: npx",
      "envKeys": ["GITHUB_TOKEN"]
    },
    {
      "name": "repo_diff_summary",
      "kind": "custom_tool",
      "description": "Summarize a supplied repo diff"
    }
  ]
}
```

Environment values, command args, and secrets are not returned.

## `POST /api/tools/read-only`

Executes a configured read-only custom tool through the same permission policy used by agent tools. The requesting `agentId` must have the tool listed under `agents.<agentId>.tools` in `quorummind.config.json`.

```json
{
  "runId": "run-tool-api",
  "agentId": "blueprint",
  "toolName": "repo_diff_summary",
  "input": {
    "diffText": "diff --git a/server/auth.ts b/server/auth.ts\n+++ b/server/auth.ts\n+token"
  }
}
```

Successful response:

```json
{
  "status": "executed",
  "permission": {
    "category": "read_only",
    "risk": "low",
    "decision": "auto"
  },
  "output": {
    "toolName": "repo_diff_summary",
    "changedFiles": ["server/auth.ts"],
    "diffSummary": "1 files changed",
    "riskRadar": []
  }
}
```

MCP server process execution is not enabled by this endpoint. MCP declarations are listed and audited as manifests; custom tool execution is currently limited to read-only repo-evidence summarization. Server-side code can use `server/tools/mcp-runtime.ts` to start a stdio MCP process, list tools, and call read-only tool names through the permission store. No public route starts arbitrary MCP commands.

## `GET /api/permissions/audit`

Returns the permission audit report used by the Workbench Permission Audit Center. The report includes counts, per-tool rationale, output handling notes, and a copyable Markdown approval package.

## `GET /api/permissions/lifecycle`

Returns approval lifecycle counts by tool and provider, including pending, approved, denied, revoked, and expired approvals.

```json
{
  "summary": {
    "total": 2,
    "pending": 1,
    "approved": 1,
    "denied": 0,
    "revoked": 1,
    "expired": 0
  },
  "byTool": [],
  "byProvider": []
}
```

## `POST /api/permissions/approvals/:id/reply`

Approves, always-approves, or rejects a pending permission gate.

```json
{
  "reply": "approve",
  "message": "Approved for this run."
}
```

`reply` must be `approve`, `always`, or `reject`. `always` stores a tool-scoped approval; `approve` stores a run-scoped approval; `reject` marks the approval denied.

## `POST /api/permissions/approvals/:id/revoke`

Revokes a saved approval while preserving the audit record.

```json
{
  "approval": {
    "id": "run:node:tool:createdAt",
    "status": "approved",
    "revokedAt": "2026-08-21T00:00:00.000Z"
  }
}
```

Consensus loop behavior: the graph validates each Blueprint consensus round in order. If the score is below the threshold and another round exists within `maxConsensusRounds`, it routes `validate_result -> revise_discussion -> critic_agent -> supervisor_agent -> validate_result`. It finalizes only after the threshold is reached or routes through `human_review_gate` when the round budget is exhausted.

Autonomous agent layer:

- `taskTree`: Planner Agent output. It decomposes the user goal into bounded tasks with owners, dependencies, tool names, and acceptance criteria.
- `toolPermissions`: Tool permission policy output. Each record includes `category`, `risk`, `decision`, and `reason`. Categories are `read_only`, `local_file_write`, `external_api_call`, `live_model_call`, `production_operation`, and `paid_operation`; decisions are `auto`, `requires_human`, or `blocked`.
- `executorActions`: Executor Agent output. It records which permitted tasks were executed, staged for human approval, or skipped.
- `criticReviews`: Critic Agent output. It checks task coverage, permission boundaries, consensus score, weak evaluations, and deferred critique adoption.
- `memoryEvents`: Memory Agent output. It records run/thread memory reads, summaries, checkpoint writes, knowledge injection evidence, preference summaries, project profile anchors, last-vs-current diff anchors, and failure-sample backlog hooks. SQLite persistence is used when configured.
- `supervisorDecisions`: Supervisor Agent output. It decides whether the graph should continue, pause for human review, or finalize, while preserving the existing validation gate as the final route authority.
- Live provider calls are also recorded in `toolPermissions` / `executorActions`. When the user explicitly selects live Blueprint mode, `quorummind_live_blueprint_provider_trace` is categorized as `live_model_call`, marked medium risk, and auto-approved for that run, still bounded by phase budget, timeout, provider trace, and schema gates.
- If the Planner detects destructive/external-write requests such as deployment, deletion, billing, or sending emails, the permission policy marks the tool `blocked`; `supervisorDecisions` then forces `validate_result` to route to `human_review_gate`.

Frontend integration: Blueprint mode exposes an experimental **Run Agent platform** action. The UI sends `blueprintRuntime`, `agentRuntime.threadId`, and `agentRuntime.maxConsensusRounds`, persists those runtime controls locally in the browser, then renders `checkpoint`, `runtimeLimits`, `liveModel`, `providerTrace`, `taskTree`, `toolPermissions`, `executorActions`, `criticReviews`, `memoryEvents`, `supervisorDecisions`, `consensusLoop`, `routeDecisions`, `terminationReason`, `toolCalls`, and node `trace` so users can see why the graph planned, executed, revised, finalized, called providers, fell back, or entered `human_review_gate`. `routeDecisions` are shown both as a compact route map and as a detailed list. When `summary.humanReviewRequired` is true, the UI can derive a Markdown review package from these response fields for team/model follow-up; this is a frontend packaging convenience, not a separate API field.

## Trace Entry Fields

Live trace entries include:

- `runId`: one id shared by all calls in a live run.
- `phase`: proposal, critique, revision, ranking, or verdict.
- `provider` and `model`: adapter identity.
- `attempt`, `maxAttempts`, `retryCount`, and `attempts`: retry metadata for transient provider, parse, or schema failures.
- `durationMs`: provider call latency.
- `jsonParsed`: whether JSON extraction succeeded.
- `validationStatus`: valid, repaired, invalid, or unparsed.
- `validationIssues`: bounded schema repair or rejection reasons.
- `failureClass`: provider_error, json_parse_error, or schema_validation_error.
- `normalized`: phase-specific schema-normalized payload when usable.

## Provider Output Contract

Proposal and revision payloads should include:

- `proposalId`
- `recommendation`
- `criteriaScores`
- `regretByScenario`
- `confidence`

Ranking payloads should include:

- `rankedProposalIds`
- `confidence`

Verdict payloads should include:

- `selectedProposalId`
- `finalRecommendation`
- `whyItWon`
- `remainingDissent`

Schema hardening clamps numeric ranges, fills neutral criteria defaults when repairable, and rejects payloads that lack essential identifiers or recommendations.

## Persistence Contract

By default, browser history remains localStorage-backed and the API reports:

```json
{ "mode": "browser_local", "configured": false, "saved": false }
```

When `QUORUMMIND_SQLITE_PATH` is set, `/api/decisions` stores a Decision Room snapshot, provider trace, prompt bundle, ADR Markdown, and any reputation feedback in SQLite. The response includes:

```json
{ "mode": "sqlite", "configured": true, "saved": true }
```

Persistence errors do not hide provider trace or deterministic fallback output; they are surfaced under `persistence.error`.

## Retry Policy

Live provider retry is explicit. The default is one attempt so real API usage does not increase unexpectedly. Internal callers can pass `retryPolicy.maxAttempts` to allow bounded retries. The implementation caps attempts at three and records every attempt in the final trace entry.
