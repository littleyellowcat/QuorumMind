import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { DecisionApiResponse } from "./lib/api-client";
import { createManualProviderBundle, defaultManualProviderAgents } from "./lib/manual-provider";
import { contextForQuestion, defaultQuestions } from "./lib/question-context";
import { runDecisionRoom } from "./lib/workflow";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("QuorumMind app integration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the initial state", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /Enter workbench/i })).toBeInTheDocument();
  });

  it("switches locale to Chinese", async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "中文" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /进入工作台/i }));
    });

    expect(screen.getByRole("button", { name: /运行决策室/i })).toBeInTheDocument();
  });

  it("runs decision and shows results", async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enter workbench/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Run decision room/i }));
      await new Promise(r => setTimeout(r, 100));
    });

    expect(screen.getByText(/Architecture Decision Record/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Agent Council/i).length).toBeGreaterThanOrEqual(1);
  });

  it("keeps decision progress moving while the backend request is pending", async () => {
    vi.useFakeTimers();

    const question = defaultQuestions.en;
    const context = contextForQuestion(question);
    const result = runDecisionRoom({ question, mode: "deep", context });
    const responseBody: DecisionApiResponse = {
      providerMode: "demo",
      persistence: { mode: "browser_local", configured: true, saved: true },
      providerStatus: {},
      providerTrace: [],
      liveVerdict: null,
      promptBundle: createManualProviderBundle({
        question,
        locale: "en",
        context,
        agents: defaultManualProviderAgents
      }),
      result
    };
    let resolveDecision: ((value: Response) => void) | undefined;
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      const path = typeof url === "string" ? url : url instanceof URL ? url.pathname : url.url;

      if (path === "/api/health") {
        return Promise.resolve(
          jsonResponse({
            status: "ok",
            providerMode: "demo",
            persistence: { mode: "browser_local", configured: true },
            providerStatus: {}
          })
        );
      }

      if (path === "/api/security") {
        return Promise.resolve(
          jsonResponse({
            classification: "self_hosted",
            controls: {
              securityHeaders: true,
              corsAllowlist: true,
              wildcardCors: false,
              rateLimiting: true,
              maxBodyBytes: 262144,
              authenticationRequired: false,
              hstsEnabled: false
            }
          })
        );
      }

      if (path === "/api/decisions") {
        return new Promise<Response>((resolve) => {
          resolveDecision = resolve;
        });
      }

      return Promise.resolve(jsonResponse({ error: "not found" }, 404));
    });

    vi.stubGlobal("fetch", fetchImpl);
    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/API connected · demo mode/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enter workbench/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Run decision room/i }));
      await Promise.resolve();
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/decisions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(question)
      })
    );
    expect(screen.getByText("28%")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    expect(screen.getByText(/Requesting backend API/i)).toBeInTheDocument();
    expect(screen.getByText("34%")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3_000);
      await Promise.resolve();
    });

    expect(screen.getByText(/Waiting for model aggregation/i)).toBeInTheDocument();

    await act(async () => {
      resolveDecision?.(jsonResponse(responseBody));
      await Promise.resolve();
    });

    expect(screen.getByText(/Architecture Decision Record/i)).toBeInTheDocument();
  });

  it("uses live verdict rationale when the live winner id is not in deterministic proposals", async () => {
    const question = defaultQuestions.en;
    const context = contextForQuestion(question);
    const result = runDecisionRoom({ question, mode: "deep", context });
    const liveReason = "Live trace says the modular monolith keeps delivery risk lowest.";
    const responseBody: DecisionApiResponse = {
      providerMode: "live",
      persistence: { mode: "browser_local", configured: true, saved: true },
      providerStatus: {},
      providerTrace: [],
      liveVerdict: {
        source: "live",
        selectedProposalId: "external-live-proposal",
        finalRecommendation: "Use the live aggregated recommendation.",
        quorumScore: 86,
        dissentIndex: 21,
        rankedProposals: [
          {
            proposalId: "external-live-proposal",
            bordaScore: 31,
            weightedUtility: 84,
            regretPenalty: 6,
            confidence: 0.86,
            quorumScore: 86
          }
        ],
        whyItWon: [liveReason],
        remainingDissent: [],
        usedProposalPhase: "revision"
      },
      promptBundle: createManualProviderBundle({
        question,
        locale: "en",
        context,
        agents: defaultManualProviderAgents
      }),
      result
    };
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      const path = typeof url === "string" ? url : url instanceof URL ? url.pathname : url.url;

      if (path === "/api/health") {
        return Promise.resolve(
          jsonResponse({
            status: "ok",
            providerMode: "live",
            persistence: { mode: "browser_local", configured: true },
            providerStatus: {}
          })
        );
      }

      if (path === "/api/security") {
        return Promise.resolve(
          jsonResponse({
            classification: "self_hosted",
            controls: {
              securityHeaders: true,
              corsAllowlist: true,
              wildcardCors: false,
              rateLimiting: true,
              maxBodyBytes: 262144,
              authenticationRequired: false,
              hstsEnabled: false
            }
          })
        );
      }

      if (path === "/api/decisions") {
        return Promise.resolve(jsonResponse(responseBody));
      }

      return Promise.resolve(jsonResponse({ error: "not found" }, 404));
    });

    vi.stubGlobal("fetch", fetchImpl);
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enter workbench/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Run decision room/i }));
      await Promise.resolve();
    });

    expect((await screen.findAllByText(liveReason)).length).toBeGreaterThan(0);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
