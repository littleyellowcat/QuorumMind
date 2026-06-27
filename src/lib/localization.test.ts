import { describe, expect, it } from "vitest";
import { localizeKnownDecisionText } from "./localization";

describe("localizeKnownDecisionText", () => {
  it("localizes service decomposition decision details in Chinese mode", () => {
    const text = [
      "The team has about 5 engineers.",
      "Can we validate that modularizing the current backend preserves delivery speed better than a service split?",
      "Run a two-week modularization spike and measure delivery throughput, test friction, and operational complexity.",
      "Splitting a small-team Node.js backend into services adds distributed debugging, deployment, and contract-management overhead.",
      "Microservice infrastructure can consume the next six months of delivery capacity before customer-facing work ships."
    ].join("\n");

    const localized = localizeKnownDecisionText(text, "zh");

    expect(localized).toContain("团队大约 5 名工程师。");
    expect(localized).toContain("能否验证：把当前后端模块化，比拆成服务更能保持交付速度？");
    expect(localized).toContain("运行一个为期两周的模块化 spike");
    expect(localized).toContain("分布式调试、部署和接口契约管理成本");
    expect(localized).toContain("微服务基础设施可能在客户功能交付前消耗未来 6 个月的研发产能。");
    expect(localized).not.toContain("The team has about 5 engineers.");
    expect(localized).not.toContain("Can we validate that modularizing");
  });
});
