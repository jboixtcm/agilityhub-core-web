import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E5-W05");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

test.describe("E5-W03 step 1 · screen 23's class drawer lists the registrants (S08 §6)", () => {
  test("an INSTRUCTOR reads who is booked and who waits, without actions", async ({ page }) => {
    // E5-W05 step 1: after the evening classes of Monday 3, so the api reads their bookings DONE.
    await page.clock.setFixedTime(new Date("2026-08-03T21:00:00+02:00"));
    await page.addInitScript(
      ({ cachedBranding }) => {
        localStorage.setItem("agilityhub.locale", "ca");
        localStorage.setItem("agilityhub.mockScenario", "instructor");
        localStorage.setItem(
          `agilityhub.branding:${location.host}`,
          JSON.stringify(cachedBranding),
        );
      },
      { cachedBranding: brandingCanic },
    );
    await page.goto(`${baseUrl}/entrar`);
    await page.getByLabel("Correu electrònic").fill("ivet.puig@example.test");
    await page.getByLabel("Contrasenya").fill("secret-password");
    await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
    // E6-W01 round 2 #7 (ruling E71): an instructor lands on 20.
    await page.waitForURL((url) => url.pathname === "/instructor/dia");
    await page.goto(`${baseUrl}/instructor/avui?date=2026-08-03`);

    const grid = page.getByRole("table", { name: "Quadre del dia" });
    await grid.getByRole("button", { name: /B\+C/u }).click();
    const drawer = page.getByRole("dialog", { name: "B+C" });
    const panel = drawer.getByRole("region", { name: "Inscrits (5/5)" });
    await expect(panel.getByRole("listitem")).toHaveCount(6);
    // E5-W05 steps 1 and 2: the api's displayState («feta») and «{guia} + {gos}».
    await expect(panel.getByRole("listitem").first()).toHaveText("Laura + Dunafeta");
    await expect(panel.getByText("En espera: Júlia + Kira · Roser + Lluna")).toBeVisible();
    await expect(panel.getByRole("button")).toHaveCount(0);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(evidenceDirectory, "23-classe-inscrits-375.png") });
  });
});
