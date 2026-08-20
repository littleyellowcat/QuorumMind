import type { Dispatch, SetStateAction } from "react";
import { downloadRenderedPdf } from "../../lib/api-client";
import type { Locale } from "../../types/app";
import { errorMessage } from "../../lib/view-utils";

export type ExportArtifact = {
  filename: string;
  mimeType: string;
  contents: string;
};

export async function downloadSimplePdfArtifact(input: {
  artifact: ExportArtifact;
  downloadArtifact: (artifact: ExportArtifact) => void;
  locale: Locale;
  setRuntimeNotice: Dispatch<SetStateAction<string | null>>;
}) {
  const { artifact, downloadArtifact, locale, setRuntimeNotice } = input;

  try {
    await downloadRenderedPdf(
      {
        html: artifact.contents,
        filename: artifact.filename
      },
      fetch
    );
  } catch (error) {
    downloadArtifact({
      ...artifact,
      filename: artifact.filename.replace(/\.pdf$/i, ".html")
    });
    setRuntimeNotice(
      locale === "zh"
        ? `PDF 生成失败：${errorMessage(error)}。已改为下载可打印的简版 HTML。`
        : `PDF generation failed: ${errorMessage(error)}. Downloaded a printable simple HTML instead.`
    );
  }
}
