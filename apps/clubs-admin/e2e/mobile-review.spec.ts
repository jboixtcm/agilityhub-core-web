import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  process.env.E2E_CAPTURE_TASK ?? "2026-10-30-mobile-review",
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
async function login(page: Page) {
  await page.addInitScript((cached) => {
    localStorage.setItem("agilityhub.locale", "ca");
    localStorage.setItem("agilityhub.mockScenario", "admin");
    localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cached));
  }, branding);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA", exact: true }).click();
  await page.waitForURL("**/tauler");
}
async function capture(page: Page, name: string) {
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: resolve(evidence, name) });
}
async function fits(page: Page) {
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const layout = await page.evaluate(
    (width) => ({
      width: document.documentElement.scrollWidth,
      innerWidth,
      clientWidth: document.documentElement.clientWidth,
      overflow: [...document.querySelectorAll("body *")]
        .filter((element) => {
          if (element.getBoundingClientRect().right <= width) return false;
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            if (["auto", "scroll", "hidden"].includes(getComputedStyle(parent).overflowX))
              return false;
          }
          return true;
        })
        .map((element) => ({
          element: element.tagName + "." + element.className,
          right: element.getBoundingClientRect().right,
        })),
    }),
    viewportWidth,
  );
  expect(layout.width, JSON.stringify(layout)).toBeLessThanOrEqual(viewportWidth);
}

for (const width of [320, 375, 390, 768, 1280]) {
  test(`T-02-14 mobile review: readable admin header ${String(width)}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 812 });
    await login(page);
    await page.goto(`${baseUrl}/plantilles`);
    await expect(page.getByRole("heading", { name: "Plantilles", exact: true })).toBeVisible();
    await fits(page);
    await expect(page.getByRole("button", { name: "Canvia el nom", exact: true })).toBeEnabled();
    await expect(page.locator(".planning-class-form")).toBeVisible();
    await capture(page, `header-${browserName}-${String(width)}.png`);
    const layout = await page.locator(".admin-shell__header").evaluate((header) => {
      const brand = header.querySelector("strong");
      const select = header.querySelector("select");
      if (brand === null || select === null)
        throw new Error("Missing header branding or appearance");
      const range = document.createRange();
      range.selectNodeContents(brand);
      return {
        brandLines: range.getClientRects().length,
        appearanceWidth: select.getBoundingClientRect().width,
        appearanceFont: Number.parseFloat(getComputedStyle(select).fontSize),
        height: header.getBoundingClientRect().height,
      };
    });
    expect.soft(layout.brandLines).toBeLessThanOrEqual(2);
    expect.soft(layout.appearanceWidth).toBeGreaterThanOrEqual(128);
    expect.soft(layout.appearanceFont).toBeGreaterThanOrEqual(12);
    expect.soft(layout.height).toBeLessThanOrEqual(120);
    await fits(page);
    if (width <= 390) {
      await page.locator(".planning-class-form").scrollIntoViewIfNeeded();
      await capture(page, `planning-form-${browserName}-${String(width)}.png`);
      await page.locator(".admin-shell__header").scrollIntoViewIfNeeded();
    }
    if (width < 960) {
      const menu = page.getByRole("button", { name: "Navegació d’administració", exact: true });
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await page.getByRole("link", { name: "Paràmetres", exact: true }).click();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await page.getByRole("button", { name: "Menú d’usuari" }).click();
      await expect(page.getByRole("menuitem", { name: "Tanca la sessió" })).toBeVisible();
      await fits(page);
      await capture(page, `user-menu-${browserName}-${String(width)}.png`);
    }
  });
}

for (const width of [320, 375, 390, 1280]) {
  test(`T-02-14 mobile review: opening hours editor fits ${String(width)}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 812 });
    await login(page);
    await page.goto(`${baseUrl}/parametres`);
    await page.getByRole("button", { name: "Edita Horari d'obertura", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await capture(page, `hours-${browserName}-${String(width)}.png`);
    const dialogSize = await dialog.evaluate((element) => ({
      overflow: element.scrollWidth > element.clientWidth + 1,
      right: element.getBoundingClientRect().right,
    }));
    expect.soft(dialogSize.overflow).toBe(false);
    expect.soft(dialogSize.right).toBeLessThanOrEqual(width);
    const overflow = await dialog.locator(".settings-hours-row").evaluateAll((rows) =>
      rows.map((row) => ({
        overflow: row.scrollWidth > row.clientWidth + 1,
        controlsFit: [...row.querySelectorAll("input")].every((input) => {
          const bounds = input.getBoundingClientRect();
          const parent = row.getBoundingClientRect();
          const label = row.querySelector("button + span");
          if (label === null) return false;
          const text = document.createRange();
          text.selectNodeContents(label);
          const labelBounds = text.getBoundingClientRect();
          const separated =
            bounds.top >= labelBounds.bottom || bounds.left >= labelBounds.right + 7;
          return separated && bounds.left >= parent.left && bounds.right <= parent.right + 1;
        }),
      })),
    );
    expect(overflow).toHaveLength(7);
    expect.soft(overflow.every((row) => !row.overflow && row.controlsFit)).toBe(true);
    await fits(page);
    await dialog.getByRole("button", { name: "Cancel·la", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    if (width <= 390) {
      await page.locator(".club-pages-list").scrollIntoViewIfNeeded();
      await fits(page);
      await capture(page, `club-pages-${browserName}-${String(width)}.png`);
    }
  });
}

test("T-02-14 mobile review: census actions and settings remain usable", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  for (const route of ["tauler", "abonats", "gossos", "calendari", "parametres"]) {
    await page.goto(`${baseUrl}/${route}`);
    await expect(page.locator("h1").first()).toBeVisible();
    await fits(page);
    await capture(page, `page-${route}-${browserName}-375.png`);
  }
  await page.goto(`${baseUrl}/abonats/member-laura`);
  await page.getByRole("button", { name: "Afegir un altre gos", exact: true }).click();
  const dog = page.getByRole("dialog", { name: "Afegir un altre gos" });
  await expect(dog.getByLabel("El guia és l’abonat")).toBeChecked();
  await fits(page);
  await capture(page, `add-dog-${browserName}-375.png`);
  const save = dog.getByRole("button", { name: "Desa", exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await capture(page, `add-dog-bottom-${browserName}-375.png`);
  await page.keyboard.press("Escape");
  await expect(dog).toHaveCount(0);
  await page.getByRole("button", { name: "Fusiona abonats", exact: true }).click();
  const merge = page.getByRole("dialog", { name: "Fusiona abonats" });
  await expect(merge.getByRole("button", { name: "Previsualitza la fusió" })).toBeDisabled();
  const target = merge.getByRole("option", { name: /Marc Prats García · #/ });
  await expect(target).toHaveCount(1);
  await merge
    .getByLabel("Abonat que es conserva")
    .selectOption((await target.getAttribute("value")) ?? "");
  await merge.getByRole("button", { name: "Previsualitza la fusió" }).click();
  await expect(merge.getByRole("button", { name: "Confirma la fusió" })).toBeEnabled();
  await fits(page);
  await capture(page, `merge-${browserName}-375.png`);
  await page.keyboard.press("Escape");
  await expect(merge).toHaveCount(0);
});
