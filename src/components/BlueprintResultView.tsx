import type { AutonomousBlueprintRun } from "../lib/api-client";
import type { BlueprintRoomResult } from "../lib/blueprint";
import type { BlueprintSnapshot, Locale } from "../types/app";
import { appCopy } from "../i18n/view-copy";
import { BlueprintCollapsiblePanel, PanelHeading } from "./PanelTitle";
import { AgentPlatformRunPanel, BlueprintProcessMap, SourceQualityBanner, clampNumber, priorityLabel, statusLabel } from "./WorkbenchShared";

export function BlueprintResultView(props: {
  locale: Locale;
  question: string;
  result: BlueprintRoomResult;
  snapshot: BlueprintSnapshot | null;
  agentRun: AutonomousBlueprintRun | null;
  onExport: (kind: "markdown" | "report" | "backlog" | "simplePdf") => void;
  onCopyBlueprint: () => void;
  onCopyPrompt: () => void;
  onCopyReviewPackage: () => void;
}) {
  const { locale, result, snapshot, agentRun, onExport, onCopyBlueprint, onCopyPrompt, onCopyReviewPackage } = props;
  const t = appCopy[locale];
  const spec = result.finalSpec;

  return (
    <>
      <article className="panel-block verdict-panel blueprint-hero">
        <PanelHeading
          title={t.blueprintTitle}
          kicker={snapshot?.providerMode === "live" ? t.liveSource : t.demoSource}
          help={
            locale === "zh"
              ? "蓝图可以处理开放式需求：各 Agent 先出草案，互评后逐轮修订，直到共识达到阈值或进入人工复审。"
              : "Blueprint handles open-ended requests: agents draft, cross-review, revise, and stop at threshold or human review."
          }
        />
        <h2>{spec.title}</h2>
        <p>{spec.executiveSummary}</p>
        <SourceQualityBanner
          locale={locale}
          providerMode={snapshot?.providerMode ?? "demo"}
          trace={snapshot?.providerTrace ?? []}
          blueprintExecution={snapshot?.blueprintExecution}
        />
        <div className="blueprint-stat-grid">
          <div>
            <span>{t.consensus}</span>
            <strong>{result.finalConsensusScore}%</strong>
          </div>
          <div>
            <span>{t.threshold}</span>
            <strong>{result.consensusThreshold}%</strong>
          </div>
          <div>
            <span>{t.recommendedAgents}</span>
            <strong>{spec.recommendedAgentCount}</strong>
          </div>
          <div>
            <span>{t.workflow}</span>
            <strong>{spec.workflowStages.length}</strong>
          </div>
        </div>
        <div className="action-row">
          <button onClick={() => onExport("markdown")}>{t.exportBlueprint}</button>
          <button onClick={() => onExport("report")}>{t.exportBlueprintPdf}</button>
          <button onClick={() => onExport("simplePdf")}>{t.exportSimplePdf}</button>
          <button onClick={onCopyBlueprint}>{t.copyBlueprint}</button>
          <button onClick={onCopyPrompt}>{t.copyPrompt}</button>
        </div>
      </article>

      {agentRun && <AgentPlatformRunPanel locale={locale} run={agentRun} onCopyReviewPackage={onCopyReviewPackage} />}

      <BlueprintProcessMap locale={locale} result={result} trace={snapshot?.providerTrace ?? []} />

      <article className="panel-block blueprint-evaluation-panel">
        <PanelHeading title={t.evaluationMatrix} kicker={String(spec.evaluationMatrix.length)} />
        <div className="blueprint-evaluation-grid">
          {spec.evaluationMatrix.map((item) => (
            <article key={item.id} className={`blueprint-evaluation-card ${item.status}`}>
              <header>
                <div>
                  <span>{statusLabel(item.status, locale)}</span>
                  <strong>{item.label}</strong>
                </div>
                <em>{item.score}/100</em>
              </header>
              <div className="blueprint-evaluation-bar">
                <span style={{ width: `${clampNumber(item.score, 0, 100)}%` }} />
              </div>
              <p>{item.rationale}</p>
              <dl>
                <div>
                  <dt>{locale === "zh" ? "证据" : "Evidence"}</dt>
                  <dd>{item.evidence.join(" / ")}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "改进动作" : "Improvement actions"}</dt>
                  <dd>{item.improvementActions.join(" / ")}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </article>

      <article className="panel-block blueprint-recommendation-panel">
        <PanelHeading title={t.detailedRecommendations} kicker={String(spec.detailedRecommendations.length)} />
        <div className="blueprint-recommendation-list">
          {spec.detailedRecommendations.map((item) => (
            <article key={item.id} className={`blueprint-recommendation-card ${item.priority}`}>
              <header>
                <div>
                  <span>{priorityLabel(item.priority, locale)}</span>
                  <strong>{item.title}</strong>
                  <small>{locale === "zh" ? "负责方" : "Owner"}: {item.ownerAgentId}</small>
                </div>
              </header>
              <p>{item.reason}</p>
              <dl>
                <div>
                  <dt>{locale === "zh" ? "建议动作" : "Actions"}</dt>
                  <dd>{item.actions.join(" / ")}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "预期影响" : "Expected impact"}</dt>
                  <dd>{item.expectedImpact}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "验收检查" : "Acceptance check"}</dt>
                  <dd>{item.acceptanceCheck}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </article>

      <BlueprintCollapsiblePanel index={1} title={t.systemAgents} summary={locale === "zh" ? "每个 Agent 的职责、输入、输出和失败模式。" : "Responsibilities, inputs, outputs, and failure modes."}>
        <div className="blueprint-system-agent-list">
          {spec.systemAgents.map((agent, index) => (
            <article className="blueprint-system-agent-card" key={agent.id}>
              <span className="agent-avatar">{index + 1}</span>
              <div>
                <strong>{agent.name}</strong>
                <p>{agent.responsibility}</p>
                <dl>
                  <div>
                    <dt>{locale === "zh" ? "输入" : "Inputs"}</dt>
                    <dd>{agent.inputs.join(" / ")}</dd>
                  </div>
                  <div>
                    <dt>{locale === "zh" ? "输出" : "Outputs"}</dt>
                    <dd>{agent.outputs.join(" / ")}</dd>
                  </div>
                  <div>
                    <dt>{locale === "zh" ? "评审问题" : "Review questions"}</dt>
                    <dd>{agent.reviewQuestions.join(" / ")}</dd>
                  </div>
                  <div>
                    <dt>{locale === "zh" ? "失败模式" : "Failure mode"}</dt>
                    <dd>{agent.failureMode}</dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      </BlueprintCollapsiblePanel>

      <BlueprintCollapsiblePanel index={2} title={t.workflow} summary={locale === "zh" ? "可回放、可重试的蓝图工作流。" : "Replayable and retryable Blueprint workflow."} defaultOpen>
        <div className="blueprint-stage-list">
          {spec.workflowStages.map((stage, index) => (
            <article className="blueprint-stage-card" key={stage.id}>
              <header>
                <span>{index + 1}</span>
                <div>
                  <strong>{stage.title}</strong>
                  <small>{locale === "zh" ? "负责方" : "Owner"}: {stage.ownerAgentId}</small>
                </div>
              </header>
              <dl>
                <div>
                  <dt>{locale === "zh" ? "输入" : "Input"}</dt>
                  <dd>{stage.input}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "输出" : "Output"}</dt>
                  <dd>{stage.output}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "校验" : "Validation"}</dt>
                  <dd>{stage.validation}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </BlueprintCollapsiblePanel>

      <BlueprintCollapsiblePanel
        index={3}
        title={t.schemas}
        summary={
          spec.schemas.some((schema) => ["CharacterCard", "SceneBeat", "DialogueLine", "AssetRequest"].includes(schema.name))
            ? locale === "zh"
              ? "字段级结构，用于拆解小说、角色、场景和资产。"
              : "Field-level structures for story, character, scene, and asset handoff."
            : locale === "zh"
              ? "字段级结构，用于承接当前问题的数据源、建议、风险和评估。"
              : "Field-level structures for this request's data sources, recommendations, risks, and evaluation."
        }
      >
        <div className="blueprint-schema-list">
          {spec.schemas.map((schema) => (
            <article className="blueprint-schema-card" key={schema.name}>
              <header>
                <div>
                  <span>{schema.fields.length} {locale === "zh" ? "个字段" : "fields"}</span>
                  <strong>{schema.name}</strong>
                  <small>{schema.purpose}</small>
                </div>
              </header>
              <div className="blueprint-field-list">
                {schema.fields.map((field) => (
                  <div key={`${schema.name}-${field.name}`}>
                    <strong>{field.name}</strong>
                    <span>{field.required ? (locale === "zh" ? "必填" : "required") : locale === "zh" ? "可选" : "optional"}</span>
                    <small>{field.type}</small>
                    <p>{field.description}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </BlueprintCollapsiblePanel>

      <article className="panel-block blueprint-backlog-panel">
        <PanelHeading title={t.implementationBacklog} kicker={String(spec.implementationBacklog.length)} />
        <div className="blueprint-backlog-list">
          {spec.implementationBacklog.map((item) => (
            <article key={item.id} className={`blueprint-backlog-card ${item.priority.toLowerCase()}`}>
              <header>
                <span>{priorityLabel(item.priority.toLowerCase(), locale)}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.phaseName} · {item.ownerAgentId} · {item.effort}</small>
                </div>
              </header>
              <dl>
                <div>
                  <dt>{locale === "zh" ? "交付物" : "Deliverables"}</dt>
                  <dd>{item.deliverables.join(" / ")}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "验收标准" : "Acceptance"}</dt>
                  <dd>{item.acceptanceCriteria.join(" / ")}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "依赖" : "Dependencies"}</dt>
                  <dd>{item.dependencies.join(" / ") || (locale === "zh" ? "无" : "None")}</dd>
                </div>
                <div>
                  <dt>{locale === "zh" ? "跳过风险" : "Risk if skipped"}</dt>
                  <dd>{item.riskIfSkipped}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <div className="action-row">
          <button onClick={() => onExport("backlog")}>{locale === "zh" ? "导出任务清单" : "Export backlog"}</button>
        </div>
      </article>

      <BlueprintCollapsiblePanel index={4} title={t.blueprintSummary} summary={locale === "zh" ? "完整 Markdown 方案正文。" : "Full Markdown plan body."}>
        <pre>{spec.markdown}</pre>
      </BlueprintCollapsiblePanel>
    </>
  );
}
