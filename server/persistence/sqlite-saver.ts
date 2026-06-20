import { DatabaseSync } from "node:sqlite";
import {
  BaseCheckpointSaver,
  copyCheckpoint,
  getCheckpointId
} from "@langchain/langgraph-checkpoint";
import type {
  Checkpoint,
  CheckpointListOptions,
  CheckpointMetadata,
  CheckpointPendingWrite,
  CheckpointTuple,
  PendingWrite
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  checkpoint_data TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_thread ON langgraph_checkpoints(thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS langgraph_writes (
  thread_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  value_json TEXT NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_id, task_id, idx)
);
`;

function ensureSchema(db: DatabaseSync): void {
  db.exec(SCHEMA_SQL);
}

class SqliteSaver extends BaseCheckpointSaver {
  #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    super();
    ensureSchema(db);
    this.#db = db;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id;
    const checkpointId = getCheckpointId(config);

    if (!threadId) return undefined;

    let row: Record<string, unknown> | undefined;

    if (checkpointId) {
      row = this.#db
        .prepare(
          `SELECT checkpoint_data, metadata_json, parent_checkpoint_id
           FROM langgraph_checkpoints
           WHERE thread_id = ? AND checkpoint_id = ?`
        )
        .get(threadId, checkpointId) as Record<string, unknown> | undefined;
    } else {
      row = this.#db
        .prepare(
          `SELECT checkpoint_data, metadata_json, parent_checkpoint_id
           FROM langgraph_checkpoints
           WHERE thread_id = ?
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(threadId) as Record<string, unknown> | undefined;
    }

    if (!row) return undefined;

    const resolvedCheckpointId =
      checkpointId || (row as Record<string, string>).checkpoint_id || undefined;

    const pendingWrites = this.#loadPendingWrites(threadId, resolvedCheckpointId);

    const tuple: CheckpointTuple = {
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_id: resolvedCheckpointId
        }
      },
      checkpoint: JSON.parse(row.checkpoint_data as string) as Checkpoint,
      metadata: JSON.parse(row.metadata_json as string) as CheckpointMetadata,
      pendingWrites: await pendingWrites
    };

    const parentId = row.parent_checkpoint_id as string | undefined;
    if (parentId) {
      tuple.parentConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_id: parentId
        }
      };
    }

    return tuple;
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      throw new Error(
        "Failed to put checkpoint. The passed RunnableConfig is missing a required " +
        '"thread_id" field in its "configurable" property.'
      );
    }

    const preparedCheckpoint = copyCheckpoint(checkpoint);
    const parentCheckpointId = config.configurable?.checkpoint_id ?? null;

    this.#db
      .prepare(
        `INSERT OR REPLACE INTO langgraph_checkpoints
         (thread_id, checkpoint_id, parent_checkpoint_id, checkpoint_data, metadata_json)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        threadId,
        preparedCheckpoint.id,
        parentCheckpointId,
        JSON.stringify(preparedCheckpoint),
        JSON.stringify(metadata)
      );

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_id: preparedCheckpoint.id
      }
    };
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) return;

    const limit = options?.limit;
    const beforeId = options?.before?.configurable?.checkpoint_id;

    let sql = `SELECT checkpoint_data, metadata_json, parent_checkpoint_id, checkpoint_id
               FROM langgraph_checkpoints
               WHERE thread_id = ?`;
    const params: unknown[] = [threadId];

    if (beforeId) {
      sql += ` AND created_at < (SELECT created_at FROM langgraph_checkpoints WHERE thread_id = ? AND checkpoint_id = ?)`;
      params.push(threadId, beforeId);
    }

    sql += ` ORDER BY created_at DESC`;

    if (limit !== undefined) {
      sql += ` LIMIT ?`;
      params.push(limit);
    }

    const rows = this.#db.prepare(sql).all(...params) as Record<string, unknown>[];

    for (const row of rows) {
      const cpId = row.checkpoint_id as string;

      const tuple: CheckpointTuple = {
        config: {
          configurable: {
            thread_id: threadId,
            checkpoint_id: cpId
          }
        },
        checkpoint: JSON.parse(row.checkpoint_data as string) as Checkpoint,
        metadata: JSON.parse(row.metadata_json as string) as CheckpointMetadata,
        pendingWrites: await this.#loadPendingWrites(threadId, cpId)
      };

      const parentId = row.parent_checkpoint_id as string | undefined;
      if (parentId) {
        tuple.parentConfig = {
          configurable: {
            thread_id: threadId,
            checkpoint_id: parentId
          }
        };
      }

      yield tuple;
    }
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    const threadId = config.configurable?.thread_id;
    const checkpointId = config.configurable?.checkpoint_id;

    if (!threadId) {
      throw new Error(
        "Failed to put writes. The passed RunnableConfig is missing a required " +
        '"thread_id" field in its "configurable" property.'
      );
    }
    if (!checkpointId) {
      throw new Error(
        "Failed to put writes. The passed RunnableConfig is missing a required " +
        '"checkpoint_id" field in its "configurable" property.'
      );
    }

    const insert = this.#db.prepare(
      `INSERT OR REPLACE INTO langgraph_writes
       (thread_id, checkpoint_id, task_id, idx, channel, value_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (let idx = 0; idx < writes.length; idx++) {
      const [channel, value] = writes[idx];
      insert.run(threadId, checkpointId, taskId, idx, channel, JSON.stringify(value));
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    this.#db.prepare("DELETE FROM langgraph_checkpoints WHERE thread_id = ?").run(threadId);
    this.#db.prepare("DELETE FROM langgraph_writes WHERE thread_id = ?").run(threadId);
  }

  async #loadPendingWrites(
    threadId: string,
    checkpointId: string | undefined
  ): Promise<CheckpointPendingWrite[]> {
    if (!checkpointId) return [];

    const rows = this.#db
      .prepare(
        `SELECT task_id, channel, value_json
         FROM langgraph_writes
         WHERE thread_id = ? AND checkpoint_id = ?
         ORDER BY task_id, idx`
      )
      .all(threadId, checkpointId) as Record<string, unknown>[];

    return rows.map((row) => [
      row.task_id as string,
      row.channel as string,
      JSON.parse(row.value_json as string)
    ] as CheckpointPendingWrite);
  }
}

export function createSqliteSaver(db: DatabaseSync): BaseCheckpointSaver {
  return new SqliteSaver(db);
}
