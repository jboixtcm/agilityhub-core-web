import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Branding } from "@agilityhub/ui";
import { expect, test, type Page } from "@playwright/test";

const branding = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
) as Branding;

const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence/2026-11-15-mobile-booking",
);
const base = "http://127.0.0.1:4173";
test.beforeAll(() => {
  mkdirSync(evidence, { recursive: true });
});

async function login(page: Page, theme: "light" | "dark" = "dark") {
  await page.clock.setFixedTime(new Date("2026-08-02T20:30:00+02:00"));
  await page.addInitScript(
    ({ fixture, mode }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockAccountLocale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "member");
      localStorage.setItem(
        `agilityhub.branding:${location.host}`,
        JSON.stringify({
          ...fixture,
          theme: { ...fixture.theme, mode },
        }),
      );
      localStorage.setItem(`agilityhub.appearance:${fixture.club.slug ?? "product"}`, mode);
    },
    { fixture: branding, mode: theme },
  );
  await page.goto(`${base}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya", { exact: true }).fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await expect(page.getByRole("heading", { name: "Hola, Laura!" })).toBeVisible();
  await page.getByRole("link", { name: "Reservar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Classes", exact: true })).toBeVisible();
}

for (const theme of ["dark", "light"] as const) {
  test(`T-08-37 mobile ${theme}: dog tabs remain at the top and can switch dogs after scrolling`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 375, height: 600 });
    await login(page, theme);
    const tabs = page.locator(".booking-screen__dog-tabs");
    await page.screenshot({ path: resolve(evidence, `reserve-${theme}-${browserName}.png`) });
    const before = await tabs.boundingBox();
    if (before === null) throw new Error("Missing dog tabs");
    expect(before.y).toBeGreaterThan(0);
    await page.evaluate(() => {
      window.scrollTo(0, 350);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(80);
    await expect.poll(async () => (await tabs.boundingBox())?.y).toBe(0);
    await expect(page.getByRole("button", { name: "Duna · C" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Toby · B (Joan Antoni)" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    await page.screenshot({ path: resolve(evidence, `scrolled-${theme}-${browserName}.png`) });
    await page.getByRole("button", { name: "Rock · D" }).click();
    await expect(page.locator('.class-row a[href="/reserves/booking-rock-mon10"]')).toHaveCount(1);
    await expect(page.locator('.class-row a[href="/reserves/booking-duna-mon3"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rock · D", pressed: true })).toBeInViewport();
  });
}

test("T-08-37 a newly confirmed class remains reserved after returning, refreshing and switching dogs", async ({
  page,
  browserName,
}) => {
  await login(page);
  await page
    .locator('.class-row[data-class-id="class-2026-08-05-1850"]')
    .getByRole("button")
    .click();
  await expect(page.getByRole("heading", { name: "Confirmar reserva" })).toBeVisible();
  await page.getByRole("button", { name: "CONFIRMAR LA RESERVA", exact: true }).click();
  await expect(page.getByText("Reserva confirmada. Afegeix-la al calendari:")).toBeVisible();
  await page.getByRole("link", { name: "Reservar", exact: true }).click();
  const row = page.locator('.class-row[data-class-id="class-2026-08-05-1850"]');
  await expect(row).toContainText("Reservada");
  await expect(row.getByRole("button")).toHaveCount(0);
  await page.reload();
  await expect(row).toContainText("Reservada");
  await page.getByRole("button", { name: "Rock · D" }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Duna · C" }).click();
  await expect(row).toContainText("Reservada");
  await page.screenshot({ path: resolve(evidence, `new-reservation-${browserName}.png`) });
  await row.getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Detall de la reserva" })).toBeVisible();
  await page.getByRole("button", { name: "ANUL·LA LA RESERVA" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ANUL·LA", exact: true }).click();
  await expect(page.getByText("anul·lada", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Reservar", exact: true }).click();
  await expect(row).not.toContainText("Reservada");
  await expect(row.getByRole("button")).toBeVisible();
});

test("T-08-37 desktop: reserved classes stay visible and dog tabs use the normal layout", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  await expect(page.locator('.class-row[data-bookable-state="RESERVED"]')).toContainText(
    "Reservada",
  );
  expect(
    await page.locator(".booking-screen__dog-tabs").evaluate((el) => getComputedStyle(el).position),
  ).toBe("static");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  await page.screenshot({ path: resolve(evidence, `reserve-desktop-${browserName}.png`) });
});

test("T-08-37 mobile large text: every wrapped dog tab remains usable after scrolling", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript((clubKey) => {
    localStorage.setItem(`agilityhub.appearance:${clubKey}:text:mobile`, "large");
  }, branding.club.slug ?? "product");
  await login(page);
  const tabs = page.locator(".booking-screen__dog-tabs");
  const first = await page.getByRole("button", { name: "Duna · C" }).boundingBox();
  const last = await page.getByRole("button", { name: "Toby · B (Joan Antoni)" }).boundingBox();
  if (first === null || last === null) throw new Error("Missing dog tabs");
  expect(last.y).toBeGreaterThan(first.y);
  await page.evaluate(() => {
    window.scrollTo(0, 500);
  });
  await expect.poll(async () => (await tabs.boundingBox())?.y).toBe(0);
  await expect(page.getByRole("button", { name: "Toby · B (Joan Antoni)" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.screenshot({ path: resolve(evidence, `scrolled-large-${browserName}.png`) });
  await page.getByRole("button", { name: "Toby · B (Joan Antoni)" }).click();
  await expect(page.getByText(/Les reserves estan bloquejades/u)).toBeVisible();
  await expect(page.locator('.class-row[data-bookable-state="RESERVED"]')).toHaveCount(0);
});
