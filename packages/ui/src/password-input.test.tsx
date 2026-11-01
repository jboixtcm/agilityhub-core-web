import { fireEvent, render, screen } from "@testing-library/react";
import type { SyntheticEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { PasswordInput } from "./password-input";

describe("Password visibility", () => {
  it("starts masked, toggles only its field, preserves the value and never submits", () => {
    const submit = vi.fn((event: SyntheticEvent) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={submit}>
        <PasswordInput
          aria-label="First"
          id="first"
          defaultValue="private-one"
          showLabel="Show first"
          hideLabel="Hide first"
        />
        <PasswordInput
          aria-label="Second"
          id="second"
          defaultValue="private-two"
          showLabel="Show second"
          hideLabel="Hide second"
        />
      </form>,
    );
    expect(screen.getByLabelText("First")).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show first" }));
    expect(screen.getByLabelText("First")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("First")).toHaveValue("private-one");
    expect(screen.getByLabelText("Second")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Hide first" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide first" }));
    expect(screen.getByLabelText("First")).toHaveAttribute("type", "password");
    expect(submit).not.toHaveBeenCalled();
  });
});
