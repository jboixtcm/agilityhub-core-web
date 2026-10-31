import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  process.env.E2E_CAPTURE_TASK ?? "2026-10-24-functional-fixes-release",
);

async function signIn(page: Page, role: "admin" | "instructor") {
  await page.clock.setFixedTime(new Date("2026-08-10T17:30:00Z"));
  await page.addInitScript((scenario) => {
    localStorage.setItem("agilityhub.locale", "ca");
    localStorage.setItem("agilityhub.mockScenario", scenario);
  }, role);
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(`${role}@example.test`);
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL(/\/(tauler|agenda)/u);
}

async function measure(page: Page, name: string) {
  await page.evaluate(async () => document.fonts.ready);
  const metrics = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    scrollX,
    overflow: [...document.querySelectorAll("main *, header *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1);
      })
      .slice(0, 50)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        text: element.textContent.trim().slice(0, 80),
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        overflowX: getComputedStyle(element).overflowX,
      })),
  }));
  mkdirSync(evidence, { recursive: true });
  writeFileSync(resolve(evidence, `${name}.json`), JSON.stringify(metrics, null, 2) + "\n");
  await page.screenshot({ fullPage: true, path: resolve(evidence, `${name}.png`) });
  expect
    .soft(metrics.documentWidth, `${name}: page-wide overflow`)
    .toBeLessThanOrEqual(metrics.viewport);
  expect.soft(metrics.scrollX, `${name}: no body scrolling to reach controls`).toBe(0);
}

async function checkContainedScroll(scroll: Locator) {
  const result = await scroll.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    const measured = {
      moved: element.scrollLeft,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      bodyScroll: window.scrollX,
      viewport: window.innerWidth,
    };
    element.scrollLeft = 0;
    return measured;
  });
  expect.soft(result.moved).toBeGreaterThan(0);
  expect.soft(result.left).toBeGreaterThanOrEqual(0);
  expect.soft(result.right).toBeLessThanOrEqual(result.viewport);
  expect.soft(result.bodyScroll).toBe(0);
}

for (const width of [375, 768, 1280]) {
  test(`INC-97 responsive shell admin ${String(width)}: library, billing, record and navigation`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, "admin");
    await expect(page.locator(".dashboard-chart__figure")).toBeVisible();
    await measure(page, `responsive-admin-dashboard-${String(width)}`);

    await page.clock.setFixedTime(new Date("2026-08-12T10:00:00+02:00"));
    await page.goto(`${baseUrl}/calendari?estat=actives&setmana=2026-08-10`);
    await page
      .getByRole("table", { name: "Calendari de classes · del 10 al 16 d’agost" })
      .getByRole("button", { name: /^dc 12 18:50 · B\+C/u })
      .click();
    const selected = page.getByRole("region", { name: /^Classe seleccionada/u });
    await expect(selected.getByLabel("Recorregut previst")).toBeVisible();
    await measure(page, `responsive-admin-calendar-selected-${String(width)}`);
    if (width === 375) {
      await checkContainedScroll(page.locator(".calendar-grid .ah-schedule-grid__scroll"));
      for (const control of await selected.locator("button, select, input").all()) {
        if (!(await control.isVisible())) continue;
        const bounds = await control.boundingBox();
        expect
          .soft(bounds?.x, "calendar selected action starts inside viewport")
          .toBeGreaterThanOrEqual(0);
        expect
          .soft(
            (bounds?.x ?? width) + (bounds?.width ?? width),
            "calendar selected action ends inside viewport",
          )
          .toBeLessThanOrEqual(width);
      }
    }

    await page.goto(`${baseUrl}/recorreguts`);
    await expect(page.getByRole("heading", { name: "Biblioteca de recorreguts" })).toBeVisible();
    await measure(page, `responsive-admin-library-${String(width)}`);
    if (width < 960) {
      await checkContainedScroll(page.locator(".ah-universal-list__table-wrap"));
    }
    const create = page.getByRole("button", { name: "Nou recorregut" });
    const box = await create.boundingBox();
    expect.soft(box?.x).toBeGreaterThanOrEqual(0);
    expect.soft((box?.x ?? width) + (box?.width ?? width)).toBeLessThanOrEqual(width);
    await create.click();
    const menu = await page.getByRole("menu").boundingBox();
    expect.soft(menu?.x, "creation menu fits the viewport").toBeGreaterThanOrEqual(0);
    expect.soft((menu?.x ?? width) + (menu?.width ?? width)).toBeLessThanOrEqual(width);
    await measure(page, `responsive-admin-create-menu-${String(width)}`);
    await page.getByRole("menuitem", { name: "Importa un fitxer Smarter (.txt)" }).click();
    await expect(page.getByRole("dialog", { name: "Importa un fitxer Smarter" })).toBeVisible();
    await measure(page, `responsive-admin-import-${String(width)}`);
    await page.keyboard.press("Escape");

    await page.goto(`${baseUrl}/facturacio?mes=2026-09`);
    await expect(page.getByRole("heading", { name: "Setembre 2026" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Actius amb pagament en efectiu" }),
    ).toBeVisible();
    const simulation = page.locator(".billing-simulation");
    const cardBounds = await simulation.boundingBox();
    for (const item of await simulation.locator(".billing-members, .billing-members a").all()) {
      const bounds = await item.boundingBox();
      expect
        .soft(bounds?.x, "billing row/action starts inside card")
        .toBeGreaterThanOrEqual(cardBounds?.x ?? width);
      expect
        .soft(
          (bounds?.x ?? width) + (bounds?.width ?? width),
          "billing row/action ends inside card",
        )
        .toBeLessThanOrEqual((cardBounds?.x ?? 0) + (cardBounds?.width ?? 0));
    }
    await measure(page, `responsive-admin-billing-${String(width)}`);
    const billingMenus = page.locator(".ah-universal-list__toolbar > details");
    await expect.poll(() => billingMenus.count()).toBeGreaterThanOrEqual(3);
    for (let index = 0; index < (await billingMenus.count()); index += 1) {
      const menu = billingMenus.nth(index);
      const summary = menu.locator("summary");
      await summary.click();
      const panel = menu.locator(".ah-universal-list__menu-panel");
      await expect(panel).toBeVisible();
      for (const item of [panel, ...(await panel.locator("button, input, select, label").all())]) {
        if (!(await item.isVisible())) continue;
        const bounds = await item.boundingBox();
        expect
          .soft(bounds?.x, "visible billing menu control starts inside viewport")
          .toBeGreaterThanOrEqual(0);
        expect
          .soft(
            (bounds?.x ?? width) + (bounds?.width ?? width),
            "visible billing menu control ends inside viewport",
          )
          .toBeLessThanOrEqual(width);
      }
      await measure(page, `responsive-admin-billing-menu-${String(index)}-${String(width)}`);
      await summary.click();
      await expect(panel).toBeHidden();
    }
    await page.getByRole("link", { name: "Obre fitxa de Pau Riera" }).click();
    await expect(page.getByRole("heading", { name: "Pau Riera" })).toBeVisible();
    await measure(page, `responsive-admin-member-${String(width)}`);

    const navigation = page.getByRole("navigation", { name: "Navegació d’administració" });
    const toggle = page.getByRole("button", { name: "Navegació d’administració" });
    if (width <= 960) {
      await expect(navigation).toBeHidden();
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(navigation).toBeVisible();
      for (let index = 0; index < 8; index += 1) {
        await page.keyboard.press("Tab");
        if (await navigation.evaluate((element) => element.contains(document.activeElement))) break;
      }
      expect(await navigation.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
      await page.screenshot({
        path: resolve(evidence, `responsive-admin-navigation-${String(width)}.png`),
      });
      await page.keyboard.press("Escape");
      await expect(navigation).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.click();
    } else {
      await expect(toggle).toBeHidden();
      await expect(navigation).toBeVisible();
    }
    await navigation.getByRole("link", { name: "Recorreguts", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Biblioteca de recorreguts" })).toBeVisible();
    if (width <= 960) await expect(navigation).toBeHidden();
  });
}

for (const width of [375, 1280]) {
  test(`INC-97 responsive shell instructor ${String(width)}: agenda and role-gated navigation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, "instructor");
    await expect(
      page.getByRole("list", { name: "Recorreguts muntats a les pistes" }),
    ).toBeVisible();
    await measure(page, `responsive-instructor-agenda-${String(width)}`);
    if (width < 960) {
      await checkContainedScroll(page.locator(".ah-schedule-grid__scroll"));
    }
    const navigation = page.getByRole("navigation", { name: "Navegació d’administració" });
    if (width <= 960) await page.getByRole("button", { name: "Navegació d’administració" }).click();
    await expect(navigation).toBeVisible();
    await page.screenshot({
      path: resolve(evidence, `responsive-instructor-navigation-${String(width)}.png`),
    });
    await expect(navigation.getByRole("link", { name: "Facturació", exact: true })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Paràmetres", exact: true })).toHaveCount(0);
    await expect(
      navigation.getByRole("link", { name: "Agenda de la setmana", exact: true }),
    ).toBeVisible();
  });
}
