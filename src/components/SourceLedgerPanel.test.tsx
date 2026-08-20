import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceLedgerPanel } from "./SourceLedgerPanel";
import type { ContextSourceLedger } from "../lib/api-client";

const ledger: ContextSourceLedger = {
  schemaVersion: 1,
  contextHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  sourceCounts: {
    user_input: 1,
    structured_context: 1,
    knowledge_injection: 0,
    reputation_feedback: 2,
    provider_trace: 3,
    deterministic_fallback: 1
  },
  providerEvidence: {
    attempted: true,
    usableCalls: 2,
    failedCalls: 1
  },
  fallback: {
    used: false,
    reason: "none"
  },
  sources: [
    {
      id: "user_input:abc",
      sourceType: "user_input",
      label: "User question",
      summary: "Should we use shared tables?",
      hash: "abc"
    },
    {
      id: "provider_trace:def",
      sourceType: "provider_trace",
      label: "Provider trace evidence",
      summary: "openai proposal",
      hash: "def"
    }
  ]
};

describe("SourceLedgerPanel", () => {
  it("shows provenance, fallback, provider participation, hash, and evidence counts", () => {
    render(<SourceLedgerPanel locale="en" ledger={ledger} />);

    expect(screen.getByText("Source ledger")).toBeInTheDocument();
    expect(screen.getByText("Live providers participated")).toBeInTheDocument();
    expect(screen.getByText("No deterministic fallback")).toBeInTheDocument();
    expect(screen.getByText(/abcdef123456/)).toBeInTheDocument();
    expect(screen.getByText("reputation 2 · provider 3 · context 2")).toBeInTheDocument();
    expect(screen.getByText("Provider trace evidence")).toBeInTheDocument();
  });
});
