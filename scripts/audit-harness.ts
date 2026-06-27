import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

type AuditEnv = Record<string, string | undefined>;

export type AuditTraceSummary = Array<{
  phase?: string;
  provider?: string;
  model?: string;
  status?: string;
  validationStatus?: string;
  jsonParsed?: boolean;
  failureClass?: string;
  durationMs?: number;
}>;

export type AuditCaseResultBase = {
  id: string;
  status: string;
  source?: string;
  calls?: number;
  latencyMs?: number;
  notes?: string[];
  traceSummary?: AuditTraceSummary;
};

export type AuditRunSummary = {
  progressPath: string;
  resumeEnabled: boolean;
  resumedCases: number;
  completedCases: number;
  plannedCases: number;
  maxRuntimeMs: number;
  stopReason: "completed" | "max_runtime_exceeded" | "manual_interrupt" | "not_started";
};

type AuditHarnessOptions = {
  kind: string;
  startedAt: Date;
  selectedCaseIds: string[];
  env: AuditEnv;
  progressPathEnvKey: string;
  resumeEnvKey: string;
  maxRuntimeEnvKey: string;
  defaultMaxRuntimeMs: number;
  plannedCases: number;
};

type AuditProgressRecord<T extends AuditCaseResultBase> =
  | {
      type: "run_event";
      event: "start" | "case_start" | "case_resume_skip" | "max_runtime_exceeded" | "manual_interrupt";
      timestamp: string;
      kind: string;
      details: Record<string, unknown>;
    }
  | {
      type: "case_result";
      timestamp: string;
      kind: string;
      result: T;
    };

export function createAuditHarness<T extends AuditCaseResultBase>(options: AuditHarnessOptions) {
  const progressPath =
    options.env[options.progressPathEnvKey] ??
    defaultProgressPath(options.kind, options.startedAt, options.selectedCaseIds);
  const resumeEnabled = isEnabled(options.env[options.resumeEnvKey]) || isEnabled(options.env.QUORUMMIND_AUDIT_RESUME);
  const maxRuntimeMs = boundedInteger(
    options.env[options.maxRuntimeEnvKey] ?? options.env.QUORUMMIND_AUDIT_MAX_RUNTIME_MS,
    options.defaultMaxRuntimeMs,
    0,
    86_400_000
  );
  const completedById = resumeEnabled ? readCompletedResults<T>(progressPath) : new Map<string, T>();
  const initiallyCompletedIds = new Set(completedById.keys());
  let stopReason: AuditRunSummary["stopReason"] = "not_started";

  mkdirSync(dirname(progressPath), { recursive: true });

  const record = (entry: AuditProgressRecord<T>) => {
    appendFileSync(progressPath, `${JSON.stringify(entry)}\n`, "utf8");
  };

  const elapsedMs = () => Date.now() - options.startedAt.getTime();

  const writeEvent = (event: Extract<AuditProgressRecord<T>, { type: "run_event" }>["event"], details: Record<string, unknown>) => {
    record({
      type: "run_event",
      event,
      timestamp: new Date().toISOString(),
      kind: options.kind,
      details
    });
  };

  const startedDetails = {
    plannedCases: options.plannedCases,
    selectedCaseIds: options.selectedCaseIds,
    resumeEnabled,
    resumedCases: completedById.size,
    maxRuntimeMs,
    progressPath
  };
  stopReason = "completed";
  writeEvent("start", startedDetails);
  console.log(`[audit:${options.kind}] start ${JSON.stringify(startedDetails)}`);

  process.once("SIGINT", () => {
    stopReason = "manual_interrupt";
    const details = {
      completedCases: completedById.size,
      plannedCases: options.plannedCases,
      elapsedMs: elapsedMs(),
      progressPath
    };
    writeEvent("manual_interrupt", details);
    console.warn(`[audit:${options.kind}] interrupted ${JSON.stringify(details)}`);
    process.exit(130);
  });

  return {
    progressPath,
    resumeEnabled,
    completedResult(caseId: string): T | undefined {
      return completedById.get(caseId);
    },
    logResumeSkip(index: number, total: number, caseId: string): void {
      const details = { index, total, caseId, progressPath };
      writeEvent("case_resume_skip", details);
      console.log(`[audit:${options.kind}] case ${index}/${total} resume-skip ${caseId}`);
    },
    shouldStopBeforeNextCase(): boolean {
      if (maxRuntimeMs <= 0 || elapsedMs() < maxRuntimeMs) {
        return false;
      }

      stopReason = "max_runtime_exceeded";
      const details = {
        elapsedMs: elapsedMs(),
        maxRuntimeMs,
        completedCases: completedById.size,
        plannedCases: options.plannedCases,
        progressPath
      };
      writeEvent("max_runtime_exceeded", details);
      console.warn(`[audit:${options.kind}] max-runtime-exceeded ${JSON.stringify(details)}`);

      return true;
    },
    caseStart(index: number, total: number, caseId: string, details: Record<string, unknown>): void {
      const payload = {
        index,
        total,
        caseId,
        elapsedMs: elapsedMs(),
        ...details
      };
      writeEvent("case_start", payload);
      console.log(`[audit:${options.kind}] case ${index}/${total} start ${caseId} ${JSON.stringify(details)}`);
    },
    caseResult(result: T): void {
      completedById.set(result.id, result);
      record({
        type: "case_result",
        timestamp: new Date().toISOString(),
        kind: options.kind,
        result
      });

      const summary = {
        id: result.id,
        status: result.status,
        source: result.source,
        calls: result.calls ?? 0,
        latencyMs: result.latencyMs ?? 0,
        notes: result.notes?.slice(0, 2) ?? []
      };
      console.log(`[audit:${options.kind}] case result ${JSON.stringify(summary)}`);

      if (result.traceSummary?.length) {
        for (const item of result.traceSummary) {
          console.log(
            `[audit:${options.kind}] trace ${[
              item.phase,
              item.provider,
              item.model,
              item.status,
              item.validationStatus,
              item.failureClass,
              item.jsonParsed === undefined ? undefined : `json=${item.jsonParsed}`,
              item.durationMs === undefined ? undefined : `${item.durationMs}ms`
            ]
              .filter(Boolean)
              .join("/")}`
          );
        }
      }
    },
    summary(results: T[]): AuditRunSummary {
      return {
        progressPath,
        resumeEnabled,
        resumedCases: resumeEnabled ? results.filter((result) => initiallyCompletedIds.has(result.id)).length : 0,
        completedCases: results.length,
        plannedCases: options.plannedCases,
        maxRuntimeMs,
        stopReason
      };
    }
  };
}

function defaultProgressPath(kind: string, startedAt: Date, selectedCaseIds: string[]): string {
  const caseSuffix = selectedCaseIds.length > 0 ? `-${slug(selectedCaseIds.join("-")).slice(0, 90)}` : "";

  return join("output", "audit-progress", `${formatDate(startedAt)}-${kind}${caseSuffix}.jsonl`);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "") || "filtered"
  );
}

function readCompletedResults<T extends AuditCaseResultBase>(path: string): Map<string, T> {
  const completed = new Map<string, T>();

  if (!existsSync(path)) {
    return completed;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as Partial<AuditProgressRecord<T>>;

      if (parsed.type === "case_result" && parsed.result?.id) {
        completed.set(parsed.result.id, parsed.result);
      }
    } catch {
      // Ignore older or partial progress lines.
    }
  }

  return completed;
}

function isEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
