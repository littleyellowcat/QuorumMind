import { describe, expect, it } from "vitest";
import { defaultManualProviderAgents } from "./manual-provider";
import {
  addModelReputationFeedback,
  createModelReputationFeedbackForAgents,
  readModelReputationFeedback,
  reputationFeedbackStorageKey
} from "./reputation-feedback";

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

describe("model reputation feedback storage", () => {
  it("saves feedback newest first and enforces a retention limit", () => {
    const storage = createStorage();

    addModelReputationFeedback(
      [
        {
          agentId: "gpt",
          domain: "technical_architecture",
          outcome: "helpful",
          confidence: 1,
          createdAt: "2026-06-15T00:00:00.000Z"
        }
      ],
      storage,
      { limit: 2 }
    );
    addModelReputationFeedback(
      [
        {
          agentId: "deepseek",
          domain: "technical_architecture",
          outcome: "unhelpful",
          confidence: 0.7,
          createdAt: "2026-06-15T00:01:00.000Z"
        },
        {
          agentId: "gemini",
          domain: "product_strategy",
          outcome: "neutral",
          confidence: 0.5,
          createdAt: "2026-06-15T00:02:00.000Z"
        }
      ],
      storage,
      { limit: 2 }
    );

    expect(readModelReputationFeedback(storage).map((record) => record.agentId)).toEqual(["deepseek", "gemini"]);
  });

  it("ignores corrupted and invalid records", () => {
    const storage = createStorage({
      [reputationFeedbackStorageKey]: JSON.stringify([
        {
          agentId: "gpt",
          domain: "technical_architecture",
          outcome: "helpful",
          confidence: 1,
          createdAt: "2026-06-15T00:00:00.000Z"
        },
        {
          agentId: "claude",
          domain: "technical_architecture",
          outcome: "helpful",
          createdAt: "2026-06-15T00:00:00.000Z"
        }
      ])
    });

    expect(readModelReputationFeedback(storage)).toHaveLength(1);
    expect(readModelReputationFeedback(createStorage({ [reputationFeedbackStorageKey]: "{not-json" }))).toEqual([]);
  });

  it("creates one feedback signal for every configured agent seat", () => {
    const records = createModelReputationFeedbackForAgents(
      defaultManualProviderAgents,
      "technical_architecture",
      "helpful",
      "2026-06-15T00:00:00.000Z"
    );

    expect(records).toEqual([
      {
        agentId: "gpt",
        domain: "technical_architecture",
        outcome: "helpful",
        confidence: 1,
        createdAt: "2026-06-15T00:00:00.000Z"
      },
      {
        agentId: "deepseek",
        domain: "technical_architecture",
        outcome: "helpful",
        confidence: 1,
        createdAt: "2026-06-15T00:00:00.000Z"
      },
      {
        agentId: "gemini",
        domain: "technical_architecture",
        outcome: "helpful",
        confidence: 1,
        createdAt: "2026-06-15T00:00:00.000Z"
      }
    ]);
  });
});
