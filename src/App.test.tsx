import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("QuorumMind app", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the English decision workspace and shows results after running", async () => {
    render(<App />);

    expect(screen.getByText("QuorumMind")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enter workbench/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enter workbench/i }));
    });

    expect(screen.getByRole("button", { name: /Run decision room/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Run decision room/i }));
      await new Promise(r => setTimeout(r, 100));
    });

    expect(screen.getByText(/Architecture Decision Record/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Final Verdict/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Agent Council/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Trade-off Ranking/i)).toBeInTheDocument();
    expect(screen.getByText(/Risk Radar/i)).toBeInTheDocument();
  });

  it("switches to Chinese", async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "中文" }));
    });

    expect(screen.getByText(/在可审计决策室里评审复杂技术选择/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /进入工作台/i }));
    });

    expect(screen.getByRole("button", { name: /运行决策室/i })).toBeInTheDocument();
  });

  it("updates the Blueprint empty-state preview from the current typed request", async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "中文" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /进入工作台/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^方案蓝图$/i }));
    });

    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: "蓝图需求" }), {
        target: {
          value:
            "我想做一个面向中小跨境电商团队的 AI 运营助手，需要根据店铺订单、商品库存、广告投放数据和客服对话生成每日运营简报、补货建议、广告预算建议和客服话术优化方案。"
        }
      });
    });

    expect(screen.getByText("当前需求")).toBeInTheDocument();
    expect(screen.getAllByText(/跨境电商团队的 AI 运营助手/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("订单数据").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("库存数据").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("广告投放").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("客服对话").length).toBeGreaterThanOrEqual(1);
  });

  it("offers clickable reference questions for Decision Room and Blueprint", async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "中文" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /进入工作台/i }));
    });

    expect(screen.getByText("参考问题")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /私有化部署/ }));
    });

    expect(screen.getByRole("textbox", { name: "架构问题" })).toHaveValue(
      "企业客户一直要求私有化部署，我们现在要不要支持？"
    );
    expect(screen.getByText("当前问题")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^方案蓝图$/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /跨境电商 AI 运营助手/ }));
    });

    expect(screen.getByRole("textbox", { name: "蓝图需求" })).toHaveValue(
      "我想做一个跨境电商 AI 运营助手，能看订单、库存、广告和客服对话，然后给运营建议。"
    );
    expect(screen.getByText("当前需求")).toBeInTheDocument();
    expect(screen.getAllByText("订单数据").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("库存数据").length).toBeGreaterThanOrEqual(1);
  });
});
