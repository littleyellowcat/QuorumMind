import type { FailureClassification, FailureSeverity } from "./failure-taxonomy";
import type { ProviderPhase } from "../providers";

export type RunEventType =
  | "run_start"
  | "route_intent_start"
  | "planner_complete"
  | "critic_warn"
  | "human_review_pause"
  | "provider_attempt_start"
  | "provider_attempt_success"
  | "provider_attempt_retry"
  | "provider_attempt_failure"
  | "context_compaction_start"
  | "context_compaction_complete"
  | "run_complete";

export type RunEvent = {
  schemaVersion?: 1;
  runId: string;
  seq: number;
  timestamp: string;
  type: RunEventType;
  severity: FailureSeverity;
  phase?: ProviderPhase | string;
  provider?: string;
  model?: string;
  attempt?: number;
  maxAttempts?: number;
  durationMs?: number;
  summary: string;
  truncated: boolean;
  failure?: FailureClassification;
};

export type RunEventRecorder = {
  record(input: RunEventInput): RunEvent;
  child(defaults: Partial<RunEventInput>): RunEventRecorder;
  events(): RunEvent[];
};

export type RunEventInput = {
  type: RunEventType;
  severity: FailureSeverity;
  phase?: ProviderPhase | string;
  provider?: string;
  model?: string;
  attempt?: number;
  maxAttempts?: number;
  durationMs?: number;
  summary: string;
  failure?: FailureClassification;
};

export type RunEventRecorderOptions = {
  runId: string;
  clock?: () => string;
  maxSummaryChars?: number;
};

export function createRunEventRecorder(options: RunEventRecorderOptions): RunEventRecorder {
  const events: RunEvent[] = [];
  const clock = options.clock ?? (() => new Date().toISOString());
  const maxSummaryChars = options.maxSummaryChars ?? 180;

  function record(input: RunEventInput): RunEvent {
    const summary = compact(input.summary, maxSummaryChars);
    const event: RunEvent = {
      runId: options.runId,
      seq: events.length + 1,
      timestamp: clock(),
      type: input.type,
      severity: input.severity,
      summary: summary.text,
      truncated: summary.truncated,
      ...(input.phase ? { phase: input.phase } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.attempt ? { attempt: input.attempt } : {}),
      ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
      ...(typeof input.durationMs === "number" ? { durationMs: input.durationMs } : {}),
      ...(input.failure ? { failure: input.failure } : {})
    };

    events.push(event);
    return event;
  }

  function child(defaults: Partial<RunEventInput>): RunEventRecorder {
    return {
      record(input) {
        return record({ ...defaults, ...input });
      },
      child(nestedDefaults) {
        return child({ ...defaults, ...nestedDefaults });
      },
      events: () => events.slice()
    };
  }

  return {
    record,
    child,
    events: () => events.slice()
  };
}

function compact(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }

  return {
    text: `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`,
    truncated: true
  };
}
