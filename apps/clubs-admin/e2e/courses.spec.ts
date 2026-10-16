import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:4174";
const evidenceDirectory = resolve(import.meta.dirname, "../../../roadmap/evidence/E9-W03");
const brandingCanic = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../packages/api-client/src/mocks/fixtures/branding-canic.json",
    ),
    "utf8",
  ),
) as unknown;
const smarterFixture = resolve(
  import.meta.dirname,
  "../../../packages/course-core/fixtures/smarter/jp-s-sw_993483_sadesign.txt",
);

async function signIn(page: Page, scenario: "admin" | "instructor") {
  await page.addInitScript(
    ({ cachedBranding, mockScenario }) => {
      localStorage.setItem("agilityhub.locale", "ca");
      localStorage.setItem("agilityhub.mockScenario", mockScenario);
      localStorage.setItem(`agilityhub.branding:${location.host}`, JSON.stringify(cachedBranding));
    },
    { cachedBranding: brandingCanic, mockScenario: scenario },
  );
  await page.goto(`${baseUrl}/entrar`);
  await page.getByLabel("Correu electrònic").fill(`${scenario}@example.test`);
  await page.getByRole("button", { name: "Tinc contrasenya" }).click();
  await page.getByLabel("Contrasenya").fill("secret-password");
  await page.getByRole("button", { name: "ENTRA" }).click();
  await page.waitForURL(/\/(tauler|agenda)/u);
}

async function openLibrary(page: Page) {
  await page.getByRole("link", { exact: true, name: "Recorreguts" }).click();
  await page.waitForURL("**/recorreguts**");
  await expect(
    page.getByRole("heading", { level: 1, name: "Biblioteca de recorreguts" }),
  ).toBeVisible();
}

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
});

test.describe("E9-W03 D18 «Biblioteca de recorreguts» and D16 «Geometria» (S16)", () => {
  test("T-16-15 the library: thumbnails, owner chips, the AgilityHub library", async ({ page }) => {
    await signIn(page, "admin");
    await openLibrary(page);
    const jumping = page.getByRole("row").filter({ hasText: "Jumping del dijous" });
    await expect(jumping).toContainText("Mitjà");
    await expect(jumping).toContainText("Muntanya");
    await expect(jumping.locator("img")).toHaveJSProperty("complete", true);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D18-biblioteca-1280.png"),
    });
    await page.getByRole("button", { name: "AgilityHub" }).click();
    await expect(page.getByRole("row").filter({ hasText: "AH · Foundations 07" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Jumping del dijous" })).toHaveCount(0);
  });

  test("T-16-15 import a Smarter file → its page (2D, 3D) → place it with live warnings → build sheet → register as set up", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await openLibrary(page);

    await page.getByRole("button", { name: "Nou recorregut" }).click();
    await page.getByRole("menuitem", { name: "Importa un fitxer Smarter (.txt)" }).click();
    const dialog = page.getByRole("dialog", { name: "Importa un fitxer Smarter" });
    await dialog
      .getByLabel("Tria el fitxer .txt que exporta Smarter")
      .setInputFiles(smarterFixture);
    await expect(dialog.getByText(/obstacles$/u).first()).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDirectory, "D18-importa-1280.png") });
    await dialog.getByRole("button", { name: "Desa el recorregut" }).click();
    await page.waitForURL(/\/recorreguts\/course-\d+$/u);
    await expect(page.getByRole("tab", { name: "Plànol" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("img", { name: /^Plànol de / })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D18-recorregut-1280.png"),
    });
    await page.getByRole("tab", { name: "3D" }).click();
    await expect(page.locator(".courses-viewer-3d canvas")).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(evidenceDirectory, "D18-recorregut-3d-1280.png") });

    // Place it on Muntanya: drag far east until a critical warning, then back to the centre.
    await page.getByRole("button", { name: "Col·loca en una pista" }).click();
    await page.waitForURL(/\/col-locacio$/u);
    const plan = page.getByRole("img", { name: "Recorregut col·locat a Muntanya" });
    await expect(plan).toBeVisible();
    const box = await plan.boundingBox();
    if (box === null) throw new Error("PLAN_NOT_VISIBLE");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.95, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText(/queda fora de la pista\.$/u).first()).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D18-col-locacio-avisos-1280.png"),
    });
    await page.getByRole("button", { name: "Centra" }).click();
    await page.getByLabel("Nom de la col·locació").fill("Dissabte matí");
    // This Smarter course is longer than Muntanya (critical warnings, R-16-05): the api refuses it
    // (422 PLACEMENT_BLOCKED) and the ADMIN confirms it with `force`.
    await page.getByRole("button", { name: "DESA LA COL·LOCACIÓ" }).click();
    await expect(
      page.getByText(
        "Vols desar-la igualment? Quedarà registrat que l'has desada amb avisos crítics.",
      ),
    ).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDirectory, "D18-col-locacio-force-1280.png") });
    await page.getByRole("button", { name: "Desa igualment" }).click();
    await expect(page.getByText("Col·locació desada.")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D18-col-locacio-1280.png"),
    });

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Full de muntatge" }).click();
    const sheet = await download;
    expect(sheet.suggestedFilename()).toMatch(/-muntanya\.pdf$/u);
    await sheet.saveAs(resolve(evidenceDirectory, "full-de-muntatge.pdf"));
    // R-16-10: the sheet is stored for the placement and offered back (GET build-sheet).
    const storedDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Full desat" }).click();
    const stored = await storedDownload;
    expect(stored.suggestedFilename()).toMatch(/-muntanya\.pdf$/u);
    await stored.saveAs(resolve(evidenceDirectory, "full-de-muntatge-desat.pdf"));

    await page.getByRole("button", { name: "Registra-ho com a muntat" }).click();
    const setup = page.getByRole("dialog", { name: "Registra-ho com a muntat" });
    await expect(
      setup.getByText(/^Substituirà el muntatge actual \(Jumping, de .+\)\.$/u),
    ).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDirectory, "D18-registra-1280.png") });
    await setup.getByRole("button", { name: "REGISTRA" }).click();
    await expect(
      page.getByText("Registrat com a muntat a Muntanya; substitueix el muntatge anterior."),
    ).toBeVisible();

    // Back in the library (in-app links: a page load would restart the mock world): the import
    // comes first with the thumbnail made in the browser, and it is now set up on Muntanya.
    await page.getByRole("link", { name: "‹ JP S SW" }).click();
    await page.getByRole("link", { name: "‹ Biblioteca de recorreguts" }).click();
    const imported = page.getByRole("row").filter({ hasText: "JP S SW" });
    await expect(imported).toContainText("Muntanya");
    await expect(imported.locator("img")).toHaveJSProperty("complete", true);
    expect(
      await imported.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBe(320);
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D18-biblioteca-importat-1280.png"),
    });
  });

  test("D16 «Geometria»: the ring's geometry, doors, inventory, marker sheet and setups history (R-16-06 warning)", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await page.getByRole("link", { exact: true, name: "Pistes" }).click();
    await page.waitForURL("**/pistes");
    await page.goto(`${baseUrl}/pistes/ring-muntanya/geometria`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Geometria · Muntanya" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Llargada (m)" })).toHaveValue("40");
    const history = page.getByRole("region", { name: "Muntatges" });
    await expect(history.getByText("Geometria canviada: revisa la col·locació")).toBeVisible();
    await expect(history.getByText("Substituït")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: resolve(evidenceDirectory, "D16-geometria-1280.png"),
    });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Full de marcadors" }).click();
    const sheet = await download;
    expect(sheet.suggestedFilename()).toBe("marcadors-muntanya.pdf");
    await sheet.saveAs(resolve(evidenceDirectory, "full-de-marcadors.pdf"));

    await page.goto(`${baseUrl}/pistes/ring-carretera/geometria`);
    await expect(
      page.getByText(
        "Aquesta pista no té geometria: només s'hi poden registrar muntatges amb foto o plànol.",
      ),
    ).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDirectory, "D16-sense-geometria-1280.png") });
  });

  test("R-16-13 D7 «Col·locacions» of an activity", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto(`${baseUrl}/activitats/activity-lliga-social-3`);
    const card = page.getByRole("region", { name: "Col·locacions" });
    await expect(
      card.getByRole("link", { name: "Agility C–D · Central · Lliga social · recorregut 1" }),
    ).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    // R-16-10: the league placement stores its build sheet; D7 offers it.
    const download = page.waitForEvent("download");
    await card.getByRole("button", { name: "Full de muntatge" }).click();
    expect((await download).suggestedFilename()).toBe("full-de-muntatge-agility-c-d.pdf");
    await page.screenshot({ path: resolve(evidenceDirectory, "D7-col-locacions-1280.png") });
  });
});
