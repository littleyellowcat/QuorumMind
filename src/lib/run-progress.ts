import type { DecisionMode } from "./domain";
import type { Locale, RunKind, RunProgress } from "../types/app";

export function modelCallHint(mode: DecisionMode, locale: Locale): string {
  if (mode === "fast") return locale === "zh" ? "少量模型席位 / 快速路径" : "reduced model seats / fast path";
  if (mode === "red_team") return locale === "zh" ? "提案 + 质询 + 红队修订" : "proposal + critique + red-team revision";
  return locale === "zh" ? "提案 + 互评 + 修订 + 排序 + 裁决" : "proposal + critique + revision + ranking + verdict";
}

export function advanceRunProgress(current: RunProgress | null, locale: Locale): RunProgress | null {
  if (!current) {
    return current;
  }

  const cap = progressCapForRun(current.kind);

  if (current.progress >= cap) {
    return {
      ...current,
      ...progressCopyForRun(current.kind, current.progress, locale)
    };
  }

  const nextProgress = Math.min(cap, current.progress + progressStepForRun(current.kind, current.progress));

  return {
    ...current,
    ...progressCopyForRun(current.kind, nextProgress, locale),
    progress: nextProgress
  };
}

export function progressCapForRun(kind: RunKind): number {
  if (kind === "agent") return 84;
  if (kind === "blueprint") return 82;
  if (kind === "provider-test") return 72;
  return 78;
}

export function progressStepForRun(kind: RunKind, progress: number): number {
  if (kind === "provider-test") return progress < 60 ? 5 : 2;
  if (kind === "agent") return progress < 58 ? 6 : 3;
  if (kind === "blueprint") return progress < 62 ? 5 : 3;
  return progress < 56 ? 6 : 3;
}

export function progressCopyForRun(kind: RunKind, progress: number, locale: Locale): Pick<RunProgress, "stage" | "message"> {
  if (kind === "decision") {
    if (progress < 48) {
      return {
        stage: locale === "zh" ? "请求后端 API" : "Requesting backend API",
        message:
          locale === "zh"
            ? "前端已向 /api/decisions 发起请求，正在等待后端返回。"
            : "The frontend has called /api/decisions and is waiting for the backend."
      };
    }

    if (progress < 68) {
      return {
        stage: locale === "zh" ? "等待模型与聚合" : "Waiting for model aggregation",
        message:
          locale === "zh"
          ? "如果当前是真实模型模式，后端可能正在等待多个模型提供方的结构化输出。"
            : "In live mode, the backend may be waiting on structured outputs from multiple providers."
      };
    }

    return {
      stage: locale === "zh" ? "等待最终裁决" : "Waiting for final verdict",
      message:
        locale === "zh"
          ? "请求仍在进行中；后端返回前不会把进度伪装成 100%。"
          : "The request is still running; progress will not be faked to 100% before the backend returns."
    };
  }

  if (kind === "blueprint") {
    if (progress < 52) {
      return {
        stage: locale === "zh" ? "请求蓝图 API" : "Requesting Blueprint API",
        message:
          locale === "zh"
            ? "前端已向 /api/blueprints 发起请求，正在等待草案和互评结果。"
            : "The frontend has called /api/blueprints and is waiting for drafts and critique."
      };
    }

    return {
      stage: locale === "zh" ? "蓝图多轮收敛中" : "Converging Blueprint rounds",
      message:
        locale === "zh"
          ? "正在等待共识轮次、模型轨迹或确定性合成结果。"
          : "Waiting for consensus rounds, model trace, or deterministic synthesis."
    };
  }

  if (kind === "agent") {
    return {
      stage: locale === "zh" ? "LangGraph 循环执行中" : "LangGraph loop running",
      message:
        locale === "zh"
          ? "正在等待 validate_result、revise_discussion 或 human_review_gate 路由结果。"
          : "Waiting for validate_result, revise_discussion, or human_review_gate routing."
    };
  }

  return {
    stage: locale === "zh" ? "测试模型连接" : "Testing model connections",
    message:
      locale === "zh"
        ? "正在等待模型提供方配置、响应和 schema 检查结果。"
        : "Waiting for provider configuration, response, and schema checks."
  };
}
