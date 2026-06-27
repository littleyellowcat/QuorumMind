export type DecisionMode = "fast" | "deep" | "red_team";

export type ProductStage = "prototype" | "mvp" | "growth" | "scale" | "enterprise";

export type Sensitivity = "low" | "medium" | "high";

export type AgentRole =
  | "principal_architect"
  | "sre_reviewer"
  | "security_reviewer"
  | "cost_engineer"
  | "pragmatic_builder";

export type CriteriaScores = {
  scalability: number;
  reliability: number;
  security: number;
  costEfficiency: number;
  implementationComplexity: number;
  maintainability: number;
  migrationFlexibility: number;
  teamFit: number;
  timeToMarket: number;
  reversibility: number;
};

/** 评分权重配置。通过 AHP 或决策上下文推导，各维度权重之和约为 1.0。 */
export type CriteriaWeights = {
  scalability: number;
  reliability: number;
  security: number;
  costEfficiency: number;
  implementationComplexity: number;
  maintainability: number;
  migrationFlexibility: number;
  teamFit: number;
  timeToMarket: number;
  reversibility: number;
};

export type AgentRanking = {
  agentId: string;
  rankedProposalIds: string[];
  weight?: number;
  confidence?: number;
  reputationScore?: number;
};

export type BayesianVoteWeight = {
  agentId: string;
  baseWeight: number;
  confidence: number;
  reputationScore: number;
  posteriorConfidence: number;
  effectiveVoteWeight: number;
};

export type Risk = {
  category: "performance" | "reliability" | "security" | "cost" | "complexity" | "migration" | "vendor_lock_in";
  severity: "low" | "medium" | "high";
  description: string;
  mitigation: string;
};

export type AssumptionLedgerEntry = {
  id: string;
  proposalId: string;
  assumption: string;
  riskLevel: "low" | "medium" | "high";
  validationQuestion: string;
  validationAction: string;
};

export type DecisionContext = {
  productStage: ProductStage;
  expectedScale: string;
  teamProfile: string;
  budgetSensitivity: Sensitivity;
  reliabilityRequirement: Sensitivity;
  securityRequirement: Sensitivity;
  existingConstraints: string[];
  candidateOptions: string[];
  assumptions: string[];
};

export type Agent = {
  id: string;
  name: string;
  role: AgentRole;
  provider: "demo" | "openai" | "gemini" | "deepseek";
  weight: number;
};

export type Proposal = {
  id: string;
  roomId: string;
  agentId: string;
  title: string;
  recommendation: string;
  alternatives: string[];
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
  assumptions: string[];
  risks: Risk[];
  migrationPath: string[];
  criteriaScores: CriteriaScores;
  regretByScenario: Record<string, number>;
  confidence: number;
  version: "initial" | "revised";
};

export type Critique = {
  id: string;
  roomId: string;
  reviewerAgentId: string;
  targetProposalId: string;
  strongestArgument: string;
  weakestAssumption: string;
  hiddenRisks: string[];
  missingConsiderations: string[];
  improvementSuggestions: string[];
  scores: CriteriaScores;
};

export type ScoredProposal = {
  proposalId: string;
  bordaScore: number;
  weightedUtility: number;
  regretPenalty: number;
  confidence: number;
  quorumScore: number;
};

export type RegretMapEntry = {
  proposalId: string;
  minimaxRank: number;
  worstScenario: string;
  worstRegret: number;
  averageRegret: number;
  scenarioRegrets: Record<string, number>;
};

export type TopsisLensEntry = {
  proposalId: string;
  topsisRank: number;
  closenessScore: number;
  distanceToIdeal: number;
  distanceToAntiIdeal: number;
};

export type MonteCarloStressEntry = {
  proposalId: string;
  monteCarloRank: number;
  winRate: number;
  averageScore: number;
  downsideP10: number;
  worstScore: number;
};

export type SensitivityScenario = {
  scenarioId: string;
  label: string;
  selectedProposalId: string;
  quorumScore: number;
  changedWinner: boolean;
  weightDelta: Partial<CriteriaWeights>;
};

export type AHPAnalysis = {
  priorityWeights: CriteriaWeights;
  consistencyRatio: number;
  consistencyAssessment: "strong" | "acceptable" | "review";
  stableWinnerRate: number;
  sensitivityScenarios: SensitivityScenario[];
};

export type DelphiRound = {
  phase: "proposal" | "blind_review" | "cross_examination" | "revision" | "consensus" | "final_verdict";
  title: string;
  status: "complete" | "skipped";
  anonymity: "blind" | "open" | "n/a";
  inputCount: number;
  outputCount: number;
  summary: string;
};

export type ADR = {
  title: string;
  status: "proposed" | "accepted" | "superseded";
  context: string;
  decision: string;
  alternatives: string[];
  consequences: string[];
  delphiRounds: DelphiRound[];
  assumptionLedger: AssumptionLedgerEntry[];
  regretMap: RegretMapEntry[];
  topsisLens: TopsisLensEntry[];
  monteCarloStress: MonteCarloStressEntry[];
  ahpAnalysis: AHPAnalysis;
  risks: Risk[];
  rollbackPlan: string[];
  reviewDate: string;
};

export type Verdict = {
  selectedProposalId: string;
  finalRecommendation: string;
  quorumScore: number;
  dissentIndex: number;
  rankedProposals: ScoredProposal[];
  delphiRounds: DelphiRound[];
  assumptionLedger: AssumptionLedgerEntry[];
  regretMap: RegretMapEntry[];
  topsisLens: TopsisLensEntry[];
  monteCarloStress: MonteCarloStressEntry[];
  ahpAnalysis: AHPAnalysis;
  riskRadar: Risk[];
  preMortem: string[];
  bayesianVoteWeights: BayesianVoteWeight[];
  adr: ADR;
  adrMarkdown: string;
};

// ── Zod schemas ──────────────────────────────────────────────

import { z } from "zod";

export const decisionModeSchema = z.enum(["fast", "deep", "red_team"]);

export const productStageSchema = z.enum([
  "prototype",
  "mvp",
  "growth",
  "scale",
  "enterprise"
]);

export const sensitivitySchema = z.enum(["low", "medium", "high"]);

export const agentRoleSchema = z.enum([
  "principal_architect",
  "sre_reviewer",
  "security_reviewer",
  "cost_engineer",
  "pragmatic_builder"
]);

export const criteriaScoresSchema = z.object({
  scalability: z.number(),
  reliability: z.number(),
  security: z.number(),
  costEfficiency: z.number(),
  implementationComplexity: z.number(),
  maintainability: z.number(),
  migrationFlexibility: z.number(),
  teamFit: z.number(),
  timeToMarket: z.number(),
  reversibility: z.number()
});

export const criteriaWeightsSchema = criteriaScoresSchema;

export const decisionContextSchema = z.object({
  productStage: productStageSchema,
  expectedScale: z.string(),
  teamProfile: z.string(),
  budgetSensitivity: sensitivitySchema,
  reliabilityRequirement: sensitivitySchema,
  securityRequirement: sensitivitySchema,
  existingConstraints: z.array(z.string()),
  candidateOptions: z.array(z.string()),
  assumptions: z.array(z.string())
});

export const regretByScenarioSchema = z.record(z.string(), z.number());

export const riskCategorySchema = z.enum([
  "performance",
  "reliability",
  "security",
  "cost",
  "complexity",
  "migration",
  "vendor_lock_in"
]);

export const riskSchema = z.object({
  category: riskCategorySchema,
  severity: sensitivitySchema,
  description: z.string(),
  mitigation: z.string()
});
