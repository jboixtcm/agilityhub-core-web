import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const evidence = resolve(
  import.meta.dirname,
  "../../../roadmap/evidence",
  process.env.E2E_CAPTURE_TASK ?? "2026-10-28-desktop-fixes",
);
test("desktop admin keeps the follow-up label on one line and the counter separate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("agilityhub.locale", "ca");
    localStorage.setItem("agilityhub.mockScenario", "admin");
  });
  await page.goto("http://127.0.0.1:4174/login");
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA", exact: true }).click();
  const link = page.getByRole("link", { name: /^Seguiment alumnes/u });
  await expect(link).toBeVisible();
  const layout = await link.evaluate((element) => {
    const label = element.querySelector("span");
    if (label === null) throw new Error("Missing navigation label");
    const range = document.createRange();
    range.selectNodeContents(label);
    const counter = element.querySelector(".ah-sidebar__count");
    return {
      lines: range.getClientRects().length,
      right: label.getBoundingClientRect().right,
      counterLeft: counter?.getBoundingClientRect().left,
      overflow: element.scrollWidth > element.clientWidth,
    };
  });
  expect(layout.lines).toBe(1);
  expect(layout.overflow).toBe(false);
  if (layout.counterLeft !== undefined)
    expect(layout.right).toBeLessThanOrEqual(layout.counterLeft);
  await page.getByLabel("Aparença").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-scheme", "light");
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: resolve(evidence, "admin-dashboard-1280-light.png"),
  });
  await page.getByLabel("Aparença").selectOption("dark");
  await page.screenshot({
    fullPage: true,
    path: resolve(evidence, "admin-dashboard-1280-dark.png"),
  });
});
