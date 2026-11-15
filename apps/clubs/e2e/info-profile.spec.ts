import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type Page, test } from "@playwright/test";

const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  process.env.E2E_CAPTURE_TASK ?? "2026-11-15-info-profile",
);

async function expectContentFits(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  const boxes = await page
    .locator(".info-page, .info-page select, .info-faq__item, .info-club-page")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          client: element.clientWidth,
          scroll: element.scrollWidth,
        };
      }),
    );
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(width);
    expect(box.scroll).toBeLessThanOrEqual(box.client + 1);
  }
}

for (const width of [320, 375, 412, 1280]) {
  for (const scheme of ["dark", "light"] as const) {
    test(`T-05-CP-07 Profile information fits ${String(width)}px in ${scheme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(new Date("2026-08-02T18:00:00+02:00"));
      await page.addInitScript(() => {
        localStorage.setItem("agilityhub.locale", "ca");
        localStorage.setItem("agilityhub.mockScenario", "member");
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const response = await originalFetch(input, init);
          const url = new URL(input instanceof Request ? input.url : String(input), location.href);
          if (url.pathname.endsWith("/club-pages") && response.ok) {
            const data = (await response.json()) as {
              items: { key: string; title: Record<string, string>; body: Record<string, string> }[];
            };
            for (const item of data.items) {
              if (item.key === "IMAGE_CONSENT") {
                item.title.ca = "Autorització d'imatge i ús de fotografies del club";
                item.body.ca = `Document amb una referència llarga: ${"autoritzacio".repeat(20)}`;
              }
            }
            return Response.json(data);
          }
          return response;
        };
      });
      await page.goto("http://127.0.0.1:4173/entrar");
      await page.getByLabel("Correu electrònic").fill("laura@example.test");
      await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
      await page.getByRole("button", { name: "ENTRA", exact: true }).click();
      await page.waitForURL("**/inici");
      const nav = page.getByRole("navigation", { name: "Navegació principal" });
      await expect(nav.getByRole("link", { name: "Info", exact: true })).toHaveCount(0);
      await nav.getByRole("link", { name: "Perfil", exact: true }).click();
      await page.getByRole("combobox", { name: "Aparença", exact: true }).selectOption(scheme);
      await page
        .getByRole("combobox", { name: "Mida del text", exact: true })
        .selectOption("large");
      mkdirSync(evidence, { recursive: true });
      const suffix = `${testInfo.project.name}-${String(width)}-${scheme}`;
      await page.screenshot({ fullPage: true, path: resolve(evidence, `profile-${suffix}.png`) });
      await page.getByRole("link", { name: "Informació del club" }).click();
      await expect(page).toHaveURL(/\/info$/u);
      await expect(nav.getByRole("link", { name: "Perfil", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      const selector = page.getByRole("combobox", { name: "Informació del club" });
      await expect(selector).toHaveValue("faq");
      await page
        .getByRole("button", { name: "Què he de fer si no puc venir a una classe?" })
        .click();
      await expectContentFits(page, width);
      if (width === 375 && scheme === "dark") {
        await page.screenshot({
          path: resolve(evidence, `info-mobile-${testInfo.project.name}.png`),
        });
      }
      await page.screenshot({ fullPage: true, path: resolve(evidence, `info-faq-${suffix}.png`) });
      await selector.selectOption("RULES");
      await expect(
        page.getByRole("heading", { name: "Normes del club", exact: true }),
      ).toBeVisible();
      await expectContentFits(page, width);
      await selector.selectOption("IMAGE_CONSENT");
      await expect(
        page.getByRole("heading", { name: "Autorització d'imatge i ús de fotografies del club" }),
      ).toBeVisible();
      await expectContentFits(page, width);
      await page.screenshot({
        fullPage: true,
        path: resolve(evidence, `info-document-${suffix}.png`),
      });
      await page.locator(".info-page__back").click();
      await expect(page.getByRole("heading", { name: "El meu perfil" })).toBeVisible();
      // Existing bookmarks still reach the section after it leaves the fixed navigation.
      await page.goto("http://127.0.0.1:4173/info");
      await expect(selector).toHaveValue("faq");
    });
  }
}
