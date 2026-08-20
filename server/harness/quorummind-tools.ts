import { createToolRegistry, type RegisteredToolDefinition, type ToolRegistry } from "./tool-registry";

export function createQuorumMindToolRegistry(): ToolRegistry {
  return createToolRegistry(defaultQuorumMindTools());
}

export function defaultQuorumMindTools(): RegisteredToolDefinition[] {
  return [
    {
      name: "quorummind_read_architecture_context",
      description: "Read the current architecture question, structured context, assumptions, and constraints.",
      ownerAgent: "planner_agent",
      permissionCategory: "read_only",
      risk: "low",
      schema: {
        type: "object",
        properties: {
          runId: { type: "string" }
        },
        required: ["runId"]
      }
    },
    {
      name: "quorummind_score_decision_lenses",
      description: "Run deterministic Borda, Bayesian voting, TOPSIS, regret, Monte Carlo, and AHP scoring lenses.",
      ownerAgent: "executor_agent",
      permissionCategory: "read_only",
      risk: "low",
      schema: {
        type: "object",
        properties: {
          proposalIds: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["proposalIds"]
      }
    },
    {
      name: "quorummind_generate_context_source_ledger",
      description: "Generate a versioned context source ledger for the current run.",
      ownerAgent: "executor_agent",
      permissionCategory: "read_only",
      risk: "low",
      schema: {
        type: "object",
        properties: {
          question: { type: "string" },
          context: { type: "object" }
        },
        required: ["question", "context"]
      }
    },
    {
      name: "quorummind_generate_adr_export",
      description: "Export the accepted recommendation as ADR markdown or PDF-ready report data.",
      ownerAgent: "memory_agent",
      permissionCategory: "local_file_write",
      risk: "medium",
      schema: {
        type: "object",
        properties: {
          roomId: { type: "string" },
          format: { enum: ["markdown", "pdf"] }
        },
        required: ["roomId", "format"]
      }
    },
    {
      name: "quorummind_live_provider_trace",
      description: "Call live model providers and capture proposal, critique, revision, ranking, and verdict trace.",
      ownerAgent: "executor_agent",
      permissionCategory: "live_model_call",
      risk: "medium",
      schema: {
        type: "object",
        properties: {
          maxProviderRounds: { type: "number" },
          providers: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["maxProviderRounds"]
      }
    }
  ];
}
