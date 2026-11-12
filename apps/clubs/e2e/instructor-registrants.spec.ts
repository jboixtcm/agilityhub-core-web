import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
// E5-W05 round 2 (review #10): the capture goes to this spec's own task (E5-W03) unless the run
// names another one (`E2E_CAPTURE_TASK`, `pnpm e2e:docker <ID> --capture-task=<ID>`), as E5-W05
// does to refresh it (steps 1 and 2): a later complete run never rewrites it.
const captureTask = process.env.E2E_CAPTURE_TASK ?? "";
const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  captureTask === "" ? "E5-W03" : captureTask,
);
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
    await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
    await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
    // E6-W01 round 2 #7 (ruling E71): an instructor lands on 20.
    await page.waitForURL((url) => url.pathname === "/instructor/dia");
    await page.goto(`${baseUrl}/instructor/avui?date=2026-08-03`);

    const grid = page.getByRole("table", { name: "Quadre del dia" });
    await expect(grid.getByRole("link", { name: "Pau + Blat" })).toHaveAttribute(
      "href",
      "/instructor/alumnes/dog-blat",
    );
    await grid.getByRole("button", { name: /B\+C/u }).click();
    const drawer = page.getByRole("dialog", { name: "B+C" });
    const panel = drawer.getByRole("region", { name: "Inscrits (5/5)" });
    await expect(panel.getByRole("listitem")).toHaveCount(6);
    // E5-W05 steps 1 and 2: the api's displayState («feta») and «{guia} + {gos}»; round 2 #3: Duna's
    // own level chip («C»).
    await expect(panel.getByRole("listitem").first()).toHaveText("Laura + DunaCfeta");
    await expect(panel.getByText("En espera: Júlia + Kira · Roser + Lluna")).toBeVisible();
    await expect(panel.getByRole("button")).toHaveCount(0);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(evidenceDirectory, "23-classe-inscrits-375.png") });
    await expect(panel.getByRole("link", { name: "Júlia + Kira" })).toHaveAttribute(
      "href",
      "/instructor/alumnes/dog-kira",
    );
    await panel.getByRole("link", { name: "Laura + Duna" }).click();
    await expect(page).toHaveURL(/\/instructor\/alumnes\/dog-duna$/u);
    await expect(page.getByRole("heading", { name: "Laura + Duna", exact: true })).toBeVisible();
    await page.goto(`${baseUrl}/instructor/classes/c1`);
    await expect(page.getByRole("link", { name: "Laura + Duna" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pau + Blat" })).toHaveAttribute(
      "href",
      "/instructor/alumnes/dog-blat",
    );
    await page.screenshot({
      path: resolve(evidenceDirectory, "attendance-links-375.png"),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Laura + Duna" }).click();
    await expect(page).toHaveURL(/\/instructor\/alumnes\/dog-duna$/u);
    await page.goto(`${baseUrl}/instructor/pistes/ring-central/reservar`);
    await page.getByRole("combobox", { name: "Dia" }).selectOption("2026-08-03");
    await page.getByRole("combobox", { name: "Franja" }).selectOption("morning");
    const trainingLink = page.getByRole("link", { name: "Sergio + Thai" });
    await expect(trainingLink).toBeVisible();
    await expect(trainingLink).toHaveAttribute("href", "/instructor/alumnes/dog-thai");
    expect(await trainingLink.evaluate((element) => element.closest("button") === null)).toBe(true);
    await page.screenshot({
      path: resolve(evidenceDirectory, "training-student-links-375.png"),
      fullPage: true,
    });
  });
});
