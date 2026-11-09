import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { ClubLogoImage } from "./ClubLogoImage";

afterEach(cleanup);

it("recovers a failed public logo once and retains an accessible club identity if it still fails", () => {
  const props = {
    alt: "Club Example",
    className: "logo",
    name: "Club Example",
    src: "/api/v1/public/example/theme/mark",
  };
  const { rerender } = render(<ClubLogoImage {...props} />);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img")).toHaveAttribute("src", `${props.src}?imageRetry=1`);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img", { name: props.alt })).toHaveTextContent("C");
  expect(document.querySelector("img")).toBeNull();
  rerender(<ClubLogoImage {...props} src="/api/v1/public/other/theme/new-mark" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "/api/v1/public/other/theme/new-mark");
});

it("does not alter embedded assets on failure", () => {
  render(
    <ClubLogoImage alt="" className="logo" name="Example" src="data:image/png;base64,broken" />,
  );
  const image = document.querySelector("img");
  if (image === null) throw new Error("Expected club logo");
  fireEvent.error(image);
  expect(document.querySelector("img")).toBeNull();
  expect(screen.getByTitle("Example")).toHaveTextContent("E");
});
