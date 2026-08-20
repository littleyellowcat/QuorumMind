import type { Dispatch, SetStateAction } from "react";
import type { BlueprintRoomResult } from "../../lib/blueprint";
import type { BlueprintSnapshot, Locale } from "../../types/app";
import { downloadSimplePdfArtifact } from "../shared/pdfFallback";

export async function exportBlueprintResult(input: {
  kind: "markdown" | "report" | "backlog" | "simplePdf";
  locale: Locale;
  blueprintQuestions: Record<Locale, string>;
  blueprintResult: BlueprintRoomResult | null;
  blueprintSnapshot: BlueprintSnapshot | null;
  setRuntimeNotice: Dispatch<SetStateAction<string | null>>;
}) {
  const { kind, locale, blueprintQuestions, blueprintResult, blueprintSnapshot, setRuntimeNotice } = input;
  if (!blueprintResult || !blueprintSnapshot) return;
  const exporters = await import("../../lib/exporters");

  if (kind === "markdown") {
    exporters.downloadArtifact({
      filename: `quorummind-blueprint-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
      mimeType: "text/markdown;charset=utf-8",
      contents: blueprintResult.finalSpec.markdown
    });
    return;
  }

  if (kind === "backlog") {
    exporters.downloadArtifact(
      exporters.createBlueprintBacklogExport({
        question: blueprintQuestions[locale],
        locale,
        result: blueprintResult
      })
    );
    return;
  }

  if (kind === "simplePdf") {
    await downloadSimplePdfArtifact({
      artifact: exporters.createBlueprintFinalPdfExport({
        question: blueprintQuestions[locale],
        locale,
        providerMode: blueprintSnapshot.providerMode,
        providerStatus: blueprintSnapshot.providerStatus,
        providerTrace: blueprintSnapshot.providerTrace,
        contextLedger: blueprintSnapshot.contextLedger,
        result: blueprintResult
      }),
      downloadArtifact: exporters.downloadArtifact,
      locale,
      setRuntimeNotice
    });
    return;
  }

  exporters.downloadArtifact(
    exporters.createBlueprintReportExport({
      question: blueprintQuestions[locale],
      locale,
      providerMode: blueprintSnapshot.providerMode,
      providerStatus: blueprintSnapshot.providerStatus,
      providerTrace: blueprintSnapshot.providerTrace,
      contextLedger: blueprintSnapshot.contextLedger,
      result: blueprintResult
    })
  );
}
