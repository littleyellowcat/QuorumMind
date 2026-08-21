#!/usr/bin/env tsx

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkCurrentDistributionReadiness, checkDistributionReadiness, type DistributionDoctorInput } from "./distribution-doctor";
import { planQuorumMindGithubRun } from "../server/github/quorummind-runner";
import { createRunAuditBundle, diffRunAuditReplays } from "../server/harness/run-audit-replay";
import { defaultHarnessRootDir } from "../server/harness/run-event-store";
import { routeProviderSeatsForEnv, type ProviderRoutingRequirements } from "../server/providers/capability-router";
import { defaultDecisionQualityGoldenCases, evaluateDecisionQuality, createDecisionQualityTrendEntry } from "../server/quality/decision-quality-eval";
import { createTeamWorkspaceStore, evaluateTeamAccess, summarizePostgresPersistenceContract, type TeamAction } from "../server/team/team-workspace";
import type { DecisionContext } from "../src/lib/domain";

export type QuorumMindCliCommand =
  | "decide"
  | "blueprint"
  | "review-pr"
  | "export"
  | "init"
  | "runs"
  | "status"
  | "watch"
  | "audit"
  | "route-provider"
  | "eval"
  | "team"
  | "doctor"
  | "version";
export type QuorumMindExportFormat = "json" | "adr" | "pdf";
export type QuorumMindPromptInput =
  | { kind: "argv" }
  | { kind: "stdin" }
  | { kind: "file"; path: string };

export type ParsedQuorumMindCliArgs =
  | {
      ok: true;
      command: "decide" | "blueprint";
      prompt: string;
      input: QuorumMindPromptInput;
      sessionId?: string;
    }
  | {
      ok: true;
      command: "review-pr";
      prompt: string;
      prNumber: number;
    }
  | {
      ok: true;
      command: "export";
      format: QuorumMindExportFormat;
      from?: string;
    }
  | {
      ok: true;
      command: "init";
      print: boolean;
      githubAction: boolean;
    }
  | {
      ok: true;
      command: "runs";
      from?: string;
    }
  | {
      ok: true;
      command: "status" | "watch";
      from?: string;
    }
  | {
      ok: true;
      command: "audit";
      runId?: string;
      diff?: [string, string];
      from?: string;
    }
  | {
      ok: true;
      command: "route-provider";
      task: string;
      requirements: ProviderRoutingRequirements;
    }
  | {
      ok: true;
      command: "eval";
      suiteName: string;
    }
  | {
      ok: true;
      command: "team";
      workspaceId: string;
      userId: string;
      action: TeamAction;
    }
  | {
      ok: true;
      command: "doctor" | "version";
    }
  | {
      ok: false;
      error: string;
      usage: string;
    };

export type RunCliCommandOptions = {
  apiBaseUrl?: string;
  repoRoot?: string;
  fetch?: typeof fetch;
  readFile?: (path: string) => string;
  writeFile?: (path: string, contents: string) => void;
  listFiles?: (path: string) => string[];
  stdin?: string;
  packageJson?: DistributionDoctorInput["packageJson"];
  files?: Set<string>;
};

export type RunCliCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const usage = [
  "Usage:",
  '  quorummind decide "architecture question"',
  "  quorummind decide --stdin --session arch-1",
  '  quorummind blueprint "product or agent-system requirement"',
  "  quorummind blueprint --file request.md",
  '  quorummind review-pr --pr 42 "focus area"',
  "  quorummind export --json|--adr|--pdf --from latest-run.json",
  "  quorummind init --print",
  "  quorummind init --github-action",
  "  quorummind runs --from ~/.quorummind/runs",
  "  quorummind status --from run.json",
  "  quorummind audit --run <run-id> [--from ~/.quorummind]",
  "  quorummind audit --diff <base-run-id> <target-run-id> [--from ~/.quorummind]",
  "  quorummind route-provider --task architecture_review --json-schema --long-context",
  "  quorummind eval --suite offline-smoke",
  "  quorummind team --workspace architecture --user alice --action approve_adr",
  "  quorummind doctor",
  "  quorummind --version"
].join("\n");

const defaultContext: DecisionContext = {
  productStage: "mvp",
  expectedScale: "local CLI review",
  teamProfile: "Small engineering team",
  budgetSensitivity: "medium",
  reliabilityRequirement: "medium",
  securityRequirement: "medium",
  existingConstraints: ["CLI-generated run"],
  candidateOptions: ["Option A", "Option B"],
  assumptions: ["User can refine context in the Web UI for deeper reviews"]
};

export function parseCliArgs(argv: string[]): ParsedQuorumMindCliArgs {
  const [command, ...rest] = argv;

  if (command === "--version" || command === "version") {
    return { ok: true, command: "version" };
  }

  if (command === "doctor") {
    return { ok: true, command: "doctor" };
  }

  if (command === "decide" || command === "blueprint") {
    const parsed = parsePromptCommandArgs(rest);
    if (parsed.error) {
      return invalid(parsed.error);
    }
    if (parsed.input.kind === "argv" && !parsed.prompt) {
      return invalid(`Missing prompt for ${command}.`);
    }
    return { ok: true, command, prompt: parsed.prompt, input: parsed.input, ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}) };
  }

  if (command === "review-pr") {
    const parsed = parseReviewPrArgs(rest);
    if (parsed.invalidPrFlag) {
      return invalid("review-pr requires a valid PR number after --pr.");
    }
    if (!parsed.prNumber) {
      return invalid("review-pr requires --pr with a valid PR number.");
    }
    if (!parsed.prompt) {
      return invalid("review-pr requires a focus prompt after the PR number.");
    }
    return {
      ok: true,
      command,
      prompt: parsed.prompt,
      prNumber: parsed.prNumber
    };
  }

  if (command === "export") {
    const format = parseExportFormat(rest);
    const from = parseValueFlag(rest, "--from");
    return format ? { ok: true, command, format, ...(from ? { from } : {}) } : invalid("Choose one export format: --json, --adr, or --pdf.");
  }

  if (command === "init") {
    return { ok: true, command, print: rest.includes("--print"), githubAction: rest.includes("--github-action") };
  }

  if (command === "runs") {
    return { ok: true, command, ...(parseValueFlag(rest, "--from") ? { from: parseValueFlag(rest, "--from") } : {}) };
  }

  if (command === "status" || command === "watch") {
    return { ok: true, command, ...(parseValueFlag(rest, "--from") ? { from: parseValueFlag(rest, "--from") } : {}) };
  }

  if (command === "audit") {
    return parseAuditArgs(rest);
  }

  if (command === "route-provider") {
    return parseRouteProviderArgs(rest);
  }

  if (command === "eval") {
    return { ok: true, command, suiteName: parseValueFlag(rest, "--suite") ?? "offline-smoke" };
  }

  if (command === "team") {
    return parseTeamArgs(rest);
  }

  return invalid("Unknown QuorumMind command.");
}

export async function runCliCommand(
  argv: string[],
  options: RunCliCommandOptions = {}
): Promise<RunCliCommandResult> {
  const parsed = parseCliArgs(argv);

  if (!parsed.ok) {
    return {
      stdout: "",
      stderr: `${parsed.error}\n\n${parsed.usage}`,
      exitCode: 1
    };
  }

  if (parsed.command === "decide" || parsed.command === "blueprint") {
    const prompt = await resolvePromptInput(parsed, options);
    if (!prompt) {
      return {
        stdout: "",
        stderr: `Missing prompt for ${parsed.command}.`,
        exitCode: 1
      };
    }
    return postLocalApi(parsed.command, prompt, options, parsed.sessionId);
  }

  if (parsed.command === "review-pr") {
    const review = await planQuorumMindGithubRun({
      commentBody: `/qm review-pr --pr ${parsed.prNumber} ${parsed.prompt}`,
      repo: "local/quorummind",
      issueNumber: parsed.prNumber,
      repoRoot: options.repoRoot ?? process.cwd(),
      dryRun: true
    });

    return {
      stdout: review.status === "planned" ? review.reviewMarkdown : review.reason,
      stderr: "",
      exitCode: review.status === "planned" ? 0 : 1
    };
  }

  if (parsed.command === "export") {
    return exportLocalRun(parsed, options);
  }

  if (parsed.command === "init") {
    return initQuorumMindConfig(parsed, options);
  }

  if (parsed.command === "doctor") {
    return runDistributionDoctor(options);
  }

  if (parsed.command === "version") {
    return printCliVersion(options);
  }

  if (parsed.command === "runs") {
    return listLocalRuns(parsed, options);
  }

  if (parsed.command === "status" || parsed.command === "watch") {
    return readLocalRunStatus(parsed, options);
  }

  if (parsed.command === "audit") {
    return runAuditCommand(parsed, options);
  }

  if (parsed.command === "route-provider") {
    return runRouteProviderCommand(parsed);
  }

  if (parsed.command === "eval") {
    return runEvalCommand(parsed);
  }

  if (parsed.command === "team") {
    return runTeamCommand(parsed, options);
  }

  return {
    stdout: "",
    stderr: "Unsupported CLI command.",
    exitCode: 1
  };
}

export function renderCliDispatch(parsed: ParsedQuorumMindCliArgs): string {
  if (!parsed.ok) {
    return `${parsed.error}\n\n${parsed.usage}`;
  }

  return JSON.stringify(parsed, null, 2);
}

export function isDirectCliInvocation(moduleUrl: string, argvScriptPath: string | undefined): boolean {
  return Boolean(argvScriptPath && moduleUrl === pathToFileURL(argvScriptPath).href);
}

async function postLocalApi(
  command: "decide" | "blueprint",
  prompt: string,
  options: RunCliCommandOptions,
  sessionId?: string
): Promise<RunCliCommandResult> {
  const fetchImpl = options.fetch ?? fetch;
  const apiBaseUrl = (options.apiBaseUrl ?? process.env.QUORUMMIND_API_BASE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const response = await fetchImpl(`${apiBaseUrl}${command === "decide" ? "/api/decisions" : "/api/blueprints"}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      question: prompt,
      mode: "deep",
      locale: "en",
      context: defaultContext,
      ...(sessionId
        ? {
            cli: {
              sessionId
            }
          }
        : {}),
      ...(command === "blueprint"
        ? {
            blueprintRuntime: {
              executionMode: "deterministic"
            }
          }
        : {})
    })
  });
  const text = await response.text();

  return {
    stdout: text,
    stderr: response.ok ? "" : `Local API returned ${response.status}`,
    exitCode: response.ok ? 0 : 1
  };
}

async function resolvePromptInput(
  parsed: Extract<ParsedQuorumMindCliArgs, { ok: true; command: "decide" | "blueprint" }>,
  options: RunCliCommandOptions
): Promise<string> {
  if (parsed.input.kind === "stdin") {
    return (options.stdin ?? await readProcessStdin()).trim();
  }

  if (parsed.input.kind === "file") {
    const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
    return readFile(parsed.input.path).trim();
  }

  return parsed.prompt.trim();
}

function initQuorumMindConfig(
  parsed: Extract<ParsedQuorumMindCliArgs, { ok: true; command: "init" }>,
  options: RunCliCommandOptions
): RunCliCommandResult {
  if (parsed.githubAction) {
    return {
      stdout: `.github/workflows/quorummind-review.yml\n${renderGithubActionScaffold()}`,
      stderr: "",
      exitCode: 0
    };
  }

  const contents = renderStarterConfig();

  if (parsed.print) {
    return {
      stdout: `quorummind.config.json\n${contents}`,
      stderr: "",
      exitCode: 0
    };
  }

  const outputPath = join(options.repoRoot ?? process.cwd(), "quorummind.config.json");
  const writeFile = options.writeFile ?? ((path: string, value: string) => writeFileSync(path, value, "utf8"));
  writeFile(outputPath, contents);

  return {
    stdout: `Wrote ${outputPath}`,
    stderr: "",
    exitCode: 0
  };
}

function runDistributionDoctor(options: RunCliCommandOptions): RunCliCommandResult {
  const report =
    options.packageJson && options.files
      ? checkDistributionReadiness({ packageJson: options.packageJson, files: options.files })
      : checkCurrentDistributionReadiness(options.repoRoot ?? process.cwd());
  const lines = [
    `Distribution readiness: ${report.ready ? "ready" : "not ready"}`,
    ...report.checks.map((check) => `${check.id}: ${check.passed ? "pass" : "fail"}`)
  ];

  return {
    stdout: lines.join("\n"),
    stderr: "",
    exitCode: report.ready ? 0 : 1
  };
}

function printCliVersion(options: RunCliCommandOptions): RunCliCommandResult {
  const version = options.packageJson?.version ?? readPackageVersion(options.repoRoot ?? process.cwd());

  return {
    stdout: `quorummind ${version}`,
    stderr: "",
    exitCode: 0
  };
}

function listLocalRuns(
  parsed: Extract<ParsedQuorumMindCliArgs, { ok: true; command: "runs" }>,
  options: RunCliCommandOptions
): RunCliCommandResult {
  const runsDir = parsed.from ?? join(defaultHarnessRootDir(), "runs");
  const files = listRunFiles(runsDir, options);
  const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const lines = files.flatMap((file) => renderRunSummaryLine(file, readFile));

  return {
    stdout: lines.length ? lines.join("\n") : `No QuorumMind runs found in ${runsDir}.`,
    stderr: "",
    exitCode: 0
  };
}

function readLocalRunStatus(
  parsed: Extract<ParsedQuorumMindCliArgs, { ok: true; command: "status" | "watch" }>,
  options: RunCliCommandOptions
): RunCliCommandResult {
  if (!parsed.from) {
    return {
      stdout: "",
      stderr: `${parsed.command} requires --from <run.json>.`,
      exitCode: 1
    };
  }

  const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const record = parseRunFile(readFile(parsed.from));
  const status = [
    `runId: ${record.runId ?? "unknown"}`,
    `status: ${record.status ?? "unknown"}`,
    ...(record.summary ? [`summary: ${record.summary}`] : [])
  ];

  return {
    stdout: status.join("\n"),
    stderr: "",
    exitCode: 0
  };
}

function exportLocalRun(
  parsed: Extract<ParsedQuorumMindCliArgs, { ok: true; command: "export" }>,
  options: RunCliCommandOptions
): RunCliCommandResult {
  if (!parsed.from) {
    return {
      stdout: "",
      stderr: "export requires --from <latest-run.json> for the CLI MVP.",
      exitCode: 1
    };
  }

  const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const raw = readFile(parsed.from);

  if (parsed.format === "json") {
    return {
      stdout: raw,
      stderr: "",
      exitCode: 0
    };
  }

  const parsedRun = JSON.parse(raw) as {
    result?: {
      verdict?: {
        adrMarkdown?: string;
      };
    };
  };
  const adr = parsedRun.result?.verdict?.adrMarkdown;

  if (parsed.format === "adr" && adr) {
    return {
      stdout: adr,
      stderr: "",
      exitCode: 0
    };
  }

  return {
    stdout: "",
    stderr: parsed.format === "pdf"
      ? "PDF export uses the local API /api/exports/pdf; pass HTML from a saved Web UI run."
      : "ADR markdown was not found in the supplied run file.",
    exitCode: 1
  };
}

function runAuditCommand(
  parsed: Extract<ParsedQuorumMindCliArgs, { ok: true; command: "audit" }>,
  options: RunCliCommandOptions
): RunCliCommandResult {
  const rootDir = parsed.from ?? options.repoRoot ?? defaultHarnessRootDir();

  if (parsed.diff) {
    const diff = diffRunAuditReplays({
      rootDir,
      baseRunId: parsed.diff[0],
      targetRunId: parsed.diff[1]
    });
    return {
      stdout: JSON.stringify(diff, null, 2),
      stderr: "",
      exitCode: 0
    };
  }

  if (!parsed.runId) {
    return {
      stdout: "",
      stderr: "audit requires --run <run-id> or --diff <base> <target>.",
      exitCode: 1
    };
  }

  return {
    stdout: createRunAuditBundle({ rootDir, runId: parsed.runId }).markdown,
    stderr: "",
    exitCode: 0
  };
}

function runRouteProviderCommand(
  parsed: Extract<ParsedQuorumMindCliArgs, { ok: true; command: "route-provider" }>
): RunCliCommandResult {
  const route = routeProviderSeatsForEnv({
    env: process.env,
    task: parsed.task,
    requirements: parsed.requirements
  });
  const lines = [
    `Provider route for ${route.task}`,
    route.explanation,
    "Selected:",
    ...(route.selectedSeats.length
      ? route.selectedSeats.map((seat) => `- ${seat.providerId}/${seat.model}: ${seat.rationale.join(" ")}`)
      : ["- None selected. Configure provider env vars or enable local providers."]),
    "Excluded:",
    ...(route.excludedSeats.length
      ? route.excludedSeats.slice(0, 12).map((seat) => `- ${seat.providerId}: ${seat.reason}`)
      : ["- None."])
  ];

  return {
    stdout: lines.join("\n"),
    stderr: "",
    exitCode: 0
  };
}

function runEvalCommand(
  parsed: Extract<ParsedQuorumMindCliArgs, { ok: true; command: "eval" }>
): RunCliCommandResult {
  const outputs = Object.fromEntries(
    defaultDecisionQualityGoldenCases.map((testCase) => [
      testCase.id,
      {
        providerId: "local-rubric",
        model: "deterministic",
        text: `${testCase.prompt}. Include ${testCase.expectedSignals.join(", ")}, evidence, risk, ADR, consensus, action, validation, and acceptance checks.`
      }
    ])
  );
  const report = evaluateDecisionQuality({
    suiteName: parsed.suiteName,
    outputs
  });
  const trend = createDecisionQualityTrendEntry(report);

  return {
    stdout: [
      `Decision quality eval: ${report.summary.suiteName}`,
      `Cases: ${report.summary.passedCases}/${report.summary.totalCases} passed`,
      `Average score: ${report.summary.averageScore}`,
      `Provider reputation: ${trend.providerReputation.map((item) => `${item.providerId}:${item.qualityBand}`).join(", ") || "none"}`
    ].join("\n"),
    stderr: "",
    exitCode: report.summary.failedCases === 0 && report.summary.missingOutputCases === 0 ? 0 : 1
  };
}

function runTeamCommand(
  parsed: Extract<ParsedQuorumMindCliArgs, { ok: true; command: "team" }>,
  options: RunCliCommandOptions
): RunCliCommandResult {
  const rootDir = options.repoRoot ?? defaultHarnessRootDir();
  const store = createTeamWorkspaceStore({ rootDir });
  const workspace = store.findWorkspace(parsed.workspaceId) ?? store.saveWorkspace({
    id: parsed.workspaceId,
    name: parsed.workspaceId,
    persistenceMode: process.env.QUORUMMIND_POSTGRES_URL ? "postgres" : "browser_local",
    members: [{ userId: parsed.userId, role: "owner" }]
  });
  const access = evaluateTeamAccess(workspace, parsed.userId, parsed.action);
  const contract = workspace.persistenceMode === "postgres"
    ? summarizePostgresPersistenceContract({
        connectionStringPresent: Boolean(process.env.QUORUMMIND_POSTGRES_URL),
        schema: process.env.QUORUMMIND_POSTGRES_SCHEMA ?? "quorummind",
        sslMode: process.env.QUORUMMIND_POSTGRES_SSL === "require" ? "require" : "prefer"
      })
    : { mode: workspace.persistenceMode, configured: true };

  return {
    stdout: [
      `workspace: ${workspace.id}`,
      `user: ${parsed.userId}`,
      `action: ${parsed.action}`,
      `allowed: ${access.allowed}`,
      `reason: ${access.reason}`,
      `persistence: ${contract.mode}`
    ].join("\n"),
    stderr: "",
    exitCode: access.allowed ? 0 : 1
  };
}

function parseReviewPrArgs(args: string[]): { prompt: string; prNumber?: number; invalidPrFlag: boolean } {
  const promptTokens: string[] = [];
  let prNumber: number | undefined;
  let invalidPrFlag = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if ((token === "--pr" || token === "--pull-request") && args[index + 1]) {
      const candidate = Number.parseInt(args[index + 1], 10);
      if (Number.isFinite(candidate) && candidate > 0) {
        prNumber = candidate;
      } else {
        invalidPrFlag = true;
      }
      index += 1;
      continue;
    }

    promptTokens.push(token);
  }

  return {
    prompt: promptTokens.join(" ").trim(),
    prNumber,
    invalidPrFlag
  };
}

function parseAuditArgs(args: string[]): ParsedQuorumMindCliArgs {
  const runId = parseValueFlag(args, "--run");
  const diffIndex = args.indexOf("--diff");
  const from = parseValueFlag(args, "--from");

  if (diffIndex >= 0) {
    const base = args[diffIndex + 1];
    const target = args[diffIndex + 2];
    if (!base || !target) {
      return invalid("audit --diff requires two run ids.");
    }
    return { ok: true, command: "audit", diff: [base, target], ...(from ? { from } : {}) };
  }

  if (!runId) {
    return invalid("audit requires --run <run-id> or --diff <base> <target>.");
  }

  return { ok: true, command: "audit", runId, ...(from ? { from } : {}) };
}

function parseRouteProviderArgs(args: string[]): ParsedQuorumMindCliArgs {
  const maxSeats = parseValueFlag(args, "--max-seats");
  const parsedMaxSeats = maxSeats ? Number.parseInt(maxSeats, 10) : undefined;

  return {
    ok: true,
    command: "route-provider",
    task: parseValueFlag(args, "--task") ?? "architecture_review",
    requirements: {
      jsonSchema: args.includes("--json-schema"),
      toolCalls: args.includes("--tool-calls"),
      longContext: args.includes("--long-context"),
      lowCost: args.includes("--low-cost"),
      localOnly: args.includes("--local-only"),
      ...(Number.isFinite(parsedMaxSeats) && parsedMaxSeats ? { maxSeats: parsedMaxSeats } : {})
    }
  };
}

function parseTeamArgs(args: string[]): ParsedQuorumMindCliArgs {
  const workspaceId = parseValueFlag(args, "--workspace");
  const userId = parseValueFlag(args, "--user");
  const action = parseValueFlag(args, "--action");

  if (!workspaceId || !userId || !isTeamAction(action)) {
    return invalid("team requires --workspace <id> --user <id> --action view|comment|create_adr|approve_adr|admin.");
  }

  return {
    ok: true,
    command: "team",
    workspaceId,
    userId,
    action
  };
}

function parsePromptCommandArgs(args: string[]): {
  prompt: string;
  input: QuorumMindPromptInput;
  sessionId?: string;
  error?: string;
} {
  const promptTokens: string[] = [];
  let input: QuorumMindPromptInput = { kind: "argv" };
  let sessionId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "--stdin") {
      if (input.kind !== "argv") {
        return { prompt: "", input, error: "Choose only one prompt input source: argv, --stdin, or --file." };
      }
      input = { kind: "stdin" };
      continue;
    }

    if (token === "--file") {
      const path = args[index + 1];
      if (!path) {
        return { prompt: "", input, error: "--file requires a path." };
      }
      if (input.kind !== "argv") {
        return { prompt: "", input, error: "Choose only one prompt input source: argv, --stdin, or --file." };
      }
      input = { kind: "file", path };
      index += 1;
      continue;
    }

    if (token === "--session") {
      const value = args[index + 1];
      if (!value) {
        return { prompt: "", input, error: "--session requires a session id." };
      }
      sessionId = value;
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      return { prompt: "", input, error: `Unknown option for prompt command: ${token}.` };
    }

    promptTokens.push(token);
  }

  return {
    prompt: promptTokens.join(" ").trim(),
    input,
    ...(sessionId ? { sessionId } : {})
  };
}

function parseExportFormat(args: string[]): QuorumMindExportFormat | undefined {
  if (args.includes("--json")) {
    return "json";
  }
  if (args.includes("--adr")) {
    return "adr";
  }
  if (args.includes("--pdf")) {
    return "pdf";
  }
  return undefined;
}

function parseValueFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function isTeamAction(value: string | undefined): value is TeamAction {
  return value === "view" || value === "comment" || value === "create_adr" || value === "approve_adr" || value === "admin";
}

async function readProcessStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function renderStarterConfig(): string {
  return `${JSON.stringify({
    providers: {
      default: "openrouter",
      openrouter: {
        enabled: true,
        envKey: "OPENROUTER_API_KEY",
        model: "anthropic/claude-3.5-sonnet"
      },
      ollama: {
        enabled: false,
        baseUrl: "http://127.0.0.1:11434",
        model: "llama3.1"
      }
    },
    mcpServers: {
      filesystem: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
        allowedTools: ["read_file", "list_directory"]
      }
    },
    customTools: [
      {
        name: "repo.read_file",
        description: "Read a file selected for architecture review",
        command: "node",
        args: ["scripts/read-file.js"],
        permission: "read_only"
      }
    ],
    agents: {
      blueprint: {
        tools: ["repo.read_file"]
      }
    }
  }, null, 2)}\n`;
}

function renderGithubActionScaffold(): string {
  return `name: QuorumMind Architecture Review

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write
  issues: write
  checks: write

jobs:
  quorummind-review:
    if: contains(github.event.comment.body, '/qm') || contains(github.event.comment.body, '/quorummind')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./github
        with:
          output_mode: all
          write_comment: "false"
          write_github: "false"
`;
}

function readPackageVersion(rootDir: string): string {
  try {
    const parsed = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function listRunFiles(path: string, options: RunCliCommandOptions): string[] {
  if (options.listFiles) {
    return options.listFiles(path);
  }

  if (!existsSync(path)) {
    return [];
  }

  return readdirSync(path)
    .map((entry) => join(path, entry))
    .filter((entryPath) => {
      try {
        return statSync(entryPath).isFile() && entryPath.endsWith(".json");
      } catch {
        return false;
      }
    });
}

function renderRunSummaryLine(file: string, readFile: (path: string) => string): string[] {
  try {
    const parsed = parseRunFile(readFile(file));
    return [`${parsed.runId ?? file}\t${parsed.status ?? "unknown"}${parsed.summary ? `\t${parsed.summary}` : ""}`];
  } catch {
    return [];
  }
}

function parseRunFile(raw: string): { runId?: string; status?: string; summary?: string } {
  const parsed = JSON.parse(raw) as {
    runId?: string;
    id?: string;
    status?: string;
    summary?: string;
    result?: {
      summary?: string;
    };
  };
  return {
    runId: parsed.runId ?? parsed.id,
    status: parsed.status,
    summary: parsed.summary ?? parsed.result?.summary
  };
}

function invalid(error: string): ParsedQuorumMindCliArgs {
  return {
    ok: false,
    error,
    usage
  };
}

if (isDirectCliInvocation(import.meta.url, process.argv[1])) {
  void runCliCommand(process.argv.slice(2)).then((result) => {
    if (result.stdout) {
      console.log(result.stdout);
    }
    if (result.stderr) {
      console.error(result.stderr);
    }
    process.exitCode = result.exitCode;
  });
}
