import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Locale } from "../types/app";

export function useClipboardNotice(input: {
  locale: Locale;
  setRuntimeNotice: Dispatch<SetStateAction<string | null>>;
  copiedNotice: string;
}) {
  const { locale, setRuntimeNotice, copiedNotice } = input;

  return useCallback(async function copyText(value: string, notice = copiedNotice) {
    try {
      await navigator.clipboard.writeText(value);
      setRuntimeNotice(notice);
    } catch {
      setRuntimeNotice(
        locale === "zh"
          ? "浏览器剪贴板不可用，请使用导出按钮获取内容。"
          : "Clipboard is unavailable. Use the export buttons instead."
      );
    }
  }, [copiedNotice, locale, setRuntimeNotice]);
}
