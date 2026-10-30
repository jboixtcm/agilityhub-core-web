import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  process.env.E2E_CAPTURE_TASK ?? "2026-10-28-word-feedback",
);

for (const width of [375, 1512]) {
  test(`Word feedback member flows ${String(width)}`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-08-03T07:10:00+02:00"));
    await page.addInitScript(() => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "member");
    });
    await page.goto("http://127.0.0.1:4173/entrar");
    await page.getByLabel("Correu electrònic").fill("laura@example.test");
    await page.getByLabel("Contrasenya").fill("secret-password");
    await page.getByRole("button", { name: "ENTRA", exact: true }).click();
    await expect(page.getByRole("region", { name: "Entrenaments aquesta setmana" })).toBeVisible();
    await expect(page.getByText(/entrenaments fets o reservats/u).first()).toBeVisible();
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({
      path: resolve(evidence, `word-home-${browserName}-${String(width)}.png`),
      fullPage: true,
    });

    await page.goto("http://127.0.0.1:4173/gossos");
    await expect(page.getByRole("button", { name: "Veure condicions" }).first()).toBeVisible();
    await page.getByRole("button", { name: "＋ DOC." }).first().click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Nom del document").fill("Prova de document");
    await modal.getByLabel("Fitxer", { exact: true }).setInputFiles({
      name: "prova.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n%%EOF"),
    });
    await expect(modal.getByText("Fitxer seleccionat: prova.pdf")).toBeVisible();
    await modal.getByRole("button", { name: "PUJA EL DOCUMENT" }).click();
    await expect(modal).not.toBeVisible();
    await expect(page.getByText("Prova de document", { exact: true })).toBeVisible();
    await page.screenshot({
      path: resolve(evidence, `word-dogs-${browserName}-${String(width)}.png`),
      fullPage: true,
    });

    await page.goto("http://127.0.0.1:4173/avui?date=2026-08-04");
    const tuesday = page.getByRole("button", { name: "dimarts 4", exact: true });
    await expect(tuesday).toHaveAttribute("aria-pressed", "true");
    await expect(
      tuesday.locator(width >= 1024 ? ".day-screen__full-label" : ".day-screen__short-label"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("columnheader", { name: "Muntanya", exact: true })
        .locator(width >= 1024 ? ".ah-day-grid__full-label" : ".ah-day-grid__short-label"),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(evidence, `word-day-${browserName}-${String(width)}.png`),
      fullPage: true,
    });

    await page.goto("http://127.0.0.1:4173/inactivitat");
    const back = page.getByLabel("Mes de tornada (opcional)");
    await expect(back).toBeVisible();
    expect(await back.evaluate((element) => element.tagName)).toBe("SELECT");
    const preview = page.waitForRequest(
      (request) =>
        request.url().includes("/inactivity-periods/preview") &&
        request.url().includes("toMonth=2026-11"),
    );
    await back.selectOption("2026-12");
    await preview;
    await expect(back).toHaveValue("2026-12");
    await page.screenshot({
      path: resolve(evidence, `word-inactivity-${browserName}-${String(width)}.png`),
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}
