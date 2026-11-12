import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DogPhoto } from "./dog-photo";

afterEach(cleanup);

describe("DogPhoto", () => {
  it("keeps the signed URL intact, falls back on failure, and tries a renewed URL", () => {
    const first = "/api/v1/attachments/files/example?expires=10&signature=first";
    const second = "/api/v1/attachments/files/example?expires=20&signature=second";
    const view = render(<DogPhoto alt="Foto de Duna" name="Duna" src={first} />);
    expect(screen.getByRole("img", { name: "Foto de Duna" })).toHaveAttribute("src", first);
    fireEvent.error(screen.getByRole("img", { name: "Foto de Duna" }));
    expect(screen.getByRole("img", { name: "Duna" })).toBeVisible();
    view.rerender(<DogPhoto alt="Foto de Duna" name="Duna" src={second} />);
    expect(screen.getByRole("img", { name: "Foto de Duna" })).toHaveAttribute("src", second);
  });

  it("does not create a broken image or duplicate an adjacent link's accessible name", () => {
    const view = render(
      <a href="/gossos/example">
        <DogPhoto name="Duna" src={null} />
        Duna
      </a>,
    );
    expect(view.container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Duna" })).toBeVisible();
  });
});
