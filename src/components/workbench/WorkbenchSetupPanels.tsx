import type { ReactNode } from "react";
import type { DecisionContext } from "../../lib/domain";
import type { DecisionApiHealth, ProviderConnectionTestResponse } from "../../lib/api-client";
import type { DecisionHistoryRecord } from "../../lib/decision-history";
import type { ManualProviderAgent } from "../../lib/manual-provider";
import { contextForQuestion, defaultQuestions } from "../../lib/question-context";
import { PanelHeading } from "../PanelTitle";
import { appCopy, blueprintDefaultQuestions, roleLabels, questionExamples, workflowStages } from "../../i18n/view-copy";
import type { ApiSecurityPosture, Locale, ProviderStatus, RunProgress, WorkspaceMode } from "../../types/app";
import { clampNumber, compactPreviewText, domainLabel, formatBytes, formatDuration, localizeText, productStageLabel, sensitivityLabel, uniquePreviewItems, yesNo } from "../../lib/view-utils";

export function ReadinessPanel(props: {
  locale: Locale;
  health: DecisionApiHealth | null;
  securityPosture: ApiSecurityPosture | null;
  providerStatus?: ProviderStatus;
  providerTest: ProviderConnectionTestResponse | null;
  running: RunProgress | null;
  onProviderTest: () => void;
}) {
  const { locale, health, securityPosture, providerStatus, providerTest, running, onProviderTest } = props;
  const t = appCopy[locale];
  const configuredProviders = Object.values(providerStatus ?? {}).filter((provider) => provider.configured).length;
  const rateLimit = securityPosture?.policy?.rateLimit;
  const providerMode = health?.providerMode ?? "demo";
  const sharingReady = Boolean(
    securityPosture?.controls.securityHeaders &&
      securityPosture.controls.corsAllowlist &&
      !securityPosture.controls.wildcardCors &&
      securityPosture.controls.authenticationRequired &&
      securityPosture.controls.rateLimiting &&
      securityPosture.controls.hstsEnabled
  );

  return (
    <section className="context-panel settings-panel">
      <PanelHeading
        title={t.setupReadiness}
        help={
          locale === "zh"
            ? "这里显示 API、CORS、Token、限流和模型 key 是否准备好。真实模型不可用时，系统会明确标识兜底。"
            : "Shows whether API, CORS, token, rate limit, and model keys are ready. Fallback is always labeled."
        }
      />
      <div className="settings-summary-grid">
        <article>
          <span>{locale === "zh" ? "当前用途" : "Current use"}</span>
          <strong>{sharingReady ? (locale === "zh" ? "可小范围分享" : "Shareable") : locale === "zh" ? "本地自用优先" : "Local use first"}</strong>
          <p>
            {sharingReady
              ? locale === "zh"
                ? "核心安全开关已开启，仍建议先用小范围用户验证真实模型质量。"
                : "Core security controls are enabled. Validate live-model quality with a small group first."
              : locale === "zh"
                ? "适合自己测试。给别人使用前，先补 Token、精确 CORS、限流、请求体限制和 HTTPS/HSTS。"
                : "Good for personal testing. Before sharing, add token, exact CORS, rate limits, body caps, and HTTPS/HSTS."}
          </p>
        </article>
        <article>
          <span>{locale === "zh" ? "模型模式" : "Model mode"}</span>
          <strong>{providerMode === "live" ? t.liveSource : t.demoSource}</strong>
          <p>
            {configuredProviders > 0
              ? locale === "zh"
                ? `已配置 ${configuredProviders} 个真实模型提供方；点击下方按钮可测试连接和 Schema。`
                : `${configuredProviders} live providers configured. Use the button below to test connectivity and schema.`
              : locale === "zh"
                ? "未检测到真实模型 key；结果会使用确定性或 mock 路径，并在结果来源里标识。"
                : "No live provider keys detected. Results use deterministic or mock paths and are labeled as such."}
          </p>
        </article>
      </div>
      <div className="readiness-list">
        <ReadinessItem
          locale={locale}
          label="API"
          status={health ? "good" : "watch"}
          value={health ? health.providerMode : locale === "zh" ? "未连接" : "Unavailable"}
          detail={health ? (locale === "zh" ? "服务端健康检查通过" : "Health check passed") : (locale === "zh" ? "仍可本地确定性运行" : "Local deterministic run remains available")}
        />
        <ReadinessItem
          locale={locale}
          label="CORS"
          status={securityPosture?.controls.corsAllowlist ? "good" : "watch"}
          value={securityPosture?.controls.corsAllowlist ? (locale === "zh" ? "白名单" : "Allowlist") : (locale === "zh" ? "待检查" : "Check")}
          detail={
            securityPosture
              ? securityPosture.controls.wildcardCors
                ? locale === "zh"
                  ? "检测到通配 CORS"
                  : "Wildcard CORS detected"
                : locale === "zh"
                  ? "当前来源应由服务端 allowlist 控制"
                  : "Current origin should be controlled by server allowlist"
              : locale === "zh"
                ? "服务端状态未知"
                : "Server status unknown"
          }
        />
        <ReadinessItem
          locale={locale}
          label="Token"
          status={securityPosture?.controls.authenticationRequired ? "good" : "watch"}
          value={securityPosture?.controls.authenticationRequired ? (locale === "zh" ? "已启用" : "Enabled") : (locale === "zh" ? "未强制" : "Not enforced")}
          detail={locale === "zh" ? "自用可放宽；对外建议强制 Token。" : "Acceptable for self-use; enforce token before sharing."}
        />
        <ReadinessItem
          locale={locale}
          label={locale === "zh" ? "限流" : "Rate limit"}
          status={securityPosture?.controls.rateLimiting ? "good" : "poor"}
          value={
            rateLimit
              ? `${rateLimit.maxRequests}/${formatDuration(rateLimit.windowMs, locale)}`
              : securityPosture?.controls.rateLimiting
                ? locale === "zh"
                  ? "已启用"
                  : "Enabled"
                : locale === "zh"
                  ? "未启用"
                  : "Disabled"
          }
          detail={locale === "zh" ? "防止误触发高频模型调用和浏览器脚本滥用。" : "Prevents accidental high-frequency model calls and browser abuse."}
        />
        <ReadinessItem
          locale={locale}
          label={locale === "zh" ? "请求体" : "Body size"}
          status={securityPosture ? (securityPosture.controls.maxBodyBytes <= 1024 * 1024 ? "good" : "watch") : "watch"}
          value={securityPosture ? formatBytes(securityPosture.controls.maxBodyBytes) : locale === "zh" ? "未知" : "Unknown"}
          detail={locale === "zh" ? "限制单次输入大小；长文建议分段进入蓝图室。" : "Caps one request; split long documents before Blueprint runs."}
        />
        <ReadinessItem
          locale={locale}
          label="HSTS"
          status={securityPosture?.controls.hstsEnabled ? "good" : "watch"}
          value={securityPosture?.controls.hstsEnabled ? (locale === "zh" ? "已启用" : "Enabled") : (locale === "zh" ? "未启用" : "Disabled")}
          detail={locale === "zh" ? "本地 HTTP 可关闭；对外 HTTPS 部署建议开启。" : "Fine off for local HTTP; enable for public HTTPS deployments."}
        />
        <ReadinessItem
          locale={locale}
          label={locale === "zh" ? "模型提供方" : "Providers"}
          status={configuredProviders > 0 ? "good" : "watch"}
          value={String(configuredProviders)}
          detail={locale === "zh" ? "已配置真实模型提供方数量；0 表示会走确定性或 mock 路径。" : "Configured live model providers; 0 means deterministic or mock paths."}
        />
        <ReadinessItem
          locale={locale}
          label={locale === "zh" ? "对外发布" : "Sharing"}
          status={sharingReady ? "good" : "watch"}
          value={sharingReady ? (locale === "zh" ? "基本就绪" : "Ready") : locale === "zh" ? "需加固" : "Harden first"}
          detail={
            locale === "zh"
              ? "给别人用前至少启用 Token、精确 CORS、限流、请求体限制，并在 HTTPS 后启用 HSTS。"
              : "Before sharing, require token, exact CORS, rate limit, body cap, and HSTS behind HTTPS."
          }
        />
      </div>
      <div className="provider-test-panel">
        <div>
          <strong>{t.providerTest}</strong>
          <small>{locale === "zh" ? "返回 key 是否配置、模型是否响应、schema 是否可用。" : "Returns key configuration, model response, and schema usability."}</small>
        </div>
        <button className="secondary-action" disabled={running?.kind === "provider-test"} onClick={onProviderTest}>
          {running?.kind === "provider-test" ? t.providerTesting : t.providerTest}
        </button>
        {providerTest && (
          <div className="provider-test-results">
            {providerTest.results.map((result) => (
              <article
                key={result.provider}
                className={`provider-test-item ${result.schemaUsable ? "good" : result.configured ? "watch" : "poor"}`}
              >
                <span>{result.provider}</span>
                <strong>{result.model}</strong>
                <small>
                  {locale === "zh" ? "配置" : "Configured"}: {yesNo(result.configured, locale)} ·{" "}
                  {locale === "zh" ? "响应" : "Responded"}: {yesNo(result.responded, locale)} · Schema:{" "}
                  {result.validationStatus}
                </small>
                {result.failureReason && <small>{result.failureReason}</small>}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function AgentConfigPanel({ locale, agents }: { locale: Locale; agents: ManualProviderAgent[] }) {
  return (
    <section className="agent-config-panel context-panel">
      <PanelHeading
        title={appCopy[locale].agentCouncil}
        kicker={String(agents.length)}
        help={
          locale === "zh"
            ? "这里是模型席位配置。权重会根据历史反馈轻微调整，但真实调用状态仍以 provider trace 为准。"
            : "Model council seats. Historical feedback can adjust weights, but live status still comes from provider trace."
        }
      />
      <div className="agent-config-list">
        {agents.map((agent) => (
          <article className="agent-config-card" key={agent.id}>
            <header>
              <strong>{agent.name}</strong>
              <span>{agent.providerLabel}</span>
            </header>
            <div className="agent-config-row">
              <label>
                <span>{locale === "zh" ? "角色" : "Role"}</span>
                <input value={roleLabels[locale][agent.role]} readOnly />
              </label>
              <label>
                <span>{locale === "zh" ? "权重" : "Weight"}</span>
                <input value={agent.effectiveWeight ?? agent.weight} readOnly />
              </label>
            </div>
            {agent.reputation && (
              <div className="agent-reputation-note">
                <span>{locale === "zh" ? "信誉权重" : "Reputation"}</span>
                <strong>{agent.reputation.score}/100 · {domainLabel(agent.reputation.domain, locale)}</strong>
                <small>{locale === "zh" ? "倍率" : "Multiplier"} {agent.reputation.weightMultiplier}</small>
                <p>{agent.reputation.reasons.slice(0, 2).map((reason) => localizeText(reason, locale)).join(" / ")}</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function ContextPanel({ locale, context }: { locale: Locale; context: DecisionContext }) {
  return (
    <section className="context-panel">
      <PanelHeading title={appCopy[locale].contextTitle} />
      <dl className="context-grid">
        <div>
          <dt>{locale === "zh" ? "阶段" : "Stage"}</dt>
          <dd>{productStageLabel(context.productStage, locale)}</dd>
        </div>
        <div>
          <dt>{locale === "zh" ? "团队" : "Team"}</dt>
          <dd>{localizeText(context.teamProfile, locale)}</dd>
        </div>
        <div>
          <dt>{locale === "zh" ? "可靠性" : "Reliability"}</dt>
          <dd>{sensitivityLabel(context.reliabilityRequirement, locale)}</dd>
        </div>
        <div>
          <dt>{locale === "zh" ? "安全" : "Security"}</dt>
          <dd>{sensitivityLabel(context.securityRequirement, locale)}</dd>
        </div>
      </dl>
      <div className="token-list" aria-label={locale === "zh" ? "候选方案" : "Candidate options"}>
        {context.candidateOptions.map((option) => (
          <span key={option}>{localizeText(option, locale)}</span>
        ))}
      </div>
    </section>
  );
}

export function WorkflowPanel({ locale, workspaceMode, hasResult }: { locale: Locale; workspaceMode: WorkspaceMode; hasResult: boolean }) {
  const steps = workflowStages[workspaceMode][locale];
  return (
    <section className="workflow-panel">
      <PanelHeading title={appCopy[locale].stagesTitle} />
      <ol>
        {steps.map((step, index) => (
          <li key={step} className={hasResult || index === 0 ? "complete" : ""}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function HistoryPanel({
  locale,
  records,
  onRestore
}: {
  locale: Locale;
  records: DecisionHistoryRecord[];
  onRestore: (record: DecisionHistoryRecord) => void;
}) {
  return (
    <section className="context-panel">
      <PanelHeading title={appCopy[locale].historyTitle} />
      {records.length === 0 ? (
        <p className="field-help">{appCopy[locale].historyEmpty}</p>
      ) : (
        <ul className="history-list">
          {records.slice(0, 8).map((record) => (
            <li key={record.id}>
              <button onClick={() => onRestore(record)}>
                <strong>{record.question}</strong>
                <span>
                  {record.kind === "blueprint" ? appCopy[locale].workspaceBlueprint : appCopy[locale].workspaceDecision} ·{" "}
                  {record.providerMode} · {record.quorumScore}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RunProgressPanel({ locale, running }: { locale: Locale; running: RunProgress }) {
  return (
    <article className="run-progress-panel">
      <header>
        <span>{running.stage}</span>
        <strong>{running.progress}%</strong>
      </header>
      <div className="run-progress-bar">
        <span style={{ transform: `scaleX(${clampNumber(running.progress, 0, 100) / 100})` }} />
      </div>
      <p>{running.message}</p>
      {running.modelCall && (
        <div className="model-call-progress">
          {locale === "zh" ? "当前模型/阶段：" : "Current model/stage: "}
          {running.modelCall}
        </div>
      )}
    </article>
  );
}

export function QuestionExamplesPanel({
  locale,
  workspaceMode,
  examples,
  onSelect
}: {
  locale: Locale;
  workspaceMode: WorkspaceMode;
  examples: string[];
  onSelect: (question: string) => void;
}) {
  return (
    <section className="question-examples" aria-label={locale === "zh" ? "参考问题" : "Reference questions"}>
      <div>
        <strong>{locale === "zh" ? "参考问题" : "Reference questions"}</strong>
        <span>
          {workspaceMode === "blueprint"
            ? locale === "zh"
              ? "点一个普通说法，再按你的真实情况改。"
              : "Pick a plain-language request, then adapt it."
            : locale === "zh"
              ? "点一个取舍问题，再补团队、时间和约束。"
              : "Pick a trade-off question, then add team, timing, and constraints."}
        </span>
      </div>
      <div className="question-example-list">
        {examples.map((example) => (
          <button type="button" key={example} onClick={() => onSelect(example)}>
            {example}
          </button>
        ))}
      </div>
    </section>
  );
}

export type LiveQuestionPreview = {
  label: string;
  title: string;
  description: string;
  tags: string[];
};

export function buildLiveQuestionPreview(input: {
  locale: Locale;
  workspaceMode: WorkspaceMode;
  question: string;
  context: DecisionContext;
}): LiveQuestionPreview {
  const { locale, workspaceMode, question, context } = input;
  const zh = locale === "zh";
  const normalizedQuestion = question.replace(/\s+/g, " ").trim();
  const fallbackQuestion = workspaceMode === "blueprint" ? blueprintDefaultQuestions[locale] : defaultQuestions[locale];
  const sourceQuestion = normalizedQuestion || fallbackQuestion;
  const tags =
    workspaceMode === "blueprint"
      ? blueprintQuestionPreviewTags(sourceQuestion, locale)
      : decisionQuestionPreviewTags(sourceQuestion, locale, context);
  const visibleTags = uniquePreviewItems(tags).slice(0, 8);

  if (workspaceMode === "blueprint") {
    return {
      label: normalizedQuestion ? (zh ? "当前需求" : "Current request") : zh ? "示例" : "Example",
      title: compactPreviewText(sourceQuestion, zh ? 92 : 150),
      description:
        visibleTags.length > 0
          ? zh
            ? `已识别：${visibleTags.slice(0, 6).join("、")}。运行后会围绕这些内容生成 Agent 分工、工作流、Schema、风险和最终方案。`
            : `Detected: ${visibleTags.slice(0, 6).join(", ")}. The run will use these to generate agents, workflow, schemas, risks, and the final plan.`
          : zh
            ? "运行后会根据当前需求生成 Agent 分工、工作流、Schema、风险和最终方案。"
            : "The run will generate agents, workflow, schemas, risks, and the final plan from the current request.",
      tags: visibleTags
    };
  }

  return {
    label: normalizedQuestion ? (zh ? "当前问题" : "Current question") : zh ? "示例" : "Example",
    title: compactPreviewText(sourceQuestion, zh ? 92 : 150),
    description:
      context.candidateOptions.length > 0
        ? zh
          ? `已识别候选路径：${context.candidateOptions.slice(0, 3).join("、")}。运行后会比较收益、风险、成本、复杂度和可逆性。`
          : `Detected options: ${context.candidateOptions.slice(0, 3).join(", ")}. The run will compare value, risk, cost, complexity, and reversibility.`
        : zh
          ? "运行后会根据当前问题生成候选方案、风险、分歧和 ADR。"
          : "The run will generate options, risks, disagreement, and an ADR from the current question.",
    tags: visibleTags
  };
}

export function blueprintQuestionPreviewTags(question: string, locale: Locale): string[] {
  const zh = locale === "zh";
  const text = question.toLowerCase();
  const candidates: Array<[RegExp, string]> = zh
    ? [
        [/订单|order/, "订单数据"],
        [/库存|inventory|stock|sku/, "库存数据"],
        [/广告|投放|预算|campaign|ad/, "广告投放"],
        [/客服|对话|support|conversation/, "客服对话"],
        [/简报|brief/, "每日运营简报"],
        [/补货|replenishment/, "补货建议"],
        [/差评|评价|review/, "差评处理"],
        [/话术|回复|reply/, "客服话术"],
        [/agent|智能体|多 agent|多agent/, "Agent 分工"],
        [/数据流|数据从|workflow|工作流/, "数据流与工作流"],
        [/schema|字段|json/, "JSON Schema"],
        [/风险|错误建议|积压|浪费|误回复/, "风险控制"],
        [/mvp|迭代|版本/, "MVP 路线"],
        [/评估|准确|延迟|成本|采纳率|效果/, "评估指标"]
      ]
    : [
        [/order/, "order data"],
        [/inventory|stock|sku/, "inventory data"],
        [/ad|campaign|budget/, "ad campaigns"],
        [/support|conversation/, "support conversations"],
        [/brief/, "daily brief"],
        [/replenishment/, "replenishment advice"],
        [/review|rating/, "review handling"],
        [/reply|script/, "support scripts"],
        [/agent|multi-agent/, "agent responsibilities"],
        [/workflow|data flow/, "workflow"],
        [/schema|field|json/, "JSON Schema"],
        [/risk|wrong|waste|overstock/, "risk controls"],
        [/mvp|iteration|version/, "MVP roadmap"],
        [/evaluation|accuracy|latency|cost|adoption/, "evaluation metrics"]
      ];

  return candidates.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
}

export function decisionQuestionPreviewTags(question: string, locale: Locale, context: DecisionContext): string[] {
  const zh = locale === "zh";
  const text = question.toLowerCase();
  const keywordTags: Array<[RegExp, string]> = zh
    ? [
        [/微服务|microservice/, "微服务"],
        [/单体|monolith/, "单体架构"],
        [/postgres|tenant|租户/, "租户隔离"],
        [/成本|预算|cost/, "成本"],
        [/可靠|稳定|reliability/, "可靠性"],
        [/安全|security/, "安全"],
        [/交付|速度|time/, "交付速度"]
      ]
    : [
        [/microservice/, "microservices"],
        [/monolith/, "monolith"],
        [/postgres|tenant/, "tenant isolation"],
        [/cost|budget/, "cost"],
        [/reliability|stable/, "reliability"],
        [/security/, "security"],
        [/delivery|speed|time/, "delivery speed"]
      ];

  return [
    ...keywordTags.filter(([pattern]) => pattern.test(text)).map(([, label]) => label),
    ...context.candidateOptions.slice(0, 4)
  ];
}

export function EmptyState({
  locale,
  workspaceMode,
  question,
  context
}: {
  locale: Locale;
  workspaceMode: WorkspaceMode;
  question: string;
  context: DecisionContext;
}) {
  const preview = buildLiveQuestionPreview({ locale, workspaceMode, question, context });

  return (
    <article className="empty-state">
      <PanelHeading
        title={appCopy[locale].readyTitle}
        kicker={workspaceMode === "blueprint" ? appCopy[locale].workspaceBlueprint : appCopy[locale].workspaceDecision}
      />
      <p>{appCopy[locale].readyText}</p>
      <div className="live-question-preview">
        <span>{preview.label}</span>
        <strong>{preview.title}</strong>
        <p>{preview.description}</p>
        {preview.tags.length > 0 && (
          <div className="live-question-tags" aria-label={locale === "zh" ? "识别到的关注点" : "Detected focus areas"}>
            {preview.tags.map((tag) => (
              <small key={tag}>{tag}</small>
            ))}
          </div>
        )}
      </div>
      <div className="empty-preview">
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

export function SideEmpty({ locale }: { locale: Locale }) {
  return (
    <section className="empty-state">
      <PanelHeading title={appCopy[locale].readyTitle} />
      <p>{locale === "zh" ? "运行后这里会展示指标解释、分歧来源、风险矩阵、模型 trace 和 Prompt 包。" : "After a run this panel shows metrics, dissent drivers, risk matrix, model trace, and prompt bundle."}</p>
    </section>
  );
}

export function SidebarDisclosure({
  title,
  summary,
  children,
  defaultOpen = false
}: {
  title: string;
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="sidebar-disclosure" open={defaultOpen}>
      <summary>
        <strong>{title}</strong>
        <small>{summary}</small>
      </summary>
      <div className="sidebar-disclosure-body">{children}</div>
    </details>
  );
}

export function OnboardingPanel({ locale, workspaceMode }: { locale: Locale; workspaceMode: WorkspaceMode }) {
  return (
    <details className="onboarding-panel">
      <summary>
        <span>{locale === "zh" ? "新手引导" : "Quick start"}</span>
        <strong>{locale === "zh" ? "应该怎么用？" : "How to use this workspace"}</strong>
        <small>
          {workspaceMode === "blueprint"
            ? locale === "zh"
              ? "开放式问题用蓝图室；决策取舍用决策室。"
              : "Use Blueprint for open-ended plans and Decision Room for trade-offs."
            : locale === "zh"
              ? "输入一个需要取舍的问题，运行后看共识、分歧和风险。"
              : "Enter a trade-off question, then inspect consensus, dissent, and risks."}
        </small>
      </summary>
      <ol>
        <li>{locale === "zh" ? "先选择工作区：决策室或方案蓝图。" : "Choose a workspace: Decision Room or Blueprint."}</li>
        <li>{locale === "zh" ? "输入当前真实问题，不需要手动改候选方案。" : "Enter the real question; no need to manually edit candidate options."}</li>
        <li>{locale === "zh" ? "看结果来源：真实模型、确定性兜底和 schema 修复都会显示。" : "Check the source badge: live, deterministic, and schema repair are labeled."}</li>
        <li>{locale === "zh" ? "指标旁的小问号可以解释裁决综合分、分歧、稳定率和 schema 可用性。" : "Use the small help markers to read Decision Score, dissent, stability, and schema usability."}</li>
        <li>{locale === "zh" ? "给别人使用前，先看就绪检查里的 Token、CORS、限流、请求体和 HSTS。" : "Before sharing, check token, CORS, rate limit, body size, and HSTS in setup readiness."}</li>
      </ol>
      <div className="onboarding-tip-grid">
        <span>{locale === "zh" ? "指标速读" : "Metric cheat sheet"}</span>
        <p>
          {locale === "zh"
            ? "裁决综合分高代表排序、效用、置信度和后悔惩罚后的综合结果更强；分歧高代表仍有明显争议；赢家稳定率高只说明权重扰动下赢家不易变，不代表风险低。"
            : "A high Decision Score means ranking, utility, confidence, and regret produce a stronger aggregate result; high dissent means material disagreement remains; winner stability means the winner survives weight changes, not that risk is low."}
        </p>
      </div>
      <div className="onboarding-example">
        <span>{locale === "zh" ? "适合测试的问题" : "Good test question"}</span>
        <p>
          {workspaceMode === "blueprint"
            ? blueprintDefaultQuestions[locale]
            : locale === "zh"
              ? "我们是否应该把当前单体 Node.js 后端拆成微服务？团队 5 人，未来 6 个月主要目标是快速交付企业客户功能。"
              : "Should our 5-person team split the current Node.js monolith into microservices while the next six months focus on enterprise feature delivery?"}
        </p>
      </div>
    </details>
  );
}

export function ReadinessItem({
  locale,
  label,
  status,
  value,
  detail
}: {
  locale: Locale;
  label: string;
  status: "good" | "watch" | "poor";
  value: string;
  detail: string;
}) {
  return (
    <div className={`readiness-item ${status}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      <span className="sr-only">{locale}</span>
    </div>
  );
}
