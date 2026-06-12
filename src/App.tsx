import { useMemo, useState } from "react";
import { runDecisionRoom } from "./lib/workflow";
import "./styles.css";

const defaultQuestion =
  "Should a B2B SaaS MVP use schema-per-tenant or shared tables with tenant_id in PostgreSQL?";

const defaultContext = {
  productStage: "mvp" as const,
  expectedScale: "First six months: 50 tenants and fewer than 10,000 daily active users.",
  teamProfile: "Small full-stack team with strong PostgreSQL experience.",
  budgetSensitivity: "high" as const,
  reliabilityRequirement: "medium" as const,
  securityRequirement: "high" as const,
  existingConstraints: ["Use PostgreSQL", "Ship MVP in eight weeks"],
  candidateOptions: ["Shared tables with tenant_id", "Schema per tenant", "Database per tenant"],
  assumptions: ["No hard regulatory tenant isolation requirement at launch"]
};

export default function App() {
  const [question, setQuestion] = useState(defaultQuestion);
  const [hasRun, setHasRun] = useState(false);
  const result = useMemo(
    () =>
      hasRun
        ? runDecisionRoom({
            question,
            mode: "deep",
            context: defaultContext
          })
        : null,
    [hasRun, question]
  );

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">AI Architecture Review Board</p>
        <h1>QuorumMind</h1>
        <p className="hero-copy">
          Turn model disagreement into better architecture decisions with independent proposals,
          blind critique, revision, consensus scoring, and ADR output.
        </p>
        <div className="decision-card">
          <label htmlFor="question">Architecture question</label>
          <textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} />
          <button type="button" onClick={() => setHasRun(true)}>
            Run Deep Quorum
          </button>
        </div>
      </section>

      {result ? (
        <section className="results-grid">
          <article className="panel score-panel">
            <p className="eyebrow">Final Verdict</p>
            <h2>{result.verdict.finalRecommendation.split(".")[0]}.</h2>
            <div className="metric-row">
              <div>
                <span>Quorum Score</span>
                <strong>{result.verdict.quorumScore}</strong>
              </div>
              <div>
                <span>Dissent Index</span>
                <strong>{result.verdict.dissentIndex}</strong>
              </div>
            </div>
          </article>

          <article className="panel">
            <h2>Agent Council</h2>
            <div className="agent-list">
              {result.agents.map((agent) => (
                <div className="agent-card" key={agent.id}>
                  <strong>{agent.name}</strong>
                  <span>{agent.role.replaceAll("_", " ")}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide">
            <h2>Trade-off Ranking</h2>
            <div className="ranking-list">
              {result.verdict.rankedProposals.map((proposal, index) => (
                <div className="ranking-row" key={proposal.proposalId}>
                  <span>#{index + 1}</span>
                  <strong>{proposal.proposalId.replace("-proposal-revised", "").replaceAll("-", " ")}</strong>
                  <em>{proposal.quorumScore} score</em>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <h2>Risk Radar</h2>
            <ul className="risk-list">
              {result.verdict.riskRadar.map((risk) => (
                <li key={risk.description}>
                  <strong>{risk.category.replaceAll("_", " ")}</strong>
                  <span>{risk.description}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <h2>Pre-Mortem</h2>
            <ul className="risk-list">
              {result.verdict.preMortem.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="panel wide">
            <h2>Architecture Decision Record</h2>
            <pre>{result.verdict.adrMarkdown}</pre>
          </article>
        </section>
      ) : (
        <section className="empty-state">
          <h2>Decision Room ready</h2>
          <p>
            Run the demo to watch QuorumMind create proposals, critique them, revise them, and
            synthesize an ADR.
          </p>
        </section>
      )}
    </main>
  );
}

