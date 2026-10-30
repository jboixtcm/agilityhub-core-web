import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  process.env.E2E_CAPTURE_TASK ?? "2026-10-28-ui-closure",
);
for (const width of [768, 1280, 1512, 1920]) {
  test(`UI closure instructor attendance is readable ${String(width)}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-08-10T19:30:00+02:00"));
    await page.addInitScript(() => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", "instructor");
    });
    await page.goto("http://127.0.0.1:4174/entrar");
    await page.getByLabel("Correu electrònic").fill("instructor@example.test");
    await page.getByRole("button", { name: "Tinc contrasenya" }).click();
    await page.getByLabel("Contrasenya").fill("secret-password");
    await page.getByRole("button", { name: "ENTRA", exact: true }).click();
    await expect(page.getByText("Setmana actual")).toBeVisible();
    const filterColors = await page
      .locator(".week-agenda__filter--instructor select")
      .evaluate((select) => {
        if (select.parentElement === null) throw new Error("Missing filter label");
        return {
          appearance: getComputedStyle(select).appearance,
        select: getComputedStyle(select).backgroundColor,
          label: getComputedStyle(select.parentElement).backgroundColor,
        };
      });
    expect(filterColors.select).toBe(filterColors.label);
    expect(filterColors.appearance).toBe("none");
    await expect(page.locator(".week-agenda__ring-action")).not.toHaveAttribute("open", "");
    await expect(
      page.getByText("Selecciona una classe de l’agenda per veure els inscrits i passar llista."),
    ).toBeVisible();
    await page
      .locator(".week-agenda button.ah-schedule-cell")
      .filter({ hasText: "B i C" })
      .filter({ hasText: "Central · Marc · 2 espera" })
      .click();
    const panel = page.locator(".week-agenda__panel");
    await expect(panel.getByText("ha avisat — plaça alliberada", { exact: true })).toBeVisible();
    const sizes = await panel.evaluate((element) => {
      const status = [...element.querySelectorAll<HTMLElement>(".week-agenda__status")].find(
        (node) => node.textContent === "ha avisat — plaça alliberada",
      );
      if (status === undefined) throw new Error("Missing attendance status");
      return {
        width: element.getBoundingClientRect().width,
        statusHeight: status.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(status).lineHeight),
        overflow: element.scrollWidth > element.clientWidth + 1,
      };
    });
    expect(sizes.statusHeight).toBeLessThanOrEqual(sizes.lineHeight * 2 + 1);
    expect(sizes.overflow).toBe(false);
    const below = await page.locator(".week-agenda__below").boundingBox();
    expect(sizes.width).toBe(below?.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width === 768) {
      await expect(
        page.getByText("Desplaça la graella horitzontalment per veure tots els dies."),
      ).toBeVisible();
      const scroll = page.locator(".ah-schedule-grid__scroll");
      await scroll.focus();
      for (let step = 0; step < 6; step += 1) await page.keyboard.press("ArrowRight");
      await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    }
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: resolve(evidence, `agenda-selected-${browserName}-${String(width)}.png`),
    });
    await page.locator(".week-agenda__ring-action summary").click();
    await expect(
      page.locator(".ring-block-card").getByRole("combobox", { name: "Dia", exact: true }),
    ).toBeVisible();
  });
}
