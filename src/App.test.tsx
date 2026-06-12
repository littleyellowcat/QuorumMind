import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("QuorumMind app", () => {
  it("renders the redesigned English command center and shows an ADR after running Deep Quorum", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: /QuorumMind/i })).toBeInTheDocument();
    expect(screen.getByText(/Architecture Command Center/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Run Deep Quorum/i }));

    expect(screen.getByText(/Architecture Decision Record/i)).toBeInTheDocument();
    expect(screen.getByText(/Quorum Score/i)).toBeInTheDocument();
    expect(screen.getByText(/Dissent Index/i)).toBeInTheDocument();
  });

  it("lets the user switch the interface to Chinese", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    expect(screen.getByText("架构决策控制台")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "运行深度评审" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "运行深度评审" }));

    expect(screen.getByText("架构决策记录")).toBeInTheDocument();
    expect(screen.getByText("共识评分")).toBeInTheDocument();
    expect(screen.getByText("分歧指数")).toBeInTheDocument();
  });
});
