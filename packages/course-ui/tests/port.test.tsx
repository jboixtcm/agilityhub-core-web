import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  PaperSizeToggle,
  PlacementControls,
  PlanStepper,
  UnitsToggle,
  UploadCourse,
  configurePlannerStore,
  type PlanStepDefinition,
  type PlannerStore,
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
          description: (label, width, height) => `${label}: ${String(width)} x ${String(height)}`,
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

    expect(screen.getByRole("link", { name: /Details/ }).getAttribute("href")).toBe("/new/details");
    expect(screen.queryByRole("link", { name: /Place/ })).toBeNull();
    expect(screen.getByText("Place").closest("span[aria-disabled='true']")).not.toBeNull();
  });

  it("R-16-03 keeps the upload payload and Idempotency-Key available after an unanswered save", async () => {
    const source = readFileSync(
      resolve(process.cwd(), "../course-core/fixtures/smarter/jp-s-sw_993483_sadesign.txt"),
      "utf8",
    );
    const uploadSmarterFile = vi
      .fn<PlannerStore["uploadSmarterFile"]>()
      .mockRejectedValueOnce(new TypeError("network answer lost"))
      .mockResolvedValueOnce({ course: { id: "course-1", name: "Course", version: 1 } });
    configurePlannerStore({ uploadSmarterFile } as unknown as PlannerStore);
    const onUploaded = vi.fn();

    render(
      <UploadCourse
        labels={{
          continue: "Continue",
          dimensions: (length, width) => `${String(length)} × ${String(width)}`,
          file: "File",
          ignoredLogos: (count) => `${String(count)} logos`,
          noGoZones: (count) => `${String(count)} zones`,
          numbers: (count) => `${String(count)} numbers`,
          obstacles: (count) => `${String(count)} obstacles`,
          parseError: "Parse error",
          parsing: (filename) => `Parsing ${filename}`,
          savedContinue: "Saved",
          title: "Upload",
          units: (value) => value,
          uploadError: "Upload error",
          uploading: "Uploading",
        }}
        onUploaded={onUploaded}
      />,
    );

    fireEvent.change(screen.getByLabelText("File"), {
      target: { files: [new File([source], "course.txt", { type: "text/plain" })] },
    });
    await screen.findByRole("button", { name: "Continue" });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledOnce();
    });

    expect(uploadSmarterFile).toHaveBeenCalledTimes(2);
    expect(uploadSmarterFile.mock.calls[0]?.[0].submissionKey).toBe(
      uploadSmarterFile.mock.calls[1]?.[0].submissionKey,
    );
    expect(uploadSmarterFile.mock.calls[0]?.[0].bytes).toEqual(
      uploadSmarterFile.mock.calls[1]?.[0].bytes,
    );
  });
});
