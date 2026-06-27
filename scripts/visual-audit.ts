import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import { chromium, type Browser, type Page } from "playwright";
import { createAdrMarkdownExport, createBlueprintBacklogExport, createBlueprintReportExport, createPdfReportExport } from "../src/lib/exporters";
import { createManualProviderBundle } from "../src/lib/manual-provider";
import { contextForQuestion } from "../src/lib/question-context";
import { runBlueprintRoom } from "../src/lib/blueprint";
import { runDecisionRoom } from "../src/lib/workflow";

type VisualCheck = {
  name: string;
  status: "passed" | "failed";
  details: string;
};

const artifactDir = join("output", "playwright", "visual-audit");
const longChineseQuestion =
  "我们是否应该把当前单体 Node.js 后端拆成微服务？团队 5 人，未来 6 个月主要目标是快速交付企业客户功能。当前后端是一个 Node.js 单体应用，数据库是 PostgreSQL，已经出现一些模块耦合，但流量规模不大。请从交付速度、团队能力、可靠性、安全、成本、未来扩展性、迁移风险几个角度评审。";
const blueprintChineseQuestion =
  "我想做一个基于小说文本的视觉类互动游戏生成系统，希望用多 Agent 协作完成从小说到游戏制作素材的拆解和规划。输入是一部长篇或中篇小说文本，系统需要自动拆解章节、场景、人物、对白、旁白、剧情分支、关键道具、背景图需求、角色立绘需求、音乐/音效需求，并最终生成一份可交给开发和美术使用的制作蓝图。请设计 Agent 分工、文本分块、人物卡字段、场景和资产 Schema、互评修订流程、人工复审、4 周 MVP、风险、验收标准和实施 backlog。";
const visibleEnglishBlocklist = [
  "Checkpoint thread",
  "Round budget",
  "recursion",
  "Termination",
  "Owner:",
  "required",
  "optional",
  " fields",
  "Execution",
  "requested",
  "calls",
  "usable",
  "deterministic mode",
  "provider mode is demo",
  "no configured providers",
  "no usable live trace",
  "live trace error",
  "live vs deterministic",
  "Wildcard CORS",
  "Harden first"
];
const exportEnglishBlocklist = [
  "Final recommendation",
  "Decision metrics",
  "Deterministic fallback",
  "Delphi consensus protocol",
  "Risk radar",
  "Assumption ledger",
  "Regret map",
  "Architecture Decision Record",
  "Owner:",
  "required",
  "optional",
  "High priority",
  "Medium priority",
  "Low priority",
  "Deliverables",
  "Acceptance",
  "Dependencies",
  "Risk if skipped",
  "Source request",
  "This backlog"
];

const checks: VisualCheck[] = [];
const children: ChildProcess[] = [];
let shuttingDown = false;
const auditDate = new Date().toISOString().slice(0, 10);

mkdirSync(artifactDir, { recursive: true });

const apiPort = await freePort();
const webPort = await freePort();
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;

try {
  startServices(apiPort, webPort);
  await waitForHttp(`${apiUrl}/api/health`, "API health");
  await waitForHttp(webUrl, "Vite web");

  const browser = await chromium.launch({ headless: true });

  try {
    await auditDesktop(browser, webUrl);
    await auditNarrowDesktop(browser, webUrl);
    await auditMobile(browser, webUrl);
  } finally {
    await browser.close();
  }

  auditChineseExports();
} finally {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

const failed = checks.filter((check) => check.status === "failed");
const report = renderReport(checks, { apiPort, webPort });
const reportPath = join("docs", "quality", `${auditDate}-visual-audit.md`);
mkdirSync(join("docs", "quality"), { recursive: true });
writeFileSync(reportPath, report, "utf8");

console.log(`Visual audit complete: ${reportPath}`);
console.log(JSON.stringify({ checks: checks.length, failed: failed.length, artifactDir }, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}

async function auditDesktop(browser: Browser, url: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(45_000);

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "中文" }).click();
    await enterWorkbench(page);
    await checkSetupGuidance(page, "desktop setup");
    await checkChineseVisibleText(page, "desktop setup");
    await page.getByLabel("架构问题").fill(longChineseQuestion);
    await page.screenshot({ path: join(artifactDir, "desktop-input.png"), fullPage: true });
    await checkNoHorizontalOverflow(page, "desktop input");
    await checkButtonTextFit(page, "desktop input");
    await checkPanelIntegrity(page, "desktop input");

    await page.getByRole("button", { name: "运行决策室" }).click();
    await page.getByText("架构决策记录").waitFor();
    await page.screenshot({ path: join(artifactDir, "desktop-result.png"), fullPage: true });
    await checkNoHorizontalOverflow(page, "desktop result");
    await checkButtonTextFit(page, "desktop result");
    await checkPanelIntegrity(page, "desktop result");
    await checkIndependentScrollAreas(page, "desktop result");
    await checkChineseVisibleText(page, "desktop result");
    await checkExportButtons(page, "desktop result");

    await page.getByRole("button", { name: /解释这个指标/ }).first().hover();
    await page.getByRole("tooltip").first().waitFor();
    await page.screenshot({ path: join(artifactDir, "desktop-tooltip.png"), fullPage: true });
    await checkTooltipFitsViewport(page, "desktop tooltip");
    pass("desktop tooltip", "Tooltip is visible after hovering a metric help button.");

    await runBlueprintFlow(page, "desktop", true);
  } finally {
    await page.close();
  }
}

async function auditNarrowDesktop(browser: Browser, url: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  page.setDefaultTimeout(45_000);

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "中文" }).click();
    await enterWorkbench(page);
    await page.getByLabel("架构问题").fill(longChineseQuestion);
    await page.screenshot({ path: join(artifactDir, "narrow-input.png"), fullPage: true });
    await checkNoHorizontalOverflow(page, "narrow input");
    await checkButtonTextFit(page, "narrow input");
    await checkPanelIntegrity(page, "narrow input");
    await checkResponsiveScrollMode(page, "narrow input");

    await page.getByRole("button", { name: "运行决策室" }).click();
    await page.getByText("架构决策记录").waitFor();
    await page.screenshot({ path: join(artifactDir, "narrow-result.png"), fullPage: true });
    await checkNoHorizontalOverflow(page, "narrow result");
    await checkButtonTextFit(page, "narrow result");
    await checkPanelIntegrity(page, "narrow result");
    await checkResponsiveScrollMode(page, "narrow result");
    await checkChineseVisibleText(page, "narrow result");

    await runBlueprintFlow(page, "narrow", true);
  } finally {
    await page.close();
  }
}

async function auditMobile(browser: Browser, url: string): Promise<void> {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  page.setDefaultTimeout(45_000);

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "中文" }).click();
    await enterWorkbench(page);
    await page.getByLabel("架构问题").fill(longChineseQuestion);
    await page.screenshot({ path: join(artifactDir, "mobile-input.png"), fullPage: true });
    await checkNoHorizontalOverflow(page, "mobile input");
    await checkButtonTextFit(page, "mobile input");
    await checkPanelIntegrity(page, "mobile input");
    await checkResponsiveScrollMode(page, "mobile input");

    await page.getByRole("button", { name: "运行决策室" }).click();
    await page.getByText("架构决策记录").waitFor();
    await page.screenshot({ path: join(artifactDir, "mobile-result.png"), fullPage: true });
    await checkNoHorizontalOverflow(page, "mobile result");
    await checkButtonTextFit(page, "mobile result");
    await checkPanelIntegrity(page, "mobile result");
    await checkResponsiveScrollMode(page, "mobile result");
    await checkChineseVisibleText(page, "mobile result");
    await checkExportButtons(page, "mobile result");

    await runBlueprintFlow(page, "mobile", true);
  } finally {
    await page.close();
  }
}

async function enterWorkbench(page: Page): Promise<void> {
  const enterButton = page.getByRole("button", { name: "进入工作台" });

  if ((await enterButton.count()) > 0) {
    await enterButton.first().click();
  }

  await page.getByLabel("架构问题").waitFor();
}

async function runBlueprintFlow(page: Page, prefix: "desktop" | "narrow" | "mobile", includeAgentPlatform = false): Promise<void> {
  await page.getByRole("button", { name: "方案蓝图", exact: true }).click();
  await page.getByLabel("蓝图需求").fill(blueprintChineseQuestion);
  await page.screenshot({ path: join(artifactDir, `${prefix}-blueprint-input.png`), fullPage: true });
  await checkNoHorizontalOverflow(page, `${prefix} blueprint input`);
  await checkButtonTextFit(page, `${prefix} blueprint input`);
  await checkPanelIntegrity(page, `${prefix} blueprint input`);

  await page.getByRole("button", { name: "运行蓝图室" }).click();
  await page.getByRole("heading", { name: "多 Agent 视觉小说生产系统蓝图" }).waitFor();
  await page.screenshot({ path: join(artifactDir, `${prefix}-blueprint-result.png`), fullPage: true });
  await checkNoHorizontalOverflow(page, `${prefix} blueprint result`);
  await checkButtonTextFit(page, `${prefix} blueprint result`);
  await checkPanelIntegrity(page, `${prefix} blueprint result`);
  await checkChineseVisibleText(page, `${prefix} blueprint result`);
  await checkBlueprintExportButtons(page, `${prefix} blueprint result`);

  if (includeAgentPlatform) {
    await runAgentPlatformFlow(page, prefix);
  }
}

async function runAgentPlatformFlow(page: Page, prefix: "desktop" | "narrow" | "mobile"): Promise<void> {
  const runButton = page.getByRole("button", { name: "运行 Agent 平台" });
  if ((await runButton.count()) === 0) {
    const summary = page.getByText("Agent 运行时", { exact: true }).first();
    if ((await summary.count()) > 0) {
      await summary.click();
    }
  }
  await runButton.click();
  await page.getByRole("heading", { name: "Agent 平台运行" }).waitFor();
  await page.getByText("Planner 任务树").first().waitFor();
  await page.screenshot({ path: join(artifactDir, `${prefix}-agent-platform-result.png`), fullPage: true });
  await checkNoHorizontalOverflow(page, `${prefix} agent platform result`);
  await checkButtonTextFit(page, `${prefix} agent platform result`);
  await checkPanelIntegrity(page, `${prefix} agent platform result`);
  await checkChineseVisibleText(page, `${prefix} agent platform result`);
  await checkAgentPlatformSections(page, `${prefix} agent platform result`);
}

async function checkAgentPlatformSections(page: Page, name: string): Promise<void> {
  const labels = ["Planner 任务树", "工具权限系统", "Executor 执行记录", "Critic 审查", "Memory Agent 事件", "Supervisor 决策"];
  const missing: string[] = [];

  for (const label of labels) {
    if ((await page.getByText(label, { exact: true }).count()) === 0) {
      missing.push(label);
    }
  }

  for (const label of ["Executor 执行记录", "Memory Agent 事件"]) {
    const section = page.locator("details.agent-platform-section").filter({ hasText: label }).first();
    if ((await section.count()) > 0) {
      await section.evaluate((node) => {
        (node as HTMLDetailsElement).open = true;
      });
    }
  }

  const visibleText = await page.locator("main").innerText();
  const requiredFragments = ["只读工具", "本地文件写入", "历史偏好摘要", "用户项目画像"];
  const missingFragments = requiredFragments.filter((fragment) => !visibleText.includes(fragment));

  if (missing.length === 0 && missingFragments.length === 0) {
    pass(name, "Agent platform Planner/Executor/Critic/Memory/Supervisor and granular permission labels are visible.");
    return;
  }

  fail(name, `Missing sections: ${missing.join(", ") || "none"}; missing text: ${missingFragments.join(", ") || "none"}`);
}

async function checkNoHorizontalOverflow(page: Page, name: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  if (overflow <= 2) {
    pass(`${name} overflow`, "No document-level horizontal overflow detected.");
    return;
  }

  fail(`${name} overflow`, `Document is ${overflow}px wider than the viewport.`);
}

async function checkButtonTextFit(page: Page, name: string): Promise<void> {
  const overflowingButtons = await page.locator("button").evaluateAll((buttons) =>
    buttons
      .filter((button) => button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1)
      .map((button) => button.textContent?.trim() || button.getAttribute("aria-label") || "unnamed button")
      .slice(0, 6)
  );

  if (overflowingButtons.length === 0) {
    pass(`${name} button fit`, "Button text fits within rendered controls.");
    return;
  }

  fail(`${name} button fit`, `Overflowing buttons: ${overflowingButtons.join(", ")}`);
}

async function checkExportButtons(page: Page, name: string): Promise<void> {
  const labels = ["导出 ADR", "导出 JSON", "导出报告", "复制 Prompt 包"];
  const missing: string[] = [];

  for (const label of labels) {
    if ((await page.getByRole("button", { name: label }).count()) === 0) {
      missing.push(label);
    }
  }

  if (missing.length === 0) {
    pass(`${name} exports`, "Export and prompt buttons are visible after a run.");
    return;
  }

  fail(`${name} exports`, `Missing buttons: ${missing.join(", ")}`);
}

async function checkBlueprintExportButtons(page: Page, name: string): Promise<void> {
  const labels = ["导出蓝图", "导出 PDF 报告", "复制蓝图", "复制 Prompt 包"];
  const missing: string[] = [];

  for (const label of labels) {
    if ((await page.getByRole("button", { name: label }).count()) === 0) {
      missing.push(label);
    }
  }

  if (missing.length === 0) {
    pass(`${name} exports`, "Blueprint export, copy, and prompt buttons are visible after a run.");
    return;
  }

  fail(`${name} exports`, `Missing buttons: ${missing.join(", ")}`);
}

async function checkSetupGuidance(page: Page, name: string): Promise<void> {
  await page.getByText("新手引导").waitFor();
  await page.getByRole("heading", { name: "就绪检查" }).waitFor();
  await page.locator(".readiness-item > span", { hasText: /^限流$/ }).waitFor();
  await page.locator(".readiness-item > span", { hasText: /^请求体$/ }).waitFor();
  await page.locator(".readiness-item > span", { hasText: /^对外发布$/ }).waitFor();

  const summary = page.locator(".onboarding-panel > summary");
  await summary.click();
  await page.getByText("指标速读").waitFor();
  pass(name, "Onboarding, setup readiness, and security sharing hints are visible in Chinese mode.");
}

async function checkPanelIntegrity(page: Page, name: string): Promise<void> {
  const panels = await page.locator(".setup-column, .room-column, .inspector-column").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        className: node.className,
        width: rect.width,
        height: rect.height,
        textLength: (node.textContent ?? "").trim().length
      };
    })
  );
  const broken = panels.filter((panel) => panel.width < 240 || panel.height < 120 || panel.textLength === 0);

  if (broken.length === 0) {
    pass(`${name} panels`, "Primary setup, result, and inspector panels are nonblank and have stable dimensions.");
    return;
  }

  fail(`${name} panels`, `Unstable panels: ${broken.map((panel) => panel.className).join(", ")}`);
}

async function checkIndependentScrollAreas(page: Page, name: string): Promise<void> {
  const result = await page.evaluate(() => {
    const selectors = [".setup-column", ".room-column", ".inspector-column"] as const;
    const nodes = selectors.map((selector) => document.querySelector<HTMLElement>(selector));

    if (nodes.some((node) => !node)) {
      return { ok: false, details: "Missing one or more primary scroll columns." };
    }

    const [setup, room, inspector] = nodes as [HTMLElement, HTMLElement, HTMLElement];
    const overflow = {
      setup: setup.scrollHeight - setup.clientHeight,
      room: room.scrollHeight - room.clientHeight,
      inspector: inspector.scrollHeight - inspector.clientHeight
    };
    const styles = {
      setup: getComputedStyle(setup).overflowY,
      room: getComputedStyle(room).overflowY,
      inspector: getComputedStyle(inspector).overflowY
    };
    const documentTop = document.scrollingElement?.scrollTop ?? 0;

    setup.scrollTop = 0;
    room.scrollTop = 0;
    inspector.scrollTop = 0;
    room.scrollTop = Math.max(0, overflow.room);
    const afterRoom = {
      documentTop: document.scrollingElement?.scrollTop ?? 0,
      setupTop: setup.scrollTop,
      roomTop: room.scrollTop,
      inspectorTop: inspector.scrollTop
    };

    setup.scrollTop = Math.max(0, overflow.setup);
    const afterSetup = {
      documentTop: document.scrollingElement?.scrollTop ?? 0,
      setupTop: setup.scrollTop,
      roomTop: room.scrollTop,
      inspectorTop: inspector.scrollTop
    };

    inspector.scrollTop = Math.max(0, overflow.inspector);
    const afterInspector = {
      documentTop: document.scrollingElement?.scrollTop ?? 0,
      setupTop: setup.scrollTop,
      roomTop: room.scrollTop,
      inspectorTop: inspector.scrollTop
    };

    return {
      ok:
        styles.setup === "auto" &&
        styles.room === "auto" &&
        styles.inspector === "auto" &&
        overflow.setup > 40 &&
        overflow.room > 80 &&
        overflow.inspector > 40 &&
        afterRoom.roomTop > 0 &&
        afterRoom.setupTop === 0 &&
        afterRoom.inspectorTop === 0 &&
        afterRoom.documentTop === documentTop &&
        afterSetup.setupTop > 0 &&
        afterSetup.roomTop === afterRoom.roomTop &&
        afterSetup.inspectorTop === 0 &&
        afterSetup.documentTop === documentTop &&
        afterInspector.inspectorTop > 0 &&
        afterInspector.setupTop === afterSetup.setupTop &&
        afterInspector.roomTop === afterRoom.roomTop &&
        afterInspector.documentTop === documentTop,
      details: JSON.stringify({ overflow, styles, documentTop, afterRoom, afterSetup, afterInspector })
    };
  });

  if (result.ok) {
    pass(`${name} independent scroll`, "Center result column scrolls independently from setup, inspector, and document scroll.");
    return;
  }

  fail(`${name} independent scroll`, result.details);
}

async function checkResponsiveScrollMode(page: Page, name: string): Promise<void> {
  const result = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>(".workspace-grid");
    const columns = Array.from(document.querySelectorAll<HTMLElement>(".setup-column, .room-column, .inspector-column"));

    if (!grid || columns.length !== 3) {
      return { ok: false, details: "Missing workspace grid or columns." };
    }

    const gridStyle = getComputedStyle(grid);
    const columnStyles = columns.map((column) => getComputedStyle(column).overflowY);
    const documentOverflow = document.documentElement.scrollWidth - window.innerWidth;

    return {
      ok: gridStyle.overflow !== "hidden" && columnStyles.every((value) => value === "visible") && documentOverflow <= 2,
      details: JSON.stringify({ gridOverflow: gridStyle.overflow, columnStyles, documentOverflow })
    };
  });

  if (result.ok) {
    pass(`${name} responsive scroll`, "Narrow/mobile layout uses document scrolling without hidden clipped columns.");
    return;
  }

  fail(`${name} responsive scroll`, result.details);
}

async function checkTooltipFitsViewport(page: Page, name: string): Promise<void> {
  const result = await page.getByRole("tooltip").first().evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      ok: rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1,
      details: JSON.stringify({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: window.innerWidth, height: window.innerHeight })
    };
  });

  if (result.ok) {
    pass(name, "Tooltip is inside the viewport.");
    return;
  }

  fail(name, result.details);
}

async function checkChineseVisibleText(page: Page, name: string): Promise<void> {
  const text = await page.locator("main").innerText();
  const hits = visibleEnglishBlocklist.filter((fragment) => text.includes(fragment));

  if (hits.length === 0) {
    pass(`${name} zh remnants`, "No known English UI remnants were visible in Chinese mode.");
    return;
  }

  const contexts = hits.map((fragment) => `${fragment}: ${contextAround(text, fragment)}`);
  fail(`${name} zh remnants`, `Visible English remnants: ${contexts.join(" | ")}`);
}

function contextAround(text: string, fragment: string): string {
  const index = text.indexOf(fragment);
  if (index < 0) {
    return "n/a";
  }

  return text.slice(Math.max(0, index - 36), Math.min(text.length, index + fragment.length + 36)).replace(/\s+/g, " ").trim();
}

function auditChineseExports(): void {
  const decisionContext = contextForQuestion(longChineseQuestion);
  const decisionResult = runDecisionRoom({ question: longChineseQuestion, mode: "deep", context: decisionContext });
  const promptBundle = createManualProviderBundle({
    question: longChineseQuestion,
    locale: "zh",
    context: decisionContext
  });
  const blueprintContext = contextForQuestion(blueprintChineseQuestion);
  const blueprintResult = runBlueprintRoom({
    question: blueprintChineseQuestion,
    mode: "deep",
    locale: "zh",
    context: blueprintContext
  });
  const artifacts = [
    createAdrMarkdownExport(decisionResult, "zh"),
    createPdfReportExport({
      question: longChineseQuestion,
      locale: "zh",
      providerMode: "demo",
      providerTrace: [],
      liveVerdict: null,
      promptBundle,
      result: decisionResult
    }),
    createBlueprintReportExport({
      question: blueprintChineseQuestion,
      locale: "zh",
      providerMode: "demo",
      providerTrace: [],
      result: blueprintResult
    }),
    createBlueprintBacklogExport({
      question: blueprintChineseQuestion,
      locale: "zh",
      result: blueprintResult
    }),
    {
      filename: "quorummind-blueprint-body.md",
      mimeType: "text/markdown;charset=utf-8",
      contents: blueprintResult.finalSpec.markdown
    }
  ];
  const hits = artifacts.flatMap((artifact) => {
    const artifactHits = exportEnglishBlocklist.filter((fragment) => artifact.contents.includes(fragment));
    return artifactHits.map((fragment) => `${artifact.filename}: ${fragment}`);
  });

  if (hits.length === 0) {
    pass("Chinese export remnants", "ADR, decision HTML report, Blueprint HTML report, backlog, and Blueprint body have no known English label remnants.");
    return;
  }

  fail("Chinese export remnants", hits.join("; "));
}

function startServices(apiPort: number, webPort: number): void {
  const serviceEnv = {
    ...process.env,
    QUORUMMIND_PROVIDER_MODE: "live",
    QUORUMMIND_MOCK_PROVIDERS: "1",
    QUORUMMIND_API_HOST: "127.0.0.1",
    QUORUMMIND_API_PORT: String(apiPort),
    QUORUMMIND_ALLOWED_ORIGINS: `http://127.0.0.1:${webPort},http://localhost:${webPort}`,
    QUORUMMIND_API_TOKEN: "",
    VITE_QUORUMMIND_API_TOKEN: "",
    QUORUMMIND_SQLITE_PATH: ""
  };

  children.push(spawnLogged("npm", ["run", "server"], serviceEnv));
  children.push(
    spawnLogged("npm", ["run", "dev:web", "--", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], serviceEnv)
  );
}

function spawnLogged(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  });

  child.stdout?.on("data", (chunk) => process.stdout.write(`[visual:${command}] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[visual:${command}] ${chunk}`));
  child.on("exit", (code) => {
    if (shuttingDown) {
      return;
    }

    if (code && code !== 0) {
      fail(`${command} process`, `${command} exited with code ${code}.`);
    }
  });

  return child;
}

async function waitForHttp(url: string, label: string): Promise<void> {
  const deadline = Date.now() + 45_000;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        pass(label, `${url} is reachable.`);
        return;
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown fetch error";
    }

    await delay(500);
  }

  fail(label, `${url} was not reachable: ${lastError}`);
  throw new Error(`${label} did not become reachable.`);
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address?.port) {
          resolvePort(address.port);
        } else {
          reject(new Error("Unable to allocate a free port."));
        }
      });
    });
    server.on("error", reject);
  });
}

function pass(name: string, details: string): void {
  checks.push({ name, status: "passed", details });
}

function fail(name: string, details: string): void {
  checks.push({ name, status: "failed", details });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function renderReport(results: VisualCheck[], ports: { apiPort: number; webPort: number }): string {
  const rows = results.map((check) => `| ${check.name} | ${check.status} | ${check.details} |`).join("\n");
  const failed = results.filter((check) => check.status === "failed");

  return `# QuorumMind 视觉回归审计记录

日期：${auditDate}

## 范围

- 桌面视口：1440x1100。
- 窄桌面视口：1024x900。
- 移动视口：390x844。
- 长中文问题输入。
- 运行后结果页。
- Blueprint 模式输入和运行后结果页。
- Agent 平台运行后结果页：Planner、Executor、Critic、Memory、Supervisor、工具权限类别。
- 左 / 中 / 右三栏独立滚动验证。
- 窄屏和移动端响应式滚动验证。
- Tooltip 悬浮显示。
- ADR / JSON / 报告 / Prompt 导出按钮可见性。
- 蓝图导出 / PDF 报告 / 复制蓝图 / Prompt 导出按钮可见性。
- 中文模式可见文本残留英文扫描。
- 中文 ADR、决策报告、蓝图报告、任务清单和蓝图正文导出残留英文扫描。
- 文档级横向溢出和按钮文字溢出。

## 运行环境

- API：127.0.0.1:${ports.apiPort}
- Web：127.0.0.1:${ports.webPort}
- Provider：mock live，不消耗真实 API。
- 截图目录：\`${artifactDir}\`

## 汇总

| 指标 | 结果 |
| --- | ---: |
| 检查项 | ${results.length} |
| 失败项 | ${failed.length} |
| 通过率 | ${percent(results.length - failed.length, results.length)} |

## 明细

| 检查 | 状态 | 说明 |
| --- | --- | --- |
${rows}
`;
}

function percent(count: number, total: number): string {
  return total <= 0 ? "0%" : `${Math.round((count / total) * 100)}%`;
}
