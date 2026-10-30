import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type Page, test } from "@playwright/test";

const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  process.env.E2E_CAPTURE_TASK ?? "2026-10-28-member-ux",
);
async function expectReadableCountdown(page: Page) {
  const contrast = await page.locator(".confirm-hold__chip").evaluate((chip) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas unavailable");
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const style = getComputedStyle(chip);
    const foreground = rgba(style.color);
    const background = rgba(style.backgroundColor);
    const pageColor = rgba(getComputedStyle(document.body).backgroundColor);
    const alpha = (background[3] ?? 255) / 255;
    const composite = background
      .slice(0, 3)
      .map((value, index) => value * alpha + (pageColor[index] ?? 255) * (1 - alpha));
    const luminance = (rgb: number[]) =>
      rgb.slice(0, 3).reduce((sum, value, index) => {
        const channel = value / 255;
        return (
          sum +
          (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) *
            ([0.2126, 0.7152, 0.0722][index] ?? 0)
        );
      }, 0);
    const a = luminance(foreground),
      b = luminance(composite);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}

for (const width of [375, 768, 1024, 1280, 1512, 1920]) {
  test(`desktop member navigation and appearance ${String(width)}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-08-02T20:30:00+02:00"));
    await page.addInitScript(() => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "member");
    });
    await page.goto("http://127.0.0.1:4173/login");
    await page.getByLabel("Correu electrònic").fill("laura@example.test");
    await page.getByLabel("Contrasenya").fill("secret-password");
    await page.getByRole("button", { name: "ENTRA", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Hola, Laura/u })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Navegació principal" });
    const metrics = await page.evaluate(() => {
      const navElement = document.querySelector(".clubs-shell__navigation");
      const mainElement = document.querySelector("main");
      if (navElement === null || mainElement === null) throw new Error("Missing shell");
      const nav = navElement.getBoundingClientRect();
      const main = mainElement.getBoundingClientRect();
      return {
        navTop: nav.top,
        navBottom: nav.bottom,
        mainTop: main.top,
        mainBottom: main.bottom,
        mainWidth: main.width,
        width: document.documentElement.scrollWidth,
      };
    });
    expect(metrics.width).toBeLessThanOrEqual(width);
    expect(metrics.mainWidth).toBeGreaterThan(Math.min(width * 0.85, 1200));
    if (width >= 768) expect(metrics.navBottom).toBeLessThanOrEqual(metrics.mainTop);
    else expect(metrics.navBottom).toBe(900);
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: resolve(evidence, `member-home-${String(width)}-dark.png`),
    });
    await expect(page.getByLabel("Aparença")).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("combobox")).toHaveCount(0);
    if (width >= 1024) {
      const brand = await page.locator(".clubs-shell__brand").boundingBox();
      const navigation = await nav.boundingBox();
      if (brand === null || navigation === null) throw new Error("Missing desktop navigation");
      expect(brand.x + brand.width).toBeLessThanOrEqual(navigation.x);
      expect(brand.y).toBeGreaterThanOrEqual(navigation.y);
      expect(brand.y + brand.height).toBeLessThanOrEqual(navigation.y + navigation.height);
      expect(navigation.height).toBeLessThanOrEqual(80);
    }
    await nav.getByRole("link", { name: "Reservar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Classes", exact: true })).toBeVisible();
    await page
      .locator(".class-row")
      .filter({ hasText: "dc 5 · 18:50" })
      .getByRole("button")
      .click();
    await expect(page.getByRole("heading", { name: "Confirmar reserva" })).toBeVisible();
    const submit = page.getByRole("button", { name: "CONFIRMAR LA RESERVA", exact: true });
    await expect(submit).toBeVisible();
    await expectReadableCountdown(page);
    if (width >= 768) {
      const button = await submit.boundingBox();
      const content = await page.locator(".booking-screen--confirm").boundingBox();
      if (button === null || content === null) throw new Error("Missing confirmation");
      expect(content.width).toBeLessThanOrEqual(704);
      expect(button.width).toBeLessThan(content.width * 0.7);
      expect(button.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({
      fullPage: true,
      path: resolve(evidence, `member-confirm-${String(width)}-dark.png`),
    });
    await page.getByRole("button", { name: "Tanca", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Classes", exact: true })).toBeVisible();
    await nav.getByRole("link", { name: "Perfil", exact: true }).click();
    await page.getByLabel("Aparença").selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-scheme", "light");
    await page.reload();
    await expect(page.getByLabel("Aparença")).toHaveValue("light");
    await expect(page.locator("html")).toHaveAttribute("data-scheme", "light");
    await nav.getByRole("link", { name: "Inici", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Hola, Laura/u })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidence, `member-home-${String(width)}-light.png`),
    });
    await nav.getByRole("link", { name: "Reservar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Classes", exact: true })).toBeVisible();
    await nav.getByRole("link", { name: "Perfil", exact: true }).click();
    await expect(page.getByRole("heading", { name: "El meu perfil", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({
      fullPage: true,
      path: resolve(evidence, `member-profile-${String(width)}-light.png`),
    });
    await nav.getByRole("link", { name: "Reservar", exact: true }).click();
    await page
      .locator(".class-row")
      .filter({ hasText: "dc 5 · 18:50" })
      .getByRole("button")
      .click();
    await expect(page.getByRole("heading", { name: "Confirmar reserva" })).toBeVisible();
    await expectReadableCountdown(page);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidence, `member-confirm-${String(width)}-light.png`),
    });
    await page.getByRole("button", { name: "Tanca", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Classes", exact: true })).toBeVisible();
    for (const [label, title, screen] of [
      ["Entrenaments", "Entrenaments", "training"],
      ["Avui", "Classes del dia", "today"],
      ["Info", "Info", "info"],
    ] as const) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await expect(page.getByLabel("Aparença")).toHaveCount(0);
      await page.screenshot({
        fullPage: true,
        path: resolve(evidence, `member-${screen}-${String(width)}-light.png`),
      });
    }
  });
}
