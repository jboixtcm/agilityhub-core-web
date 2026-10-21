import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E11-W02");
const brandingCanic = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
) as unknown;
const WIDTHS = [1280, 375] as const;

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function signIn(page: Page) {
  await page.addInitScript(
    ({ cachedBranding }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "admin");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

test.describe("E11-W02 round 3: D18's date, D16's «Substituït», D5's bulk bar", () => {
  for (const width of WIDTHS) {
    test(`D18 at ${String(width)} px: «Últim canvi» shows each course's last change as the club's day (INC-62)`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: 900, width });
      await signIn(page);
      await page.goto(`${baseUrl}/recorreguts`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Biblioteca de recorreguts" }),
      ).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Últim canvi/u })).toBeVisible();
      const jumping = page.getByRole("row").filter({ hasText: "Jumping del dijous" });
      await expect(jumping).toContainText("12/10/2026");
      await expect(jumping.locator("img")).toHaveJSProperty("complete", true);
      await page.screenshot({
        fullPage: true,
        path: resolve(evidenceDirectory, `r3-D18-biblioteca-${String(width)}.png`),
      });
    });

    test(`D16 at ${String(width)} px: the replaced setup reads «Substituït» from the api's reason (INC-62)`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: 900, width });
      await signIn(page);
      await page.goto(`${baseUrl}/pistes/ring-muntanya/geometria`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Geometria · Muntanya" }),
      ).toBeVisible();
      const history = page.getByRole("region", { name: "Muntatges" });
      await expect(history.getByText("Substituït")).toBeVisible();
      await history.scrollIntoViewIfNeeded();
      await page.screenshot({
        fullPage: true,
        path: resolve(evidenceDirectory, `r3-D16-geometria-${String(width)}.png`),
      });
    });

    test(`D5 at ${String(width)} px: the bulk bar offers no «Canviar nivell» (AGENTS rule 3)`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: 900, width });
      await signIn(page);
      await page.goto(`${baseUrl}/abonats`);
      await page
        .getByRole("checkbox", { exact: true, name: "Selecciona Laura Serra Vidal" })
        .check();
      await expect(page.getByText("1 seleccionat — accions massives:")).toBeVisible();
      await expect(page.getByRole("button", { name: "Exportar selecció" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Canviar nivell" })).toHaveCount(0);
      await page.screenshot({
        fullPage: true,
        path: resolve(evidenceDirectory, `r3-D5-abonats-seleccio-${String(width)}.png`),
      });
    });
  }
});
