// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildContextCompactionEvents } from "./context-compressor";

describe("buildContextCompactionEvents", () => {
  it("creates start and complete event inputs with fill ratio and token counts", () => {
    const events = buildContextCompactionEvents({
      roundNumber: 2,
      fillRatio: 0.72,
      tokenCountBefore: 92160,
      tokenCountAfter: 18432
    });

    expect(events).toEqual([
      expect.objectContaining({
        type: "context_compaction_start",
        severity: "info",
        summary: expect.stringContaining("round 2")
      }),
      expect.objectContaining({
        type: "context_compaction_complete",
        severity: "info",
        summary: expect.stringContaining("92160 -> 18432")
      })
    ]);
  });
});
