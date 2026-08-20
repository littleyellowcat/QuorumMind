import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DecisionApiResponse, DecisionRoomResult } from "../../src/lib/api-client";
import type { DecisionMode } from "../../src/lib/domain";
import type { ManualProviderBundle } from "../../src/lib/manual-provider";
import type { ModelReputationFeedback } from "../../src/lib/model-reputation";

export type PersistedDecisionRoomSummary = {
  id: string;
  question: string;
  locale: "en" | "zh";
  mode: DecisionMode;
  providerMode: "demo" | "live";
  selectedProposalId: string;
  recommendation: string;
  quorumScore: number;
  dissentIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type PersistedDecisionRoomSnapshot = PersistedDecisionRoomSummary & {
  providerTrace: DecisionApiResponse["providerTrace"];
  contextLedger?: DecisionApiResponse["contextLedger"];
  liveVerdict: DecisionApiResponse["liveVerdict"];
  promptBundle: ManualProviderBundle;
  result: DecisionRoomResult;
  adrMarkdown: string;
};

export type SaveDecisionRoomInput = Omit<PersistedDecisionRoomSnapshot, "updatedAt" | "adrMarkdown"> & {
  updatedAt?: string;
};

export type SqliteDecisionRepository = {
  saveDecisionRoom(input: SaveDecisionRoomInput): void;
  listDecisionRooms(limit?: number): PersistedDecisionRoomSummary[];
  findDecisionRoom(id: string): PersistedDecisionRoomSnapshot | undefined;
  saveReputationFeedback(records: ModelReputationFeedback[], roomId?: string): void;
  listReputationFeedback(limit?: number): ModelReputationFeedback[];
  close(): void;
};

export function createSqliteDecisionRepository(options: { databasePath: string }): SqliteDecisionRepository {
  if (options.databasePath !== ":memory:") {
    mkdirSync(dirname(options.databasePath), { recursive: true });
  }

  const db = new DatabaseSync(options.databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(new URL("./sqlite-schema.sql", import.meta.url), "utf8"));
  ensureDecisionTraceColumns(db);

  return {
    saveDecisionRoom(input) {
      const updatedAt = input.updatedAt ?? input.createdAt;

      db.exec("BEGIN IMMEDIATE");

      try {
        db.prepare(
          `INSERT OR REPLACE INTO decision_rooms (
            id,
            question,
            locale,
            mode,
            provider_mode,
            selected_proposal_id,
            recommendation,
            quorum_score,
            dissent_index,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          input.id,
          input.question,
          input.locale,
          input.mode,
          input.providerMode,
          input.selectedProposalId,
          input.recommendation,
          input.quorumScore,
          input.dissentIndex,
          input.createdAt,
          updatedAt
        );
        db.prepare(
          `INSERT OR REPLACE INTO decision_traces (
            room_id,
            result_json,
            provider_trace_json,
            context_ledger_json,
            live_verdict_json,
            prompt_bundle_json,
            adr_markdown,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          input.id,
          JSON.stringify(input.result),
          JSON.stringify(input.providerTrace),
          input.contextLedger ? JSON.stringify(input.contextLedger) : null,
          input.liveVerdict ? JSON.stringify(input.liveVerdict) : null,
          JSON.stringify(input.promptBundle),
          input.result.verdict.adrMarkdown,
          input.createdAt
        );

        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    listDecisionRooms(limit = 12) {
      return db
        .prepare(
          `SELECT
            id,
            question,
            locale,
            mode,
            provider_mode,
            selected_proposal_id,
            recommendation,
            quorum_score,
            dissent_index,
            created_at,
            updated_at
          FROM decision_rooms
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .all(limit)
        .map(toDecisionRoomSummary);
    },

    findDecisionRoom(id) {
      const row = db
        .prepare(
          `SELECT
            r.id,
            r.question,
            r.locale,
            r.mode,
            r.provider_mode,
            r.selected_proposal_id,
            r.recommendation,
            r.quorum_score,
            r.dissent_index,
            r.created_at,
            r.updated_at,
            t.result_json,
            t.provider_trace_json,
            t.context_ledger_json,
            t.live_verdict_json,
            t.prompt_bundle_json,
            t.adr_markdown
          FROM decision_rooms r
          INNER JOIN decision_traces t ON t.room_id = r.id
          WHERE r.id = ?`
        )
        .get(id);

      if (!row) {
        return undefined;
      }

      return {
        ...toDecisionRoomSummary(row),
        providerTrace: parseJson<DecisionApiResponse["providerTrace"]>(row.provider_trace_json, []),
        contextLedger: row.context_ledger_json
          ? parseJson<DecisionApiResponse["contextLedger"]>(row.context_ledger_json, undefined)
          : undefined,
        liveVerdict: row.live_verdict_json
          ? parseJson<DecisionApiResponse["liveVerdict"]>(row.live_verdict_json, null)
          : null,
        promptBundle: parseJson<ManualProviderBundle>(row.prompt_bundle_json),
        result: parseJson<DecisionRoomResult>(row.result_json),
        adrMarkdown: stringField(row.adr_markdown)
      };
    },

    saveReputationFeedback(records, roomId = undefined) {
      const insert = db.prepare(
        `INSERT INTO reputation_feedback (
          room_id,
          agent_id,
          domain,
          outcome,
          confidence,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      );

      db.exec("BEGIN IMMEDIATE");

      try {
        for (const record of records) {
          insert.run(
            roomId ?? null,
            record.agentId,
            record.domain,
            record.outcome,
            typeof record.confidence === "number" ? record.confidence : null,
            record.createdAt
          );
        }

        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    listReputationFeedback(limit = 60) {
      return db
        .prepare(
          `SELECT agent_id, domain, outcome, confidence, created_at
          FROM reputation_feedback
          ORDER BY created_at DESC, id DESC
          LIMIT ?`
        )
        .all(limit)
        .map(toReputationFeedback);
    },

    close() {
      db.close();
    }
  };
}

function ensureDecisionTraceColumns(db: DatabaseSync): void {
  const columns = new Set(
    db
      .prepare("PRAGMA table_info(decision_traces)")
      .all()
      .map((row) => stringField((row as Record<string, unknown>).name))
  );

  if (!columns.has("context_ledger_json")) {
    db.exec("ALTER TABLE decision_traces ADD COLUMN context_ledger_json TEXT");
  }
}

function toDecisionRoomSummary(row: Record<string, unknown>): PersistedDecisionRoomSummary {
  return {
    id: stringField(row.id),
    question: stringField(row.question),
    locale: stringField(row.locale) === "zh" ? "zh" : "en",
    mode: toDecisionMode(row.mode),
    providerMode: stringField(row.provider_mode) === "live" ? "live" : "demo",
    selectedProposalId: stringField(row.selected_proposal_id),
    recommendation: stringField(row.recommendation),
    quorumScore: numberField(row.quorum_score),
    dissentIndex: numberField(row.dissent_index),
    createdAt: stringField(row.created_at),
    updatedAt: stringField(row.updated_at)
  };
}

function toReputationFeedback(row: Record<string, unknown>): ModelReputationFeedback {
  return {
    agentId: toAgentId(row.agent_id),
    domain: toDecisionDomain(row.domain),
    outcome: toOutcome(row.outcome),
    confidence: typeof row.confidence === "number" ? row.confidence : undefined,
    createdAt: stringField(row.created_at)
  };
}

function parseJson<T>(value: unknown, fallback?: T): T {
  if (typeof value !== "string") {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error("Expected SQLite JSON field to be a string.");
  }

  return JSON.parse(value) as T;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0;
}

function toDecisionMode(value: unknown): DecisionMode {
  return value === "fast" || value === "red_team" ? value : "deep";
}

function toAgentId(value: unknown): ModelReputationFeedback["agentId"] {
  return value === "deepseek" || value === "gemini" ? value : "gpt";
}

function toDecisionDomain(value: unknown): ModelReputationFeedback["domain"] {
  if (
    value === "technical_architecture" ||
    value === "product_strategy" ||
    value === "career_strategy" ||
    value === "portfolio_packaging"
  ) {
    return value;
  }

  return "technical_architecture";
}

function toOutcome(value: unknown): ModelReputationFeedback["outcome"] {
  if (value === "helpful" || value === "neutral" || value === "unhelpful") {
    return value;
  }

  return "neutral";
}
