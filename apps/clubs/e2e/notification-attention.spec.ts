import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence/2026-11-01-notification-attention",
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

test.beforeAll(() => mkdirSync(evidenceDirectory, { recursive: true }));

for (const width of [375, 1280]) {
  test(`important unread notice, bell and read lifecycle at ${String(width)}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
    await page.clock.setFixedTime(new Date("2026-08-02T18:00:00+02:00"));
    await page.addInitScript((cachedBranding) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "member");
      const club = (cachedBranding as { club: { slug?: string } }).club;
      localStorage.setItem(`agilityhub.appearance:${club.slug ?? "product"}`, "auto");
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    }, branding);
    let readRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/me/notifications/read-all"))
        readRequests++;
    });
    await page.goto(`${baseUrl}/entrar`);
    await page.getByLabel("Correu electrònic").fill("laura@example.test");
    await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
    await page.getByRole("button", { name: "ENTRA", exact: true }).click();
    await page.waitForURL("**/inici");
    const banner = page.getByRole("status", { name: "Tens avisos importants pendents" });
    await expect(page.locator("html")).toHaveAttribute("data-scheme", "dark");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Classe anul·lada pel club");
    expect(readRequests).toBe(0);
    const bell = page.locator(".home-header__bell-icon--ringing");
    await expect(bell).toHaveCSS("animation-iteration-count", "3");
    await expect(bell).toHaveCSS("animation-duration", "1.4s");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      fullPage: true,
      path: resolve(
        evidenceDirectory,
        `attention-dark-${testInfo.project.name}-${String(width)}.png`,
      ),
    });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveAttribute("data-scheme", "light");
    await expect(bell).toHaveCSS("animation-name", "none");
    await expect(banner.locator(".notification-attention__icon")).toHaveCSS(
      "animation-name",
      "none",
    );
    await page.screenshot({
      fullPage: true,
      path: resolve(
        evidenceDirectory,
        `attention-light-reduced-motion-${testInfo.project.name}-${String(width)}.png`,
      ),
    });
    await banner.getByRole("link", { name: "Revisa els avisos" }).click();
    await page.waitForURL("**/notificacions");
    await expect(banner).toHaveCount(0);
    await expect.poll(() => readRequests).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { level: 1, name: "Notificacions" })).toBeVisible();
    await page.getByRole("link", { name: "Inici", exact: true }).click();
    await page.waitForURL("**/inici");
    await expect(page.getByRole("link", { name: "Avisos", exact: true })).toBeVisible();
    await expect(banner).toHaveCount(0);
    await expect(page.locator(".home-header__bell-icon--ringing")).toHaveCount(0);
  });
}
