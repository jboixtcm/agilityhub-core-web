import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Icon } from "./Icon";
import { ICON_NAMES } from "./names";

describe("Icon", () => {
  it("renders a typed mockup sprite symbol", () => {
    render(<Icon name="home" title="Home" />);

    expect(screen.getByRole("img", { name: "Home" })).toBeInTheDocument();
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(15);
  });
});
