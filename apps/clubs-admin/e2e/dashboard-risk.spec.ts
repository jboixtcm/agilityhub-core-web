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
    const clipped = [...element.querySelectorAll<HTMLElement>("a, strong, span, p, h2")]
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
      const title = row.querySelector("a")?.getBoundingClientRect();
      const count = row.querySelector(".dashboard-risk__booked")?.getBoundingClientRect();
      const status = row.querySelector(".dashboard-risk__status")?.getBoundingClientRect();
      if (!title || !count || !status) throw new Error("Missing risk row content");
      return title.right > count.left || status.top < Math.max(title.bottom, count.bottom);
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
    await page.getByLabel("Contrasenya").fill("secret-password");
    await page.getByRole("button", { name: "ENTRA", exact: true }).click();
    await page.waitForURL("**/tauler");
    await page.getByRole("combobox", { name: /Aparença/u }).selectOption(mode);
    const card = page.locator(".dashboard-risk");
    await expect(
      card.getByRole("heading", { name: "Revisió de classes en risc", exact: true }),
    ).toBeVisible();
    await expect(card.locator(".dashboard-risk__row")).toHaveCount(4);
    await expect(card.getByText("avisada Clara + Trevi")).toBeVisible();
    await expect(card.getByText("s'anul·larà dc a les 7:30")).toBeVisible();
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
      const title = element.querySelector(".dashboard-risk__class strong");
      const notified = element.querySelector(".dashboard-risk__notified");
      if (!title || !notified) throw new Error("Missing fixture copy");
      title.textContent = "Revisió per selectives i preparació de competicions amb grup avançat";
      notified.textContent = "avisada Clara Serra Vidal + Trevi, Dani Soler Puig + Rayo";
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
    await expect(page).toHaveURL(/\/calendari\?.*estat=anul%C2%B7lades/u);
  });
}
