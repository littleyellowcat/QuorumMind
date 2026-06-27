import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

type AgentEvalCase = {
  id: string;
  kind: "decision" | "blueprint" | string;
  locale: "zh" | "en" | string;
  mode: string;
  status: "passed" | "warning" | "failed" | string;
  score: {
    responseQuality: number;
    trajectory: number;
    toolAndSchema: number;
    collaboration: number;
    engineering: number;
    explainability: number;
    reasoning: number;
    toolUse: number;
    interaction: number;
    total: number;
  };
  providerCalls: number;
  fallbackUsed: boolean;
  consensusScore?: number;
  schemaValidRate?: string;
  keywordHits?: string[];
  missingKeywords?: string[];
  notes?: string[];
};

type AgentEvalDetail = {
  startedAt: string;
  suite: string;
  cases: AgentEvalCase[];
};

type JudgeFinding = {
  id: string;
  kind: string;
  locale: string;
  verdict: "pass" | "warn" | "fail";
  rubric: {
    relevance: number;
    process: number;
    engineering: number;
    transparency: number;
    costControl: number;
    total: number;
  };
  comments: string[];
};

const now = new Date();
const date = formatDate(now);
const sourcePath = process.env.QUORUMMIND_AGENT_JUDGE_SOURCE || latestAgentEvalDetailPath();
const detail = readAgentEvalDetail(sourcePath);
const judgeMode = process.env.QUORUMMIND_AGENT_JUDGE_MODE === "live" ? "live_requested_not_enabled" : "local_rubric_mock";
const sampleSize = Number(process.env.QUORUMMIND_AGENT_JUDGE_SAMPLE_SIZE || 8);
const sample = selectJudgeSample(detail.cases, sampleSize);
const findings = sample.map(judgeCase);
const summary = summarize(findings);
const outputDir = join("output", "agent-eval");
const docsDir = join("docs", "quality");
const jsonPath = join(outputDir, `${date}-agent-judge-audit.json`);
const reportPath = join(docsDir, `${date}-agent-judge-audit.md`);

mkdirSync(outputDir, { recursive: true });
mkdirSync(docsDir, { recursive: true });
writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      startedAt: now.toISOString(),
      judgeMode,
      sourcePath,
      sourceSuite: detail.suite,
      sourceStartedAt: detail.startedAt,
      sampleSize: sample.length,
      summary,
      findings
    },
    null,
    2
  ),
  "utf8"
);
writeFileSync(reportPath, renderReport({ judgeMode, sourcePath, detail, summary, findings, jsonPath }), "utf8");

console.log(`Agent judge audit complete: ${reportPath}`);
console.log(JSON.stringify({ judgeMode, sourcePath, sampleSize: sample.length, ...summary }, null, 2));

if (summary.fail > 0) {
  process.exitCode = 1;
}

function latestAgentEvalDetailPath(): string {
  const dir = join("output", "agent-eval");

  if (!existsSync(dir)) {
    throw new Error("No output/agent-eval directory found. Run npm run agent:eval:full first.");
  }

  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".json") && file.includes("agent-performance-audit"))
    .map((file) => join(dir, file))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  if (!files[0]) {
    throw new Error("No agent performance detail JSON found. Run npm run agent:eval:full first.");
  }

  return files[0];
}

function readAgentEvalDetail(path: string): AgentEvalDetail {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as AgentEvalDetail;

  if (!Array.isArray(parsed.cases)) {
    throw new Error(`${path} is not an AgentEval detail file.`);
  }

  return parsed;
}

function selectJudgeSample(cases: AgentEvalCase[], size: number): AgentEvalCase[] {
  const byRisk = [...cases].sort((left, right) => {
    const leftRisk = riskScore(left);
    const rightRisk = riskScore(right);
    return rightRisk - leftRisk;
  });
  const selected: AgentEvalCase[] = [];

  for (const preferredKind of ["decision", "blueprint"]) {
    const candidate = byRisk.find((item) => item.kind === preferredKind && !selected.some((picked) => picked.id === item.id));
    if (candidate) {
      selected.push(candidate);
    }
  }

  for (const item of byRisk) {
    if (selected.length >= size) {
      break;
    }

    if (!selected.some((picked) => picked.id === item.id)) {
      selected.push(item);
    }
  }

  return selected.slice(0, size);
}

function riskScore(item: AgentEvalCase): number {
  const missingKeywordPenalty = item.missingKeywords?.length ? item.missingKeywords.length * 4 : 0;
  const notePenalty = item.notes?.length ? item.notes.length * 3 : 0;
  const statusPenalty = item.status === "failed" ? 35 : item.status === "warning" ? 18 : 0;
  const fallbackPenalty = item.fallbackUsed ? 12 : 0;
  const lowConsensusPenalty = item.consensusScore && item.consensusScore < 80 ? 8 : 0;

  return 100 - item.score.total + missingKeywordPenalty + notePenalty + statusPenalty + fallbackPenalty + lowConsensusPenalty;
}

function judgeCase(item: AgentEvalCase): JudgeFinding {
  const relevance = clamp(Math.round(item.score.responseQuality - (item.missingKeywords?.length ?? 0) * 3));
  const process = average([item.score.trajectory, item.score.toolAndSchema, item.score.collaboration]);
  const engineering = average([item.score.engineering, item.score.reasoning, item.score.interaction]);
  const transparency = clamp(Math.round(average([item.score.explainability, item.score.toolAndSchema]) - (item.fallbackUsed ? 10 : 0)));
  const costControl = clamp(Math.round(96 - Math.max(0, item.providerCalls - 8) * 2 - (item.fallbackUsed ? 4 : 0)));
  const total = average([relevance, process, engineering, transparency, costControl]);
  const comments = buildComments(item, { relevance, process, engineering, transparency, costControl, total });
  const verdict = item.status === "failed" || total < 85 ? "fail" : item.status === "warning" || total < 92 ? "warn" : "pass";

  return {
    id: item.id,
    kind: item.kind,
    locale: item.locale,
    verdict,
    rubric: { relevance, process, engineering, transparency, costControl, total },
    comments
  };
}

function buildComments(item: AgentEvalCase, rubric: JudgeFinding["rubric"]): string[] {
  const comments = [
    `响应质量 ${item.score.responseQuality}，综合分 ${item.score.total}，Judge 总分 ${rubric.total}。`,
    `轨迹/工具/协作过程分 ${rubric.process}，Schema 有效率 ${item.schemaValidRate ?? "n/a"}。`
  ];

  if (item.missingKeywords?.length) {
    comments.push(`缺失关键词：${item.missingKeywords.join("、")}。`);
  }

  if (item.fallbackUsed) {
    comments.push("该样本使用过 fallback，真实模型质量结论需要单独复核。");
  }

  if (item.consensusScore && item.consensusScore < 80) {
    comments.push(`共识分 ${item.consensusScore} 低于 80，建议纳入复审样本。`);
  }

  if (item.notes?.length) {
    comments.push(`原始评估备注：${item.notes.join("；")}。`);
  }

  return comments;
}

function summarize(findings: JudgeFinding[]) {
  const pass = findings.filter((item) => item.verdict === "pass").length;
  const warn = findings.filter((item) => item.verdict === "warn").length;
  const fail = findings.filter((item) => item.verdict === "fail").length;
  const averageScore = average(findings.map((item) => item.rubric.total));

  return { total: findings.length, pass, warn, fail, averageScore };
}

function renderReport(input: {
  judgeMode: string;
  sourcePath: string;
  detail: AgentEvalDetail;
  summary: ReturnType<typeof summarize>;
  findings: JudgeFinding[];
  jsonPath: string;
}): string {
  const rows = input.findings
    .map(
      (item) =>
        `| ${item.id} | ${item.kind} | ${item.verdict} | ${item.rubric.total} | ${item.rubric.relevance} | ${item.rubric.process} | ${item.rubric.engineering} | ${item.rubric.transparency} | ${item.rubric.costControl} | ${item.comments.join("<br>")} |`
    )
    .join("\n");

  return `# QuorumMind AgentEval LLM-as-a-Judge 抽检

日期：${date}

## 说明

- Judge 模式：\`${input.judgeMode}\`。
- 本次默认不调用真实模型，使用 LLM-as-a-Judge Rubric 的本地 mock 版本做 8 条抽检，避免额外 API 成本。
- 如果后续接入真实 Judge，需要沿用同一套维度，并记录 provider、timeout、schema、fallback 和调用成本。
- 来源明细：\`${input.sourcePath}\`（${basename(input.sourcePath)}）。
- 输出 JSON：\`${input.jsonPath}\`。

## 汇总

| 指标 | 结果 |
| --- | ---: |
| 抽检样本 | ${input.summary.total} |
| 通过 | ${input.summary.pass} |
| 警告 | ${input.summary.warn} |
| 失败 | ${input.summary.fail} |
| 平均 Judge 分 | ${input.summary.averageScore} |

## Rubric

| 维度 | 含义 |
| --- | --- |
| Relevance | 是否回答用户问题、关键词覆盖和意图相关性 |
| Process | Agent 轨迹、工具/Schema、协作过程是否合理 |
| Engineering | 延迟、可执行性、推理完整性和交互质量 |
| Transparency | 是否解释来源、fallback、schema 和过程证据 |
| Cost Control | provider 调用次数、fallback 和预算风险 |

## 抽检明细

| 样本 | 类型 | 结论 | 总分 | 相关性 | 过程 | 工程 | 透明度 | 成本 | 评语 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${rows}
`;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
