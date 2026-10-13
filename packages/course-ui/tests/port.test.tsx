import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  PaperSizeToggle,
  PlacementControls,
  PlanStepper,
  UnitsToggle,
  type PlanStepDefinition,
} from "../src/index";

describe("T-16-04 course-ui port", () => {
  it("R-16-01 keeps placement controls as controlled actions", () => {
    const onNudge = vi.fn();
    const onRotate = vi.fn();
    const onFlipX = vi.fn();
    const onFlipY = vi.fn();
    const onCenter = vi.fn();
    const onReset = vi.fn();

    render(
      <PlacementControls
        units="M"
        labels={{
          center: "Center",
          flipHorizontal: "Flip horizontal",
          flipVertical: "Flip vertical",
          nudgeDown: "Down",
          nudgeLeft: "Left",
          nudgeRight: "Right",
          nudgeUp: "Up",
          reset: "Reset",
          rotateFineLeft: "Fine left",
          rotateFineRight: "Fine right",
          rotateLeft: "Rotate left",
          rotateRight: "Rotate right",
          stepSize: "Step",
          title: "Placement",
        }}
        onCenter={onCenter}
        onFlipX={onFlipX}
        onFlipY={onFlipY}
        onNudge={onNudge}
        onReset={onReset}
        onRotate={onRotate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Right" }));
    fireEvent.click(screen.getByRole("button", { name: "Flip horizontal" }));
    expect(onNudge).toHaveBeenCalledWith(0.5, 0);
    expect(onFlipX).toHaveBeenCalledOnce();
  });

  it("R-16-01 keeps units and paper size controlled", () => {
    const setUnits = vi.fn();
    const setPaper = vi.fn();
    const { rerender } = render(
      <UnitsToggle
        labels={{ feet: "Feet", group: "Units", meters: "Meters" }}
        units="M"
        onChange={setUnits}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Feet" }));
    expect(setUnits).toHaveBeenCalledWith("FT");

    rerender(
      <PaperSizeToggle
        labels={{
          a4: "A4",
          description: (label, width, height) =>
            `${label}: ${String(width)} x ${String(height)}`,
          group: "Paper",
          letter: "Letter",
        }}
        value="a4"
        onChange={setPaper}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Letter" }));
    expect(setPaper).toHaveBeenCalledWith("letter");
  });

  it("R-16-01 removes Next coupling while retaining gated wizard navigation", () => {
    const steps: readonly PlanStepDefinition[] = [
      { id: "details", index: 1, label: "Details", href: "/new/details" },
      { id: "place", index: 2, label: "Place", href: "/new/place" },
    ];
    render(
      <PlanStepper
        ariaLabel="Course steps"
        currentStep="details"
        steps={steps}
        canEnterStep={(step) => step === "details"}
        renderLink={({ children, ...props }) => <a {...props}>{children}</a>}
      />,
    );

    expect(screen.getByRole("link", { name: /Details/ }).getAttribute("href")).toBe(
      "/new/details",
    );
    expect(screen.queryByRole("link", { name: /Place/ })).toBeNull();
    expect(screen.getByText("Place").closest("span[aria-disabled='true']")).not.toBeNull();
  });
});
