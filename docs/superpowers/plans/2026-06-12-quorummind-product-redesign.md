# QuorumMind Product Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the QuorumMind frontend into a polished technical command-center interface with user-controlled English and Chinese UI display.

**Architecture:** Keep the app as a single React page, but separate UI copy from layout through a local translation map in `src/App.tsx`. Preserve the existing deterministic workflow and tests, then expand UI coverage to verify language switching and the redesigned product sections.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, CSS.

---

## Tasks

### Task 1: Bilingual UI Test

**Files:**
- Modify: `src/App.test.tsx`

- [ ] Add a failing test that expects the default English command-center UI.
- [ ] Add a failing test that clicks the Chinese language toggle and expects Chinese labels.
- [ ] Run `npm test -- --run src/App.test.tsx` and confirm failure because the toggle and redesigned labels do not exist yet.

### Task 2: Product Redesign

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] Add locale state and a translation map.
- [ ] Redesign the layout into header, decision brief, final verdict, agent council, debate signal, risk radar, and ADR preview sections.
- [ ] Add language toggle buttons for English and Chinese.
- [ ] Localize static labels, action text, agent role labels, risk category labels, and context chips.
- [ ] Run `npm test -- --run src/App.test.tsx` and confirm pass.

### Task 3: Verification

**Files:**
- Modify: `README.md`

- [ ] Document the bilingual UI and product redesign.
- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Open `http://127.0.0.1:5173/` for review.
- [ ] Commit with `feat: redesign command center UI`.
