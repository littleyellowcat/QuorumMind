#!/usr/bin/env tsx
/**
 * QuorumMind Garbage Collector Agent
 *
 * Runs periodic cleanup to combat system entropy:
 * 1. Archive old decision summaries
 * 2. Clean expired LangGraph checkpoints
 * 3. Rotate pressure logs
 * 4. Decay old reputation feedback
 *
 * Usage: npm run gc  (or: npx tsx server/garbage-collector.ts)
 */

import { readdirSync, renameSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = process.env.QUORUMMIND_DATA_DIR ?? join(process.env.HOME ?? "~", ".quorummind");
const DECISIONS_DIR = join(DATA_DIR, "decisions");
const ARCHIVE_DIR = join(DECISIONS_DIR, "archive");
const DECISION_MAX_AGE_DAYS = 90;
const DECISION_DELETE_DAYS = 180;
const CHECKPOINT_TTL_DAYS = 7;
const MAX_PRESSURE_ROWS = 1000;
const FEEDBACK_DECAY_DAYS = 60;
const FEEDBACK_DELETE_DAYS = 120;

const results: string[] = [];

function now(): number { return Date.now(); }
function daysAgo(days: number): number { return now() - days * 86400000; }

// ── 1. Decision archiving ────────────────────────────────

function cleanDecisions(): void {
  if (!existsSync(DECISIONS_DIR)) return;

  mkdirSync(ARCHIVE_DIR, { recursive: true });
  let archived = 0, deleted = 0;

  for (const file of readdirSync(DECISIONS_DIR)) {
    if (!file.endsWith(".md")) continue;
    const path = join(DECISIONS_DIR, file);
    const match = file.match(/^(\d{4}-\d{2}-\d{2})-/);
    if (!match) continue;

    const fileDate = new Date(match[1]).getTime();
    const age = now() - fileDate;

    if (age > DECISION_DELETE_DAYS * 86400000) {
      unlinkSync(path);
      deleted++;
    } else if (age > DECISION_MAX_AGE_DAYS * 86400000) {
      renameSync(path, join(ARCHIVE_DIR, file));
      archived++;
    }
  }

  if (archived > 0) results.push(`archived ${archived} decisions`);
  if (deleted > 0) results.push(`deleted ${deleted} decisions`);
}

// ── 2. Checkpoint cleanup ────────────────────────────────

function cleanCheckpoints(): void {
  const dbPath = process.env.QUORUMMIND_SQLITE_PATH;
  if (!dbPath || !existsSync(dbPath)) return;

  const db = new DatabaseSync(dbPath);
  const cutoff = new Date(daysAgo(CHECKPOINT_TTL_DAYS)).toISOString();
  const result = db.prepare(
    "DELETE FROM langgraph_checkpoints WHERE created_at < ?"
  ).run(cutoff);

  if (result.changes > 0) results.push(`cleaned ${result.changes} checkpoints`);
  db.close();
}

// ── 3. Pressure log rotation ─────────────────────────────

function rotatePressureLogs(): void {
  const dbPath = process.env.QUORUMMIND_SQLITE_PATH;
  if (!dbPath || !existsSync(dbPath)) return;

  const db = new DatabaseSync(dbPath);
  const count = (db.prepare("SELECT COUNT(*) as c FROM pressure_log").get() as { c: number })?.c ?? 0;

  if (count > MAX_PRESSURE_ROWS) {
    const result = db.prepare(
      `DELETE FROM pressure_log WHERE id NOT IN (
        SELECT id FROM pressure_log ORDER BY id DESC LIMIT ?
      )`
    ).run(MAX_PRESSURE_ROWS);
    if (result.changes > 0) results.push(`rotated ${result.changes} pressure logs`);
  }
  db.close();
}

// ── 4. Reputation feedback decay ─────────────────────────

function decayFeedback(): void {
  const dbPath = process.env.QUORUMMIND_SQLITE_PATH;
  if (!dbPath || !existsSync(dbPath)) return;

  const db = new DatabaseSync(dbPath);
  const decayCutoff = new Date(daysAgo(FEEDBACK_DECAY_DAYS)).toISOString();
  const deleteCutoff = new Date(daysAgo(FEEDBACK_DELETE_DAYS)).toISOString();

  const deleted = db.prepare(
    "DELETE FROM reputation_feedback WHERE created_at < ?"
  ).run(deleteCutoff);

  const decayed = db.prepare(
    "UPDATE reputation_feedback SET confidence = confidence * 0.5 WHERE created_at < ?"
  ).run(decayCutoff);

  if (deleted.changes > 0) results.push(`deleted ${deleted.changes} old feedbacks`);
  if (decayed.changes > 0) results.push(`decayed ${decayed.changes} feedbacks`);
  db.close();
}

// ── Main ─────────────────────────────────────────────────

cleanDecisions();
cleanCheckpoints();
rotatePressureLogs();
decayFeedback();

const report = results.length > 0
  ? `[gc] ${results.join(", ")}`
  : "[gc] nothing to clean — system is healthy";

console.log(report);
