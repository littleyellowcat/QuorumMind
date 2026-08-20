import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DecisionApiHealth, ProviderConnectionTestResponse } from "../lib/api-client";
import type { Locale, RunProgress } from "../types/app";
import { errorMessage } from "../components/WorkbenchShared";
import { testProviderConnections } from "../lib/api-client";

export function useProviderTest(input: {
  locale: Locale;
  setRunning: Dispatch<SetStateAction<RunProgress | null>>;
  setRuntimeNotice: Dispatch<SetStateAction<string | null>>;
  setProviderTest: Dispatch<SetStateAction<ProviderConnectionTestResponse | null>>;
  setHealth: Dispatch<SetStateAction<DecisionApiHealth | null>>;
}) {
  const { locale, setRunning, setRuntimeNotice, setProviderTest, setHealth } = input;

  return useCallback(async function handleProviderTest() {
    setRunning({
      kind: "provider-test",
      stage: locale === "zh" ? "测试模型连接" : "Testing model connections",
      progress: 45,
      message: locale === "zh" ? "正在检查 API key、模型响应和 schema 可用性。" : "Checking API keys, model response, and schema usability."
    });
    setRuntimeNotice(null);

    try {
      const response = await testProviderConnections();
      setProviderTest(response);
      setHealth((current) =>
        current
          ? {
              ...current,
              providerMode: response.providerMode,
              providerStatus: response.providerStatus
            }
          : current
      );
    } catch (error) {
      setRuntimeNotice(
        locale === "zh"
          ? `模型连接测试失败：${errorMessage(error)}。`
          : `Provider connection test failed: ${errorMessage(error)}.`
      );
    } finally {
      setRunning(null);
    }
  }, [locale, setHealth, setProviderTest, setRunning, setRuntimeNotice]);
}
