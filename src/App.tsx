import { useMemo, useState } from "react";
import type { Agent, Risk } from "./lib/domain";
import { runDecisionRoom } from "./lib/workflow";
import "./styles.css";

type Locale = "en" | "zh";

const defaultQuestions: Record<Locale, string> = {
  en: "Should a B2B SaaS MVP use schema-per-tenant or shared tables with tenant_id in PostgreSQL?",
  zh: "一个 B2B SaaS MVP 应该使用 PostgreSQL 的 schema-per-tenant，还是 shared tables + tenant_id？"
};

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

const copy = {
  en: {
    commandCenter: "Architecture Command Center",
    language: "Language",
    eyebrow: "AI Architecture Review Board",
    headline: "QuorumMind",
    lead: "A decision room for architecture trade-offs.",
    sublead:
      "Run expert agents through independent proposals, blind critique, revision, consensus scoring, and ADR generation.",
    briefTitle: "Decision Brief",
    questionLabel: "Architecture question",
    runButton: "Run Deep Quorum",
    contextTitle: "Context Matrix",
    context: ["Stage: MVP", "Team: small full-stack", "Budget sensitivity: high", "Security need: high"],
    readyTitle: "Decision Room armed",
    readyText: "Run Deep Quorum to assemble the agent council and generate a verdict.",
    finalVerdict: "Final Verdict",
    quorumScore: "Quorum Score",
    dissentIndex: "Dissent Index",
    agentCouncil: "Agent Council",
    roleAgent: "Role Agent",
    debateSignal: "Debate Signal",
    tradeoffRanking: "Trade-off Ranking",
    riskRadar: "Risk Radar",
    preMortem: "Pre-Mortem",
    assumptions: "Assumption Ledger",
    adr: "Architecture Decision Record",
    selected: "Selected path",
    score: "score",
    confidence: "confidence",
    reportLanguageNote: "Generated demo report content is currently English; provider prompts will control output language next.",
    statusSteps: ["Intake", "Proposal", "Blind critique", "Revision", "Consensus", "ADR"],
    riskCategories: {
      performance: "Performance",
      reliability: "Reliability",
      security: "Security",
      cost: "Cost",
      complexity: "Complexity",
      migration: "Migration",
      vendor_lock_in: "Vendor lock-in"
    }
  },
  zh: {
    commandCenter: "架构决策控制台",
    language: "界面语言",
    eyebrow: "AI 架构评审委员会",
    headline: "QuorumMind",
    lead: "为技术架构权衡而生的决策室。",
    sublead: "让专家智能体独立提案、匿名互评、反驳修正、共识评分，并生成 ADR 架构决策记录。",
    briefTitle: "决策简报",
    questionLabel: "架构问题",
    runButton: "运行深度评审",
    contextTitle: "上下文矩阵",
    context: ["阶段：MVP", "团队：小型全栈团队", "预算敏感度：高", "安全要求：高"],
    readyTitle: "决策室已就绪",
    readyText: "运行深度评审后，QuorumMind 会组建专家委员会并生成最终裁决。",
    finalVerdict: "最终裁决",
    quorumScore: "共识评分",
    dissentIndex: "分歧指数",
    agentCouncil: "专家委员会",
    roleAgent: "角色智能体",
    debateSignal: "辩论信号",
    tradeoffRanking: "方案排序",
    riskRadar: "风险雷达",
    preMortem: "失败预演",
    assumptions: "假设账本",
    adr: "架构决策记录",
    selected: "入选路径",
    score: "分",
    confidence: "置信度",
    reportLanguageNote: "当前 demo 报告内容仍为英文；接入真实模型后会通过 prompt 控制输出语言。",
    statusSteps: ["需求输入", "独立提案", "匿名互评", "反驳修正", "共识聚合", "生成 ADR"],
    riskCategories: {
      performance: "性能",
      reliability: "可靠性",
      security: "安全",
      cost: "成本",
      complexity: "复杂度",
      migration: "迁移",
      vendor_lock_in: "供应商锁定"
    }
  }
} satisfies Record<Locale, Record<string, unknown>>;

const roleLabels: Record<Locale, Record<Agent["role"], string>> = {
  en: {
    principal_architect: "Principal Architect",
    sre_reviewer: "SRE Reviewer",
    security_reviewer: "Security Reviewer",
    cost_engineer: "Cost Engineer",
    pragmatic_builder: "Pragmatic Builder"
  },
  zh: {
    principal_architect: "首席架构师",
    sre_reviewer: "SRE 评审",
    security_reviewer: "安全评审",
    cost_engineer: "成本工程师",
    pragmatic_builder: "务实构建者"
  }
};

export default function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const [questions, setQuestions] = useState(defaultQuestions);
  const [hasRun, setHasRun] = useState(false);
  const t = copy[locale];
  const question = questions[locale];
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
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div>
          <span className="brand-mark">QM</span>
          <span className="brand-copy">QuorumMind</span>
        </div>
        <div className="language-switch" aria-label={t.language as string}>
          <button className={locale === "en" ? "active" : ""} type="button" onClick={() => setLocale("en")}>
            English
          </button>
          <button className={locale === "zh" ? "active" : ""} type="button" onClick={() => setLocale("zh")}>
            中文
          </button>
        </div>
      </header>

      <section className="hero-grid">
        <article className="hero-panel">
          <p className="eyebrow">{t.eyebrow as string}</p>
          <h1>{t.headline as string}</h1>
          <h2>{t.commandCenter as string}</h2>
          <p className="hero-lead">{t.lead as string}</p>
          <p className="hero-copy">{t.sublead as string}</p>
          <div className="status-rail">
            {(t.statusSteps as string[]).map((step, index) => (
              <span key={step}>
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                {step}
              </span>
            ))}
          </div>
        </article>

        <aside className="brief-panel">
          <div className="panel-heading">
            <p className="eyebrow">{t.briefTitle as string}</p>
            <span className="live-pill">Live demo</span>
          </div>
          <label htmlFor="question">{t.questionLabel as string}</label>
          <textarea
            id="question"
            value={question}
            onChange={(event) => setQuestions((current) => ({ ...current, [locale]: event.target.value }))}
          />
          <button className="primary-action" type="button" onClick={() => setHasRun(true)}>
            {t.runButton as string}
          </button>
          <div className="context-card">
            <h3>{t.contextTitle as string}</h3>
            <div className="chip-grid">
              {(t.context as string[]).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {result ? (
        <section className="command-grid">
          <article className="panel verdict-panel span-7">
            <p className="eyebrow">{t.finalVerdict as string}</p>
            <h2>{result.verdict.finalRecommendation.split(".")[0]}.</h2>
            <p className="note">{t.reportLanguageNote as string}</p>
            <div className="metric-row">
              <Metric label={t.quorumScore as string} value={result.verdict.quorumScore} />
              <Metric label={t.dissentIndex as string} value={result.verdict.dissentIndex} />
            </div>
          </article>

          <article className="panel council-panel span-5">
            <PanelTitle title={t.agentCouncil as string} kicker={t.roleAgent as string} />
            <div className="agent-list">
              {result.agents.map((agent) => (
                <div className="agent-card" key={agent.id}>
                  <span className="agent-avatar">{agent.name.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{roleLabels[locale][agent.role]}</strong>
                    <small>{agent.provider.toUpperCase()} / deterministic</small>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel span-4">
            <PanelTitle title={t.tradeoffRanking as string} kicker={t.selected as string} />
            <div className="ranking-list">
              {result.verdict.rankedProposals.map((proposal, index) => (
                <div className="ranking-row" key={proposal.proposalId}>
                  <span>#{index + 1}</span>
                  <strong>{proposal.proposalId.replace("-proposal-revised", "").replaceAll("-", " ")}</strong>
                  <div className="score-bar">
                    <i style={{ width: `${proposal.quorumScore}%` }} />
                  </div>
                  <em>
                    {proposal.quorumScore} {t.score as string}
                  </em>
                </div>
              ))}
            </div>
          </article>

          <article className="panel span-4">
            <PanelTitle title={t.riskRadar as string} kicker="Radar" />
            <ul className="risk-list">
              {result.verdict.riskRadar.map((risk) => (
                <li key={risk.description}>
                  <span className={`severity ${risk.severity}`}>{risk.severity}</span>
                  <strong>{riskLabel(locale, risk)}</strong>
                  <p>{risk.description}</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel span-4">
            <PanelTitle title={t.debateSignal as string} kicker={t.preMortem as string} />
            <div className="timeline">
              {result.verdict.preMortem.map((item, index) => (
                <div className="timeline-item" key={item}>
                  <span>{index + 1}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="panel span-5">
            <PanelTitle title={t.assumptions as string} kicker="Ledger" />
            <ul className="assumption-list">
              {result.verdict.assumptionLedger.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </article>

          <article className="panel adr-panel span-7">
            <PanelTitle title={t.adr as string} kicker="Markdown export" />
            <pre>{result.verdict.adrMarkdown}</pre>
          </article>
        </section>
      ) : (
        <section className="empty-state">
          <h2>{t.readyTitle as string}</h2>
          <p>{t.readyText as string}</p>
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelTitle({ title, kicker }: { title: string; kicker: string }) {
  return (
    <div className="panel-title">
      <span>{kicker}</span>
      <h2>{title}</h2>
    </div>
  );
}

function riskLabel(locale: Locale, risk: Risk) {
  return copy[locale].riskCategories[risk.category];
}
