import { describe, expect, it } from "vitest";
import { contextForQuestion, inferQuestionPattern } from "./question-context";

describe("question context inference", () => {
  it("maps PostgreSQL tenant questions to the tenant isolation context", () => {
    const question = "一个 B2B SaaS MVP 应该使用 PostgreSQL 的 schema-per-tenant，还是 shared tables + tenant_id？";
    const context = contextForQuestion(question);

    expect(inferQuestionPattern(question)).toBe("tenant_isolation");
    expect(context.candidateOptions).toContain("Shared tables with tenant_id");
    expect(context.teamProfile).toContain("PostgreSQL");
  });

  it("maps Node.js monolith questions to service decomposition", () => {
    const question = "我们是否应该把当前单体 Node.js 后端拆成微服务？";

    expect(inferQuestionPattern(question)).toBe("service_decomposition");
    expect(contextForQuestion(question).candidateOptions).toContain("Modular monolith");
  });

  it("maps LangGraph and LangChain questions to agent framework selection", () => {
    const question = "多 agent 工作流应该用 LangGraph 还是 LangChain？";

    expect(inferQuestionPattern(question)).toBe("agent_framework");
    expect(contextForQuestion(question).candidateOptions).toContain("LangGraph");
  });

  it("maps multi-agent loop governance questions to agent framework selection", () => {
    const question = "多 Agent 系统是否应该默认开启循环互评直到共识达到 80？";

    expect(inferQuestionPattern(question)).toBe("agent_framework");
    expect(contextForQuestion(question).candidateOptions).toContain("LangGraph");
  });

  it("does not treat every non-game multi-agent request as a visual novel agent framework question", () => {
    const question =
      "我想做一个面向中小跨境电商团队的 AI 运营助手，需要根据订单、库存、广告和客服对话生成运营建议，应该设计哪些多 Agent？";

    expect(inferQuestionPattern(question)).toBe("general_architecture");
    expect(contextForQuestion(question).expectedScale).not.toContain("visual-novel");
    expect(contextForQuestion(question).expectedScale).not.toContain("小说");
  });
});
