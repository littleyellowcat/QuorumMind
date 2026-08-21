import type { RunAuditBundle, RunAuditReplay, RunAuditReplayDiffResponse, RunAuditReplayListItem } from "../lib/api-client";
import type { Locale } from "../types/app";

export function AuditReplayCenter({
  locale,
  replays,
  selectedReplay,
  selectedBundle,
  replayDiff,
  loading,
  onRefresh,
  onSelectReplay,
  onCopyReplayPackage,
  onCopyBundle,
  onLoadBundle,
  onCompareReplay
}: {
  locale: Locale;
  replays: RunAuditReplayListItem[];
  selectedReplay: RunAuditReplay | null;
  selectedBundle?: RunAuditBundle | null;
  replayDiff?: RunAuditReplayDiffResponse["diff"] | null;
  loading: boolean;
  onRefresh: () => void;
  onSelectReplay: (runId: string) => void;
  onCopyReplayPackage: () => void;
  onCopyBundle?: () => void;
  onLoadBundle?: (runId: string) => void;
  onCompareReplay?: (baseRunId: string, targetRunId: string) => void;
}) {
  const copy = replayCopy[locale];
  const selectedRunId = selectedReplay?.summary.runId;
  const compareBaseRunId = replays.find((replay) => replay.runId !== selectedRunId)?.runId;

  return (
    <section className="context-panel audit-replay-center">
      <header>
        <div>
          <span>{copy.kicker}</span>
          <strong>{copy.title}</strong>
        </div>
        <button className="secondary-action" disabled={loading} onClick={onRefresh}>
          {loading ? copy.loading : copy.refresh}
        </button>
      </header>
      <p className="field-help">{copy.help}</p>

      {replays.length > 0 ? (
        <div className="audit-replay-list" aria-label={copy.listLabel}>
          {replays.slice(0, 5).map((replay) => (
            <button
              className={replay.runId === selectedRunId ? "active" : ""}
              key={replay.runId}
              onClick={() => onSelectReplay(replay.runId)}
            >
              <strong>{replay.summary ?? replay.runId}</strong>
              <span>
                {replay.status ?? copy.unknown} · {replay.eventCount} {copy.events} · {replay.artifactCount}{" "}
                {copy.artifacts}
              </span>
              <small>{replayMetadataLabel(replay, copy)}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="field-help">{loading ? copy.loading : copy.empty}</p>
      )}

      {selectedReplay ? (
        <div className="audit-replay-detail">
          <div className="permission-audit-stats" aria-label={copy.metricsLabel}>
            <span>{`${selectedReplay.metrics.providerCallCount} ${copy.providerCalls}`}</span>
            <span>{`${selectedReplay.metrics.permissionDecisionCount} ${copy.permissionDecisions}`}</span>
            <span>{`${selectedReplay.metrics.githubReviewCount} ${copy.githubOutputs}`}</span>
            <span>{`${selectedReplay.metrics.humanReviewCount} ${copy.humanReviews}`}</span>
          </div>
          <div className="audit-replay-grid">
            <article>
              <span>{copy.providerTrail}</span>
              <strong>{selectedReplay.providerCalls[0]?.provider ?? copy.none}</strong>
              <small>{selectedReplay.providerCalls[0]?.summary ?? copy.noProviderCalls}</small>
            </article>
            <article>
              <span>{copy.githubTrail}</span>
              <strong>{selectedReplay.githubReviews[0]?.checkRunConclusion ?? copy.none}</strong>
              <small>
                {selectedReplay.githubReviews[0]
                  ? `${selectedReplay.githubReviews[0].reviewCommentCount} ${copy.reviewComments} · ${selectedReplay.githubReviews[0].annotationCount} ${copy.annotations}`
                  : copy.noGithubOutputs}
              </small>
            </article>
          </div>
          <ol className="audit-replay-timeline" aria-label={copy.timelineLabel}>
            {selectedReplay.timeline.slice(0, 4).map((item) => (
              <li key={`${item.seq}-${item.type}`}>
                <span>{item.type}</span>
                <small>{item.summary}</small>
              </li>
            ))}
          </ol>
          {selectedBundle ? (
            <div className="audit-replay-grid">
              <article>
                <span>{copy.bundleManifest}</span>
                <strong>{selectedBundle.manifest.runId}</strong>
                <small>
                  {selectedBundle.manifest.linkedPullRequests.map((pr) => `PR #${pr}`).join(", ") || copy.noPrLinks}
                  {" · "}
                  {selectedBundle.files.length} {copy.bundleFiles}
                </small>
              </article>
              <article>
                <span>{copy.bundleArtifacts}</span>
                <strong>{selectedBundle.files[0]?.label ?? copy.none}</strong>
                <small>{selectedBundle.files[0]?.sha256 ?? copy.noSha}</small>
              </article>
            </div>
          ) : null}
          {replayDiff ? (
            <div className="audit-replay-grid">
              <article>
                <span>{copy.runDiff}</span>
                <strong>{`${replayDiff.baseRunId} -> ${replayDiff.targetRunId}`}</strong>
                <small>
                  {signed(replayDiff.metricDelta.providerCallCount)} {copy.providerCalls} ·{" "}
                  {signed(replayDiff.metricDelta.githubReviewCount)} {copy.githubOutputs}
                </small>
              </article>
              <article>
                <span>{copy.diffChanges}</span>
                <strong>{replayDiff.providerChanges.added[0] ?? replayDiff.riskLevelChanges.added[0] ?? copy.none}</strong>
                <small>{replayDiff.statusChanged ? copy.statusChanged : copy.statusUnchanged}</small>
              </article>
            </div>
          ) : null}
          <div className="permission-reply-actions">
            <button className="secondary-action" onClick={onCopyReplayPackage}>
              {copy.copyPackage}
            </button>
            {onLoadBundle ? (
              <button className="secondary-action" onClick={() => onLoadBundle(selectedReplay.summary.runId)}>
                {copy.loadBundle}
              </button>
            ) : null}
            {selectedBundle && onCopyBundle ? (
              <button className="secondary-action" onClick={onCopyBundle}>
                {copy.copyBundle}
              </button>
            ) : null}
            {compareBaseRunId && onCompareReplay ? (
              <button className="secondary-action" onClick={() => onCompareReplay(compareBaseRunId, selectedReplay.summary.runId)}>
                {copy.compare}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

const replayCopy = {
  en: {
    kicker: "Run history",
    title: "Run audit replay",
    help: "Replay recent Decision Room evidence across events, model calls, GitHub outputs, artifacts, and permission decisions.",
    refresh: "Refresh",
    loading: "Loading...",
    empty: "No server-side run audit records yet.",
    unknown: "unknown",
    events: "events",
    artifacts: "artifacts",
    providerCalls: "provider calls",
    permissionDecisions: "permission decisions",
    githubOutputs: "GitHub outputs",
    humanReviews: "human reviews",
    providerTrail: "Provider trail",
    githubTrail: "GitHub trail",
    noProviderCalls: "No provider calls recorded.",
    noGithubOutputs: "No GitHub native review outputs recorded.",
    reviewComments: "review comments",
    annotations: "annotations",
    bundleManifest: "Bundle manifest",
    bundleArtifacts: "Bundle artifacts",
    bundleFiles: "bundle files",
    runDiff: "Run diff",
    diffChanges: "Diff changes",
    statusChanged: "status changed",
    statusUnchanged: "status unchanged",
    loadBundle: "Load bundle",
    copyBundle: "Copy bundle",
    compare: "Compare",
    noPrLinks: "No PR links",
    noSha: "No checksum",
    none: "None",
    noLinks: "No PR/ADR links",
    copyPackage: "Copy replay package",
    listLabel: "Run audit replay list",
    metricsLabel: "Run audit replay metrics",
    timelineLabel: "Run audit replay timeline"
  },
  zh: {
    kicker: "运行历史",
    title: "运行审计回放",
    help: "回放最近决策室的事件、模型调用、GitHub 输出、产物和权限决策证据。",
    refresh: "刷新",
    loading: "加载中...",
    empty: "暂无服务端运行审计记录。",
    unknown: "未知",
    events: "个事件",
    artifacts: "个产物",
    providerCalls: "次模型调用",
    permissionDecisions: "条权限决策",
    githubOutputs: "个 GitHub 输出",
    humanReviews: "次人工复审",
    providerTrail: "模型轨迹",
    githubTrail: "GitHub 轨迹",
    noProviderCalls: "未记录模型调用。",
    noGithubOutputs: "未记录 GitHub 原生评审输出。",
    reviewComments: "条评审评论",
    annotations: "条标注",
    bundleManifest: "回放包清单",
    bundleArtifacts: "回放包产物",
    bundleFiles: "个包文件",
    runDiff: "运行差异",
    diffChanges: "差异变化",
    statusChanged: "状态已变化",
    statusUnchanged: "状态未变化",
    loadBundle: "加载回放包",
    copyBundle: "复制回放包",
    compare: "对比运行",
    noPrLinks: "暂无 PR 关联",
    noSha: "暂无校验和",
    none: "无",
    noLinks: "暂无 PR/ADR 关联",
    copyPackage: "复制回放包",
    listLabel: "运行审计回放列表",
    metricsLabel: "运行审计回放指标",
    timelineLabel: "运行审计回放时间线"
  }
};

function replayMetadataLabel(replay: RunAuditReplayListItem, copy: typeof replayCopy.en): string {
  const parts = [
    replay.linkedPullRequests.length ? replay.linkedPullRequests.map((pr) => `PR #${pr}`).join(", ") : "",
    replay.linkedAdrPaths[0] ?? "",
    replay.providers[0] ?? "",
    replay.riskLevels[0] ?? ""
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : copy.noLinks;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
