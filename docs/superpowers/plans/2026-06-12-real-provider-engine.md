# Real Provider Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local API server that keeps model API keys on the server, supports demo fallback, and exposes a real-provider decision endpoint for the React UI.

**Architecture:** Keep the deterministic `src/lib` workflow as the no-key fallback. Add `server/` as a TypeScript Node service run by local `tsx`, with provider adapters for OpenAI, DeepSeek, and Gemini behind one `ModelProvider` interface. The React app calls `/api/decisions` through a Vite dev proxy and falls back to local demo behavior if the API is unavailable.

**Tech Stack:** React, TypeScript, Vite proxy, Node HTTP server, native `fetch`, Vitest, local `tsx`.

---

### Task 1: Provider Contract And Tests

**Files:**
- Create: `server/providers/types.ts`
- Create: `server/providers/prompt.ts`
- Create: `server/providers/openai.test.ts`
- Create: `server/providers/deepseek.test.ts`
- Create: `server/providers/gemini.test.ts`

- [ ] Write tests that inject fake `fetch` functions and verify each adapter sends API keys only from server env.
- [ ] Verify OpenAI uses `POST https://api.openai.com/v1/responses`.
- [ ] Verify DeepSeek uses `POST https://api.deepseek.com/chat/completions`.
- [ ] Verify Gemini uses `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=...`.

### Task 2: Provider Adapters

**Files:**
- Create: `server/providers/openai.ts`
- Create: `server/providers/deepseek.ts`
- Create: `server/providers/gemini.ts`
- Create: `server/providers/index.ts`

- [ ] Implement adapters with a shared `generateDecisionText` method.
- [ ] Add JSON extraction helper for model responses.
- [ ] Return plain text when provider output is not valid JSON, so later orchestration can still show diagnostics.

### Task 3: Decision API

**Files:**
- Create: `server/decision-api.ts`
- Create: `server/index.ts`
- Modify: `vite.config.ts`

- [ ] Add `POST /api/decisions`.
- [ ] Validate `question` and `context`.
- [ ] Use demo workflow when `QUORUMMIND_PROVIDER_MODE=demo` or no model keys are configured.
- [ ] Return a stable JSON payload matching the current frontend result shape.
- [ ] Proxy `/api` from Vite to `http://127.0.0.1:8787`.

### Task 4: Frontend API Client

**Files:**
- Create: `src/lib/api-client.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] Add `requestDecisionRoom`.
- [ ] Change the Run button to call the API asynchronously.
- [ ] Show loading and error states.
- [ ] Keep local demo fallback when the API call fails during portfolio demos.

### Task 5: Scripts And Docs

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] Add `server`, `dev:web`, and combined `dev` scripts.
- [ ] Document local provider keys and demo fallback.
- [ ] Confirm `.env.local` remains ignored.

### Task 6: Verification

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Start `npm run server` and POST a smoke request to `/api/decisions`.
- [ ] Start `npm run dev` and verify the frontend can run through the API path.
