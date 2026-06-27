import { describe, expect, it } from "vitest";
import { decisionHistoryStorageKey, type DecisionHistoryRecord } from "./decision-history";
import { createLocalStorageDecisionRepository } from "./decision-repository";

function createStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  };
}

function record(id: string, quorumScore = 80): DecisionHistoryRecord {
  return {
    id,
    question: `Question ${id}`,
    createdAt: `2026-06-15T00:00:${id.padStart(2, "0")}.000Z`,
    providerMode: "demo",
    recommendation: `Recommendation ${id}`,
    quorumScore
  };
}

describe("localStorage decision repository", () => {
  it("saves records newest first and enforces a retention limit", () => {
    const repository = createLocalStorageDecisionRepository(createStorage(), { limit: 3 });

    repository.save(record("1"));
    repository.save(record("2"));
    repository.save(record("3"));
    repository.save(record("4"));

    expect(repository.list().map((item) => item.id)).toEqual(["4", "3", "2"]);
  });

  it("replaces records with the same id", () => {
    const repository = createLocalStorageDecisionRepository(createStorage(), { limit: 3 });

    repository.save(record("1", 70));
    repository.save(record("1", 91));

    expect(repository.list()).toHaveLength(1);
    expect(repository.findById("1")?.quorumScore).toBe(91);
  });

  it("returns an empty list for corrupted storage", () => {
    const repository = createLocalStorageDecisionRepository(
      createStorage({ [decisionHistoryStorageKey]: "{not-json" })
    );

    expect(repository.list()).toEqual([]);
  });

  it("clears persisted decision records", () => {
    const storage = createStorage();
    const repository = createLocalStorageDecisionRepository(storage);

    repository.save(record("1"));
    repository.clear();

    expect(repository.list()).toEqual([]);
    expect(storage.getItem(decisionHistoryStorageKey)).toBeNull();
  });
});
