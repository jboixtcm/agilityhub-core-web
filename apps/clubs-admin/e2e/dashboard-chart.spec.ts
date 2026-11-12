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
        // The dashboard and census predate this navigation and use separate fixture IDs.
        // Align only the read-only dashboard response with the census world for this flow.
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const response = await originalFetch(input, init);
          const url = new URL(
            input instanceof Request ? input.url : String(input),
            location.origin,
          );
          if (url.pathname !== "/api/v1/dashboard") return response;
          const body = (await response.json()) as {
            dogsByLevel: { levels: { code: string; levelId: string }[] };
          };
          for (const level of body.dogsByLevel.levels) {
            if (level.code === "C") level.levelId = "level-c";
          }
          return Response.json(body, { status: response.status });
        };
      }, branding);
      await page.goto("http://127.0.0.1:4174/entrar");
      await page.getByLabel("Correu electrònic").fill("admin@example.test");
      await page.getByRole("button", { name: "Tinc contrasenya" }).click();
      await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
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
      await expect(card.getByRole("row", { name: /CAD 19 11/u })).toBeVisible();
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

      await card.getByRole("link", { name: "C", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/gossos");
      const selected = new URL(page.url());
      expect(selected.searchParams.getAll("filter")).toEqual([
        "status:eq:ACTIVE",
        "levelId:eq:level-c",
      ]);
      expect(selected.searchParams.getAll("sort")).toEqual(["levelAssignedAt,asc", "name,asc"]);
      await expect(
        page.getByRole("columnheader", { name: "Data de naixement", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Al nivell des de/u })).toBeVisible();
      await expect(page.getByText("Duna", { exact: true })).toBeVisible();
      await expect(page.getByText("12/03/2022", { exact: true })).toBeVisible();
      await expect(page.locator(".admin-shell__brand img")).toBeVisible();
      expect(
        await page
          .locator(".admin-shell__brand img")
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
      await page.screenshot({
        path: resolve(evidence, `category-list-${browserName}-${theme}-${String(width)}.png`),
        fullPage: true,
      });
    });
  }
}
