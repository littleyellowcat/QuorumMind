import type { ImplementedProviderId } from "../providers/types";
import type { ModelProvider } from "../providers/types";

export type DecisionQualityCaseKind = "decision" | "blueprint" | "github_review";

export type DecisionQualityGoldenCase = {
  id: string;
  kind: DecisionQualityCaseKind;
  prompt: string;
  expectedSignals: string[];
  minScore: number;
};

export type DecisionQualityOutput = {
  text: string;
  providerId?: ImplementedProviderId | string;
  model?: string;
};

export type DecisionQualityRubric = {
  relevance: number;
  evidence: number;
  riskCoverage: number;
  adrReadiness: number;
  dissentTrace: number;
  actionability: number;
  total: number;
};

export type DecisionQualityFinding = {
  caseId: string;
  kind: DecisionQualityCaseKind;
  verdict: "passed" | "failed" | "missing_output";
  providerId?: string;
  model?: string;
  rubric: DecisionQualityRubric;
  evidence: string[];
  comments: string[];
  llmJudge?: DecisionQualityLlmJudgeFinding;
};

export type DecisionQualityReport = {
  suiteName: string;
  startedAt: string;
  summary: {
    suiteName: string;
    totalCases: number;
    passedCases: number;
    failedCases: number;
    missingOutputCases: number;
    averageScore: number;
  };
  findings: DecisionQualityFinding[];
  judgeSummary?: DecisionQualityJudgeSummary;
};

export type DecisionQualityLlmJudgeResult =
  | {
      status: "used";
      score: number;
      rationale: string;
      concerns: string[];
    }
  | {
      status: "invalid" | "error";
      rationale: string;
      concerns: string[];
    };

export type DecisionQualityLlmJudge = {
  providerId: string;
  model: string;
  evaluate(input: {
    case: DecisionQualityGoldenCase;
    output: DecisionQualityOutput;
    deterministicFinding: DecisionQualityFinding;
  }): Promise<DecisionQualityLlmJudgeResult>;
};

export type DecisionQualityLlmJudgeFinding = {
  status: "not_requested" | "skipped" | "used" | "invalid" | "error";
  providerId?: string;
  model?: string;
  score?: number;
  deterministicScore: number;
  agreement?: "agreed" | "disagreed" | "borderline";
  rationale: string;
  concerns: string[];
};

export type DecisionQualityJudgeSummary = {
  requested: boolean;
  status: "not_requested" | "skipped" | "used" | "partial" | "failed";
  providerId?: string;
  model?: string;
  judgedCases: number;
  reason?: string;
  privacyNote: string;
};

export type ProviderQualityReputation = {
  providerId: string;
  sampleCount: number;
  averageScore: number;
  passRate: number;
  qualityBand: "strong" | "watch" | "unproven";
  reasons: string[];
};

export type DecisionQualityTrendEntry = {
  suiteName: string;
  startedAt: string;
  totalCases: number;
  passedCases: number;
  averageScore: number;
  providerReputation: ProviderQualityReputation[];
};

export const defaultDecisionQualityGoldenCases: DecisionQualityGoldenCase[] = [
  {
    id: "tenant-architecture-review",
    kind: "decision",
    prompt: "Should a SaaS MVP use shared tenant tables or schema-per-tenant isolation?",
    expectedSignals: ["tenant", "risk", "ADR", "consensus", "rollback", "validation"],
    minScore: 78
  },
  {
    id: "agent-system-blueprint-review",
    kind: "blueprint",
    prompt: "Design a multi-agent architecture review workflow with tools and human review.",
    expectedSignals: ["Planner", "Executor", "Critic", "permission", "schema", "eval", "human review"],
    minScore: 78
  },
  {
    id: "github-pr-native-review",
    kind: "github_review",
    prompt: "Review a PR that changes auth and API boundaries.",
    expectedSignals: ["PR", "Check Run", "line", "risk", "ADR", "permission"],
    minScore: 76
  }
];

export function judgeDecisionOutput(input: {
  case: DecisionQualityGoldenCase;
  output?: DecisionQualityOutput | string;
  providerId?: string;
  model?: string;
}): DecisionQualityFinding {
  const output = typeof input.output === "string"
    ? { text: input.output, providerId: input.providerId, model: input.model }
    : input.output;

  if (!output?.text?.trim()) {
    return {
      caseId: input.case.id,
      kind: input.case.kind,
      verdict: "missing_output",
      providerId: output?.providerId ?? input.providerId,
      model: output?.model ?? input.model,
      rubric: emptyRubric(),
      evidence: [],
      comments: ["No output was supplied for this golden case."]
    };
  }

  const text = output.text;
  const rubric = scoreRubric(input.case, text);
  const matchedSignals = input.case.expectedSignals.filter((signal) => containsLoose(text, signal));
  const evidence = [
    ...matchedSignals.map((signal) => `Matched expected signal: ${signal}`),
    ...(["ADR", "risk", "consensus", "permission", "eval"].filter((signal) => containsLoose(text, signal)).map((signal) => `Found ${signal} evidence`))
  ];

  return {
    caseId: input.case.id,
    kind: input.case.kind,
    verdict: rubric.total >= input.case.minScore ? "passed" : "failed",
    ...(output.providerId ?? input.providerId ? { providerId: output.providerId ?? input.providerId } : {}),
    ...(output.model ?? input.model ? { model: output.model ?? input.model } : {}),
    rubric,
    evidence,
    comments: [
      `Rubric total ${rubric.total}; minimum ${input.case.minScore}.`,
      matchedSignals.length === input.case.expectedSignals.length
        ? "All expected case signals were present."
        : `Missing signals: ${input.case.expectedSignals.filter((signal) => !matchedSignals.includes(signal)).join(", ") || "none"}.`
    ]
  };
}

export function evaluateDecisionQuality(input: {
  suiteName?: string;
  cases?: DecisionQualityGoldenCase[];
  outputs: Record<string, DecisionQualityOutput | string>;
  startedAt?: string;
}): DecisionQualityReport {
  const suiteName = input.suiteName ?? "offline-golden";
  const startedAt = input.startedAt ?? new Date().toISOString();
  const cases = input.cases ?? defaultDecisionQualityGoldenCases;
  const findings = cases.map((testCase) =>
    judgeDecisionOutput({
      case: testCase,
      output: input.outputs[testCase.id]
    })
  );
  const passedCases = findings.filter((finding) => finding.verdict === "passed").length;
  const missingOutputCases = findings.filter((finding) => finding.verdict === "missing_output").length;
  const averageScore = average(findings.map((finding) => finding.rubric.total));

  return {
    suiteName,
    startedAt,
    summary: {
      suiteName,
      totalCases: cases.length,
      passedCases,
      failedCases: cases.length - passedCases - missingOutputCases,
      missingOutputCases,
      averageScore
    },
    findings
  };
}

export async function evaluateDecisionQualityWithOptionalJudge(input: {
  suiteName?: string;
  cases?: DecisionQualityGoldenCase[];
  outputs: Record<string, DecisionQualityOutput | string>;
  startedAt?: string;
  judgeRequested?: boolean;
  judgeSkipReason?: string;
  llmJudge?: DecisionQualityLlmJudge;
}): Promise<DecisionQualityReport> {
  const cases = input.cases ?? defaultDecisionQualityGoldenCases;
  const report = evaluateDecisionQuality({
    suiteName: input.suiteName,
    cases,
    outputs: input.outputs,
    startedAt: input.startedAt
  });

  if (!input.judgeRequested) {
    return {
      ...report,
      judgeSummary: {
        requested: false,
        status: "not_requested",
        judgedCases: 0,
        privacyNote: "No LLM judge was requested; deterministic local rubric was used."
      },
      findings: report.findings.map((finding) => ({
        ...finding,
        llmJudge: {
          status: "not_requested",
          deterministicScore: finding.rubric.total,
          rationale: "No LLM judge was requested.",
          concerns: []
        }
      }))
    };
  }

  if (!input.llmJudge) {
    return {
      ...report,
      judgeSummary: {
        requested: true,
        status: "skipped",
        judgedCases: 0,
        reason: input.judgeSkipReason ?? "No LLM judge provider was configured.",
        privacyNote: "No output was sent to an external judge."
      },
      findings: report.findings.map((finding) => ({
        ...finding,
        llmJudge: {
          status: "skipped",
          deterministicScore: finding.rubric.total,
          rationale: input.judgeSkipReason ?? "No LLM judge provider was configured.",
          concerns: []
        }
      }))
    };
  }

  const judgedFindings: DecisionQualityFinding[] = [];

  for (const finding of report.findings) {
    const testCase = cases.find((candidate) => candidate.id === finding.caseId);
    const output = normalizeOutput(input.outputs[finding.caseId], finding.providerId, finding.model);

    if (!testCase || !output?.text?.trim()) {
      judgedFindings.push({
        ...finding,
        llmJudge: {
          status: "skipped",
          providerId: input.llmJudge.providerId,
          model: input.llmJudge.model,
          deterministicScore: finding.rubric.total,
          rationale: "No output was available for the LLM judge.",
          concerns: []
        }
      });
      continue;
    }

    try {
      const judged = await input.llmJudge.evaluate({
        case: testCase,
        output,
        deterministicFinding: finding
      });
      judgedFindings.push({
        ...finding,
        llmJudge: llmJudgeFindingFromResult(judged, finding, input.llmJudge)
      });
    } catch (error) {
      judgedFindings.push({
        ...finding,
        llmJudge: {
          status: "error",
          providerId: input.llmJudge.providerId,
          model: input.llmJudge.model,
          deterministicScore: finding.rubric.total,
          rationale: error instanceof Error ? error.message : "LLM judge failed.",
          concerns: []
        }
      });
    }
  }

  const used = judgedFindings.filter((finding) => finding.llmJudge?.status === "used").length;
  const failed = judgedFindings.filter((finding) => finding.llmJudge?.status === "error" || finding.llmJudge?.status === "invalid").length;

  return {
    ...report,
    findings: judgedFindings,
    judgeSummary: {
      requested: true,
      status: used === judgedFindings.length ? "used" : used > 0 ? "partial" : failed > 0 ? "failed" : "skipped",
      providerId: input.llmJudge.providerId,
      model: input.llmJudge.model,
      judgedCases: used,
      ...(failed > 0 ? { reason: `${failed} judge result${failed === 1 ? "" : "s"} failed or were invalid.` } : {}),
      privacyNote: "LLM judge is opt-in. Case prompt and candidate output are sent to the configured judge provider only when enabled."
    }
  };
}

export function createProviderDecisionQualityJudge(provider: ModelProvider): DecisionQualityLlmJudge {
  return {
    providerId: provider.id,
    model: provider.model,
    async evaluate(input) {
      const text = await provider.generateDecisionText({
        locale: "en",
        mode: "fast",
        phase: "verdict",
        agentName: "Quality Judge",
        agentRole: "principal_architect",
        question: [
          "Judge this QuorumMind output as an architecture decision quality evaluator.",
          "Return JSON only with fields: score number 0-100, rationale string, concerns string[].",
          `Golden case: ${input.case.prompt}`,
          `Expected signals: ${input.case.expectedSignals.join(", ")}`,
          `Deterministic score: ${input.deterministicFinding.rubric.total}`,
          `Candidate output: ${input.output.text}`
        ].join("\n"),
        context: {
          productStage: "mvp",
          expectedScale: "architecture quality evaluation",
          teamProfile: "QuorumMind evaluation harness",
          budgetSensitivity: "medium",
          reliabilityRequirement: "high",
          securityRequirement: "high",
          existingConstraints: ["Do not send secrets", "Return structured judge metadata"],
          candidateOptions: ["accept", "revise", "reject"],
          assumptions: ["The judge is used only after explicit opt-in."]
        },
        payload: {
          case: input.case,
          deterministicFinding: input.deterministicFinding,
          candidateOutput: input.output.text
        }
      });

      return parseJudgeResponse(text);
    }
  };
}

export function summarizeProviderReputation(findings: DecisionQualityFinding[]): ProviderQualityReputation[] {
  const grouped = new Map<string, DecisionQualityFinding[]>();

  for (const finding of findings) {
    if (!finding.providerId) {
      continue;
    }
    grouped.set(finding.providerId, [...(grouped.get(finding.providerId) ?? []), finding]);
  }

  return [...grouped.entries()]
    .map(([providerId, providerFindings]) => {
      const averageScore = average(providerFindings.map((finding) => finding.rubric.total));
      const passRate = providerFindings.filter((finding) => finding.verdict === "passed").length / Math.max(1, providerFindings.length);
      const qualityBand: ProviderQualityReputation["qualityBand"] =
        averageScore >= 78 && passRate >= 0.8 ? "strong" : providerFindings.length < 2 ? "unproven" : "watch";

      return {
        providerId,
        sampleCount: providerFindings.length,
        averageScore,
        passRate,
        qualityBand,
        reasons: [
          `${providerFindings.length} golden-case sample${providerFindings.length === 1 ? "" : "s"}.`,
          `Average rubric score ${averageScore}.`,
          `Pass rate ${Math.round(passRate * 100)}%.`
        ]
      };
    })
    .sort((a, b) => a.providerId.localeCompare(b.providerId));
}

export function createDecisionQualityTrendEntry(report: DecisionQualityReport): DecisionQualityTrendEntry {
  return {
    suiteName: report.suiteName,
    startedAt: report.startedAt,
    totalCases: report.summary.totalCases,
    passedCases: report.summary.passedCases,
    averageScore: report.summary.averageScore,
    providerReputation: summarizeProviderReputation(report.findings)
  };
}

function scoreRubric(testCase: DecisionQualityGoldenCase, text: string): DecisionQualityRubric {
  const signalScore = Math.round(100 * testCase.expectedSignals.filter((signal) => containsLoose(text, signal)).length / Math.max(1, testCase.expectedSignals.length));
  const relevance = Math.min(100, signalScore + (containsLoose(text, testCase.prompt.split(" ")[0] ?? "") ? 5 : 0));
  const evidence = scoreKeywordGroup(text, ["evidence", "because", "trace", "source", "validation", "test", "证据", "验证"]);
  const riskCoverage = scoreKeywordGroup(text, ["risk", "failure", "rollback", "security", "boundary", "风险", "回滚"]);
  const adrReadiness = scoreKeywordGroup(text, ["adr", "decision", "consequence", "owner", "status", "架构决策"]);
  const dissentTrace = scoreKeywordGroup(text, ["consensus", "disagree", "dissent", "trade-off", "model", "共识", "分歧"]);
  const actionability = scoreKeywordGroup(text, ["next", "task", "check", "milestone", "action", "acceptance", "trigger", "handoff", "matrix", "行动", "验收"]);
  const rawTotal = Math.round(
    relevance * 0.25 +
    evidence * 0.15 +
    riskCoverage * 0.18 +
    adrReadiness * 0.16 +
    dissentTrace * 0.13 +
    actionability * 0.13
  );
  const total = signalScore === 100 ? Math.max(rawTotal, 82) : rawTotal;

  return {
    relevance,
    evidence,
    riskCoverage,
    adrReadiness,
    dissentTrace,
    actionability,
    total
  };
}

function normalizeOutput(
  output: DecisionQualityOutput | string | undefined,
  providerId?: string,
  model?: string
): DecisionQualityOutput | undefined {
  if (typeof output === "string") {
    return { text: output, providerId, model };
  }
  return output;
}

function llmJudgeFindingFromResult(
  result: DecisionQualityLlmJudgeResult,
  finding: DecisionQualityFinding,
  judge: DecisionQualityLlmJudge
): DecisionQualityLlmJudgeFinding {
  if (result.status !== "used") {
    return {
      status: result.status,
      providerId: judge.providerId,
      model: judge.model,
      deterministicScore: finding.rubric.total,
      rationale: result.rationale,
      concerns: result.concerns
    };
  }

  return {
    status: "used",
    providerId: judge.providerId,
    model: judge.model,
    score: clampScore(result.score),
    deterministicScore: finding.rubric.total,
    agreement: judgeAgreement(finding.rubric.total, result.score),
    rationale: result.rationale,
    concerns: result.concerns
  };
}

function parseJudgeResponse(text: string): DecisionQualityLlmJudgeResult {
  const parsed = parseJsonObject(text);
  if (!parsed) {
    return {
      status: "invalid",
      rationale: "Judge response was not valid JSON.",
      concerns: ["The configured judge provider did not return the requested schema."]
    };
  }

  const score =
    typeof parsed.score === "number"
      ? parsed.score
      : typeof parsed.total === "number"
        ? parsed.total
        : typeof parsed.confidence === "number"
          ? parsed.confidence * 100
          : undefined;
  if (typeof score !== "number") {
    return {
      status: "invalid",
      rationale: "Judge response did not include a numeric score.",
      concerns: ["Missing score field."]
    };
  }

  return {
    status: "used",
    score: clampScore(score),
    rationale:
      typeof parsed.rationale === "string"
        ? parsed.rationale
        : typeof parsed.finalRecommendation === "string"
          ? parsed.finalRecommendation
          : "LLM judge returned a numeric score.",
    concerns: Array.isArray(parsed.concerns)
      ? parsed.concerns.map(String).slice(0, 6)
      : Array.isArray(parsed.remainingDissent)
        ? parsed.remainingDissent.map(String).slice(0, 6)
        : []
  };
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : undefined;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : undefined;
    } catch {
      return undefined;
    }
  }
}

function judgeAgreement(deterministicScore: number, judgeScore: number): DecisionQualityLlmJudgeFinding["agreement"] {
  const delta = Math.abs(deterministicScore - judgeScore);
  if (delta <= 12) {
    return "agreed";
  }
  if (delta <= 22) {
    return "borderline";
  }
  return "disagreed";
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreKeywordGroup(text: string, keywords: string[]): number {
  const matched = keywords.filter((keyword) => containsLoose(text, keyword)).length;
  return Math.min(100, 55 + matched * 16);
}

function emptyRubric(): DecisionQualityRubric {
  return {
    relevance: 0,
    evidence: 0,
    riskCoverage: 0,
    adrReadiness: 0,
    dissentTrace: 0,
    actionability: 0,
    total: 0
  };
}

function containsLoose(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10;
}
