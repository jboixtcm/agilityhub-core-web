import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LimitedMarkdown } from "./limited-markdown";

describe("LimitedMarkdown", () => {
  it("renders the allowed subset and strips unsupported HTML and images", () => {
    render(
      <LimitedMarkdown>
        {
          "## Heading\n\nA **bold** and *soft* [link](https://example.test).\n\n- One\n- Two\n\n<img src=x>![hidden](https://example.test/image.png)"
        }
      </LimitedMarkdown>,
    );

    expect(screen.getByRole("heading", { name: "Heading" })).toBeVisible();
    expect(screen.getByText("bold")).toHaveProperty("tagName", "STRONG");
    expect(screen.getByText("soft")).toHaveProperty("tagName", "EM");
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute(
      "href",
      "https://example.test",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });
});
