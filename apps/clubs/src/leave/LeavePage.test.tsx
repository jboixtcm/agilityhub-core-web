import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { e8Client, renderE8, setupE8World } from "../test/e8";

import { LeavePage } from "./LeavePage";

setupE8World();

describe("T-13-30 member leave", () => {
  it("renders the inactivity offer, API reason catalog, NPS 0–10 and full-month help", async () => {
    await renderE8(<LeavePage client={e8Client()} />);
    expect(
      await screen.findByRole("heading", { name: "Abans de donar-te de baixa…" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "VULL DEMANAR INACTIVITAT" })).toHaveAttribute(
      "href",
      "/inactivitat",
    );
    expect(screen.getByText("Avui, 11 d’agost del 2026")).toBeVisible();
    expect(screen.getByRole("option", { name: "Ja he après tot el que volia" })).toBeVisible();
    const group = screen.getByRole("group", {
      name: "De 0 a 10, amb quina probabilitat ens recomanaries?",
    });
    expect(within(group).getAllByRole("button")).toHaveLength(11);
    expect(screen.getByText(/aquell mes es cobrarà íntegrament/u)).toBeVisible();
  });

  it("sends the selected catalog reason and shows the review footer", async () => {
    await renderE8(<LeavePage client={e8Client()} />);
    fireEvent.change(await screen.findByLabelText("Motiu"), { target: { value: "NO_TIME" } });
    fireEvent.click(screen.getByRole("button", { name: "ENVIA LA SOL·LICITUD" }));
    const back = await screen.findByRole("button", { name: "Torna al perfil" });
    expect(back.closest(".leave-sent")).toHaveTextContent(
      "El club la revisarà i et confirmarà la data d'efecte.",
    );
  });

  it("renders a planned leave read-only", async () => {
    await renderE8(<LeavePage client={e8Client()} />, { scenario: "memberPlannedLeave" });
    expect(await screen.findByText(/Tens la baixa prevista el/u)).toBeVisible();
    expect(screen.queryByRole("button", { name: "ENVIA LA SOL·LICITUD" })).not.toBeInTheDocument();
  });

  it("keeps the 15 literals complete in ca, es and en", async () => {
    for (const locale of ["ca", "es", "en"] as const) {
      const view = await renderE8(<LeavePage client={e8Client(locale)} />, { locale });
      await waitFor(() => {
        expect(view.container.textContent).not.toContain("leave:");
      });
      expect(view.container.textContent).toMatchSnapshot(locale);
      view.unmount();
    }
  });
});
