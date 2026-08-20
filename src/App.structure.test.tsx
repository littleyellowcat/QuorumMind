import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const sourceRoot = join(process.cwd(), "src");

function readSource(relativePath: string) {
  return readFileSync(join(sourceRoot, relativePath), "utf8");
}

describe("App module boundaries", () => {
  it("keeps heavyweight workbench views out of App.tsx", () => {
    const appSource = readSource("App.tsx");

    expect(appSource).not.toMatch(/function\s+DecisionResultView\b/);
    expect(appSource).not.toMatch(/function\s+BlueprintResultView\b/);
    expect(appSource).not.toMatch(/function\s+DecisionInspector\b/);
    expect(appSource).not.toMatch(/function\s+BlueprintInspector\b/);
  });

  it("keeps run, export, and history handlers in hooks", () => {
    const appSource = readSource("App.tsx");

    expect(existsSync(join(sourceRoot, "hooks/useDecisionRuns.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "hooks/useBlueprintRuns.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "hooks/useRunHistory.ts"))).toBe(true);

    expect(appSource).not.toMatch(/function\s+handleRunDecision\b/);
    expect(appSource).not.toMatch(/function\s+handleRunBlueprint\b/);
    expect(appSource).not.toMatch(/function\s+handleRestoreHistory\b/);
    expect(appSource).not.toMatch(/function\s+handleDecisionExport\b/);
    expect(appSource).not.toMatch(/function\s+handleBlueprintExport\b/);
  });

  it("keeps LandingPage and small app handlers out of App.tsx", () => {
    const appSource = readSource("App.tsx");

    expect(existsSync(join(sourceRoot, "components/LandingPage.tsx"))).toBe(true);
    expect(existsSync(join(sourceRoot, "hooks/useApiStatus.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "hooks/useProviderTest.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "hooks/useClipboardNotice.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "hooks/useModelFeedback.ts"))).toBe(true);

    expect(appSource).not.toMatch(/function\s+LandingPage\b/);
    expect(appSource).not.toMatch(/function\s+refreshApiStatus\b/);
    expect(appSource).not.toMatch(/function\s+handleProviderTest\b/);
    expect(appSource).not.toMatch(/function\s+copyText\b/);
    expect(appSource).not.toMatch(/function\s+handleFeedback\b/);
  });

  it("keeps shared workbench code split by responsibility", () => {
    expect(existsSync(join(sourceRoot, "components/workbench/WorkbenchSetupPanels.tsx"))).toBe(true);
    expect(existsSync(join(sourceRoot, "components/workbench/DecisionPanels.tsx"))).toBe(true);
    expect(existsSync(join(sourceRoot, "components/workbench/BlueprintPanels.tsx"))).toBe(true);
    expect(existsSync(join(sourceRoot, "lib/view-utils.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "lib/run-progress.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "lib/blueprint-runner.ts"))).toBe(true);
  });

  it("keeps run hooks backed by smaller helpers", () => {
    expect(existsSync(join(sourceRoot, "hooks/decision/decisionRunHandlers.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "hooks/decision/decisionExportHandlers.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "hooks/decision/decisionHistory.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "hooks/shared/pdfFallback.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "hooks/blueprint/blueprintRunHandlers.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "hooks/blueprint/blueprintExportHandlers.ts"))).toBe(true);
    expect(existsSync(join(sourceRoot, "hooks/blueprint/blueprintHistory.ts"))).toBe(true);
  });

  it("keeps large decision and blueprint panels split into smaller view files", () => {
    const decisionPanelsSource = readSource("components/workbench/DecisionPanels.tsx");
    const blueprintPanelsSource = readSource("components/workbench/BlueprintPanels.tsx");

    expect(existsSync(join(sourceRoot, "components/workbench/decision/DecisionSummaryPanels.tsx"))).toBe(true);
    expect(existsSync(join(sourceRoot, "components/workbench/decision/DecisionRiskPanels.tsx"))).toBe(true);
    expect(existsSync(join(sourceRoot, "components/workbench/decision/PromptInspector.tsx"))).toBe(true);

    expect(existsSync(join(sourceRoot, "components/workbench/blueprint/SourceQualityBanner.tsx"))).toBe(true);
    expect(existsSync(join(sourceRoot, "components/workbench/blueprint/BlueprintProcessMap.tsx"))).toBe(true);
    expect(existsSync(join(sourceRoot, "components/workbench/blueprint/AgentPlatformRunPanel.tsx"))).toBe(true);
    expect(existsSync(join(sourceRoot, "components/workbench/blueprint/BlueprintModelCalls.tsx"))).toBe(true);
    expect(existsSync(join(sourceRoot, "components/workbench/blueprint/BlueprintHistoryComparison.tsx"))).toBe(true);

    expect(decisionPanelsSource).not.toMatch(/function\s+(AgentCard|RiskMatrixPanel|PromptInspector)\b/);
    expect(blueprintPanelsSource).not.toMatch(/function\s+(BlueprintProcessMap|AgentPlatformRunPanel|BlueprintHistoryComparison)\b/);
  });
});
