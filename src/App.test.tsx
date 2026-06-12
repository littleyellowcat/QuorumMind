import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("QuorumMind app", () => {
  it("renders the demo and shows an ADR after running Deep Quorum", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: /QuorumMind/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Run Deep Quorum/i }));

    expect(screen.getByText(/Architecture Decision Record/i)).toBeInTheDocument();
    expect(screen.getByText(/Quorum Score/i)).toBeInTheDocument();
    expect(screen.getByText(/Dissent Index/i)).toBeInTheDocument();
  });
});
