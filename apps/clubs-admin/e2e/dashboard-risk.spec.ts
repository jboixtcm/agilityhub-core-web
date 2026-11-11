import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Locator } from "@playwright/test";

const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  process.env.E2E_CAPTURE_TASK ?? "2026-10-31-dashboard-risk",
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

async function expectReadable(card: Locator) {
  const layout = await card.evaluate((element) => {
    const cardBounds = element.getBoundingClientRect();
    const clipped = [...element.querySelectorAll<HTMLElement>("a, strong, span, p, h2, time")]
      .filter((child) => {
        const box = child.getBoundingClientRect();
        return (
          box.right > cardBounds.right + 1 ||
          box.left < cardBounds.left - 1 ||
          child.scrollWidth > child.clientWidth + 1 ||
          child.scrollHeight > child.clientHeight + 1
        );
      })
      .map((child) => child.textContent);
    const overlapping = [...element.querySelectorAll(".dashboard-risk__row")].some((row) => {
      const date = row.querySelector("time")?.getBoundingClientRect();
      const title = row.querySelector(".class-notices__class")?.getBoundingClientRect();
      const status = row.querySelector(".ah-badge")?.getBoundingClientRect();
      if (!date || !title || !status) throw new Error("Missing notice row content");
      return (
        title.right > status.left + 1 && title.top < status.bottom && status.top < title.bottom
      );
    });
    return { clipped, overlapping };
  });
  expect(layout).toEqual({ clipped: [], overlapping: false });
}

for (const mode of ["dark", "light"] as const) {
  test(`T-15-33 risk review stays readable with long text in ${mode} mode`, async ({
    page,
    browserName,
  }) => {
    await page.clock.setFixedTime(new Date("2026-08-10T08:12:00+02:00"));
    await page.emulateMedia({ colorScheme: mode });
    await page.addInitScript((cached) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "admin");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cached));
    }, branding);
    await page.goto("http://127.0.0.1:4174/entrar");
    await page.getByLabel("Correu electrònic").fill("admin@example.test");
    await page.getByRole("button", { name: "Tinc contrasenya" }).click();
    await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
    await page.getByRole("button", { name: "ENTRA", exact: true }).click();
    await page.waitForURL("**/tauler");
    await page.getByRole("combobox", { name: /Aparença/u }).selectOption(mode);
    const card = page.locator(".dashboard-risk");
    await expect(
      card.getByRole("heading", { name: "Avisos de classes", exact: true }),
    ).toBeVisible();
    await expect(card.locator(".dashboard-risk__row")).toHaveCount(4);
    await expect(card.getByText("4 avisos d’avui")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    mkdirSync(evidence, { recursive: true });
    for (const width of [375, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectReadable(card);
      await card.screenshot({
        path: resolve(evidence, `risk-${browserName}-${mode}-${String(width)}.png`),
      });
    }

    // Typography stress: replace only rendered fixture copy; statuses and navigation are
    // covered against the actual mock response in e5-backoffice and the component tests.
    await card.evaluate((element) => {
      const title = element.querySelector(".class-notices__class strong");
      const notified = element.querySelector(".class-notices__class span");
      if (!title || !notified) throw new Error("Missing fixture copy");
      title.textContent = "Revisió per selectives i preparació de competicions amb grup avançat";
      notified.textContent = "dimecres 12 de novembre · 18:50 · Pista Central del club";
    });
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectReadable(card);
    }
    await page.setViewportSize({ width: 375, height: 1000 });
    await card.screenshot({ path: resolve(evidence, `risk-${browserName}-${mode}-long-375.png`) });
    const firstClass = card.getByRole("link").first();
    await firstClass.focus();
    await expect(firstClass).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/avisos-classes$/u);
    await expect(page.locator(".class-notices__row")).toHaveCount(20);
    await page.screenshot({
      path: resolve(evidence, `history-${browserName}-${mode}-375.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await expectReadable(page.locator(".class-notices-page > .ah-card"));
    await page.screenshot({
      path: resolve(evidence, `history-${browserName}-${mode}-1280.png`),
      fullPage: true,
    });
  });
}
