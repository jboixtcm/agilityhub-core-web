import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  process.env.E2E_CAPTURE_TASK ?? "2026-10-28-ui-closure",
);

for (const width of [375, 768, 1024, 1280, 1512, 1920]) {
  test(`UI closure training selection remains visible ${String(width)}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.clock.setFixedTime(new Date("2026-08-03T07:10:00+02:00"));
    await page.addInitScript(() => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "member");
    });
    await page.goto("http://127.0.0.1:4173/entrar");
    await page.getByLabel("Correu electrònic").fill("laura@example.test");
    await page.getByLabel("Contrasenya").fill("secret-password");
    await page.getByRole("button", { name: "ENTRA", exact: true }).click();
    await page.getByRole("link", { name: "Entrenaments", exact: true }).click();
    await expect(page.getByRole("group", { name: "Matí" })).toBeVisible();
    await page.getByRole("button", { name: "8:30, lliure", exact: true }).click();
    const actions = page.getByRole("region", { name: "Reserva d’entrenament", exact: true });
    await expect(actions).toBeFocused();
    await expect(actions.getByText("Rock", { exact: true })).toBeVisible();
    await expect(actions.getByRole("button", { name: "Muntanya", pressed: true })).toBeVisible();
    const confirm = actions.getByRole("button", { name: /^Confirma/u });
    await expect(confirm).toBeInViewport({ ratio: 1 });
    const size = await confirm.boundingBox();
    expect(size?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width < 768) {
      const nav = page.getByRole("navigation", { name: "Navegació principal" });
      await expect(nav).toBeInViewport({ ratio: 1 });
      const navBox = await nav.boundingBox();
      expect((size?.y ?? 0) + (size?.height ?? 0)).toBeLessThanOrEqual(navBox?.y ?? 0);
    }
    await actions.getByRole("button", { name: "Carretera", exact: true }).click();
    await expect(confirm).toContainText("Carretera");
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({
      path: resolve(evidence, `training-selection-${browserName}-${String(width)}.png`),
    });
    await actions.getByRole("button", { name: "Tanca", exact: true }).click();
    await expect(confirm).toBeDisabled();
    await page.locator(".training-times .ah-slot--free").last().click();
    await expect(confirm).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: resolve(evidence, `training-last-slot-${browserName}-${String(width)}.png`),
    });
    // Booking behavior, ring choice and server limits remain covered by training.spec.ts.
  });
}
