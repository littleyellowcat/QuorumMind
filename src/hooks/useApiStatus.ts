import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DecisionApiHealth } from "../lib/api-client";
import type { ApiSecurityPosture, Locale } from "../types/app";
import { errorMessage } from "../components/WorkbenchShared";
import { getApiHealth, getApiSecurityPosture } from "../lib/api-client";

export function useApiStatus(input: {
  locale: Locale;
  setHealth: Dispatch<SetStateAction<DecisionApiHealth | null>>;
  setSecurityPosture: Dispatch<SetStateAction<ApiSecurityPosture | null>>;
  setRuntimeNotice: Dispatch<SetStateAction<string | null>>;
}) {
  const { locale, setHealth, setSecurityPosture, setRuntimeNotice } = input;

  return useCallback(async function refreshApiStatus() {
    try {
      const [healthResponse, securityResponse] = await Promise.all([getApiHealth(), getApiSecurityPosture()]);
      setHealth(healthResponse);
      setSecurityPosture(securityResponse);
    } catch (error) {
      setRuntimeNotice(
        locale === "zh"
          ? `API 状态不可用：${errorMessage(error)}。仍可使用本地确定性结果。`
          : `API status unavailable: ${errorMessage(error)}. Deterministic local mode is still available.`
      );
    }
  }, [locale, setHealth, setRuntimeNotice, setSecurityPosture]);
}
