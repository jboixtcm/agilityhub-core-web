import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E7-W01");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);

test.use({ viewport: { height: 800, width: 1280 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

async function signIn(page: Page, scenario = "admin", modules?: readonly string[]) {
  const branding =
    modules === undefined
      ? brandingCanic
      : { ...(brandingCanic as Record<string, unknown>), modules: [...modules] };
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: branding, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("admin@example.test");
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL("**/tauler");
}

async function iconsPainted(page: Page) {
  await expect
    .poll(() =>
      page
        .locator("svg.ah-icon")
        .evaluateAll((icons) =>
          icons.every(
            (icon) =>
              !(icon instanceof SVGSVGElement) ||
              icon.getClientRects().length === 0 ||
              icon.getBBox().width > 0,
          ),
        ),
    )
    .toBe(true);
}

test.describe("E7-W01 T-11-37 / T-11-38 D9, the log and D10 (S11) against MSW", () => {
  test("D9 as the mockup (N-28 open in «Comunicats individuals»), its preview, and «Enviar comunicat» with the dryRun count", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`${baseUrl}/comunicats?template=tpl-n-28`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Comunicats i plantilles" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Comunicats individuals/u }).click();
    await expect(page.getByLabel("Títol —")).toHaveValue("Comunicació de baixa com a associat");
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
      /^Hola \[\[persona_nom\]\],/u,
    );
    await expect(page.getByRole("link", { name: "Comunicats" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await iconsPainted(page);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D9-comunicats-1280.png"),
    });

    await page.getByRole("button", { name: "Vista prèvia" }).click();
    const preview = page.getByRole("dialog", { name: "Vista prèvia" });
    await expect(
      preview.getByText("Comunicació de baixa com a associat", { exact: true }).first(),
    ).toBeVisible();
    await expect(preview.getByTitle("Correu de la vista prèvia")).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDirectory, "D9-vista-previa-1280.png") });
    await preview.getByRole("button", { name: "Tanca" }).click();

    await page.getByRole("button", { name: "Enviar comunicat" }).click();
    const send = page.getByRole("dialog", { name: "Enviar comunicat" });
    await expect(send.getByText("Tots els abonats")).toBeVisible();
    await expect(send.getByText(/^S'enviarà a \d+ abonats$/u)).toBeVisible();
    await expect(send.getByRole("button", { name: "ENVIA" })).toBeDisabled();
    await send.getByRole("checkbox", { name: /^Confirmo que vull enviar/u }).check();
    await expect(send.getByRole("button", { name: "ENVIA" })).toBeEnabled();
    await page.screenshot({ path: resolve(evidenceDirectory, "D9-enviar-comunicat-1280.png") });
    await send.getByRole("button", { name: "ENVIA" }).click();
    await expect(page.getByText(/^Comunicat enviat a \d+ abonats/u)).toBeVisible();
    await page.getByRole("link", { name: "Avisos enviats ›" }).first().click();
    await page.waitForURL("**/notificacions");
    await expect(page.getByRole("heading", { level: 1, name: "Avisos enviats" })).toBeVisible();
  });

  test("D9 in a club without SMS: no SMS column and no SMS field", async ({ page }) => {
    const modules = (brandingCanic as { modules: string[] }).modules.filter(
      (module) => module !== "SMS",
    );
    await signIn(page, "messagingNoSms", modules);
    await page.goto(`${baseUrl}/comunicats?template=tpl-n-08a`);
    await expect(page.getByLabel("Títol —")).toHaveValue("Classe anul·lada pel club");
    await expect(page.getByRole("columnheader", { name: "SMS" })).toHaveCount(0);
    await expect(page.getByLabel("SMS (text curt)")).toHaveCount(0);
    await iconsPainted(page);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D9-sense-sms-1280.png"),
    });
  });

  test("D10's «Preferències d'avisos» saves a partial change and links to the member's notifications in the log", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`${baseUrl}/abonats/member-laura`);
    const block = page.locator(".notification-preferences");
    await expect(block.getByText("Comunicats del club", { exact: true })).toBeVisible();
    const saved = page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        request.url().endsWith("/members/member-laura/notification-preferences"),
    );
    await block.getByLabel("Recordatori de classe").selectOption("120");
    expect((await saved).postDataJSON()).toEqual({ reminderMinutesBefore: 120 });
    await block.scrollIntoViewIfNeeded();
    await iconsPainted(page);
    await page.screenshot({ path: resolve(evidenceDirectory, "D10-preferencies-avisos-1280.png") });
    await block.getByRole("link", { name: "Avisos enviats ›" }).click();
    await page.waitForURL("**/notificacions?filter=*");
    await expect(page.getByRole("heading", { level: 1, name: "Avisos enviats" })).toBeVisible();
    await expect(page.locator(".ah-universal-list tbody tr")).toHaveCount(4);
    await page.getByRole("link", { name: "N-08a" }).first().click();
    const drawer = page.getByRole("dialog", { name: "Avís N-08a" });
    await expect(drawer.getByText("l···a@example.test")).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDirectory, "log-notificacions-1280.png") });
  });
});
