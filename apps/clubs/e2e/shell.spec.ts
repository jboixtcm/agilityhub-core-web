import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E0-W06");
const brandingCanic = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
) as { theme: { colors: { primary: string } } };
const brandingMinim: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-minim.json",
    ),
    "utf8",
  ),
);

async function prepareScenario(page: Page, scenario: "member" | "minimal", branding: unknown) {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
      window.addEventListener(
        "DOMContentLoaded",
        () => {
          (
            window as Window & { __ahPrimaryAtDomContentLoaded?: string }
          ).__ahPrimaryAtDomContentLoaded =
            document.documentElement.style.getPropertyValue("--ah-color-primary");
        },
        { once: true },
      );
    },
    { cachedBranding: branding, mockScenario: scenario },
  );
}

async function login(page: Page) {
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("biel.roca@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL("**/inici");
}

test.describe("T-02-14 clubs shell", () => {
  test("applies cached Cànic branding before React and exposes the dynamic manifest", async ({
    page,
  }) => {
    await prepareScenario(page, "member", brandingCanic);
    await login(page);

    const initialPrimary = await page.evaluate(
      () =>
        (window as Window & { __ahPrimaryAtDomContentLoaded?: string })
          .__ahPrimaryAtDomContentLoaded,
    );
    expect(initialPrimary).toBe(brandingCanic.theme.colors.primary);
    await expect(page.getByRole("link", { name: "Entrenaments" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Avui" })).toHaveCount(0);

    const manifest = await page.evaluate(async () => {
      const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href;
      return href === undefined ? null : ((await fetch(href)).json() as Promise<unknown>);
    });
    expect(manifest).toMatchObject({
      name: "Club Agility Cànic",
      short_name: "Club Agility Cànic",
    });
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "clubs-canic-375.png"),
    });
  });

  test("uses the AgilityHub theme and hides FREE_TRAINING UI for the minimal club", async ({
    page,
  }) => {
    await prepareScenario(page, "minimal", brandingMinim);
    await login(page);

    await expect(page.getByRole("link", { name: "Entrenaments" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Info" })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "clubs-minim-375.png"),
    });
  });
});
