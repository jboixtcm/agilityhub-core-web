import { t } from "@agilityhub/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("id placeholder", () => {
  it("renders the application heading", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: t("shell.id") })).toBeInTheDocument();
  });
});
