import type { ManualProviderBundle } from "../../../lib/manual-provider";
import { CollapsibleSidePanel } from "../../PanelTitle";
import { appCopy, phaseLabels } from "../../../i18n/view-copy";
import type { Locale } from "../../../types/app";

export function PromptInspector({ locale, promptBundle }: { locale: Locale; promptBundle?: ManualProviderBundle }) {
  if (!promptBundle) {
    return (
      <CollapsibleSidePanel title={appCopy[locale].promptBundle} kicker="0">
        <p className="field-help">{locale === "zh" ? "运行后会显示 Prompt 包。" : "Prompt bundle appears after a run."}</p>
      </CollapsibleSidePanel>
    );
  }

  const groups = promptBundle.prompts.reduce<Record<string, typeof promptBundle.prompts>>((acc, prompt) => {
    acc[prompt.phase] = [...(acc[prompt.phase] ?? []), prompt];
    return acc;
  }, {});

  return (
    <CollapsibleSidePanel title={appCopy[locale].promptBundle} kicker={String(promptBundle.prompts.length)}>
      <div className="prompt-phase-list">
        {Object.entries(groups).map(([phase, prompts]) => (
          <details className="prompt-phase-group" key={phase}>
            <summary>
              <span>{phaseLabels[locale][phase] ?? phase}</span>
              <small>{prompts.length} {locale === "zh" ? "个 Prompt" : "prompts"}</small>
            </summary>
            <div className="prompt-card-list">
              {prompts.map((prompt) => (
                <article className="prompt-card" key={prompt.id}>
                  <header>
                    <div>
                      <span>{prompt.agentName}</span>
                      <strong>{prompt.title}</strong>
                    </div>
                    <button onClick={() => navigator.clipboard?.writeText(prompt.prompt)}>
                      {locale === "zh" ? "复制" : "Copy"}
                    </button>
                  </header>
                  <pre>{prompt.prompt}</pre>
                </article>
              ))}
            </div>
          </details>
        ))}
      </div>
    </CollapsibleSidePanel>
  );
}
