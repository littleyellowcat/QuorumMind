import type { AutonomousBlueprintRun } from "../../../lib/api-client";
import { PanelHeading } from "../../PanelTitle";
import { appCopy, phaseLabels } from "../../../i18n/view-copy";
import type { Locale } from "../../../types/app";
import {
  agentLayerLabel,
  agentPatternLabel,
  agentSourceLabel,
  clarificationStrategyLabel,
  evaluatorActionLabel,
  evaluatorCheckLabel,
  executorStatusLabel,
  gateStatusLabel,
  intentCategoryLabelUi,
  intentRouteLabelUi,
  localizeText,
  memoryActionLabel,
  nodeLabel,
  permissionCategoryLabel,
  permissionDecisionLabel,
  riskLabel,
  routeReasonLabel,
  statusValueLabel,
  supervisorDecisionLabelUi,
  taskStatusLabel,
  terminationReasonLabel,
  toolSourceLabel
} from "../../../lib/view-utils";

export function AgentPlatformRunPanel({
  locale,
  run,
  onCopyReviewPackage
}: {
  locale: Locale;
  run: AutonomousBlueprintRun;
  onCopyReviewPackage: () => void;
}) {
  const t = appCopy[locale];
  return (
    <article className={`panel-block agent-platform-panel ${run.summary.humanReviewRequired ? "needs-review" : ""}`}>
      <PanelHeading title={t.agentPlatformRun} kicker={run.platform.orchestrator} />
      <div className="agent-platform-summary-grid">
        <div>
          <span>{locale === "zh" ? "检查点" : "checkpoint"}</span>
          <strong>{run.checkpoint.saver}</strong>
          <small>{run.checkpoint.threadId}</small>
        </div>
        <div>
          <span>{locale === "zh" ? "来源" : "Source"}</span>
          <strong>{agentSourceLabel(run.platform.source, locale)}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "轮次预算" : "Round budget"}</span>
          <strong>{run.runtimeLimits.maxConsensusRounds}</strong>
          <small>{locale === "zh" ? "递归上限" : "recursion"} {run.runtimeLimits.recursionLimit}</small>
        </div>
        <div>
          <span>{locale === "zh" ? "终止原因" : "Termination"}</span>
          <strong>{terminationReasonLabel(run.summary.terminationReason, locale)}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "Agent 范式" : "Agent pattern"}</span>
          <strong>{agentPatternLabel(run.agentPattern?.primary, locale)}</strong>
          <small>{run.agentPattern?.reactScope === "node_local_bounded_tools" ? (locale === "zh" ? "局部 ReAct 工具" : "local ReAct tools") : ""}</small>
        </div>
        <div>
          <span>{locale === "zh" ? "意图路由" : "Intent route"}</span>
          <strong>{intentCategoryLabelUi(run.intent?.category, locale)}</strong>
          <small>{intentRouteLabelUi(run.intent?.route, locale)} · {Math.round((run.intent?.confidence ?? 0) * 100)}%</small>
        </div>
        <div>
          <span>{locale === "zh" ? "质量门" : "Quality gate"}</span>
          <strong>{run.evaluatorGate?.score ?? run.validation.consensusScore}/{run.evaluatorGate?.threshold ?? run.validation.threshold}</strong>
          <small>{evaluatorActionLabel(run.evaluatorGate?.action, locale)}</small>
        </div>
      </div>
      {run.summary.humanReviewRequired && (
        <div className="agent-review-package">
          <div>
            <strong>{t.humanReviewPackage}</strong>
            <p>{locale === "zh" ? "本次未达到共识阈值，建议复制复审包进行人工补充后用同一线程继续。" : "Threshold was not met. Copy the review package, add human evidence, then rerun with the same thread."}</p>
          </div>
          <button onClick={onCopyReviewPackage}>{t.copyReviewPackage}</button>
        </div>
      )}
      <AgentRunMiniMap locale={locale} run={run} />
    </article>
  );
}

export function AgentRunMiniMap({ locale, run }: { locale: Locale; run: AutonomousBlueprintRun }) {
  return (
    <>
      <details className="agent-platform-section" open>
        <summary>
          <strong>{locale === "zh" ? "混合 Agent 范式" : "Hybrid Agent pattern"}</strong>
          <small>{run.agentPattern?.layers?.length ?? 0}</small>
        </summary>
        <div className="agent-pattern-grid">
          <p>{run.agentPattern?.description}</p>
          <div>
            {(run.agentPattern?.layers ?? []).map((layer) => (
              <span key={layer}>{agentLayerLabel(layer, locale)}</span>
            ))}
          </div>
        </div>
      </details>
      <details className="agent-platform-section" open={Boolean(run.clarification?.required)}>
        <summary>
          <strong>{locale === "zh" ? "意图与澄清" : "Intent and clarification"}</strong>
          <small>{intentCategoryLabelUi(run.intent?.category, locale)}</small>
        </summary>
        <div className="agent-intent-grid">
          <article>
            <span>{locale === "zh" ? "路由" : "Route"}</span>
            <strong>{intentRouteLabelUi(run.intent?.route, locale)}</strong>
            <p>{run.intent?.normalizedRequest}</p>
          </article>
          <article>
            <span>{locale === "zh" ? "策略" : "Strategy"}</span>
            <strong>{clarificationStrategyLabel(run.clarification?.strategy, locale)}</strong>
            <p>{run.clarification?.required ? (locale === "zh" ? "有信息缺口，本轮带假设继续。" : "Some details are missing; continuing with assumptions.") : locale === "zh" ? "信息足够，直接继续。" : "Enough context to continue."}</p>
          </article>
        </div>
        {run.clarification?.questions?.length > 0 && (
          <ul className="agent-question-list">
            {run.clarification.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        )}
      </details>
      {(run.reactToolSteps ?? []).length > 0 && (
        <details className="agent-platform-section" open>
          <summary>
            <strong>{locale === "zh" ? "局部 ReAct 工具步骤" : "Local ReAct tool steps"}</strong>
            <small>{(run.reactToolSteps ?? []).length}</small>
          </summary>
          <div className="agent-tool-list react-tool-steps">
            {(run.reactToolSteps ?? []).map((step, index) => (
              <article key={`${step.toolName}-${step.action}-${index}`}>
                <span>{step.action}</span>
                <strong>{step.toolName}</strong>
                <small>{localizeText(step.thought, locale)}</small>
                <p>{localizeText(step.observation, locale)}</p>
              </article>
            ))}
          </div>
        </details>
      )}
      {(run.taskTree ?? []).length > 0 && (
        <details className="agent-platform-section" open>
          <summary>
            <strong>{locale === "zh" ? "Planner 任务树" : "Planner task tree"}</strong>
            <small>{run.taskTree.length}</small>
          </summary>
          <div className="agent-tool-list">
            {run.taskTree.map((task) => (
              <article key={task.id}>
                <span>{taskStatusLabel(task.status, locale)}</span>
                <strong>{task.title}</strong>
                <small>{nodeLabel(task.ownerAgent, locale)} · {task.toolName}</small>
                <p>{task.acceptanceCriteria.map((item) => localizeText(item, locale)).join(" / ")}</p>
              </article>
            ))}
          </div>
        </details>
      )}
      {(run.toolPermissions ?? []).length > 0 && (
        <details className="agent-platform-section" open>
          <summary>
            <strong>{locale === "zh" ? "工具权限系统" : "Tool permission policy"}</strong>
            <small>{run.toolPermissions.length}</small>
          </summary>
          <div className="agent-gate-list">
            {run.toolPermissions.map((permission, index) => (
              <article className={permission.decision === "auto" ? "pass" : permission.decision === "blocked" ? "fail" : "warn"} key={`${permission.toolName}-${permission.node}-${index}`}>
                <span>{permissionDecisionLabel(permission.decision, locale)} · {permissionCategoryLabel(permission.category, locale)} · {riskLabel(permission.risk, locale)}</span>
                <strong>{permission.toolName}</strong>
                <small>{localizeText(permission.reason, locale)}</small>
              </article>
            ))}
          </div>
        </details>
      )}
      {(run.executorActions ?? []).length > 0 && (
        <details className="agent-platform-section">
          <summary>
            <strong>{locale === "zh" ? "Executor 执行记录" : "Executor actions"}</strong>
            <small>{run.executorActions.length}</small>
          </summary>
          <div className="agent-tool-list">
            {run.executorActions.map((action) => (
              <article key={`${action.taskId}-${action.toolName}`}>
                <span>{executorStatusLabel(action.status, locale)}</span>
                <strong>{action.toolName}</strong>
                <small>{action.taskId} · {permissionDecisionLabel(action.permission, locale)}</small>
                <p>{localizeText(action.outputSummary, locale)}</p>
              </article>
            ))}
          </div>
        </details>
      )}
      {(run.criticReviews ?? []).length > 0 && (
        <details className="agent-platform-section" open>
          <summary>
            <strong>{locale === "zh" ? "Critic 审查" : "Critic reviews"}</strong>
            <small>{run.criticReviews.length}</small>
          </summary>
          <div className="agent-gate-list">
            {run.criticReviews.map((review, index) => (
              <article className={review.status} key={`${review.targetTaskId}-${index}`}>
                <span>{gateStatusLabel(review.status, locale)}</span>
                <strong>{review.targetTaskId}</strong>
                <small>{localizeText(review.finding, locale)}</small>
                <p>{localizeText(review.recommendation, locale)}</p>
              </article>
            ))}
          </div>
        </details>
      )}
      {(run.memoryEvents ?? []).length > 0 && (
        <details className="agent-platform-section">
          <summary>
            <strong>{locale === "zh" ? "Memory Agent 事件" : "Memory Agent events"}</strong>
            <small>{run.memoryEvents.length}</small>
          </summary>
          <div className="agent-tool-list">
            {run.memoryEvents.map((event, index) => (
              <article key={`${event.key}-${event.action}-${index}`}>
                <span>{memoryActionLabel(event.action, locale)} · {event.persistence}</span>
                <strong>{event.key}</strong>
                <small>{event.scope}</small>
                <p>{localizeText(event.detail, locale)}</p>
              </article>
            ))}
          </div>
        </details>
      )}
      {(run.supervisorDecisions ?? []).length > 0 && (
        <details className="agent-platform-section" open>
          <summary>
            <strong>{locale === "zh" ? "Supervisor 决策" : "Supervisor decisions"}</strong>
            <small>{run.supervisorDecisions.length}</small>
          </summary>
          <div className="agent-tool-list">
            {run.supervisorDecisions.map((decision, index) => (
              <article key={`${decision.decision}-${index}`}>
                <span>{supervisorDecisionLabelUi(decision.decision, locale)}</span>
                <strong>{nodeLabel(decision.nextNode, locale)}</strong>
                <small>{localizeText(decision.reason, locale)}</small>
                {decision.requiredHumanInputs.length > 0 && <p>{decision.requiredHumanInputs.map((item) => localizeText(item, locale)).join(" / ")}</p>}
              </article>
            ))}
          </div>
        </details>
      )}
      {run.evaluatorGate && (
        <details className="agent-platform-section" open>
          <summary>
            <strong>{locale === "zh" ? "Evaluator Gate" : "Evaluator Gate"}</strong>
            <small>{run.evaluatorGate.score}/{run.evaluatorGate.threshold}</small>
          </summary>
          <div className="agent-gate-list">
            {run.evaluatorGate.checks.map((check) => (
              <article className={check.status} key={check.name}>
                <span>{gateStatusLabel(check.status, locale)}</span>
                <strong>{evaluatorCheckLabel(check.name, locale)}</strong>
                <small>{check.detail}</small>
              </article>
            ))}
          </div>
        </details>
      )}
      <div className="agent-route-map">
        <header>
          <strong>{appCopy[locale].routeMap}</strong>
          <small>{locale === "zh" ? "每次 validate_result 后为什么继续、终止或进入人工复审。" : "Why each validate_result routed to revise, finalize, or human review."}</small>
        </header>
        <div>
          {run.routeDecisions.map((decision, index) => (
            <article className={decision.toNode} key={`${decision.round}-${decision.toNode}-${index}`}>
              <span>{decision.round}</span>
              <div>
                <strong>
                  {nodeLabel(decision.fromNode, locale)} {"->"} {nodeLabel(decision.toNode, locale)}
                </strong>
                <small>{routeReasonLabel(decision.reason, locale)}</small>
              </div>
              <em>{decision.consensusScore}/{decision.threshold}</em>
            </article>
          ))}
        </div>
      </div>
      <details className="agent-platform-section" open>
        <summary>
          <strong>{locale === "zh" ? "共识循环" : "Consensus loop"}</strong>
          <small>{run.consensusLoop.length}</small>
        </summary>
        <div className="agent-consensus-list">
          {run.consensusLoop.map((round) => (
            <article key={round.round} className={round.passed ? "passed" : ""}>
              <header>
                <div>
                  <span>{phaseLabels[locale][round.phase] ?? round.phase}</span>
                  <strong>{localizeText(round.summary, locale)}</strong>
                </div>
                <em>{round.consensusScore}/{round.threshold}</em>
              </header>
              <small>{round.improvements.map((item) => localizeText(item, locale)).join(" / ")}</small>
            </article>
          ))}
        </div>
      </details>
      <details className="agent-platform-section">
        <summary>
          <strong>{locale === "zh" ? "工具调用" : "Tool calls"}</strong>
          <small>{run.toolCalls.length}</small>
        </summary>
        <div className="agent-tool-list">
          {run.toolCalls.map((call, index) => (
            <article key={`${call.toolName}-${index}`}>
              <span>{toolSourceLabel(call.source, locale)}</span>
              <strong>{call.toolName}</strong>
              <small>{nodeLabel(call.node, locale)}</small>
              <p>{localizeText(call.outputSummary, locale)}</p>
            </article>
          ))}
        </div>
      </details>
      <details className="agent-platform-section">
        <summary>
          <strong>{locale === "zh" ? "节点轨迹" : "Node trace"}</strong>
          <small>{run.trace.length}</small>
        </summary>
        <div className="agent-trace-list">
          {run.trace.map((entry, index) => (
            <article key={`${entry.node}-${index}`} className={entry.status}>
              <span>{entry.agentId}</span>
              <strong>{nodeLabel(entry.node, locale)}</strong>
              <small>{statusValueLabel(entry.status, locale)}</small>
              <p>{localizeText(entry.summary, locale)}</p>
            </article>
          ))}
        </div>
      </details>
    </>
  );
}
