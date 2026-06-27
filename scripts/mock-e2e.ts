import { handleApiRequest } from "../server/decision-api";
import type { DecisionContext } from "../src/lib/domain";

const context: DecisionContext = {
  productStage: "mvp",
  expectedScale: "First six months: 50 tenants and fewer than 10,000 daily active users.",
  teamProfile: "Small full-stack team with strong PostgreSQL experience.",
  budgetSensitivity: "high",
  reliabilityRequirement: "medium",
  securityRequirement: "high",
  existingConstraints: ["Use PostgreSQL", "Ship MVP in eight weeks"],
  candidateOptions: ["Shared tables with tenant_id", "Schema per tenant", "Database per tenant"],
  assumptions: ["No hard regulatory tenant isolation requirement at launch"]
};

const response = await handleApiRequest(
  new Request("http://127.0.0.1:8787/api/decisions", {
    method: "POST",
    body: JSON.stringify({
      question: "Should a B2B SaaS MVP use schema-per-tenant or shared tables with tenant_id in PostgreSQL?",
      mode: "fast",
      locale: "en",
      context
    })
  }),
  {
    QUORUMMIND_PROVIDER_MODE: "live",
    QUORUMMIND_MOCK_PROVIDERS: "1"
  }
);
const body = (await response.json()) as {
  providerMode?: string;
  providerTrace?: Array<{
    status: string;
    jsonParsed: boolean;
    validationStatus?: string;
    provider: string;
    phase: string;
  }>;
  liveVerdict?: {
    selectedProposalId: string;
    quorumScore: number;
    dissentIndex: number;
  } | null;
};

assert(response.status === 200, `Expected 200, received ${response.status}`);
assert(body.providerMode === "live", `Expected live provider mode, received ${body.providerMode}`);
assert(Array.isArray(body.providerTrace) && body.providerTrace.length === 9, "Expected 9 fast-mode mock provider calls");
assert(body.providerTrace.every((entry) => entry.status === "ok"), "Expected every mock provider call to succeed");
assert(body.providerTrace.every((entry) => entry.jsonParsed), "Expected every mock provider call to parse JSON");
assert(
  body.providerTrace.every((entry) => entry.validationStatus === "valid" || entry.validationStatus === "repaired"),
  "Expected every mock provider call to produce a usable schema status"
);
assert(body.liveVerdict !== null && body.liveVerdict !== undefined, "Expected live verdict aggregation");

console.log("QuorumMind mock E2E passed");
console.log(
  JSON.stringify(
    {
      providerMode: body.providerMode,
      calls: body.providerTrace.length,
      providers: [...new Set(body.providerTrace.map((entry) => entry.provider))],
      phases: [...new Set(body.providerTrace.map((entry) => entry.phase))],
      selectedProposalId: body.liveVerdict.selectedProposalId,
      quorumScore: body.liveVerdict.quorumScore,
      dissentIndex: body.liveVerdict.dissentIndex
    },
    null,
    2
  )
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
