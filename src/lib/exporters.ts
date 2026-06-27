import type { DecisionApiResponse, DecisionRoomResult } from "./api-client";
import { generateADR, type ADRLocale } from "./adr";
import type { BlueprintRoomResult } from "./blueprint";
import { localizeKnownDecisionText } from "./localization";

export type ExportArtifact = {
  filename: string;
  mimeType: string;
  contents: string;
};

type JsonTraceExportInput = Pick<
  DecisionApiResponse,
  "providerMode" | "providerTrace" | "liveVerdict" | "promptBundle" | "result"
> & {
  question: string;
  locale?: ADRLocale;
};

export type PdfReportInput = JsonTraceExportInput;

export type BlueprintReportInput = {
  question: string;
  locale?: ADRLocale;
  providerMode: "demo" | "live";
  providerTrace: DecisionApiResponse["providerTrace"];
  result: BlueprintRoomResult;
};

export type BlueprintBacklogExportInput = {
  question: string;
  locale?: ADRLocale;
  result: BlueprintRoomResult;
};

type FinalPdfCard = {
  title: string;
  body?: string;
  details?: string[];
};

export function createAdrMarkdownExport(result: DecisionRoomResult, locale: ADRLocale = "en"): ExportArtifact {
  return {
    filename: `quorummind-adr-${timestampForFilename()}.md`,
    mimeType: "text/markdown;charset=utf-8",
    contents: generateADR(result.verdict.adr, locale)
  };
}

export function createJsonTraceExport(input: JsonTraceExportInput): ExportArtifact {
  return {
    filename: `quorummind-trace-${timestampForFilename()}.json`,
    mimeType: "application/json;charset=utf-8",
    contents: JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        question: input.question,
        locale: input.locale ?? "en",
        providerMode: input.providerMode,
        providerTrace: input.providerTrace,
        liveVerdict: input.liveVerdict,
        promptBundle: input.promptBundle,
        result: input.result
      },
      null,
      2
    )
  };
}

export function createPdfReportHtml(input: PdfReportInput): string {
  const locale = input.locale ?? "en";
  const labels = reportLabels[locale];
  const verdict = input.liveVerdict ?? input.result.verdict;
  const rankedProposals = input.liveVerdict?.rankedProposals.length
    ? input.liveVerdict.rankedProposals
    : input.result.verdict.rankedProposals;
  const exportedAt = new Date().toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  const traceFailures = input.providerTrace.filter((entry) => entry.status === "error").length;
  const jsonParsed = input.providerTrace.filter((entry) => entry.jsonParsed).length;
  const jsonParseRate =
    input.providerTrace.length === 0 ? 0 : Math.round((jsonParsed / input.providerTrace.length) * 100);

  return `<!doctype html>
<html lang="${locale === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${labels.reportTitle}</title>
  <style>
    :root {
      color: #172033;
      background: #f5f7fb;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; background: #f5f7fb; }
    main { max-width: 920px; margin: 0 auto; border: 1px solid #d9e1ef; border-radius: 24px; padding: 34px; background: #ffffff; }
    header.report-hero { border-bottom: 1px solid #d9e1ef; padding-bottom: 24px; }
    .eyebrow { margin: 0 0 8px; color: #4b63c7; font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
    h1 { margin: 0; color: #111827; font-size: 34px; line-height: 1.08; letter-spacing: -0.04em; }
    h2 { margin: 0 0 12px; color: #111827; font-size: 18px; }
    p { color: #42526b; line-height: 1.65; }
    section { margin-top: 24px; break-inside: avoid; }
    .question { margin-top: 16px; border: 1px solid #cfd8f8; border-radius: 14px; padding: 12px 14px; background: #f2f5ff; color: #172033; font-weight: 700; }
    .metric-grid, .rank-grid, .trace-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .metric, .rank-card, .risk-card { border: 1px solid #d9e1ef; border-radius: 16px; padding: 14px; background: #fbfcff; }
    .metric span { display: block; color: #6b7894; font-size: 12px; font-weight: 800; }
    .metric strong { display: block; margin-top: 6px; color: #111827; font-size: 24px; }
    .recommendation { border: 1px solid #c9f0df; border-radius: 18px; padding: 18px; background: #effbf5; }
    .recommendation strong { color: #0f766e; }
    .rank-card strong, .risk-card strong { display: block; color: #111827; }
    .rank-card small, .risk-card small { display: block; margin-top: 8px; color: #6b7894; line-height: 1.5; }
    ul { margin: 8px 0 0; padding-left: 18px; color: #42526b; line-height: 1.6; }
    .risk-list { display: grid; gap: 10px; }
    pre { overflow: hidden; border: 1px solid #d9e1ef; border-radius: 16px; padding: 16px; color: #172033; background: #f8fafc; font-size: 12px; line-height: 1.55; white-space: pre-wrap; }
    footer { margin-top: 28px; border-top: 1px solid #d9e1ef; padding-top: 14px; color: #6b7894; font-size: 12px; }
    @media print {
      body { padding: 0; background: #ffffff; }
      main { max-width: none; border: 0; border-radius: 0; padding: 0; }
      section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <header class="report-hero">
      <p class="eyebrow">QuorumMind</p>
      <h1>${labels.reportTitle}</h1>
      <p class="question">${escapeHtml(input.question)}</p>
    </header>

    <section>
      <h2>${labels.finalRecommendation}</h2>
      <div class="recommendation">
        <strong>${escapeHtml(formatProposalId(verdict.selectedProposalId, locale))}</strong>
        <p>${escapeHtml(verdict.finalRecommendation)}</p>
      </div>
    </section>

    <section>
      <h2>${labels.metrics}</h2>
      <div class="metric-grid">
        ${metricHtml(labels.source, input.providerMode === "live" && input.liveVerdict ? labels.liveSource : labels.fallbackSource)}
        ${metricHtml(labels.quorumScore, `${verdict.quorumScore}/100`)}
        ${metricHtml(labels.dissentIndex, `${verdict.dissentIndex}/100`)}
      </div>
    </section>

    <section>
      <h2>${labels.delphi}</h2>
      <div class="risk-list">
        ${input.result.verdict.delphiRounds
          .map(
            (round) => `<article class="risk-card">
          <strong>${escapeHtml(localizeKnownText(round.title, locale))} · ${escapeHtml(localizeAnonymity(round.anonymity, locale))}</strong>
          <p>${escapeHtml(localizeKnownText(round.summary, locale))}</p>
          <small>${labels.inputs}: ${round.inputCount} / ${labels.outputs}: ${round.outputCount} / ${labels.status}: ${escapeHtml(
            localizeStatus(round.status, locale)
          )}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.rankedProposals}</h2>
      <div class="rank-grid">
        ${rankedProposals
          .slice(0, 6)
          .map(
            (proposal, index) => `<article class="rank-card">
          <strong>#${index + 1} ${escapeHtml(formatProposalId(proposal.proposalId, locale))}</strong>
          <small>${labels.quorumScore} ${proposal.quorumScore} / Borda ${proposal.bordaScore} / ${labels.utility} ${
            proposal.weightedUtility
          } / ${labels.confidence} ${Math.round(proposal.confidence * 100)}% / ${labels.regret} -${
            proposal.regretPenalty
          }</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.bayesian}</h2>
      <div class="rank-grid">
        ${input.result.verdict.bayesianVoteWeights
          .map(
            (entry) => `<article class="rank-card">
          <strong>${escapeHtml(entry.agentId)} · ${entry.effectiveVoteWeight.toFixed(2)}x</strong>
          <small>${labels.posterior} ${Math.round(entry.posteriorConfidence * 100)}% / ${labels.reputation} ${
            entry.reputationScore
          }/100 / ${labels.baseWeight} ${entry.baseWeight}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.topsis}</h2>
      <div class="rank-grid">
        ${input.result.verdict.topsisLens
          .slice(0, 5)
          .map(
            (entry) => `<article class="rank-card">
          <strong>#${entry.topsisRank} ${escapeHtml(formatProposalId(entry.proposalId, locale))}</strong>
          <small>${labels.closeness} ${entry.closenessScore}/100 / ${labels.idealDistance} ${
            entry.distanceToIdeal
          } / ${labels.antiIdealDistance} ${entry.distanceToAntiIdeal}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.monteCarlo}</h2>
      <div class="rank-grid">
        ${input.result.verdict.monteCarloStress
          .slice(0, 5)
          .map(
            (entry) => `<article class="rank-card">
          <strong>#${entry.monteCarloRank} ${escapeHtml(formatProposalId(entry.proposalId, locale))}</strong>
          <small>${labels.winRate} ${entry.winRate}% / ${labels.average} ${entry.averageScore}/100 / ${labels.downside} ${
            entry.downsideP10
          }/100 / ${labels.worst} ${entry.worstScore}/100</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.ahp}</h2>
      <div class="metric-grid">
        ${metricHtml(labels.consistencyRatio, String(input.result.verdict.ahpAnalysis.consistencyRatio))}
        ${metricHtml(labels.assessment, localizeKnownText(input.result.verdict.ahpAnalysis.consistencyAssessment, locale))}
        ${metricHtml(labels.stableWinnerRate, `${input.result.verdict.ahpAnalysis.stableWinnerRate}%`)}
      </div>
    </section>

    <section>
      <h2>${labels.riskRadar}</h2>
      <div class="risk-list">
        ${input.result.verdict.riskRadar
          .slice(0, 8)
          .map(
            (risk) => `<article class="risk-card">
          <strong>${escapeHtml(localizeRiskCategory(risk.category, locale))} · ${escapeHtml(
            localizeSeverity(risk.severity, locale)
          )}</strong>
          <p>${escapeHtml(localizeKnownText(risk.description, locale))}</p>
          <small>${labels.mitigation}: ${escapeHtml(localizeKnownText(risk.mitigation, locale))}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.regretMap}</h2>
      <div class="risk-list">
        ${input.result.verdict.regretMap
          .slice(0, 5)
          .map(
            (entry) => `<article class="risk-card">
          <strong>#${entry.minimaxRank} ${escapeHtml(formatProposalId(entry.proposalId, locale))}</strong>
          <p>${labels.worstRegret} ${entry.worstRegret}/100 · ${escapeHtml(localizeKnownText(entry.worstScenario, locale))}</p>
          <small>${labels.averageRegret}: ${entry.averageRegret}/100</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.assumptionLedger}</h2>
      <div class="risk-list">
        ${input.result.verdict.assumptionLedger
          .map(
            (entry) => `<article class="risk-card">
          <strong>${escapeHtml(localizeKnownText(entry.assumption, locale))} · ${escapeHtml(
            localizeSeverity(entry.riskLevel, locale)
          )}</strong>
          <p>${escapeHtml(localizeKnownText(entry.validationQuestion, locale))}</p>
          <small>${labels.proposal}: ${escapeHtml(formatProposalId(entry.proposalId, locale))} · ${
            labels.action
          }: ${escapeHtml(localizeKnownText(entry.validationAction, locale))}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.traceSummary}</h2>
      <div class="trace-grid">
        ${metricHtml(labels.providerCalls, String(input.providerTrace.length))}
        ${metricHtml(labels.failures, String(traceFailures))}
        ${metricHtml(labels.jsonParse, `${jsonParseRate}%`)}
      </div>
    </section>

    <section>
      <h2>${labels.adr}</h2>
      <pre>${escapeHtml(generateADR(input.result.verdict.adr, locale))}</pre>
    </section>

    <footer>${labels.exportedAt} ${escapeHtml(exportedAt)} · ${labels.footer}</footer>
  </main>
</body>
</html>`;
}

export function createPdfReportExport(input: PdfReportInput): ExportArtifact {
  return {
    filename: `quorummind-report-${timestampForFilename()}.html`,
    mimeType: "text/html;charset=utf-8",
    contents: createPdfReportHtml(input)
  };
}

export function createDecisionFinalPdfHtml(input: PdfReportInput): string {
  const locale = input.locale ?? "en";
  const labels = finalDecisionPdfLabels[locale];
  const verdict = input.liveVerdict ?? input.result.verdict;
  const winningProposal = input.result.revisedProposals.find((proposal) => proposal.id === verdict.selectedProposalId);
  const reasons = input.liveVerdict?.whyItWon?.length
    ? input.liveVerdict.whyItWon
    : [
        winningProposal?.reasoning,
        ...(winningProposal?.strengths.slice(0, 3) ?? [])
      ].filter(isNonEmptyString);
  const nextSteps = winningProposal?.migrationPath.length
    ? winningProposal.migrationPath
    : input.result.verdict.adr.rollbackPlan;
  const risks = (winningProposal?.risks.length ? winningProposal.risks : input.result.verdict.riskRadar).slice(0, 5);
  const assumptions = input.result.verdict.assumptionLedger
    .filter((entry) => entry.proposalId === verdict.selectedProposalId)
    .slice(0, 4);

  return finalPdfDocument({
    locale,
    title: labels.title,
    eyebrow: labels.eyebrow,
    question: input.question,
    summaryTitle: labels.finalAnswer,
    summary: localizeKnownText(verdict.finalRecommendation, locale),
    meta: [
      `${labels.selected}: ${formatProposalId(verdict.selectedProposalId, locale)}`,
      `${labels.quorumScore}: ${verdict.quorumScore}/100`,
      `${labels.dissentIndex}: ${verdict.dissentIndex}/100`
    ],
    sections: [
      finalListSection(labels.why, reasons.map((item) => localizeKnownText(item, locale))),
      winningProposal
        ? finalListSection(labels.whatItMeans, [
            ...winningProposal.strengths.slice(0, 3).map((item) => localizeKnownText(item, locale)),
            ...winningProposal.weaknesses.slice(0, 2).map((item) => `${labels.watch}: ${localizeKnownText(item, locale)}`)
          ])
        : "",
      finalListSection(labels.nextSteps, nextSteps.map((item) => localizeKnownText(item, locale))),
      finalCardSection(
        labels.risks,
        risks.map((risk) => ({
          title: `${localizeRiskCategory(risk.category, locale)} · ${localizeSeverity(risk.severity, locale)}`,
          body: localizeKnownText(risk.description, locale),
          details: [`${labels.mitigation}: ${localizeKnownText(risk.mitigation, locale)}`]
        }))
      ),
      finalCardSection(
        labels.validation,
        assumptions.map((entry) => ({
          title: localizeKnownText(entry.assumption, locale),
          body: localizeKnownText(entry.validationQuestion, locale),
          details: [`${labels.action}: ${localizeKnownText(entry.validationAction, locale)}`]
        }))
      )
    ].filter(Boolean)
  });
}

export function createDecisionFinalPdfExport(input: PdfReportInput): ExportArtifact {
  return {
    filename: `quorummind-final-decision-${timestampForFilename()}.pdf`,
    mimeType: "text/html;charset=utf-8",
    contents: createDecisionFinalPdfHtml(input)
  };
}

export function createBlueprintReportHtml(input: BlueprintReportInput): string {
  const locale = input.locale ?? "en";
  const zh = locale === "zh";
  const spec = input.result.finalSpec;
  const labels = blueprintReportLabels[locale];
  const exportedAt = new Date().toLocaleString(zh ? "zh-CN" : "en-US");
  const usableCalls = input.providerTrace.filter(
    (entry) => entry.status === "ok" && entry.jsonParsed && (entry.validationStatus === "valid" || entry.validationStatus === "repaired")
  ).length;

  return `<!doctype html>
<html lang="${zh ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(labels.reportTitle)}</title>
  <style>
    :root {
      color: #172033;
      background: #f5f7fb;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; background: #f5f7fb; }
    main { max-width: 960px; margin: 0 auto; border: 1px solid #d9e1ef; border-radius: 24px; padding: 34px; background: #ffffff; }
    header.report-hero { border-bottom: 1px solid #d9e1ef; padding-bottom: 24px; }
    .eyebrow { margin: 0 0 8px; color: #0f62b8; font-size: 12px; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; }
    h1 { margin: 0; color: #111827; font-size: 34px; line-height: 1.1; letter-spacing: -0.04em; }
    h2 { margin: 0 0 12px; color: #111827; font-size: 19px; }
    h3 { margin: 0 0 8px; color: #111827; font-size: 15px; }
    p { color: #42526b; line-height: 1.68; }
    section { margin-top: 26px; break-inside: avoid; }
    .question { margin-top: 16px; border: 1px solid #c8daf4; border-radius: 14px; padding: 12px 14px; background: #f2f7ff; color: #172033; font-weight: 750; }
    .metric-grid, .card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .metric, .card { border: 1px solid #d9e1ef; border-radius: 16px; padding: 14px; background: #fbfcff; break-inside: avoid; }
    .metric span, .card small { display: block; color: #6b7894; font-size: 12px; font-weight: 800; line-height: 1.45; }
    .metric strong { display: block; margin-top: 6px; color: #111827; font-size: 24px; }
    .consensus-bar { position: relative; overflow: hidden; height: 8px; margin: 10px 0; border-radius: 999px; background: #d9e1ef; }
    .consensus-bar span { display: block; height: 100%; border-radius: inherit; background: #0f62b8; }
    .consensus-bar i { position: absolute; top: -3px; width: 2px; height: 14px; background: #b45309; }
    ul, ol { margin: 8px 0 0; padding-left: 20px; color: #42526b; line-height: 1.62; }
    li { margin: 3px 0; }
    .list { display: grid; gap: 10px; }
    .schema-field { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; border-top: 1px solid #e5ebf5; padding-top: 8px; margin-top: 8px; }
    .schema-field p { grid-column: 1 / -1; margin: 0; font-size: 13px; }
    .muted { color: #6b7894; }
    footer { margin-top: 28px; border-top: 1px solid #d9e1ef; padding-top: 14px; color: #6b7894; font-size: 12px; }
    @media print {
      body { padding: 0; background: #ffffff; }
      main { max-width: none; border: 0; border-radius: 0; padding: 0; }
      section { page-break-inside: avoid; }
    }
    @media (max-width: 760px) {
      body { padding: 14px; }
      main { padding: 20px; }
      .metric-grid, .card-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header class="report-hero">
      <p class="eyebrow">${zh ? "QuorumMind 蓝图" : "QuorumMind Blueprint"}</p>
      <h1>${escapeHtml(spec.title)}</h1>
      <p class="question">${escapeHtml(input.question)}</p>
      <p>${escapeHtml(spec.executiveSummary)}</p>
    </header>

    <section>
      <h2>${labels.metrics}</h2>
      <div class="metric-grid">
        ${metricHtml(labels.source, input.providerMode === "live" ? labels.liveSource : labels.demoSource)}
        ${metricHtml(labels.recommendedAgents, String(spec.recommendedAgentCount))}
        ${metricHtml(labels.usableCalls, `${usableCalls}/${input.providerTrace.length}`)}
        ${metricHtml(labels.finalConsensus, `${input.result.finalConsensusScore}%`)}
        ${metricHtml(labels.consensusThreshold, `${input.result.consensusThreshold}%`)}
      </div>
    </section>

    <section>
      <h2>${labels.consensusConvergence}</h2>
      <div class="list">
        ${input.result.consensusRounds
          .map(
            (round) => `<article class="card">
          <h3>${escapeHtml(labels.round)} ${round.round} · ${escapeHtml(labels[round.phase])} · ${round.consensusScore}%</h3>
          <div class="consensus-bar"><span style="width:${Math.max(0, Math.min(100, round.consensusScore))}%"></span><i style="left:${Math.max(0, Math.min(100, round.threshold))}%"></i></div>
          <p>${escapeHtml(round.summary)}</p>
          <small>${labels.improvements}: ${escapeHtml(round.improvements.join(" / "))}</small>
          <small>${labels.remainingDisagreements}: ${escapeHtml(round.remainingDisagreements.join(" / "))}</small>
          <small>${labels.agentPositions}: ${escapeHtml(round.agentPositions.map((position) => `${position.agentId} ${position.confidence}%`).join(" / "))}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.evaluationMatrix}</h2>
      <div class="list">
        ${spec.evaluationMatrix
          .map(
            (item) => `<article class="card">
          <h3>${escapeHtml(item.label)} · ${item.score}/100 · ${escapeHtml(labels[item.status])}</h3>
          <div class="consensus-bar"><span style="width:${Math.max(0, Math.min(100, item.score))}%"></span></div>
          <p>${escapeHtml(item.rationale)}</p>
          <small>${labels.evidence}: ${escapeHtml(item.evidence.join(" / "))}</small>
          <small>${labels.improvementActions}: ${escapeHtml(item.improvementActions.join(" / "))}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.detailedRecommendations}</h2>
      <div class="list">
        ${spec.detailedRecommendations
          .map(
            (recommendation) => `<article class="card">
          <h3>${escapeHtml(labels[recommendation.priority])} · ${escapeHtml(recommendation.title)}</h3>
          <small>${labels.owner}: ${escapeHtml(recommendation.ownerAgentId)}</small>
          <p>${escapeHtml(recommendation.reason)}</p>
          <small>${labels.actions}: ${escapeHtml(recommendation.actions.join(" / "))}</small>
          <small>${labels.expectedImpact}: ${escapeHtml(recommendation.expectedImpact)}</small>
          <small>${labels.acceptanceCheck}: ${escapeHtml(recommendation.acceptanceCheck)}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.adoptionLedger}</h2>
      <div class="list">
        ${spec.adoptionLedger
          .slice(0, 30)
          .map(
            (item) => `<article class="card">
          <h3>${escapeHtml(labels[item.adoptionStatus])} · ${escapeHtml(item.targetSection)}</h3>
          <small>${labels.critiqueSource}: ${escapeHtml(item.reviewerAgentId)} -> ${escapeHtml(item.targetDraftId)}</small>
          <small>${labels.suggestion}: ${escapeHtml(item.suggestion)}</small>
          <small>${labels.resolution}: ${escapeHtml(item.resolution)}</small>
          <small>${labels.evidence}: ${escapeHtml(item.evidence.join(" / "))}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.implementationBacklog}</h2>
      <div class="list">
        ${spec.implementationBacklog
          .map(
            (item) => `<article class="card">
          <h3>${escapeHtml(blueprintPriorityLabel(item.priority, locale))} · ${escapeHtml(item.title)}</h3>
          <small>${labels.phase}: ${escapeHtml(item.phaseName)}</small>
          <small>${labels.owner}: ${escapeHtml(item.ownerAgentId)}</small>
          <small>${labels.effort}: ${escapeHtml(item.effort)}</small>
          <small>${labels.dependencies}: ${escapeHtml(item.dependencies.join(" / ") || labels.none)}</small>
          <small>${labels.deliverables}: ${escapeHtml(item.deliverables.join(" / "))}</small>
          <small>${labels.acceptance}: ${escapeHtml(item.acceptanceCriteria.join(" / "))}</small>
          <small>${labels.riskIfSkipped}: ${escapeHtml(item.riskIfSkipped)}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    ${sectionList(labels.targetOutputs, spec.targetOutputs)}
    ${sectionList(labels.successCriteria, spec.successCriteria)}

    <section>
      <h2>${labels.agentDesign}</h2>
      <div class="list">
        ${spec.systemAgents
          .map(
            (agent) => `<article class="card">
          <h3>${escapeHtml(agent.name)}</h3>
          <p>${escapeHtml(agent.responsibility)}</p>
          <small>${labels.inputs}: ${escapeHtml(agent.inputs.join(" / "))}</small>
          <small>${labels.outputs}: ${escapeHtml(agent.outputs.join(" / "))}</small>
          <small>${labels.reviewQuestions}: ${escapeHtml(agent.reviewQuestions.join(" / "))}</small>
          <small>${labels.failureMode}: ${escapeHtml(agent.failureMode)}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.workflow}</h2>
      <div class="list">
        ${spec.workflowStages
          .map(
            (stage, index) => `<article class="card">
          <h3>${index + 1}. ${escapeHtml(stage.title)}</h3>
          <small>${labels.inputs}: ${escapeHtml(stage.input)}</small>
          <small>${labels.outputs}: ${escapeHtml(stage.output)}</small>
          <small>${labels.validation}: ${escapeHtml(stage.validation)}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.schemas}</h2>
      <div class="list">
        ${spec.schemas
          .map(
            (schema) => `<article class="card">
          <h3>${escapeHtml(schema.name)}</h3>
          <p>${escapeHtml(schema.purpose)}</p>
          ${schema.fields
            .map(
              (field) => `<div class="schema-field">
            <strong>${escapeHtml(field.name)}</strong>
            <small>${escapeHtml(field.type)}${field.required ? ` · ${labels.required}` : ""}</small>
            <p>${escapeHtml(field.description)}</p>
          </div>`
            )
            .join("")}
        </article>`
          )
          .join("")}
      </div>
    </section>

    ${sectionList(labels.extraction, spec.extractionStrategy)}
    ${sectionList(labels.collaboration, spec.collaborationProtocol)}
    ${sectionList(labels.humanReview, spec.humanReviewLoop)}

    <section>
      <h2>${labels.implementationPlan}</h2>
      <div class="list">
        ${spec.implementationPlan
          .map(
            (phase) => `<article class="card">
          <h3>${escapeHtml(phase.name)} · ${escapeHtml(phase.duration)}</h3>
          <small>${labels.deliverables}: ${escapeHtml(phase.deliverables.join(" / "))}</small>
          <small>${labels.acceptance}: ${escapeHtml(phase.acceptanceCriteria.join(" / "))}</small>
        </article>`
          )
          .join("")}
      </div>
    </section>

    ${sectionList(labels.validationPlan, spec.validationPlan)}
    ${sectionList(labels.risks, spec.risks)}
    ${sectionList(labels.openQuestions, spec.openQuestions)}

    <section>
      <h2>${labels.crossCritiques}</h2>
      <div class="list">
        ${input.result.critiques
          .slice(0, 10)
          .map(
            (critique) => `<article class="card">
          <h3>${escapeHtml(critique.criticalGap)}</h3>
          <p>${escapeHtml(critique.strongestPart)}</p>
          <ul>${critique.improvementSuggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </article>`
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>${labels.modelContributions}</h2>
      <div class="list">
        ${
          spec.modelContributions.length > 0
            ? spec.modelContributions
                .map(
                  (contribution) => `<article class="card">
          <h3>${escapeHtml(contribution.source)} · ${escapeHtml(contribution.title)}</h3>
          <p>${escapeHtml(contribution.recommendation)}</p>
          <small>${labels.usefulIdeas}: ${escapeHtml(contribution.usefulIdeas.join(" / ") || labels.none)}</small>
          <small>${labels.cautions}: ${escapeHtml(contribution.cautions.join(" / ") || labels.none)}</small>
        </article>`
                )
                .join("")
            : `<p class="muted">${escapeHtml(labels.noModelContributions)}</p>`
        }
      </div>
    </section>

    <footer>${labels.exportedAt} ${escapeHtml(exportedAt)} · ${labels.footer}</footer>
  </main>
</body>
</html>`;
}

export function createBlueprintReportExport(input: BlueprintReportInput): ExportArtifact {
  return {
    filename: `quorummind-blueprint-report-${timestampForFilename()}.html`,
    mimeType: "text/html;charset=utf-8",
    contents: createBlueprintReportHtml(input)
  };
}

export function createBlueprintFinalPdfHtml(input: BlueprintReportInput): string {
  const locale = input.locale ?? "en";
  const labels = finalBlueprintPdfLabels[locale];
  const spec = input.result.finalSpec;

  return finalPdfDocument({
    locale,
    title: labels.title,
    eyebrow: labels.eyebrow,
    question: input.question,
    summaryTitle: spec.title,
    summary: spec.executiveSummary,
    meta: [
      `${labels.consensus}: ${input.result.finalConsensusScore}%`,
      `${labels.recommendedAgents}: ${spec.recommendedAgentCount}`,
      `${labels.workflowStages}: ${spec.workflowStages.length}`
    ],
    sections: [
      finalListSection(labels.targetOutputs, spec.targetOutputs),
      finalCardSection(
        labels.agentDesign,
        spec.systemAgents.map((agent) => ({
          title: agent.name,
          body: agent.responsibility,
          details: [
            `${labels.inputs}: ${agent.inputs.join(" / ")}`,
            `${labels.outputs}: ${agent.outputs.join(" / ")}`,
            `${labels.review}: ${agent.reviewQuestions.join(" / ")}`
          ]
        }))
      ),
      finalCardSection(
        labels.workflow,
        spec.workflowStages.map((stage, index) => ({
          title: `${index + 1}. ${stage.title}`,
          details: [
            `${labels.inputs}: ${stage.input}`,
            `${labels.outputs}: ${stage.output}`,
            `${labels.validation}: ${stage.validation}`
          ]
        }))
      ),
      finalCardSection(
        labels.schemas,
        spec.schemas.map((schema) => ({
          title: schema.name,
          body: schema.purpose,
          details: schema.fields.slice(0, 8).map((field) => `${field.name}: ${field.description}`)
        }))
      ),
      finalCardSection(
        labels.recommendations,
        spec.detailedRecommendations.slice(0, 6).map((recommendation) => ({
          title: recommendation.title,
          body: recommendation.reason,
          details: [
            `${labels.owner}: ${recommendation.ownerAgentId}`,
            `${labels.actions}: ${recommendation.actions.join(" / ")}`,
            `${labels.acceptance}: ${recommendation.acceptanceCheck}`
          ]
        }))
      ),
      finalCardSection(
        labels.implementationPlan,
        spec.implementationPlan.map((phase) => ({
          title: `${phase.name} · ${phase.duration}`,
          details: [
            `${labels.deliverables}: ${phase.deliverables.join(" / ")}`,
            `${labels.acceptance}: ${phase.acceptanceCriteria.join(" / ")}`
          ]
        }))
      ),
      finalListSection(labels.validationPlan, spec.validationPlan),
      finalListSection(labels.risks, spec.risks),
      finalListSection(labels.openQuestions, spec.openQuestions)
    ]
  });
}

export function createBlueprintFinalPdfExport(input: BlueprintReportInput): ExportArtifact {
  return {
    filename: `quorummind-final-blueprint-${timestampForFilename()}.pdf`,
    mimeType: "text/html;charset=utf-8",
    contents: createBlueprintFinalPdfHtml(input)
  };
}

export function createBlueprintBacklogExport(input: BlueprintBacklogExportInput): ExportArtifact {
  const locale = input.locale ?? "en";
  const zh = locale === "zh";
  const labels = blueprintBacklogLabels[locale];
  const lines = [
    `# ${labels.title}`,
    "",
    `## ${labels.question}`,
    input.question,
    "",
    `## ${labels.summary}`,
    `- ${labels.blueprint}: ${input.result.finalSpec.title}`,
    `- ${labels.finalConsensus}: ${input.result.finalConsensusScore}%`,
    `- ${labels.taskCount}: ${input.result.finalSpec.implementationBacklog.length}`,
    "",
    `## ${labels.tasks}`,
    ...input.result.finalSpec.implementationBacklog.flatMap((item, index) => [
      `### ${index + 1}. ${blueprintPriorityLabel(item.priority, locale)} · ${item.title}`,
      `- ${labels.phase}: ${item.phaseName}`,
      `- ${labels.owner}: ${item.ownerAgentId}`,
      `- ${labels.effort}: ${item.effort}`,
      `- ${labels.dependencies}: ${item.dependencies.join(" / ") || labels.none}`,
      `- ${labels.deliverables}: ${item.deliverables.join(" / ")}`,
      `- ${labels.acceptance}: ${item.acceptanceCriteria.join(" / ")}`,
      `- ${labels.riskIfSkipped}: ${item.riskIfSkipped}`,
      ""
    ]),
    `> ${zh ? "该任务清单来自 QuorumMind Blueprint 的结构化实施任务字段。" : "This backlog comes from the structured implementation backlog in QuorumMind Blueprint."}`
  ];

  return {
    filename: `quorummind-blueprint-backlog-${timestampForFilename()}.md`,
    mimeType: "text/markdown;charset=utf-8",
    contents: lines.join("\n")
  };
}

export function downloadArtifact(artifact: ExportArtifact): void {
  const blob = new Blob([artifact.contents], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = artifact.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function metricHtml(label: string, value: string): string {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function sectionList(title: string, items: string[]): string {
  return `<section>
      <h2>${escapeHtml(title)}</h2>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>`;
}

function finalPdfDocument(input: {
  locale: ADRLocale;
  title: string;
  eyebrow: string;
  question: string;
  summaryTitle: string;
  summary: string;
  meta: string[];
  sections: string[];
}): string {
  const exportedAt = new Date().toLocaleString(input.locale === "zh" ? "zh-CN" : "en-US");
  const htmlLang = input.locale === "zh" ? "zh-CN" : "en";
  const footer =
    input.locale === "zh"
      ? "这是一份面向普通读者的简版最终方案，只保留结论和执行内容。"
      : "This is a simplified final plan for general readers. It keeps only the conclusion and execution content.";

  return `<!doctype html>
<html lang="${htmlLang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    :root {
      color: #172033;
      background: #f6f8fc;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; background: #f6f8fc; }
    main { max-width: 860px; margin: 0 auto; border: 1px solid #d8e1ef; border-radius: 24px; padding: 34px; background: #ffffff; }
    header { border-bottom: 1px solid #d8e1ef; padding-bottom: 22px; }
    .eyebrow { margin: 0 0 8px; color: #075cab; font-size: 12px; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; }
    h1 { margin: 0; color: #111827; font-size: 34px; line-height: 1.12; letter-spacing: -0.03em; }
    h2 { margin: 0 0 12px; color: #111827; font-size: 20px; line-height: 1.25; }
    h3 { margin: 0 0 8px; color: #111827; font-size: 15px; line-height: 1.35; }
    p { margin: 0; color: #40506a; line-height: 1.72; }
    section { margin-top: 24px; break-inside: avoid; page-break-inside: avoid; }
    ul { margin: 0; padding-left: 20px; color: #40506a; line-height: 1.68; }
    li { margin: 5px 0; }
    .question { margin-top: 16px; border: 1px solid #cbdcf3; border-radius: 14px; padding: 12px 14px; background: #f1f7ff; color: #172033; font-weight: 750; line-height: 1.65; }
    .summary { border: 1px solid #bfe7d8; border-radius: 18px; padding: 18px; background: #effaf5; }
    .summary strong { display: block; margin-bottom: 8px; color: #0f766e; font-size: 16px; }
    .meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
    .meta span { border: 1px solid #d8e1ef; border-radius: 12px; padding: 10px; color: #40506a; background: #fbfcff; font-size: 12px; font-weight: 800; line-height: 1.45; }
    .card-list { display: grid; gap: 10px; }
    .card { border: 1px solid #d8e1ef; border-radius: 16px; padding: 14px; background: #fbfcff; break-inside: avoid; page-break-inside: avoid; }
    .card p { margin-top: 6px; }
    .card small { display: block; margin-top: 7px; color: #5d6b82; font-size: 12px; font-weight: 760; line-height: 1.55; }
    footer { margin-top: 28px; border-top: 1px solid #d8e1ef; padding-top: 14px; color: #64748b; font-size: 12px; line-height: 1.55; }
    @media print {
      body { padding: 0; background: #ffffff; }
      main { max-width: none; border: 0; border-radius: 0; padding: 0; }
    }
    @media (max-width: 760px) {
      body { padding: 14px; }
      main { padding: 20px; }
      .meta { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">${escapeHtml(input.eyebrow)}</p>
      <h1>${escapeHtml(input.title)}</h1>
      <p class="question">${escapeHtml(input.question)}</p>
    </header>
    <section>
      <div class="summary">
        <strong>${escapeHtml(input.summaryTitle)}</strong>
        <p>${escapeHtml(input.summary)}</p>
      </div>
      <div class="meta">${input.meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
    </section>
    ${input.sections.join("")}
    <footer>${escapeHtml(exportedAt)} · ${escapeHtml(footer)}</footer>
  </main>
</body>
</html>`;
}

function finalListSection(title: string, items: string[]): string {
  const visibleItems = items.filter(Boolean);

  if (visibleItems.length === 0) {
    return "";
  }

  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <ul>${visibleItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  </section>`;
}

function finalCardSection(title: string, cards: FinalPdfCard[]): string {
  const visibleCards = cards.filter((card) => card.title || card.body || card.details?.length);

  if (visibleCards.length === 0) {
    return "";
  }

  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <div class="card-list">
      ${visibleCards
        .map(
          (card) => `<article class="card">
        <h3>${escapeHtml(card.title)}</h3>
        ${card.body ? `<p>${escapeHtml(card.body)}</p>` : ""}
        ${(card.details ?? []).map((detail) => `<small>${escapeHtml(detail)}</small>`).join("")}
      </article>`
        )
        .join("")}
    </div>
  </section>`;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const finalDecisionPdfLabels = {
  en: {
    eyebrow: "QuorumMind final result",
    title: "Final Decision Plan",
    finalAnswer: "Final answer",
    selected: "Selected option",
    quorumScore: "Decision score",
    dissentIndex: "Remaining disagreement",
    why: "Why this is the recommended path",
    whatItMeans: "What this means in practice",
    watch: "Watch",
    nextSteps: "Next steps",
    risks: "Important risks",
    mitigation: "Mitigation",
    validation: "Assumptions to validate",
    action: "Action"
  },
  zh: {
    eyebrow: "QuorumMind 最终结果",
    title: "最终决策方案",
    finalAnswer: "最终答案",
    selected: "选择方案",
    quorumScore: "裁决综合分",
    dissentIndex: "剩余分歧",
    why: "为什么推荐这个方向",
    whatItMeans: "这意味着要怎么做",
    watch: "注意",
    nextSteps: "下一步执行",
    risks: "重要风险",
    mitigation: "应对方式",
    validation: "需要验证的假设",
    action: "动作"
  }
} satisfies Record<ADRLocale, Record<string, string>>;

const finalBlueprintPdfLabels = {
  en: {
    eyebrow: "QuorumMind final result",
    title: "Final Blueprint Plan",
    consensus: "Consensus",
    recommendedAgents: "Recommended agents",
    workflowStages: "Workflow stages",
    targetOutputs: "Target outputs",
    agentDesign: "Agent design",
    workflow: "Workflow",
    schemas: "Core data structures",
    recommendations: "Recommended improvements",
    implementationPlan: "Implementation plan",
    validationPlan: "Validation plan",
    risks: "Risks",
    openQuestions: "Open questions",
    inputs: "Inputs",
    outputs: "Outputs",
    review: "Review",
    validation: "Validation",
    owner: "Owner",
    actions: "Actions",
    acceptance: "Acceptance",
    deliverables: "Deliverables"
  },
  zh: {
    eyebrow: "QuorumMind 最终结果",
    title: "最终方案蓝图",
    consensus: "共识",
    recommendedAgents: "建议 Agent 数量",
    workflowStages: "工作流阶段",
    targetOutputs: "目标产物",
    agentDesign: "Agent 分工",
    workflow: "工作流",
    schemas: "核心数据结构",
    recommendations: "建议优化",
    implementationPlan: "实施计划",
    validationPlan: "验证计划",
    risks: "风险",
    openQuestions: "待确认问题",
    inputs: "输入",
    outputs: "输出",
    review: "复审",
    validation: "校验",
    owner: "负责方",
    actions: "行动",
    acceptance: "验收",
    deliverables: "交付物"
  }
} satisfies Record<ADRLocale, Record<string, string>>;

const reportLabels = {
  en: {
    reportTitle: "QuorumMind Decision Report",
    finalRecommendation: "Final recommendation",
    metrics: "Decision metrics",
    source: "Source",
    liveSource: "Live model aggregation",
    fallbackSource: "Deterministic fallback",
    quorumScore: "Decision score",
    dissentIndex: "Dissent index",
    rankedProposals: "Ranked proposals",
    utility: "Utility",
    confidence: "Confidence",
    regret: "Regret",
    riskRadar: "Risk radar",
    delphi: "Delphi consensus protocol",
    inputs: "Inputs",
    outputs: "Outputs",
    status: "Status",
    bayesian: "Bayesian weighted voting",
    posterior: "Posterior",
    reputation: "Reputation",
    baseWeight: "Base",
    topsis: "TOPSIS decision lens",
    closeness: "Closeness",
    idealDistance: "Ideal distance",
    antiIdealDistance: "Anti-ideal distance",
    monteCarlo: "Monte Carlo stress lens",
    winRate: "Win rate",
    average: "Average",
    downside: "Downside P10",
    worst: "Worst",
    ahp: "AHP sensitivity analysis",
    consistencyRatio: "Consistency ratio",
    assessment: "Assessment",
    stableWinnerRate: "Stable winner rate",
    mitigation: "Mitigation",
    regretMap: "Regret map",
    worstRegret: "Worst-case regret",
    averageRegret: "Average regret",
    assumptionLedger: "Assumption ledger",
    proposal: "Proposal",
    action: "Action",
    traceSummary: "Run trace summary",
    providerCalls: "Provider calls",
    failures: "Failures",
    jsonParse: "JSON parse",
    adr: "Architecture Decision Record",
    exportedAt: "Exported",
    footer: "Use JSON trace export for audit-level raw model evidence."
  },
  zh: {
    reportTitle: "QuorumMind 决策报告",
    finalRecommendation: "最终建议",
    metrics: "决策指标",
    source: "来源",
    liveSource: "真实模型聚合",
    fallbackSource: "确定性兜底",
    quorumScore: "裁决综合分",
    dissentIndex: "分歧指数",
    rankedProposals: "方案排序",
    utility: "效用",
    confidence: "置信度",
    regret: "后悔值",
    riskRadar: "风险雷达",
    delphi: "德尔菲共识协议",
    inputs: "输入",
    outputs: "输出",
    status: "状态",
    bayesian: "贝叶斯加权投票",
    posterior: "后验",
    reputation: "信誉",
    baseWeight: "基础权重",
    topsis: "TOPSIS 决策视角",
    closeness: "接近度",
    idealDistance: "距理想解",
    antiIdealDistance: "距负理想解",
    monteCarlo: "蒙特卡洛压力测试",
    winRate: "胜率",
    average: "平均分",
    downside: "下行 P10",
    worst: "最差分",
    ahp: "AHP 敏感性分析",
    consistencyRatio: "一致性比率",
    assessment: "评估",
    stableWinnerRate: "赢家稳定率",
    mitigation: "缓解方式",
    regretMap: "后悔地图",
    worstRegret: "最坏后悔值",
    averageRegret: "平均后悔值",
    assumptionLedger: "假设账本",
    proposal: "方案",
    action: "动作",
    traceSummary: "运行轨迹摘要",
    providerCalls: "模型调用数",
    failures: "失败数",
    jsonParse: "JSON 解析率",
    adr: "架构决策记录",
    exportedAt: "导出时间",
    footer: "审计级原始模型证据请使用 JSON 轨迹导出。"
  }
} satisfies Record<ADRLocale, Record<string, string>>;

const blueprintReportLabels = {
  en: {
    reportTitle: "QuorumMind Blueprint Report",
    metrics: "Run summary",
    source: "Source",
    liveSource: "Live model review trace",
    demoSource: "Deterministic blueprint",
    recommendedAgents: "Recommended target agents",
    usableCalls: "Usable model calls",
    finalConsensus: "Final consensus",
    consensusThreshold: "Consensus threshold",
    consensusConvergence: "Consensus convergence record",
    round: "Round",
    draft: "Independent draft",
    critique: "Cross-critique",
    revision: "Revision",
    verification: "Red-team verification",
    final: "Final synthesis",
    improvements: "Improvements",
    remainingDisagreements: "Remaining disagreements",
    agentPositions: "Agent positions",
    evaluationMatrix: "Final evaluation matrix",
    evidence: "Evidence",
    improvementActions: "Improvement actions",
    strong: "Strong",
    watch: "Watch",
    weak: "Weak",
    detailedRecommendations: "Detailed optimization recommendations",
    owner: "Owner",
    actions: "Actions",
    expectedImpact: "Expected impact",
    acceptanceCheck: "Acceptance check",
    high: "High priority",
    medium: "Medium priority",
    low: "Low priority",
    adoptionLedger: "Critique adoption ledger",
    adopted: "Adopted",
    partial: "Partially adopted",
    deferred: "Deferred",
    critiqueSource: "Critique source",
    suggestion: "Suggestion",
    resolution: "Resolution",
    implementationBacklog: "Implementation backlog",
    phase: "Phase",
    effort: "Effort",
    dependencies: "Dependencies",
    riskIfSkipped: "Risk if skipped",
    targetOutputs: "Target outputs",
    successCriteria: "Success criteria",
    agentDesign: "Target system agent design",
    inputs: "Inputs",
    outputs: "Outputs",
    reviewQuestions: "Review questions",
    failureMode: "Failure mode",
    workflow: "Workflow",
    validation: "Validation",
    schemas: "Data schemas",
    required: "required",
    extraction: "Extraction strategy",
    collaboration: "Multi-agent collaboration and critique protocol",
    humanReview: "Human review loop",
    implementationPlan: "Implementation plan",
    deliverables: "Deliverables",
    acceptance: "Acceptance",
    validationPlan: "Validation plan",
    risks: "Risks",
    openQuestions: "Open questions",
    crossCritiques: "Cross-agent critiques",
    modelContributions: "Model contribution summary",
    usefulIdeas: "Useful ideas",
    cautions: "Cautions",
    none: "None",
    noModelContributions: "No usable structured live model contribution was available; this report uses the local structured Blueprint synthesis.",
    exportedAt: "Exported",
    footer: "Open this report in a browser and print or save as PDF for distribution."
  },
  zh: {
    reportTitle: "QuorumMind 蓝图报告",
    metrics: "运行摘要",
    source: "来源",
    liveSource: "真实模型评审轨迹",
    demoSource: "确定性蓝图",
    recommendedAgents: "建议目标 Agent 数量",
    usableCalls: "可用模型调用",
    finalConsensus: "最终共识",
    consensusThreshold: "共识阈值",
    consensusConvergence: "共识收敛记录",
    round: "第",
    draft: "独立草案",
    critique: "交叉质询",
    revision: "反驳修订",
    verification: "红队复核",
    final: "最终综合",
    improvements: "本轮改进",
    remainingDisagreements: "剩余分歧",
    agentPositions: "Agent 立场",
    evaluationMatrix: "终局评估矩阵",
    evidence: "评估证据",
    improvementActions: "改进动作",
    strong: "稳健",
    watch: "需关注",
    weak: "薄弱",
    detailedRecommendations: "详细优化建议",
    owner: "负责方",
    actions: "行动",
    expectedImpact: "预期影响",
    acceptanceCheck: "验收检查",
    high: "高优先级",
    medium: "中优先级",
    low: "低优先级",
    adoptionLedger: "质询采纳账本",
    adopted: "已采纳",
    partial: "部分采纳",
    deferred: "延期验证",
    critiqueSource: "质询来源",
    suggestion: "建议",
    resolution: "处理",
    implementationBacklog: "实施任务清单",
    phase: "阶段",
    effort: "预估",
    dependencies: "依赖",
    riskIfSkipped: "跳过风险",
    targetOutputs: "目标输出",
    successCriteria: "验收标准",
    agentDesign: "目标系统 Agent 设计",
    inputs: "输入",
    outputs: "输出",
    reviewQuestions: "互评问题",
    failureMode: "失败处理",
    workflow: "工作流",
    validation: "校验",
    schemas: "数据 Schema",
    required: "必填",
    extraction: "抽取策略",
    collaboration: "多 Agent 协作与互评协议",
    humanReview: "人工复审闭环",
    implementationPlan: "实施计划",
    deliverables: "交付物",
    acceptance: "验收",
    validationPlan: "验证计划",
    risks: "风险",
    openQuestions: "待确认问题",
    crossCritiques: "交叉质询",
    modelContributions: "模型贡献摘要",
    usefulIdeas: "可采纳点",
    cautions: "风险提醒",
    none: "无",
    noModelContributions: "本轮没有可用的真实模型结构化贡献，报告使用本地结构化 Blueprint 综合结果。",
    exportedAt: "导出时间",
    footer: "可在浏览器中打开本报告，并打印或另存为 PDF 后分发。"
  }
} satisfies Record<ADRLocale, Record<string, string>>;

const blueprintBacklogLabels = {
  en: {
    title: "QuorumMind Blueprint Implementation Backlog",
    question: "Source request",
    summary: "Summary",
    blueprint: "Blueprint",
    finalConsensus: "Final consensus",
    taskCount: "Task count",
    tasks: "Tasks",
    phase: "Phase",
    owner: "Owner",
    effort: "Effort",
    dependencies: "Dependencies",
    deliverables: "Deliverables",
    acceptance: "Acceptance",
    riskIfSkipped: "Risk if skipped",
    none: "None"
  },
  zh: {
    title: "QuorumMind 蓝图实施任务清单",
    question: "原始需求",
    summary: "摘要",
    blueprint: "蓝图",
    finalConsensus: "最终共识",
    taskCount: "任务数量",
    tasks: "任务",
    phase: "阶段",
    owner: "负责方",
    effort: "预估",
    dependencies: "依赖",
    deliverables: "交付物",
    acceptance: "验收",
    riskIfSkipped: "跳过风险",
    none: "无"
  }
} satisfies Record<ADRLocale, Record<string, string>>;

function blueprintPriorityLabel(priority: string, locale: ADRLocale): string {
  const normalized = priority.toLowerCase();
  const labels: Record<ADRLocale, Record<string, string>> = {
    en: {
      high: "High priority",
      medium: "Medium priority",
      low: "Low priority"
    },
    zh: {
      high: "高优先级",
      medium: "中优先级",
      low: "低优先级"
    }
  };

  return labels[locale][normalized] ?? priority;
}

function formatProposalId(proposalId: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return proposalId;
  }

  const direct: Record<string, string> = {
    shared: "共享表方案",
    schema: "独立 Schema 方案",
    hybrid: "混合隔离方案",
    modular_monolith: "模块化单体",
    selective_extraction: "选择性拆分",
    microservices_now: "立即微服务化",
    langgraph: "LangGraph",
    langchain: "LangChain",
    custom_orchestration: "自研编排"
  };

  return direct[proposalId] ?? proposalId;
}

function localizeRiskCategory(category: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return category;
  }

  const direct: Record<string, string> = {
    performance: "性能",
    reliability: "可靠性",
    security: "安全",
    cost: "成本",
    complexity: "复杂度",
    migration: "迁移",
    vendor_lock_in: "供应商锁定"
  };

  return direct[category] ?? category;
}

function localizeSeverity(severity: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return severity;
  }

  return { low: "低", medium: "中", high: "高" }[severity] ?? severity;
}

function localizeStatus(status: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return status;
  }

  return {
    accepted: "已接受",
    proposed: "已提出",
    complete: "已完成",
    open: "公开",
    blind: "匿名",
    "n/a": "不适用",
    acceptable: "可接受"
  }[status] ?? localizeKnownDecisionText(status, locale);
}

function localizeAnonymity(value: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return value;
  }

  return { blind: "匿名", open: "公开", "n/a": "不适用" }[value] ?? localizeKnownDecisionText(value, locale);
}

function localizeKnownText(value: string, locale: ADRLocale): string {
  if (locale !== "zh") {
    return value;
  }

  const direct: Record<string, string> = {
    "A missing tenant boundary can expose cross-tenant data.": "租户边界缺失可能导致跨租户数据暴露。",
    "Centralize tenant-scoped data access and add authorization boundary tests.": "集中管理租户级数据访问，并补充授权边界测试。",
    "More isolated tenancy models increase migration, backup, and support operations.": "更强隔离的租户模型会增加迁移、备份和支持成本。",
    "Automate tenant lifecycle tasks before moving beyond shared tables.": "在超出共享表方案前，先自动化租户生命周期操作。",
    "Noisy tenants can stress shared indexes and connection pools.": "高负载租户可能压垮共享索引和连接池。",
    "Track per-tenant usage and add partitioning or premium isolation when needed.": "跟踪单租户用量，必要时增加分区或高级隔离。",
    "Splitting a small-team Node.js backend into services adds distributed debugging, deployment, and contract-management overhead.": "小团队把 Node.js 后端拆成多个服务，会增加分布式调试、部署和接口契约管理成本。",
    "Keep a modular monolith first, isolate bounded contexts in code, and extract only after ownership and scaling pressure are proven.": "先保持模块化单体，在代码中隔离边界上下文，只有在责任归属和扩展压力明确后再拆服务。",
    "Microservice infrastructure can consume the next six months of delivery capacity before customer-facing work ships.": "微服务基础设施可能在客户功能交付前消耗未来数月的研发产能。",
    "Use one deployable with strong module boundaries, CI checks, and explicit extraction triggers.": "保持单一部署单元，同时建立清晰模块边界、CI 检查和明确拆分触发条件。",
    "Network calls, partial failures, and version skew introduce reliability modes the current team may not be staffed to operate.": "网络调用、局部失败和版本不一致会引入当前团队未必有能力运维的可靠性问题。",
    "Add observability and background-job boundaries inside the monolith before introducing independent services.": "在引入独立服务前，先在单体内补齐可观测性和后台任务边界。",
    "The team has about 5 engineers.": "团队大约 5 名工程师。",
    "The next six months prioritize fast enterprise feature delivery.": "未来 6 个月优先快速交付企业客户功能。",
    "The current monolith can still be refactored without a rewrite.": "当前单体仍可通过重构演进，不需要重写。",
    "Can this assumption be validated before the next release gate?": "这个假设能否在下一个发布关口前验证？",
    "Review launch requirements with product and legal before implementation.": "实现前与产品和法务复核上线要求。",
    "Add the assumption to the ADR review checklist and owner it in the next design review.": "把该假设加入 ADR 评审清单，并在下一次设计评审中指定负责人。",
    "Capture an experiment or telemetry check that can retire this assumption.": "记录一个实验或遥测检查，用于验证并关闭该假设。"
  };

  return direct[value] ?? localizeKnownDecisionText(value, locale);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
