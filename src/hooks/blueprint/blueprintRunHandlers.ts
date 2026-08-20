import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { DecisionContext, DecisionMode } from "../../lib/domain";
import type { BlueprintRoomResult } from "../../lib/blueprint";
import {
  createManualProviderBundle,
  type ManualProviderAgent
} from "../../lib/manual-provider";
import {
  requestAutonomousBlueprintRun,
  requestBlueprintRoom,
  type AgentBlueprintApiResponse,
  type AutonomousBlueprintRun,
  type BlueprintExecutionMode,
  type DecisionApiHealth
} from "../../lib/api-client";
import type { ModelReputationFeedback } from "../../lib/model-reputation";
import type { BlueprintSnapshot, Locale, RunProgress, WorkspaceMode } from "../../types/app";
import type { DecisionHistoryRecord } from "../../lib/decision-history";
import { runLocalBlueprint } from "../../lib/blueprint-runner";
import { modelCallHint } from "../../lib/run-progress";
import { errorMessage, traceStats } from "../../lib/view-utils";
import { persistBlueprintRecord } from "./blueprintHistory";

export type BlueprintRunHandlersInput = {
  locale: Locale;
  decisionMode: DecisionMode;
  blueprintQuestions: Record<Locale, string>;
  blueprintExecutionMode: BlueprintExecutionMode;
  maxProviderRounds: number;
  agentThreadId: string;
  maxConsensusRounds: number;
  humanReviewNote: string;
  activeContext: DecisionContext;
  effectiveAgents: ManualProviderAgent[];
  reputationFeedback: ModelReputationFeedback[];
  health: DecisionApiHealth | null;
  setBlueprintResult: Dispatch<SetStateAction<BlueprintRoomResult | null>>;
  setBlueprintSnapshot: Dispatch<SetStateAction<BlueprintSnapshot | null>>;
  setAgentRun: Dispatch<SetStateAction<AutonomousBlueprintRun | null>>;
  setHistoryRecords: Dispatch<SetStateAction<DecisionHistoryRecord[]>>;
  setRunning: Dispatch<SetStateAction<RunProgress | null>>;
  setRuntimeNotice: Dispatch<SetStateAction<string | null>>;
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>;
  abortRef: MutableRefObject<AbortController | null>;
};

export function createBlueprintRunHandlers(input: BlueprintRunHandlersInput) {
  const {
    locale,
    decisionMode,
    blueprintQuestions,
    blueprintExecutionMode,
    maxProviderRounds,
    agentThreadId,
    maxConsensusRounds,
    humanReviewNote,
    activeContext,
    effectiveAgents,
    reputationFeedback,
    health,
    setBlueprintResult,
    setBlueprintSnapshot,
    setAgentRun,
    setHistoryRecords,
    setRunning,
    setRuntimeNotice,
    setWorkspaceMode,
    abortRef
  } = input;

  const createPromptBundle = (question: string) =>
    createManualProviderBundle({
      question,
      locale,
      context: activeContext,
      agents: effectiveAgents
    });

  async function handleRunBlueprint() {
    const question = blueprintQuestions[locale].trim();
    if (!question) {
      setRuntimeNotice(locale === "zh" ? "请先输入蓝图需求。" : "Enter a Blueprint request first.");
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    setWorkspaceMode("blueprint");
    setRuntimeNotice(null);
    setAgentRun(null);
    setRunning({
      kind: "blueprint",
      stage: locale === "zh" ? "运行蓝图室" : "Running Blueprint Room",
      progress: blueprintExecutionMode === "live" ? 22 : 45,
      message:
        blueprintExecutionMode === "live"
          ? locale === "zh"
            ? "正在尝试真实模型深度蓝图，并记录每一轮 provider trace。"
            : "Attempting live deep Blueprint and recording provider trace."
          : locale === "zh"
            ? "快速确定性模式不会调用真实模型。"
            : "Fast deterministic mode will not call live providers.",
      modelCall:
        blueprintExecutionMode === "live"
          ? `${Math.max(1, maxProviderRounds)} phase provider trace`
          : locale === "zh"
            ? "不调用真实模型"
            : "no live model calls"
    });

    try {
      let result: BlueprintRoomResult;
      let snapshot: BlueprintSnapshot;

      if (blueprintExecutionMode === "deterministic") {
        result = await runLocalBlueprint(question, locale, decisionMode, activeContext);
        snapshot = {
          providerMode: "demo",
          providerStatus: health?.providerStatus ?? {},
          providerTrace: [],
          promptBundle: createPromptBundle(question),
          blueprintExecution: {
            requested: "deterministic",
            actual: "deterministic",
            liveTraceRequired: false,
            liveTraceAttempted: false,
            liveTraceUsable: false,
            providerCalls: 0,
            usableCalls: 0,
            fallbackReason: "deterministic_mode"
          }
        };
      } else {
        const response = await requestBlueprintRoom(
          {
            question,
            mode: decisionMode,
            locale,
            context: activeContext,
            agentConfig: effectiveAgents,
            reputationFeedback,
            blueprintRuntime: {
              executionMode: blueprintExecutionMode,
              maxProviderRounds
            }
          },
          fetch,
          { signal: abortController.signal }
        );
        if (abortController.signal.aborted) return;
        result = response.result;
        snapshot = response;
      }

      setRunning({
        kind: "blueprint",
        stage: locale === "zh" ? "合成最终方案" : "Synthesizing final plan",
        progress: 88,
        message: locale === "zh" ? "正在更新蓝图过程地图和右侧模型透明度。" : "Updating process map and model transparency.",
        modelCall: traceStats(snapshot.providerTrace).calls ? "provider trace" : undefined
      });
      setBlueprintResult(result);
      setBlueprintSnapshot(snapshot);
      persistBlueprintRecord({ question, response: snapshot, result, setHistoryRecords });
    } catch (error) {
      if (abortController.signal.aborted) return;
      const result = await runLocalBlueprint(question, locale, decisionMode, activeContext);
      const snapshot: BlueprintSnapshot = {
        providerMode: "demo",
        providerStatus: health?.providerStatus ?? {},
        providerTrace: [],
        promptBundle: createPromptBundle(question),
        blueprintExecution: {
          requested: blueprintExecutionMode,
          actual: "deterministic",
          liveTraceRequired: blueprintExecutionMode === "live",
          liveTraceAttempted: blueprintExecutionMode === "live",
          liveTraceUsable: false,
          providerCalls: 0,
          usableCalls: 0,
          fallbackReason: blueprintExecutionMode === "live" ? "live_trace_error" : "deterministic_mode"
        }
      };
      setBlueprintResult(result);
      setBlueprintSnapshot(snapshot);
      persistBlueprintRecord({ question, response: snapshot, result, setHistoryRecords });
      setRuntimeNotice(
        locale === "zh"
          ? `蓝图 API 不可用：${errorMessage(error)}。已显示确定性本地蓝图。`
          : `Blueprint API unavailable: ${errorMessage(error)}. Showing deterministic local Blueprint.`
      );
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  }

  async function handleRunAgentPlatform() {
    const question = blueprintQuestions[locale].trim();
    if (!question) {
      setRuntimeNotice(locale === "zh" ? "请先输入蓝图需求。" : "Enter a Blueprint request first.");
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    setWorkspaceMode("blueprint");
    setRuntimeNotice(null);
    setRunning({
      kind: "agent",
      stage: locale === "zh" ? "运行 LangGraph Agent 平台" : "Running LangGraph Agent platform",
      progress: 20,
      message:
        locale === "zh"
          ? "正在执行 understand_request -> review -> validate -> revise 的有界循环。"
          : "Executing bounded understand -> review -> validate -> revise loop.",
      modelCall:
        blueprintExecutionMode === "live"
          ? `${Math.max(1, maxProviderRounds)} phase provider trace`
          : locale === "zh"
            ? "确定性 LangChain 工具"
            : "deterministic LangChain tools"
    });

    try {
      const response: AgentBlueprintApiResponse = await requestAutonomousBlueprintRun(
        {
          question,
          mode: decisionMode,
          locale,
          context: activeContext,
          agentConfig: effectiveAgents,
          reputationFeedback,
          blueprintRuntime: {
            executionMode: blueprintExecutionMode,
            maxProviderRounds
          },
          agentRuntime: {
            threadId: agentThreadId,
            maxConsensusRounds,
            humanReviewNote: humanReviewNote.trim() || undefined
          }
        },
        fetch,
        { signal: abortController.signal }
      );
      if (abortController.signal.aborted) return;

      const snapshot: BlueprintSnapshot = {
        providerMode: response.providerMode,
        providerStatus: response.providerStatus,
        providerTrace: response.run.providerTrace,
        promptBundle: createPromptBundle(question),
        blueprintExecution: response.run.liveModel
      };

      setRunning({
        kind: "agent",
        stage: locale === "zh" ? "写入运行轨迹" : "Rendering run trace",
        progress: 90,
        message: locale === "zh" ? "正在渲染路由图、工具调用和终止原因。" : "Rendering route map, tool calls, and termination reason.",
        modelCall: response.run.liveModel.liveTraceUsable ? "live provider trace" : undefined
      });
      setAgentRun(response.run);
      setBlueprintResult(response.run.result);
      setBlueprintSnapshot(snapshot);
      persistBlueprintRecord({
        question,
        response: snapshot,
        result: response.run.result,
        agentRun: response.run,
        setHistoryRecords
      });
    } catch (error) {
      if (abortController.signal.aborted) return;
      setRuntimeNotice(
        locale === "zh"
          ? `Agent 平台运行失败：${errorMessage(error)}。请检查 API Token、CORS、限流和请求体配置。`
          : `Agent platform run failed: ${errorMessage(error)}. Check API token, CORS, rate limit, and request body limits.`
      );
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  }

  return {
    handleRunBlueprint,
    handleRunAgentPlatform
  };
}
