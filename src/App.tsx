import { useEffect, useMemo, useRef, useState } from "react";
import type { DecisionMode } from "./lib/domain";
import type { BlueprintRoomResult } from "./lib/blueprint";
import { contextForQuestion, defaultQuestions } from "./lib/question-context";
import { defaultManualProviderAgents } from "./lib/manual-provider";
import {
  readDecisionHistoryRecords,
  type DecisionHistoryRecord
} from "./lib/decision-history";
import {
  type AutonomousBlueprintRun,
  type BlueprintExecutionMode,
  type DecisionApiHealth,
  type DecisionApiResponse,
  type ProviderConnectionTestResponse
} from "./lib/api-client";
import type {
  ApiSecurityPosture,
  AppSurface,
  BlueprintSnapshot,
  DecisionReviewLoopState,
  DecisionRoomResult,
  DecisionSnapshot,
  Locale,
  RunProgress,
  WorkspaceMode
} from "./types/app";
import { applyModelReputation } from "./lib/model-reputation";
import { readModelReputationFeedback } from "./lib/reputation-feedback";
import {
  appCopy,
  blueprintDefaultQuestions,
  questionExamples,
  runProfiles,
} from "./i18n/view-copy";
import { PanelHeading } from "./components/PanelTitle";
import { WorkbenchIntro } from "./components/WorkbenchIntro";
import { LandingPage } from "./components/LandingPage";
import { ProviderPolicyStatusPanel } from "./components/ProviderPolicyStatusPanel";
import { DecisionResultView } from "./components/DecisionResultView";
import { BlueprintResultView } from "./components/BlueprintResultView";
import { DecisionInspector } from "./components/DecisionInspector";
import { BlueprintInspector } from "./components/BlueprintInspector";
import { useApiStatus } from "./hooks/useApiStatus";
import { useProviderTest } from "./hooks/useProviderTest";
import { useClipboardNotice } from "./hooks/useClipboardNotice";
import { useModelFeedback } from "./hooks/useModelFeedback";
import { useDecisionRuns } from "./hooks/useDecisionRuns";
import { useBlueprintRuns } from "./hooks/useBlueprintRuns";
import { useRunHistory } from "./hooks/useRunHistory";
import {
  AgentConfigPanel,
  ContextPanel,
  EmptyState,
  HistoryPanel,
  OnboardingPanel,
  QuestionExamplesPanel,
  ReadinessPanel,
  RunProgressPanel,
  SidebarDisclosure,
  WorkflowPanel,
  advanceRunProgress,
  clampNumber,
  connectionBadgeLabel,
  estimateProviderCalls,
  estimateTokens,
  localizeText,
  modeLabel,
  preferredLocale,
  readStoredNumber,
  readStoredValue,
  renderHumanReviewPackage,
  shortId
} from "./components/WorkbenchShared";
import "./styles.css";

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => readStoredValue("quorummind.locale", preferredLocale()));
  const [appSurface, setAppSurface] = useState<AppSurface>("landing");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("decision");
  const [decisionMode, setDecisionMode] = useState<DecisionMode>("deep");
  const [decisionQuestions, setDecisionQuestions] = useState(defaultQuestions);
  const [blueprintQuestions, setBlueprintQuestions] = useState(blueprintDefaultQuestions);
  const [blueprintExecutionMode, setBlueprintExecutionMode] = useState<BlueprintExecutionMode>(() =>
    readStoredValue("quorummind.blueprint.executionMode", "live")
  );
  const [maxProviderRounds, setMaxProviderRounds] = useState(() =>
    readStoredNumber("quorummind.blueprint.maxProviderRounds", 5)
  );
  const [agentThreadId, setAgentThreadId] = useState<string>(() =>
    readStoredValue("quorummind.agent.threadId", `qm-${shortId()}`)
  );
  const [maxConsensusRounds, setMaxConsensusRounds] = useState(() =>
    readStoredNumber("quorummind.agent.maxConsensusRounds", 4)
  );
  const [humanReviewNote, setHumanReviewNote] = useState("");
  const [decisionResult, setDecisionResult] = useState<DecisionRoomResult | null>(null);
  const [decisionSnapshot, setDecisionSnapshot] = useState<DecisionSnapshot | null>(null);
  const [decisionReviewLoop, setDecisionReviewLoop] = useState<DecisionReviewLoopState | null>(null);
  const [blueprintResult, setBlueprintResult] = useState<BlueprintRoomResult | null>(null);
  const [blueprintSnapshot, setBlueprintSnapshot] = useState<BlueprintSnapshot | null>(null);
  const [agentRun, setAgentRun] = useState<AutonomousBlueprintRun | null>(null);
  const [health, setHealth] = useState<DecisionApiHealth | null>(null);
  const [securityPosture, setSecurityPosture] = useState<ApiSecurityPosture | null>(null);
  const [providerTest, setProviderTest] = useState<ProviderConnectionTestResponse | null>(null);
  const [historyRecords, setHistoryRecords] = useState<DecisionHistoryRecord[]>(() => readDecisionHistoryRecords());
  const [reputationFeedback, setReputationFeedback] = useState(() => readModelReputationFeedback());
  const [running, setRunning] = useState<RunProgress | null>(null);
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const t = appCopy[locale];
  const activeQuestion = workspaceMode === "decision" ? decisionQuestions[locale] : blueprintQuestions[locale];
  const activeContext = useMemo(() => contextForQuestion(activeQuestion), [activeQuestion]);
  const effectiveAgents = useMemo(
    () => applyModelReputation(defaultManualProviderAgents, { question: activeQuestion, context: activeContext }, reputationFeedback),
    [activeContext, activeQuestion, reputationFeedback]
  );
  const activePromptBundle =
    workspaceMode === "decision" ? decisionSnapshot?.promptBundle : blueprintSnapshot?.promptBundle;

  const refreshApiStatus = useApiStatus({
    locale,
    setHealth,
    setSecurityPosture,
    setRuntimeNotice
  });

  const handleProviderTest = useProviderTest({
    locale,
    setRunning,
    setRuntimeNotice,
    setProviderTest,
    setHealth
  });

  const copyText = useClipboardNotice({
    locale,
    setRuntimeNotice,
    copiedNotice: t.copied
  });

  const handleFeedback = useModelFeedback({
    locale,
    activeQuestion,
    activeContext,
    effectiveAgents,
    setReputationFeedback,
    setFeedbackNotice
  });

  const {
    handleRunDecision,
    handleRunDecisionReviewToThreshold,
    handleDecisionExport
  } = useDecisionRuns({
    locale,
    decisionMode,
    decisionQuestions,
    activeContext,
    effectiveAgents,
    reputationFeedback,
    health,
    decisionResult,
    decisionSnapshot,
    setDecisionResult,
    setDecisionSnapshot,
    setDecisionReviewLoop,
    setHistoryRecords,
    setRunning,
    setRuntimeNotice,
    setFeedbackNotice,
    setWorkspaceMode,
    abortRef
  });

  const {
    handleRunBlueprint,
    handleRunAgentPlatform,
    handleBlueprintExport
  } = useBlueprintRuns({
    locale,
    decisionMode,
    blueprintQuestions,
    blueprintExecutionMode,
    maxProviderRounds,
    agentThreadId,
    maxConsensusRounds,
    humanReviewNote,
    activeContext,
    effectiveAgents,
    reputationFeedback,
    health,
    blueprintResult,
    blueprintSnapshot,
    setBlueprintResult,
    setBlueprintSnapshot,
    setAgentRun,
    setHistoryRecords,
    setRunning,
    setRuntimeNotice,
    setWorkspaceMode,
    abortRef
  });

  const { handleRestoreHistory } = useRunHistory({
    locale,
    health,
    setWorkspaceMode,
    setDecisionResult,
    setDecisionSnapshot,
    setDecisionQuestions,
    setBlueprintResult,
    setBlueprintSnapshot,
    setBlueprintQuestions,
    setAgentRun
  });

  function updateCurrentQuestion(value: string) {
    setRuntimeNotice(null);

    if (workspaceMode === "decision") {
      setDecisionQuestions((current) => ({ ...current, [locale]: value }));
      setDecisionResult(null);
      setDecisionSnapshot(null);
      setDecisionReviewLoop(null);
    } else {
      setBlueprintQuestions((current) => ({ ...current, [locale]: value }));
      setBlueprintResult(null);
      setBlueprintSnapshot(null);
      setAgentRun(null);
    }
  }

  useEffect(() => {
    void refreshApiStatus();
  }, [refreshApiStatus]);

  useEffect(() => {
    localStorage.setItem("quorummind.locale", locale);
  }, [locale]);

  useEffect(() => {
    localStorage.setItem("quorummind.blueprint.executionMode", blueprintExecutionMode);
  }, [blueprintExecutionMode]);

  useEffect(() => {
    localStorage.setItem("quorummind.blueprint.maxProviderRounds", String(maxProviderRounds));
  }, [maxProviderRounds]);

  useEffect(() => {
    localStorage.setItem("quorummind.agent.threadId", agentThreadId);
  }, [agentThreadId]);

  useEffect(() => {
    localStorage.setItem("quorummind.agent.maxConsensusRounds", String(maxConsensusRounds));
  }, [maxConsensusRounds]);

  useEffect(() => {
    if (!running) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRunning((current) => advanceRunProgress(current, locale));
    }, 900);

    return () => window.clearInterval(intervalId);
  }, [running?.kind, locale]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (workspaceMode === "decision") {
          handleRunDecision();
        } else {
          handleRunBlueprint();
        }
      }
      if (event.key === "Escape" && running) {
        cancelRun();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [workspaceMode, running, locale, decisionMode, decisionQuestions, blueprintExecutionMode]);

  function cancelRun() {
    abortRef.current?.abort();
    abortRef.current = null;
    setDecisionReviewLoop((current) =>
      current?.status === "running"
        ? {
            ...current,
            status: "cancelled",
            finalMessage: locale === "zh" ? "深度复审已取消。" : "Deep review was cancelled."
          }
        : current
    );
    setRunning(null);
    setRuntimeNotice(locale === "zh" ? "已取消当前运行。" : "Current run cancelled.");
  }

  const sourceProviderMode =
    workspaceMode === "decision"
      ? decisionSnapshot?.providerMode
      : blueprintSnapshot?.providerMode ?? (agentRun?.platform.source === "live_model_trace_with_deterministic_synthesis" ? "live" : "demo");
  const sourceProviderStatus =
    workspaceMode === "decision" ? decisionSnapshot?.providerStatus : blueprintSnapshot?.providerStatus ?? health?.providerStatus;
  const activeWorkspaceLabel = workspaceMode === "decision" ? t.workspaceDecision : t.workspaceBlueprint;
  const workbenchHint =
    workspaceMode === "decision"
      ? locale === "zh"
        ? "输入取舍问题，运行后查看共识、分歧、风险和可导出的 ADR。"
        : "Enter a trade-off question, then review consensus, dissent, risks, and an exportable ADR."
      : locale === "zh"
        ? "输入开放式需求，运行后查看 Agent 分工、工作流、风险和最终方案。"
        : "Enter an open-ended request, then review agents, workflow, risks, and the final blueprint.";
  const workbenchSourceLabel = sourceProviderMode === "live" ? t.liveSource : sourceProviderMode === "demo" ? t.demoSource : locale === "zh" ? "等待连接" : "Waiting";

  if (appSurface === "landing") {
    return (
      <LandingPage
        locale={locale}
        health={health}
        sourceProviderMode={sourceProviderMode}
        onLocaleChange={setLocale}
        onEnterWorkbench={() => setAppSurface("workbench")}
        onTrySample={() => {
          setWorkspaceMode("blueprint");
          setAppSurface("workbench");
        }}
      />
    );
  }

  return (
    <main className="product-shell">
      <header className="topbar">
        <button className="brand-lockup brand-button" onClick={() => setAppSurface("landing")}>
          <span className="brand-mark">QM</span>
          <div>
            <strong>{t.productName}</strong>
            <small>{t.productKind}</small>
          </div>
        </button>
        <div className="topbar-actions">
          <span className="demo-badge">{connectionBadgeLabel(locale, health, sourceProviderMode)}</span>
          <div className="language-switch" aria-label={t.language}>
            <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>
              EN
            </button>
            <button className={locale === "zh" ? "active" : ""} onClick={() => setLocale("zh")}>
              中文
            </button>
          </div>
        </div>
      </header>

      <WorkbenchIntro
        title={t.productKind}
        workspaceLabel={activeWorkspaceLabel}
        hint={workbenchHint}
        sourceLabel={workbenchSourceLabel}
        statusLabel={locale === "zh" ? "当前工作台状态" : "Current workspace status"}
        modeLabel={locale === "zh" ? "当前模式" : "Mode"}
        sourceTitle={t.source}
      />

      <div className="workspace-grid">
        <aside className="setup-column" aria-label={locale === "zh" ? "运行设置" : "Run setup"}>
          <OnboardingPanel locale={locale} workspaceMode={workspaceMode} />

          <section className="settings-panel context-panel">
            <PanelHeading title={t.workspaceLabel} />
            <div className="profile-switch workspace-switch">
              <button
                className={workspaceMode === "decision" ? "active" : ""}
                onClick={() => setWorkspaceMode("decision")}
              >
                {t.workspaceDecision}
              </button>
              <button
                className={workspaceMode === "blueprint" ? "active" : ""}
                onClick={() => setWorkspaceMode("blueprint")}
              >
                {t.workspaceBlueprint}
              </button>
            </div>
          </section>

          <section className="panel-block">
            <label className="field-label" htmlFor="question">
              {workspaceMode === "decision" ? t.questionLabel : t.blueprintQuestionLabel}
            </label>
            <textarea
              id="question"
              aria-label={workspaceMode === "decision" ? t.questionLabel : t.blueprintQuestionLabel}
              value={workspaceMode === "decision" ? decisionQuestions[locale] : blueprintQuestions[locale]}
              onChange={(event) => updateCurrentQuestion(event.target.value)}
            />
            <p className="field-help">
              {locale === "zh"
                ? "可以问二选一决策，也可以在方案蓝图里问开放式需求。结果会按当前问题重新生成。"
                : "Ask either a trade-off decision or an open-ended Blueprint request. Results regenerate from the current question."}
            </p>
            <QuestionExamplesPanel
              locale={locale}
              workspaceMode={workspaceMode}
              examples={questionExamples[workspaceMode][locale]}
              onSelect={updateCurrentQuestion}
            />
          </section>

          <section className="context-panel">
            <PanelHeading title={t.decisionModeLabel} />
            <div className="profile-switch">
              {runProfiles.map((profile) => (
                <button
                  key={profile}
                  className={decisionMode === profile ? "active" : ""}
                  onClick={() => setDecisionMode(profile)}
                >
                  {modeLabel(profile, locale)}
                </button>
              ))}
            </div>
          </section>

          {workspaceMode === "blueprint" && (
            <section className="context-panel blueprint-execution-panel">
              <PanelHeading
                title={locale === "zh" ? "蓝图运行模式" : "Blueprint execution"}
                help={
                  locale === "zh"
                    ? "快速确定性不会调用真实模型；真实模型深度蓝图会请求 provider trace，如果不可用会明确显示兜底。"
                    : "Fast deterministic mode skips live models. Live deep Blueprint requests provider trace and shows fallback when unavailable."
                }
              />
              <div className="profile-switch">
                <button
                  className={blueprintExecutionMode === "deterministic" ? "active" : ""}
                  onClick={() => setBlueprintExecutionMode("deterministic")}
                >
                  {t.fastDeterministic}
                </button>
                <button
                  className={blueprintExecutionMode === "live" ? "active" : ""}
                  onClick={() => setBlueprintExecutionMode("live")}
                >
                  {t.liveDeepBlueprint}
                </button>
              </div>
              <div className="blueprint-cost-estimate">
                <strong>{t.costEstimate}</strong>
                <dl>
                  <div>
                    <dt>{t.estimatedCalls}</dt>
                    <dd>{blueprintExecutionMode === "live" ? estimateProviderCalls(maxProviderRounds) : 0}</dd>
                  </div>
                  <div>
                    <dt>{t.estimatedTokens}</dt>
                    <dd>{blueprintExecutionMode === "live" ? `${estimateTokens(maxProviderRounds)}k` : "0"}</dd>
                  </div>
                  <div>
                    <dt>{t.timeoutWindow}</dt>
                    <dd>{blueprintExecutionMode === "live" ? `${Math.max(1, maxProviderRounds) * 20}s` : "<1s"}</dd>
                  </div>
                </dl>
                <label>
                  <span className="field-label">{locale === "zh" ? "最多 provider 阶段" : "Max provider phases"}</span>
                  <input
                    min={1}
                    max={5}
                    type="number"
                    value={maxProviderRounds}
                    onChange={(event) => setMaxProviderRounds(clampNumber(event.target.valueAsNumber, 1, 5))}
                  />
                </label>
              </div>
            </section>
          )}

          <div className="run-control-row">
            <button
              className="primary-action"
              disabled={Boolean(running)}
              onClick={workspaceMode === "decision" ? handleRunDecision : handleRunBlueprint}
            >
              {running?.kind === workspaceMode ? "..." : workspaceMode === "decision" ? t.runDecision : t.runBlueprint}
            </button>
            {workspaceMode === "decision" ? (
              <button
                className="review-action"
                disabled={Boolean(running)}
                onClick={handleRunDecisionReviewToThreshold}
              >
                {running?.kind === "decision-review"
                  ? "..."
                  : locale === "zh"
                    ? "基于当前结果复审到 80"
                    : "Review current result to 80"}
              </button>
            ) : null}
            {running ? (
              <button className="secondary-action" onClick={cancelRun}>
                {t.cancel}
              </button>
            ) : null}
          </div>

          {workspaceMode === "blueprint" && (
            <SidebarDisclosure
              title={t.agentRuntime}
              summary={
                locale === "zh"
                  ? "线程、共识轮次和人工复审入口。"
                  : "Thread, consensus rounds, and human-review controls."
              }
            >
              <div className="agent-runtime-panel">
                <label>
                  <span>{t.checkpointThread}</span>
                  <input value={agentThreadId} onChange={(event) => setAgentThreadId(event.target.value)} />
                  <small>
                    {locale === "zh"
                      ? "保持相同 thread 可复用 MemorySaver checkpoint。"
                      : "Keep the same thread to reuse MemorySaver checkpoint state."}
                  </small>
                </label>
                <label>
                  <span>{t.maxRounds}</span>
                  <input
                    min={1}
                    max={6}
                    type="number"
                    value={maxConsensusRounds}
                    onChange={(event) => setMaxConsensusRounds(clampNumber(event.target.valueAsNumber, 1, 6))}
                  />
                </label>
                <label>
                  <span>{t.humanReviewNote}</span>
                  <textarea
                    className="compact-textarea"
                    value={humanReviewNote}
                    onChange={(event) => setHumanReviewNote(event.target.value)}
                  />
                </label>
                <button className="agent-platform-action" disabled={Boolean(running)} onClick={handleRunAgentPlatform}>
                  {t.runAgent}
                </button>
              </div>
            </SidebarDisclosure>
          )}

          {runtimeNotice && <p className="runtime-notice">{runtimeNotice}</p>}

          <SidebarDisclosure
            title={locale === "zh" ? "设置页" : "Settings"}
            summary={
              locale === "zh"
                ? "API、模型连接、安全策略和对外使用状态。"
                : "API, model connections, security policy, and sharing readiness."
            }
            defaultOpen
          >
            <ReadinessPanel
              locale={locale}
              health={health}
              securityPosture={securityPosture}
              providerStatus={sourceProviderStatus}
              providerTest={providerTest}
              running={running}
              onProviderTest={handleProviderTest}
            />
            <ProviderPolicyStatusPanel locale={locale} providerStatus={sourceProviderStatus} />
          </SidebarDisclosure>

          <SidebarDisclosure
            title={t.agentCouncil}
            summary={
              locale === "zh"
                ? "查看当前专家权重和声誉修正。"
                : "Review current expert weights and reputation adjustments."
            }
          >
            <AgentConfigPanel locale={locale} agents={effectiveAgents} />
          </SidebarDisclosure>

          <SidebarDisclosure
            title={locale === "zh" ? "上下文与流程" : "Context and workflow"}
            summary={
              locale === "zh"
                ? "问题类型、候选方案和阶段路径。"
                : "Question type, candidate paths, and stage flow."
            }
          >
            <ContextPanel locale={locale} context={activeContext} />
            <WorkflowPanel locale={locale} workspaceMode={workspaceMode} hasResult={Boolean(decisionResult || blueprintResult)} />
          </SidebarDisclosure>

          <SidebarDisclosure
            title={t.historyTitle}
            summary={
              locale === "zh"
                ? "恢复之前的决策或蓝图运行。"
                : "Restore previous decision or Blueprint runs."
            }
          >
            <HistoryPanel locale={locale} records={historyRecords} onRestore={handleRestoreHistory} />
          </SidebarDisclosure>
        </aside>

        <section className="room-column" aria-live="polite">
          {running && <RunProgressPanel locale={locale} running={running} />}

          {workspaceMode === "decision" ? (
            decisionResult ? (
              <DecisionResultView
                locale={locale}
                question={decisionQuestions[locale]}
                result={decisionResult}
                snapshot={decisionSnapshot}
                onExport={handleDecisionExport}
                onCopyPrompt={() =>
                  copyText(JSON.stringify(decisionSnapshot?.promptBundle ?? {}, null, 2), t.copied)
                }
                onFeedback={handleFeedback}
                feedbackNotice={feedbackNotice}
              />
            ) : (
              <EmptyState
                locale={locale}
                workspaceMode="decision"
                question={decisionQuestions[locale]}
                context={activeContext}
              />
            )
          ) : blueprintResult ? (
            <BlueprintResultView
              locale={locale}
              question={blueprintQuestions[locale]}
              result={blueprintResult}
              snapshot={blueprintSnapshot}
              agentRun={agentRun}
              onExport={handleBlueprintExport}
              onCopyBlueprint={() => copyText(blueprintResult.finalSpec.markdown, t.copied)}
              onCopyPrompt={() => copyText(JSON.stringify(blueprintSnapshot?.promptBundle ?? {}, null, 2), t.copied)}
              onCopyReviewPackage={() => agentRun && copyText(renderHumanReviewPackage(agentRun, locale), t.copied)}
            />
          ) : (
            <EmptyState
              locale={locale}
              workspaceMode="blueprint"
              question={blueprintQuestions[locale]}
              context={activeContext}
            />
          )}
        </section>

        <aside className="inspector-column" aria-label={locale === "zh" ? "结果分析" : "Result inspector"}>
          {workspaceMode === "decision" ? (
            <DecisionInspector
              locale={locale}
              result={decisionResult}
              snapshot={decisionSnapshot}
              promptBundle={activePromptBundle}
              reviewLoop={decisionReviewLoop}
              running={Boolean(running)}
              onDeepReview={handleRunDecisionReviewToThreshold}
            />
          ) : (
            <BlueprintInspector
              locale={locale}
              result={blueprintResult}
              snapshot={blueprintSnapshot}
              agentRun={agentRun}
              records={historyRecords}
              currentQuestion={blueprintQuestions[locale]}
            />
          )}
        </aside>
      </div>

      {workspaceMode === "decision" && decisionResult ? (
        <section className="adr-board">
          <div>
            <PanelHeading title={t.adr} kicker="Markdown" />
            <p>{locale === "zh" ? "ADR 预览来自当前结果，可直接导出或用于团队评审。" : "ADR preview from the current result, ready for review or export."}</p>
          </div>
          <pre>{localizeText(decisionResult.verdict.adrMarkdown, locale)}</pre>
        </section>
      ) : null}
    </main>
  );
}
