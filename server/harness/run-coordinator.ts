import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultHarnessRootDir, safeSegment } from "./run-event-store";

export type RunCoordinatorTerminalStatus = "completed" | "paused" | "interrupted";

export type RunCoordinatorTerminalState = {
  runId: string;
  status: RunCoordinatorTerminalStatus;
  reason?: string;
  updatedAt: string;
};

export type RunCoordinatorStartResult =
  | {
      accepted: true;
      runId: string;
    }
  | {
      accepted: false;
      runId: string;
      reason: "already_running";
    };

export type RunWakeSource = "human_review" | "api_request" | "resume" | "system";

export type RunWakeInput = {
  source: RunWakeSource;
  note?: string;
};

export type RunWakeState = {
  runId: string;
  pendingWake: true;
  wakeCount: number;
  sources: RunWakeSource[];
  notes: string[];
  updatedAt: string;
};

export type RunWakeResult = {
  accepted: true;
  runId: string;
  pendingWake: true;
  wakeCount: number;
};

export type RunCoordinatorOptions = {
  rootDir?: string;
};

export type RunCoordinator = {
  start(runId: string): RunCoordinatorStartResult;
  wake(runId: string, input: RunWakeInput): RunWakeResult;
  pendingWake(runId: string): RunWakeState | undefined;
  consumeWake(runId: string): RunWakeState | undefined;
  complete(runId: string, reason?: string): RunCoordinatorTerminalState;
  pause(runId: string, reason?: string): RunCoordinatorTerminalState;
  interrupt(runId: string, reason?: string): RunCoordinatorTerminalState;
  wait(runId: string): Promise<RunCoordinatorTerminalState>;
  activeRuns(): string[];
};

type Waiter = (state: RunCoordinatorTerminalState) => void;

const waiters = new Map<string, Waiter[]>();

export function createRunCoordinator(options: RunCoordinatorOptions = {}): RunCoordinator {
  const rootDir = options.rootDir ?? defaultHarnessRootDir();

  function activePath(runId: string): string {
    return join(rootDir, "runs", safeSegment(runId), "active.json");
  }

  function terminalPath(runId: string): string {
    return join(rootDir, "runs", safeSegment(runId), "terminal.json");
  }

  function wakePath(runId: string): string {
    return join(rootDir, "runs", safeSegment(runId), "wake.json");
  }

  function start(runId: string): RunCoordinatorStartResult {
    const path = activePath(runId);
    if (existsSync(path)) {
      return { accepted: false, runId, reason: "already_running" };
    }

    mkdirSync(join(rootDir, "runs", safeSegment(runId)), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ runId, startedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
    return { accepted: true, runId };
  }

  function pendingWake(runId: string): RunWakeState | undefined {
    const path = wakePath(runId);
    if (!existsSync(path)) {
      return undefined;
    }

    return JSON.parse(readFileSync(path, "utf8")) as RunWakeState;
  }

  function wake(runId: string, input: RunWakeInput): RunWakeResult {
    const current = pendingWake(runId);
    const next: RunWakeState = {
      runId,
      pendingWake: true,
      wakeCount: (current?.wakeCount ?? 0) + 1,
      sources: [...(current?.sources ?? []), input.source],
      notes: input.note ? [...(current?.notes ?? []), input.note] : current?.notes ?? [],
      updatedAt: new Date().toISOString()
    };

    mkdirSync(join(rootDir, "runs", safeSegment(runId)), { recursive: true });
    writeFileSync(wakePath(runId), `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return {
      accepted: true,
      runId,
      pendingWake: true,
      wakeCount: next.wakeCount
    };
  }

  function consumeWake(runId: string): RunWakeState | undefined {
    const current = pendingWake(runId);
    rmSync(wakePath(runId), { force: true });
    return current;
  }

  function finish(runId: string, status: RunCoordinatorTerminalStatus, reason?: string): RunCoordinatorTerminalState {
    const state = {
      runId,
      status,
      ...(reason ? { reason } : {}),
      updatedAt: new Date().toISOString()
    };

    mkdirSync(join(rootDir, "runs", safeSegment(runId)), { recursive: true });
    rmSync(activePath(runId), { force: true });
    writeFileSync(terminalPath(runId), `${JSON.stringify(state, null, 2)}\n`, "utf8");
    resolveWaiters(runId, state);
    return state;
  }

  function wait(runId: string): Promise<RunCoordinatorTerminalState> {
    const path = terminalPath(runId);
    if (existsSync(path)) {
      return Promise.resolve(JSON.parse(readFileSync(path, "utf8")) as RunCoordinatorTerminalState);
    }

    return new Promise((resolve) => {
      waiters.set(runId, [...(waiters.get(runId) ?? []), resolve]);
    });
  }

  function activeRuns(): string[] {
    const runsDir = join(rootDir, "runs");
    if (!existsSync(runsDir)) {
      return [];
    }

    return readdirSync(runsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(activePath(entry.name)))
      .map((entry) => entry.name)
      .sort();
  }

  return {
    start,
    wake,
    pendingWake,
    consumeWake,
    complete: (runId, reason) => finish(runId, "completed", reason),
    pause: (runId, reason) => finish(runId, "paused", reason),
    interrupt: (runId, reason) => finish(runId, "interrupted", reason),
    wait,
    activeRuns
  };
}

function resolveWaiters(runId: string, state: RunCoordinatorTerminalState): void {
  const listeners = waiters.get(runId) ?? [];
  waiters.delete(runId);

  for (const resolve of listeners) {
    resolve(state);
  }
}
