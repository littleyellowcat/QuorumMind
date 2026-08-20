import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkbenchIntro } from "./WorkbenchIntro";

describe("WorkbenchIntro", () => {
  it("renders the active workspace and source status with an accessible label", () => {
    render(
      <WorkbenchIntro
        title="Decision and Blueprint Studio"
        workspaceLabel="Decision room"
        hint="Enter a trade-off question."
        sourceLabel="Demo"
        statusLabel="Current workspace status"
        modeLabel="Mode"
        sourceTitle="Source"
      />
    );

    expect(screen.getByRole("definition", { name: "Mode" })).toHaveTextContent("Decision room");
    expect(screen.getByRole("definition", { name: "Source" })).toHaveTextContent("Demo");
    expect(screen.getByLabelText("Current workspace status")).toBeInTheDocument();
  });
});
