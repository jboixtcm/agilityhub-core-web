import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4173";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E6-W02");
const brandingCanic: unknown = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
);
// The S10 world is drawn at Monday 3 August 2026, 8:50 (Europe/Madrid): `ATTENDANCE_MOCK_NOW`.
const followupNow = new Date("2026-08-03T08:50:00+02:00");

test.use({ viewport: { height: 812, width: 375 } });

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

/** Signs the instructor in (20 is the landing page) and opens 26 from 22's button. */
async function openTasks(page: Page, scenario = "instructor") {
  await page.clock.setFixedTime(followupNow);
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill("laura@example.test");
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { exact: true, name: "ENTRA" }).click();
  await page.waitForURL((url) => url.pathname === "/instructor/dia");
  await page.goto(`${baseUrl}/instructor/alumnes/dog-duna`);
  await page.getByRole("link", { name: "Gestionar tasques i notes" }).click();
  await page.waitForURL("**/instructor/alumnes/dog-duna/tasques");
  await expect(
    page.getByRole("heading", { level: 1, name: "Tasques i notes — Laura + Duna" }),
  ).toBeVisible();
  await expect(page.locator(".ah-tasks__list > .ah-task")).toHaveCount(3);
}

function cards(page: Page) {
  return page.locator(".ah-tasks__list > .ah-task");
}

async function shot(page: Page, name: string) {
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
  await page.screenshot({ fullPage: true, path: resolve(evidenceDirectory, name) });
}

test.describe("E6-W02 T-10-28 screen 26 «Tasques i notes» against MSW", () => {
  test("26 as mockup 26: observations, the three tasks with the struck done one, the member's note and [DESA]", async ({
    page,
  }) => {
    await openTasks(page);
    await expect(page.getByLabel("Observacions privades")).toHaveValue(/^Va molt bé amb reforç/u);
    await expect(cards(page).nth(0)).toContainText("31-07 · Estel · vídeo_balancí.mp4");
    await expect(cards(page).nth(2)).toContainText("feta per la Laura el 02-08");
    await expect(cards(page).nth(2).locator(".ah-task__text")).toHaveCSS(
      "text-decoration-line",
      "line-through",
    );
    await expect(page.getByRole("button", { name: "foto_balancí.jpg" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Desa" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Alumnes" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
    await shot(page, "26-tasques-375.png");
  });

  test("«＋ Afegir» with a video through the signed url creates one task; the pencil, the ✕ with its question, completion and reopening", async ({
    page,
  }) => {
    await openTasks(page);
    await page.getByRole("button", { name: "Afegir" }).click();
    const form = page.getByRole("form", { name: "Nova tasca" });
    await form
      .getByLabel("Text de la tasca nova")
      .fill("Salts amb calma: tres repeticions i premi");
    await form.getByLabel("Adjunta un fitxer").setInputFiles({
      buffer: Buffer.from("fictional video"),
      mimeType: "video/mp4",
      name: "vídeo_salt.mp4",
    });
    await expect(form.getByRole("button", { exact: true, name: "vídeo_salt.mp4" })).toBeVisible();
    await shot(page, "26-nova-tasca-375.png");

    const upload = page.waitForRequest(
      (request) => request.method() === "PUT" && request.url().includes("/mock-uploads/"),
    );
    const created = page.waitForRequest(
      (request) =>
        request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/tasks",
    );
    await form.getByRole("button", { name: "Afegeix" }).click();
    const put = await upload;
    // CONVENCIONS_API §5: the signed headers unchanged and no bearer to the storage.
    expect(put.headers().authorization).toBeUndefined();
    expect(put.headers()["if-none-match"]).toBe("*");
    const post = await created;
    expect(post.headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(post.postDataJSON()).toMatchObject({
      dogId: "dog-duna",
      text: "Salts amb calma: tres repeticions i premi",
    });
    await expect(cards(page)).toHaveCount(4);
    await expect(cards(page).nth(0)).toContainText("03-08 · Estel · vídeo_salt.mp4");

    await cards(page).nth(2).getByRole("button", { name: "Edita la tasca" }).click();
    await cards(page).nth(2).getByLabel("Text de la tasca").fill("Repasseu la taula de contactes");
    await cards(page).nth(2).getByRole("button", { name: "Desa" }).click();
    await expect(cards(page).nth(2)).toContainText("Repasseu la taula de contactes");

    await cards(page).nth(2).getByRole("button", { name: "Elimina la tasca" }).click();
    const dialog = page.getByRole("dialog", { name: "Vols eliminar aquesta tasca?" });
    await dialog.getByRole("button", { name: "Elimina" }).click();
    await expect(cards(page)).toHaveCount(3);

    await cards(page).nth(1).getByRole("button", { name: "Marca-la com a feta" }).click();
    await expect(cards(page).nth(1)).toContainText("feta per l'Estel el 03-08");
    await cards(page).nth(1).getByRole("button", { name: "Torna-la a pendent" }).click();
    await expect(cards(page).nth(1)).toContainText("pendent");
  });

  test("[DESA] after someone else saved (tasksStale): the notice, their text, and mine to recover and save", async ({
    page,
  }) => {
    await openTasks(page, "tasksStale");
    const field = page.getByLabel("Observacions privades");
    await field.fill("Treballar la sortida amb calma.");
    await page.getByRole("button", { name: "Desa" }).click();
    await expect(
      page.getByText("Algú ha desat les observacions fa un moment: revisa-les."),
    ).toBeVisible();
    await expect(field).toHaveValue(
      "Va molt bé amb reforç de pilota. Evitar sobrecàrrega de salts.",
    );
    await page.getByRole("button", { name: "Recupera el meu text" }).click();
    await expect(field).toHaveValue("Treballar la sortida amb calma.");
    await page.getByRole("button", { name: "Desa" }).click();
    await expect(page.getByRole("button", { name: "Desa" })).toBeDisabled();
  });

  test("«Veure l'historial complet ›» opens every task, read-only, in a drawer", async ({
    page,
  }) => {
    await openTasks(page);
    await page.getByRole("button", { name: "Veure l'historial complet ›" }).click();
    const drawer = page.getByRole("dialog", { name: "Historial de tasques" });
    await expect(drawer.getByRole("listitem")).toHaveCount(3);
    await expect(drawer.getByRole("button", { name: "Edita la tasca" })).toHaveCount(0);
  });
});
