export function WorkbenchIntro({
  title,
  workspaceLabel,
  hint,
  sourceLabel,
  statusLabel,
  modeLabel,
  sourceTitle
}: {
  title: string;
  workspaceLabel: string;
  hint: string;
  sourceLabel: string;
  statusLabel: string;
  modeLabel: string;
  sourceTitle: string;
}) {
  return (
    <section className="intro-strip">
      <div>
        <span>{workspaceLabel}</span>
        <h1>{title}</h1>
        <p>{hint}</p>
      </div>
      <dl className="intro-status" aria-label={statusLabel}>
        <div>
          <dt id="workbench-mode-term">{modeLabel}</dt>
          <dd aria-labelledby="workbench-mode-term">{workspaceLabel}</dd>
        </div>
        <div>
          <dt id="workbench-source-term">{sourceTitle}</dt>
          <dd aria-labelledby="workbench-source-term">{sourceLabel}</dd>
        </div>
      </dl>
    </section>
  );
}
