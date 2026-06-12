# QuorumMind MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable QuorumMind MVP that demonstrates a multi-agent architecture decision room with deterministic expert agents, consensus scoring, risk analysis, and ADR generation.

**Architecture:** Use a Vite + React + TypeScript single-page app for the portfolio demo. Keep decision logic in pure TypeScript modules so scoring, ADR generation, and workflow orchestration can be tested without the browser. Real LLM providers are out of scope for this first runnable version; mock role agents make the demo reliable and keep API keys unnecessary.

**Tech Stack:** Vite, React, TypeScript, Vitest, Testing Library, CSS.

---

## Tasks

- [ ] Bootstrap Vite, React, TypeScript, Vitest, and Testing Library.
- [ ] Add tested consensus scoring functions.
- [ ] Add tested ADR Markdown generation.
- [ ] Add tested deterministic expert-agent workflow.
- [ ] Add tested React portfolio UI.
- [ ] Add README, run all tests, build, and commit.

## Intentional v0.1 Omissions

- Real OpenAI, Gemini, and DeepSeek API calls are deferred. The first runnable portfolio version uses deterministic role agents so the app works without API keys.
- PostgreSQL persistence is deferred. The first version runs locally in browser memory.
- GitHub PR review, PDF export, team collaboration, and dynamic reputation scoring remain future work.
