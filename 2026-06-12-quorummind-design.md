# QuorumMind v0.1 Design

Date: 2026-06-12

## 1. Product Positioning

QuorumMind is an adversarial multi-agent architecture decision engine for technical architecture decisions.

It helps engineers evaluate technical trade-offs, expose hidden risks, compare implementation paths, and generate explainable Architecture Decision Records (ADRs).

Chinese positioning:

> QuorumMind 是一个面向技术选型与系统设计的多智能体架构决策平台。它模拟架构师、SRE、安全工程师、成本工程师和务实开发者组成的 AI 架构评审委员会，通过独立提案、匿名互评、对抗式反驳、算法聚合和 ADR 生成，帮助用户做出可解释的技术决策。

The product should feel less like a chatbot and more like an AI architecture review board.

## 2. Target Users

Primary users:

- Software engineers preparing architecture decisions.
- Students and junior developers building portfolio projects.
- Technical leads evaluating trade-offs before implementation.
- Founders or indie hackers choosing a pragmatic stack.

The first version is optimized for a portfolio project and interview demonstration. It should show strong engineering judgment, not just LLM API usage.

## 3. Core Use Cases

QuorumMind v0.1 should focus on architecture decisions such as:

- Next.js vs Nuxt vs Remix.
- PostgreSQL vs MongoDB.
- Redis Queue vs Kafka vs RabbitMQ.
- Monolith vs modular monolith vs microservices.
- REST vs GraphQL vs tRPC.
- Multi-tenant SaaS database design.
- Authentication and authorization architecture.
- Observability and reliability planning.
- Whether a design is over-engineered for the current stage.

Out of scope for v0.1:

- General life decisions.
- Financial, legal, or medical decisions.
- Full repository analysis.
- Automatic code generation.
- GitHub PR review automation.
- Enterprise collaboration, billing, or multi-user permissions.

## 4. MVP Product Shape

The core user experience is a "Decision Room".

A Decision Room is one complete architecture decision workflow:

1. The user describes an architecture question.
2. The system extracts structured context and assumptions.
3. Multiple agents independently propose solutions.
4. Agents anonymously critique each proposal.
5. Agents revise their own proposals using critique feedback.
6. A consensus engine scores and ranks the options.
7. The system generates a final verdict and ADR.

Recommended v0.1 tagline:

> Turn model disagreement into better architecture decisions.

## 5. Decision Modes

v0.1 should support three modes:

### Fast Quorum

One proposal round and one scoring round.

Use when the user wants a quick technical recommendation.

### Deep Quorum

Proposal, anonymous critique, revision, scoring, and final synthesis.

This is the default mode and the best demo path.

### Red-Team Quorum

Focuses on risks, failure modes, over-engineering, operational burden, and rollback plans.

Use when the user already has a preferred architecture and wants it challenged.

## 6. Agent Roles

The product should not expose models as "GPT", "Gemini", and "DeepSeek" directly in the main workflow. It should expose expert roles. The underlying providers can be configured separately.

Recommended v0.1 agents:

### Principal Architect

Focuses on system boundaries, long-term maintainability, scalability, and architectural coherence.

### SRE Reviewer

Focuses on reliability, observability, deployment, incident response, capacity planning, and operational complexity.

### Security Reviewer

Focuses on authentication, authorization, data isolation, attack surface, secrets, compliance, and abuse cases.

### Cost Engineer

Focuses on infrastructure cost, development cost, maintenance cost, vendor lock-in, and migration cost.

### Pragmatic Builder

Focuses on MVP speed, team capability, implementation simplicity, and avoiding over-engineering.

v0.1 can run three to five agents depending on cost settings. The best demo default is five role agents backed by three model providers, while the minimum viable run requires three successful role-agent outputs.

## 7. Workflow

### Step 1: Intake

The user submits:

- Architecture question.
- Product stage: prototype, MVP, growth, scale, enterprise.
- Expected users or traffic.
- Team size and experience.
- Budget sensitivity.
- Reliability requirements.
- Security or compliance requirements.
- Existing constraints and preferred stack.

If the user provides only a free-form question, QuorumMind should infer missing fields and list them as assumptions.

### Step 2: Context Brief

The system converts the intake into a structured brief:

- Decision objective.
- Constraints.
- Evaluation criteria.
- Known facts.
- Open assumptions.
- Candidate options.

This brief is passed to all agents.

### Step 3: Independent Proposals

Each agent generates a proposal without seeing other agents' answers.

Each proposal includes:

- Recommended architecture.
- Alternatives considered.
- Main reasoning.
- Strengths.
- Weaknesses.
- Assumptions.
- Risks.
- Operational implications.
- Suggested migration path.
- Confidence score.

### Step 4: Blind Critique

The system anonymizes proposals as Proposal A, Proposal B, Proposal C, and so on, depending on how many role agents completed the proposal round.

Each agent reviews the anonymized proposals and outputs:

- Strongest argument.
- Weakest assumption.
- Hidden risk.
- Missing consideration.
- Over-engineering risk.
- Under-engineering risk.
- Score by criteria.
- Concrete improvement suggestion.

### Step 5: Revision

Each original proposer receives aggregated critique about its proposal and revises it.

The revised proposal must state:

- What changed.
- Which critique was accepted.
- Which critique was rejected.
- Why the revised recommendation is stronger.

### Step 6: Consensus Scoring

The consensus engine evaluates revised proposals using fixed criteria:

- Scalability.
- Reliability.
- Security.
- Cost efficiency.
- Implementation complexity.
- Maintainability.
- Migration flexibility.
- Team fit.
- Time-to-market.
- Reversibility.

Scores are normalized to 0-100.

### Step 7: Final Verdict and ADR

The system produces:

- Final recommendation.
- Score summary.
- Trade-off matrix.
- Risk radar.
- Key assumptions.
- Rejected alternatives.
- Failure pre-mortem.
- Migration path.
- Rollback plan.
- ADR document.

## 8. Consensus Algorithms

v0.1 should use algorithms that are explainable and feasible to implement.

### Borda Count

Each agent ranks the revised proposals. Rankings are converted into points. This reduces the brittleness of simple majority voting.

### Bayesian Weighted Voting

Each agent vote is weighted by:

- Model/provider reliability.
- Role relevance to the decision.
- Self-reported confidence.
- Historical user feedback if available.

For v0.1, historical reliability can start as a static prior and later become dynamic.

### Minimax Regret

For each proposal, estimate regret under adverse scenarios such as high traffic, limited team capacity, high security requirements, or budget pressure.

The preferred architecture should not only have a high upside. It should also avoid catastrophic downside.

### Weighted Utility Score

Compute an aggregate utility score:

```text
utility =
  scalability * w1 +
  reliability * w2 +
  security * w3 +
  cost_efficiency * w4 +
  maintainability * w5 +
  team_fit * w6 +
  reversibility * w7 -
  regret_penalty
```

Weights come from the user's context. For an MVP, time-to-market and team fit weigh more. For an enterprise system, security and reliability weigh more.

## 9. Signature Features

### Quorum Score

A final 0-100 decision score that combines ranking, weighted utility, confidence, and regret penalty.

### Dissent Index

Measures how much agents disagree. A high Dissent Index means the final verdict should include more caveats and validation steps.

### Assumption Ledger

Lists all major assumptions behind the recommendation.

Example:

- Traffic will remain below 10,000 DAU for the first six months.
- The team has PostgreSQL experience.
- Strong tenant isolation is useful, but hard regulatory isolation is not required.

### Risk Radar

Groups risks by category:

- Performance.
- Reliability.
- Security.
- Cost.
- Complexity.
- Migration.
- Vendor lock-in.

### Overengineering Detector

Flags decisions that add distributed systems, event-driven architecture, Kubernetes, or microservices too early.

### Pre-Mortem Review

Asks:

> Assume this architecture failed six months later. What most likely caused the failure?

Outputs:

- Failure reasons.
- Early warning signals.
- Preventive actions.
- Rollback or mitigation plan.

### ADR Generator

Generates a standard Architecture Decision Record:

- Title.
- Status.
- Context.
- Decision.
- Alternatives considered.
- Consequences.
- Risks.
- Rollback plan.
- Review date.

## 10. Pages

v0.1 should have five main pages.

### Home

Explains QuorumMind, shows example decisions, and offers a "Create Decision Room" call to action.

### Create Decision Room

Collects the architecture question and structured context.

Important fields:

- Architecture question.
- Product stage.
- Candidate options.
- Scale expectations.
- Team profile.
- Budget sensitivity.
- Reliability needs.
- Security needs.
- Existing constraints.
- Decision mode.

### Agent Proposals

Shows each expert role's initial proposal.

The UI should make the process visible:

- Principal Architect is thinking about system boundaries.
- SRE Reviewer is thinking about reliability.
- Security Reviewer is thinking about risk.
- Cost Engineer is thinking about cost.
- Pragmatic Builder is thinking about shipping speed.

### Debate Arena

Shows blind critique, disagreements, accepted critiques, and revised proposals.

This is the most distinctive page. It should make QuorumMind feel like an architecture review board, not a simple answer generator.

### Verdict and ADR

Shows:

- Final recommendation.
- Quorum Score.
- Dissent Index.
- Trade-off matrix.
- Risk radar.
- Pre-mortem.
- ADR.
- Export options.

## 11. Data Model

Core entities:

### DecisionRoom

```ts
type DecisionRoom = {
  id: string;
  title: string;
  question: string;
  mode: "fast" | "deep" | "red_team";
  status: "draft" | "running" | "completed" | "failed";
  context: DecisionContext;
  createdAt: string;
  updatedAt: string;
};
```

### DecisionContext

```ts
type DecisionContext = {
  productStage: "prototype" | "mvp" | "growth" | "scale" | "enterprise";
  expectedScale?: string;
  teamProfile?: string;
  budgetSensitivity: "low" | "medium" | "high";
  reliabilityRequirement: "low" | "medium" | "high";
  securityRequirement: "low" | "medium" | "high";
  existingConstraints: string[];
  candidateOptions: string[];
  assumptions: string[];
};
```

### Agent

```ts
type Agent = {
  id: string;
  role:
    | "principal_architect"
    | "sre_reviewer"
    | "security_reviewer"
    | "cost_engineer"
    | "pragmatic_builder";
  provider: "openai" | "gemini" | "deepseek";
  model: string;
  weight: number;
};
```

### Proposal

```ts
type Proposal = {
  id: string;
  roomId: string;
  agentId: string;
  recommendation: string;
  alternatives: string[];
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
  assumptions: string[];
  risks: Risk[];
  migrationPath: string[];
  confidence: number;
  version: "initial" | "revised";
};
```

### Critique

```ts
type Critique = {
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
```

### Verdict

```ts
type Verdict = {
  id: string;
  roomId: string;
  selectedProposalId: string;
  finalRecommendation: string;
  quorumScore: number;
  dissentIndex: number;
  criteriaScores: CriteriaScores;
  regretAnalysis: RegretAnalysis;
  assumptionLedger: string[];
  riskRadar: Risk[];
  preMortem: PreMortemItem[];
  adr: ADR;
};
```

## 12. Technical Stack

Recommended stack for a strong portfolio project:

- Frontend: Next.js, TypeScript, Tailwind CSS, shadcn/ui.
- Backend: Next.js Route Handlers or FastAPI.
- Database: PostgreSQL with Prisma.
- Queue: Inngest, BullMQ, or a simple database-backed job runner for v0.1.
- LLM providers: OpenAI, Gemini, DeepSeek through provider adapters.
- Validation: Zod schemas for all model outputs.
- Observability: structured logs for each agent step.
- Export: Markdown ADR export first, PDF export later.

Recommended v0.1 choice:

- Use Next.js full-stack for speed.
- Use PostgreSQL + Prisma for persistence.
- Use provider adapter interfaces so model providers can be swapped.
- Use Zod to force model outputs into predictable JSON.

## 13. LLM Provider Abstraction

Define a shared provider interface:

```ts
type LLMProvider = {
  name: string;
  generateStructured<TInput, TOutput>(
    task: AgentTask<TInput>,
    schema: Schema<TOutput>
  ): Promise<TOutput>;
};
```

Each provider implementation handles:

- API key configuration.
- Model name.
- Prompt construction.
- Retry policy.
- JSON repair or validation failure handling.
- Token and cost tracking.

v0.1 should limit retries to one structured-output repair attempt per agent step.

## 14. Error Handling

Expected failures:

- Provider API failure.
- Invalid structured output.
- Timeout.
- One agent fails while others succeed.
- Model refuses or returns generic content.
- Cost or token limit exceeded.

Rules:

- If one non-critical agent fails, continue with remaining agents and mark the verdict as lower confidence.
- If fewer than three agent outputs are valid, stop the run and ask the user to retry.
- If structured output validation fails, attempt one repair prompt.
- Every final report should include a "run integrity" section showing which agents completed.

## 15. Testing Strategy

Unit tests:

- Consensus scoring.
- Borda Count ranking.
- Dissent Index calculation.
- Regret penalty calculation.
- ADR formatting.
- Zod schema validation.

Integration tests:

- Mock providers produce valid proposals.
- Decision Room can complete a full Deep Quorum run.
- Partial provider failure degrades gracefully.

Evaluation tests:

- Golden architecture questions with expected traits.
- Verify that the final ADR contains recommendation, alternatives, consequences, risks, and rollback plan.
- Verify that over-engineering is flagged in obvious MVP cases.

## 16. Demo Scenarios

The project should ship with several sample prompts:

### Multi-Tenant SaaS

> Should a B2B SaaS MVP use schema-per-tenant or shared tables with tenant_id in PostgreSQL?

### Queue Selection

> Should a notification system use Redis Queue, RabbitMQ, or Kafka?

### Architecture Style

> Should an early-stage product start with a modular monolith or microservices?

### API Layer

> Should a TypeScript SaaS app use REST, GraphQL, or tRPC?

### Deployment

> Should an MVP use Vercel, Docker on a VPS, or Kubernetes?

These examples should be used on the home page and in the demo video.

## 17. Portfolio and Resume Framing

English resume bullet:

> Built QuorumMind, an adversarial multi-agent architecture decision engine that orchestrates LLM-based architect, SRE, security, cost, and pragmatic-builder agents to evaluate technical trade-offs, critique proposals, compute consensus scores, and generate Architecture Decision Records.

Chinese resume bullet:

> 设计并实现 QuorumMind 多智能体架构决策系统，模拟架构师、SRE、安全工程师、成本工程师和务实开发者组成的 AI 技术评审委员会，支持技术选型对比、架构风险雷达、失败预演、共识评分与 ADR 自动生成。

Interview story:

- Problem: LLMs often give one confident architecture recommendation without enough trade-off analysis.
- Solution: QuorumMind forces independent proposals, adversarial critique, revision, and algorithmic consensus.
- Technical depth: provider abstraction, structured output validation, multi-agent orchestration, scoring algorithms, ADR generation, failure handling.
- Product depth: Decision Room workflow, Risk Radar, Dissent Index, Pre-Mortem Review, Overengineering Detector.

## 18. v0.1 Acceptance Criteria

QuorumMind v0.1 is complete when:

- A user can create a Decision Room from an architecture question.
- The system can run at least three expert agents.
- Agents produce structured proposals.
- Agents critique anonymized proposals.
- Revised proposals are scored by fixed criteria.
- The final page shows Quorum Score, Dissent Index, trade-off matrix, risk radar, pre-mortem, and ADR.
- ADR can be exported as Markdown.
- Provider failures and invalid outputs are handled gracefully.
- At least five demo scenarios are available.

## 19. Future Versions

v0.2:

- GitHub repository context ingestion.
- PR architecture review mode.
- Dynamic Model Reputation based on user feedback.
- PDF export.
- Mermaid architecture diagrams.
- Monte Carlo scenario simulation.

v0.3:

- Team collaboration.
- Decision history and searchable ADR library.
- Organization-specific architecture principles.
- Custom agent roles.
- Integration with Linear, GitHub, and Slack.

## 20. Key Design Decision

QuorumMind v0.1 should prioritize a polished architecture decision workflow over broad integrations.

The strongest portfolio version is not the one with the most providers or features. It is the one that clearly demonstrates:

- Multi-agent orchestration.
- Adversarial critique.
- Structured model outputs.
- Explainable scoring.
- Practical engineering trade-offs.
- A useful final artifact: the ADR.
