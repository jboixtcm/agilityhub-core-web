import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E2-W02");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

async function prepareAdmin(page: Page) {
  await page.addInitScript((cachedBranding) => {
    localStorage.setItem("agilityhub.locale", "ca");
    localStorage.setItem("agilityhub.mockScenario", "admin");
    localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
  }, brandingCanic);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

test.describe("E2-W02 census records", () => {
  test("T-03-36 keeps the member detail request tenant-scoped and exposes every D10 action", async ({
    page,
  }) => {
    await prepareAdmin(page);
    await page.goto(`${baseUrl}/abonats/member-laura`);

    await expect(page.getByRole("heading", { name: "Laura Serra Vidal" })).toBeVisible();
    await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/34655100101",
    );
    await expect(page.getByRole("button", { name: "Reenvia accés" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Entra com l'abonat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edita" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Bloqueja les reserves" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Tasques" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Auditoria" })).toBeVisible();

    await page.getByRole("button", { name: "Entra com l'abonat" }).click();
    const impersonationDialog = page.getByRole("dialog", { name: "Entra com l'abonat" });
    await impersonationDialog.getByLabel("Motiu (opcional)").fill("Comprovació de la fitxa");
    const popupPromise = page.waitForEvent("popup");
    await impersonationDialog.getByRole("button", { name: "Entra com l'abonat" }).click();
    const clubsPage = await popupPromise;
    await clubsPage.waitForURL("http://127.0.0.1:4173/perfil");
    await expect(clubsPage.getByText("Estàs veient l'app com Laura Serra Vidal")).toBeVisible();
    await clubsPage.close();

    const response = await page.evaluate(async () => {
      const result = await fetch("/api/v1/members/member-from-another-club/overview", {
        headers: { Authorization: "Bearer mock-access-token" },
      });
      return result.status;
    });
    expect(response).toBe(404);
  });

  test("T-03-37 surfaces one stale edit and one booking conflict for concurrent D10 writes", async ({
    page,
  }) => {
    await prepareAdmin(page);
    await page.goto(`${baseUrl}/abonats/member-laura`);
    await expect(page.getByRole("heading", { name: "Laura Serra Vidal" })).toBeVisible();

    const result = await page.evaluate(async () => {
      const headers = {
        Authorization: "Bearer mock-access-token",
        "Content-Type": "application/json",
      };
      const edits = await Promise.all([
        fetch("/api/v1/members/member-laura", {
          body: JSON.stringify({ firstName: "Laura", version: 7 }),
          headers,
          method: "PATCH",
        }),
        fetch("/api/v1/members/member-laura", {
          body: JSON.stringify({ firstName: "Laura", version: 7 }),
          headers,
          method: "PATCH",
        }),
      ]);
      const blocks = await Promise.all([
        fetch("/api/v1/members/member-laura/booking-block", {
          body: JSON.stringify({ reason: "Rebut pendent" }),
          headers,
          method: "POST",
        }),
        fetch("/api/v1/members/member-laura/booking-block", {
          body: JSON.stringify({ reason: "Cartilla pendent" }),
          headers,
          method: "POST",
        }),
      ]);
      await fetch("/api/v1/members/member-laura/booking-block", {
        headers,
        method: "DELETE",
      });
      return {
        blocks: blocks.map((response) => response.status).sort(),
        edits: edits.map((response) => response.status).sort(),
      };
    });

    expect(result.edits).toEqual([200, 409]);
    expect(result.blocks).toEqual([201, 409]);
  });

  test("T-03-38 completes the dog record actions and captures its 1280 layout", async ({
    page,
  }) => {
    await prepareAdmin(page);
    await page.goto(`${baseUrl}/gossos/dog-duna`);

    await expect(page.getByRole("heading", { name: "Duna" })).toBeVisible();
    await expect(page.locator("strong").filter({ hasText: /^Cartilla de vacunes$/u })).toBeVisible();
    await expect(page.getByText("Treballar la calma a la sortida.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Canvia el nivell" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Transfereix" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dona de baixa" })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "dog-record-1280.png"),
    });

    await page.getByRole("button", { name: "Canvia el nivell" }).click();
    const levelDialog = page.getByRole("dialog", { name: "Canvia el nivell" });
    await levelDialog.getByLabel("Nivell nou").selectOption("level-d");
    await levelDialog.getByRole("button", { name: "Desa" }).click();
    await expect(page.getByText(/1 reserva futura queda fora del nivell nou/u)).toBeVisible();

    await page.getByRole("button", { name: "Dona de baixa" }).click();
    await page
      .getByRole("dialog", { name: "Dona de baixa el gos" })
      .getByRole("button", { name: "Dona de baixa" })
      .click();
    await expect(page.getByRole("button", { name: "Reactiva" })).toBeVisible();
  });

  test("T-03-39 matches the D10 literals and both booking-block states at 1280", async ({
    page,
  }) => {
    await prepareAdmin(page);
    await page.goto(`${baseUrl}/abonats/member-laura`);

    await expect(page.getByText("núm. 87", { exact: true })).toBeVisible();
    await expect(page.getByText("alta des de 2023")).toBeVisible();
    await expect(page.getByText("titular del grup familiar")).toBeVisible();
    await expect(page.getByText(/No autoritza l'ús de la seva imatge/u)).toBeVisible();
    await expect(page.getByText(/···· ···· ···· ···· 2231/u)).toBeVisible();
    await expect(page.getByText("canvi només admin")).toBeVisible();
    await expect(page.getByText("Pack 10: 6/4 · caduca 12-11")).toBeVisible();
    await expect(page.getByText("Pot entrenar sol")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D10-member-record-1280.png"),
    });

    await page.getByRole("button", { name: "Bloqueja les reserves" }).click();
    const dialog = page.getByRole("dialog", { name: "Bloqueja les reserves" });
    await dialog.getByLabel("Motiu del bloqueig").fill("Rebut pendent");
    await dialog.getByRole("button", { name: "Bloqueja les reserves" }).click();
    await expect(page.getByText("Reserves bloquejades")).toBeVisible();
    await expect(page.getByRole("button", { name: "Desbloqueja les reserves" })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D10-booking-blocked-1280.png"),
    });
    await page.getByRole("button", { name: "Desbloqueja les reserves" }).click();
  });
});
