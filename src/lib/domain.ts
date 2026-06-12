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

export type CriteriaWeights = CriteriaScores;

export type AgentRanking = {
  agentId: string;
  rankedProposalIds: string[];
};

export type Risk = {
  category: "performance" | "reliability" | "security" | "cost" | "complexity" | "migration" | "vendor_lock_in";
  severity: "low" | "medium" | "high";
  description: string;
  mitigation: string;
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

export type ADR = {
  title: string;
  status: "proposed" | "accepted" | "superseded";
  context: string;
  decision: string;
  alternatives: string[];
  consequences: string[];
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
  assumptionLedger: string[];
  riskRadar: Risk[];
  preMortem: string[];
  adr: ADR;
  adrMarkdown: string;
};

