import type { Dispatch, SetStateAction } from "react";
import type { DecisionRoomResult, DecisionSnapshot, Locale } from "../../types/app";
import { downloadSimplePdfArtifact } from "../shared/pdfFallback";

export async function exportDecisionResult(input: {
  kind: "adr" | "json" | "report" | "simplePdf";
  locale: Locale;
  decisionQuestions: Record<Locale, string>;
  decisionResult: DecisionRoomResult | null;
  decisionSnapshot: DecisionSnapshot | null;
  setRuntimeNotice: Dispatch<SetStateAction<string | null>>;
}) {
  const { kind, locale, decisionQuestions, decisionResult, decisionSnapshot, setRuntimeNotice } = input;
  if (!decisionResult || !decisionSnapshot) return;
  const exporters = await import("../../lib/exporters");

  if (kind === "adr") {
    exporters.downloadArtifact(exporters.createAdrMarkdownExport(decisionResult, locale));
    return;
  }

  if (kind === "json") {
    exporters.downloadArtifact(
      exporters.createJsonTraceExport({
        question: decisionQuestions[locale],
        locale,
        providerMode: decisionSnapshot.providerMode,
        providerStatus: decisionSnapshot.providerStatus,
        providerTrace: decisionSnapshot.providerTrace,
        contextLedger: decisionSnapshot.contextLedger,
        liveVerdict: decisionSnapshot.liveVerdict,
        promptBundle: decisionSnapshot.promptBundle,
        result: decisionResult
      })
    );
    return;
  }

  if (kind === "simplePdf") {
    await downloadSimplePdfArtifact({
      artifact: exporters.createDecisionFinalPdfExport({
        question: decisionQuestions[locale],
        locale,
        providerMode: decisionSnapshot.providerMode,
        providerStatus: decisionSnapshot.providerStatus,
        providerTrace: decisionSnapshot.providerTrace,
        contextLedger: decisionSnapshot.contextLedger,
        liveVerdict: decisionSnapshot.liveVerdict,
        promptBundle: decisionSnapshot.promptBundle,
        result: decisionResult
      }),
      downloadArtifact: exporters.downloadArtifact,
      locale,
      setRuntimeNotice
    });
    return;
  }

  exporters.downloadArtifact(
    exporters.createPdfReportExport({
      question: decisionQuestions[locale],
      locale,
      providerMode: decisionSnapshot.providerMode,
      providerStatus: decisionSnapshot.providerStatus,
      providerTrace: decisionSnapshot.providerTrace,
      contextLedger: decisionSnapshot.contextLedger,
      liveVerdict: decisionSnapshot.liveVerdict,
      promptBundle: decisionSnapshot.promptBundle,
      result: decisionResult
    })
  );
}
