# Persistence Strategy

QuorumMind is local-first by default and can persist server-side audit snapshots with SQLite.

The browser stores decision history and model-reputation feedback in `localStorage` so the demo runs without setup, API keys, Docker volumes, or a database server. When `QUORUMMIND_SQLITE_PATH` is set, the local API also writes full Decision Room snapshots and reputation feedback to SQLite.

## Current Stores

| Store | Key | Owner | Purpose |
| --- | --- | --- | --- |
| Decision history | `quorummind.history.v1` | `src/lib/decision-repository.ts` | Restorable Decision Room snapshots, result, trace, prompt bundle, live verdict |
| Reputation feedback | `quorummind.reputation-feedback.v1` | `src/lib/reputation-feedback.ts` | User ratings that calibrate model-domain reputation on later runs |
| Server audit store | `QUORUMMIND_SQLITE_PATH` | `server/persistence/sqlite-repository.ts` | SQLite snapshots for Decision Rooms, provider traces, ADR output, and reputation feedback |

Both stores validate records while reading. Corrupted JSON or unknown record shapes are ignored instead of crashing the workspace.

## Feedback Loop

1. User runs a Decision Room.
2. User marks the verdict as helpful or needing work.
3. QuorumMind creates one feedback signal per configured GPT/DeepSeek/Gemini seat.
4. Feedback is saved locally and passed to `/api/decisions` on the next run.
5. `applyModelReputation` recalibrates each seat's effective weight for the inferred domain.
6. The updated reputation rationale is shown in the Agent lineup and included in provider prompts.

This creates a visible learning loop while keeping the MVP auditable: feedback affects bounded score deltas, not hidden model fine-tuning.

## SQLite Runtime

The SQLite schema is documented in `server/persistence/sqlite-schema.sql` and implemented by `server/persistence/sqlite-repository.ts`.

Table responsibilities:

- `decision_rooms`: one row per saved room, optimized for history lists.
- `decision_traces`: full trace and export payloads for reopening a room.
- `reputation_feedback`: append-only user feedback signals for model-domain calibration.

Local development can opt in with:

```bash
QUORUMMIND_SQLITE_PATH=.quorummind/quorummind.db npm run dev
```

Docker enables SQLite by default at `/data/quorummind.db` and maps `/data` to the `quorummind-data` named volume.

SQLite is a strong portfolio default because it keeps setup simple while enabling server-side history, cross-browser persistence, and richer analytics. Postgres can use the same conceptual schema when multi-user auth is introduced.

## Migration Plan

1. Keep `DecisionRepository` as the UI-facing contract.
2. Add server routes for listing and reopening persisted SQLite rooms.
3. Let the browser choose between localStorage history and server-backed history.
4. Add pagination/search for longer room histories.
5. Move to Postgres when shared team accounts require concurrent multi-user access.

The important boundary is already present: React should ask a repository for records, not know whether records live in localStorage, SQLite, or Postgres.
