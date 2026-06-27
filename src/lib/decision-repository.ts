import type { DecisionHistoryRecord } from "./decision-history";

export type DecisionRepository = {
  list(): DecisionHistoryRecord[];
  save(record: DecisionHistoryRecord): DecisionHistoryRecord[];
  findById(id: string): DecisionHistoryRecord | undefined;
  clear(): void;
};

export const defaultDecisionHistoryStorageKey = "quorummind.history.v1";

export function createLocalStorageDecisionRepository(
  storage: Storage = window.localStorage,
  options: { key?: string; limit?: number } = {}
): DecisionRepository {
  const key = options.key ?? defaultDecisionHistoryStorageKey;
  const limit = options.limit ?? 12;

  return {
    list() {
      const raw = storage.getItem(key);

      if (!raw) {
        return [];
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed.filter(isDecisionHistoryRecord) : [];
      } catch {
        return [];
      }
    },
    save(record) {
      const records = [
        record,
        ...this.list().filter((item) => item.id !== record.id)
      ].slice(0, limit);

      storage.setItem(key, JSON.stringify(records));
      return records;
    },
    findById(id) {
      return this.list().find((record) => record.id === id);
    },
    clear() {
      storage.removeItem(key);
    }
  };
}

function isDecisionHistoryRecord(value: unknown): value is DecisionHistoryRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Partial<DecisionHistoryRecord>;

  return (
    typeof record.id === "string" &&
    typeof record.question === "string" &&
    typeof record.createdAt === "string" &&
    (record.providerMode === "demo" || record.providerMode === "live") &&
    typeof record.recommendation === "string" &&
    typeof record.quorumScore === "number"
  );
}
