import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  process.env.E2E_CAPTURE_TASK ?? "2026-10-31-dashboard-donut",
);
const branding: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

for (const width of [375, 1280]) {
  for (const theme of ["light", "dark"]) {
    test(`T-14-25 donut filter ${theme} ${String(width)}`, async ({ page, browserName }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((cached) => {
        localStorage.setItem("agilityhub.locale", "ca");
        localStorage.setItem("agilityhub.mockScenario", "admin");
        localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cached));
      }, branding);
      await page.goto("http://127.0.0.1:4174/entrar");
      await page.getByLabel("Correu electrònic").fill("admin@example.test");
      await page.getByRole("button", { name: "Tinc contrasenya" }).click();
      await page.getByLabel("Contrasenya").fill("secret-password");
      await page.getByRole("button", { name: "ENTRA", exact: true }).click();
      await page.waitForURL("**/tauler");
      await page.getByRole("combobox", { name: "Aparença" }).selectOption(theme);
      const card = page.locator(".dashboard-chart");
      const ring = card.locator(".dashboard-chart__donut");
      await expect(
        card.getByRole("figure", { name: "Gossos per nivell — 242 actius" }),
      ).toBeVisible();
      await expect(ring).toHaveCSS("background-image", /conic-gradient/u);
      const allGradient = await ring.evaluate(
        (element) => getComputedStyle(element).backgroundImage,
      );
      mkdirSync(evidence, { recursive: true });
      await card.screenshot({
        path: resolve(evidence, `donut-${browserName}-${theme}-${String(width)}-all.png`),
      });
      await card.getByRole("radio", { name: "Tots" }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(card.getByRole("radio", { name: "Amb reserves" })).toBeChecked();
      await expect(
        card.getByRole("figure", { name: "Gossos per nivell — 179 amb reserves" }),
      ).toBeVisible();
      await expect(card.getByRole("row", { name: /CAD 19 10,6/u })).toBeVisible();
      await expect(card.locator(".dashboard-chart__description")).toHaveText(
        "amb reserva (setm. en curs o anterior)",
      );
      expect(await ring.evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe(
        allGradient,
      );
      await card.screenshot({
        path: resolve(evidence, `donut-${browserName}-${theme}-${String(width)}-recent.png`),
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      const layout = await card.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return [...element.querySelectorAll("table, input, .dashboard-chart__donut")].every(
          (child) => {
            const rect = child.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right;
          },
        );
      });
      expect(layout).toBe(true);
      await page.keyboard.press("ArrowLeft");
      await expect(card.getByRole("radio", { name: "Tots" })).toBeChecked();
    });
  }
}
