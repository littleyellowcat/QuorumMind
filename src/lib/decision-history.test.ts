import { describe, expect, it } from "vitest";
import { addDecisionHistoryRecord, hasBlueprintHistorySnapshot, hasDecisionHistorySnapshot, readDecisionHistoryRecords } from "./decision-history";
import { runBlueprintRoom } from "./blueprint";
import { createManualProviderBundle } from "./manual-provider";
import { runDecisionRoom } from "./workflow";

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

describe("decision history", () => {
  it("stores newest decision records first and keeps the latest twelve", () => {
    const storage = createStorage();

    for (let index = 0; index < 14; index += 1) {
      addDecisionHistoryRecord(
        {
          id: `room-${index}`,
          question: `Question ${index}`,
          createdAt: `2026-06-12T00:${String(index).padStart(2, "0")}:00.000Z`,
          providerMode: "demo",
          recommendation: `Recommendation ${index}`,
          quorumScore: index
        },
        storage
      );
    }

    const records = readDecisionHistoryRecords(storage);

    expect(records).toHaveLength(12);
    expect(records[0].id).toBe("room-13");
    expect(records.at(-1)?.id).toBe("room-2");
  });

  it("returns an empty list when stored history is invalid", () => {
    const storage = createStorage({ "quorummind.history.v1": "not-json" });

    expect(readDecisionHistoryRecords(storage)).toEqual([]);
  });

  it("preserves a restorable decision room snapshot", () => {
    const storage = createStorage();
    const result = runDecisionRoom({
      question: "Should we use shared tables?",
      mode: "deep",
      context: {
        productStage: "mvp",
        expectedScale: "50 tenants",
        teamProfile: "Small full-stack team",
        budgetSensitivity: "high",
        reliabilityRequirement: "medium",
        securityRequirement: "high",
        existingConstraints: ["Use PostgreSQL"],
        candidateOptions: ["Shared tables", "Schema per tenant"],
        assumptions: ["No strict compliance need at launch"]
      }
    });
    const promptBundle = createManualProviderBundle({
      question: "Should we use shared tables?",
      locale: "en",
      context: result.context
    });

    addDecisionHistoryRecord(
      {
        id: "room-snapshot",
        question: "Should we use shared tables?",
        createdAt: "2026-06-12T00:00:00.000Z",
        providerMode: "live",
        recommendation: "Use shared tables.",
        quorumScore: 88,
        providerTrace: [
          {
            id: "proposal-openai-0",
            provider: "openai",
            model: "gpt-4o-mini",
            phase: "proposal",
            status: "ok",
            text: "{}",
            durationMs: 12,
            jsonParsed: true
          }
        ],
        liveVerdict: null,
        promptBundle,
        result
      },
      storage
    );

    const [record] = readDecisionHistoryRecords(storage);

    expect(record.result?.roomId).toBe("demo-room");
    expect(record.providerTrace?.[0].durationMs).toBe(12);
    expect(record.promptBundle?.prompts.length).toBeGreaterThan(0);
    expect(hasDecisionHistorySnapshot(record)).toBe(true);
  });

  it("preserves a restorable blueprint snapshot", () => {
    const storage = createStorage();
    const context = {
      productStage: "mvp" as const,
      expectedScale: "3 pilot novels",
      teamProfile: "Small full-stack team",
      budgetSensitivity: "medium" as const,
      reliabilityRequirement: "medium" as const,
      securityRequirement: "medium" as const,
      existingConstraints: ["Chinese output"],
      candidateOptions: ["LangGraph", "LangChain"],
      assumptions: ["Start with structured artifacts"]
    };
    const blueprintResult = runBlueprintRoom({
      question: "我想做一个视觉类游戏，用多 agent 拆解小说文本。",
      mode: "deep",
      locale: "zh",
      context
    });
    const promptBundle = createManualProviderBundle({
      question: "我想做一个视觉类游戏，用多 agent 拆解小说文本。",
      locale: "zh",
      context
    });

    addDecisionHistoryRecord(
      {
        id: "blueprint-snapshot",
        kind: "blueprint",
        question: "我想做一个视觉类游戏，用多 agent 拆解小说文本。",
        createdAt: "2026-06-20T00:00:00.000Z",
        providerMode: "demo",
        recommendation: blueprintResult.finalSpec.executiveSummary,
        quorumScore: blueprintResult.finalConsensusScore,
        providerTrace: [],
        promptBundle,
        blueprintResult,
        blueprintExecution: {
          requested: "deterministic",
          actual: "deterministic",
          liveTraceRequired: false,
          liveTraceAttempted: false,
          liveTraceUsable: false,
          providerCalls: 0,
          usableCalls: 0,
          fallbackReason: "deterministic_mode"
        }
      },
      storage
    );

    const [record] = readDecisionHistoryRecords(storage);

    expect(record.kind).toBe("blueprint");
    expect(record.blueprintResult?.finalSpec.title).toContain("视觉小说");
    expect(hasBlueprintHistorySnapshot(record)).toBe(true);
    expect(hasDecisionHistorySnapshot(record)).toBe(false);
  });
});
